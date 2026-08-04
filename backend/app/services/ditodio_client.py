"""Ditodio hub client — handoff verify + platform me/usage."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import urllib.error
import urllib.request
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)


def _hub_base() -> str:
    return (settings.ditodio_hub_url or "").rstrip("/")


def handoff_secret() -> str:
    return (settings.platform_handoff_secret or settings.jwt_secret_key or "").strip()


def verify_handoff_token(token: str) -> dict[str, Any] | None:
    """Verify hub handoff format: base64url(json).hmac_sha256_base64url"""
    secret = handoff_secret()
    if not secret or "." not in token:
        return None
    body, sig = token.split(".", 1)
    if not body or not sig:
        return None
    expected = hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    expected_b64 = base64.urlsafe_b64encode(expected).decode("utf-8").rstrip("=")
    # Hub uses Node base64url (no pad). Accept both.
    given = sig
    if not hmac.compare_digest(given, expected_b64):
        # try with padding-normalized compare
        def _pad(s: str) -> bytes:
            return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

        try:
            if not hmac.compare_digest(_pad(given), expected):
                return None
        except Exception:
            return None
    try:
        raw = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    sub = payload.get("sub")
    email = payload.get("email")
    exp = payload.get("exp")
    if not sub or not email or not isinstance(exp, (int, float)):
        return None
    import time

    if int(exp) < int(time.time()):
        return None
    return {
        "sub": str(sub),
        "email": str(email).lower().strip(),
        "plan": str(payload.get("plan") or "free"),
        "role": payload.get("role"),
    }


def _request_json(
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    timeout: float = 15.0,
) -> dict[str, Any]:
    base = _hub_base()
    if not base:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Ditodio hub URL not configured.")
    url = f"{base}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            msg = parsed.get("error") or parsed.get("message") or detail
        except Exception:
            msg = detail or str(exc)
        raise HTTPException(status_code=exc.code, detail=msg) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Ditodio hub unreachable: {exc.reason}",
        ) from exc


def platform_me_via_handoff(handoff: str) -> dict[str, Any]:
    return _request_json("GET", "/api/platform/me", headers={"x-ditodio-handoff": handoff})


def platform_me_via_service(ditodio_user_id: str) -> dict[str, Any]:
    token = (settings.platform_service_token or "").strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PLATFORM_SERVICE_TOKEN not configured.",
        )
    return _request_json(
        "GET",
        "/api/platform/me",
        headers={"x-platform-token": token, "x-user-id": ditodio_user_id},
    )


def post_shorts_usage(ditodio_user_id: str, *, delta: int = 1, commit: bool = True) -> dict[str, Any]:
    token = (settings.platform_service_token or "").strip()
    if not token:
        logger.warning("PLATFORM_SERVICE_TOKEN missing; skipping shorts meter")
        return {"ok": False, "skipped": True}
    return _request_json(
        "POST",
        "/api/platform/usage",
        headers={"x-platform-token": token, "x-user-id": ditodio_user_id},
        body={"meter": "shorts", "delta": delta, "commit": commit},
    )


def assert_can_create_short(ditodio_user_id: str) -> None:
    if not settings.ditodio_entitlements_enabled:
        return
    token = (settings.platform_service_token or "").strip()
    if not token:
        return
    try:
        post_shorts_usage(ditodio_user_id, delta=1, commit=False)
    except HTTPException as exc:
        if exc.status_code == 403:
            raise
        logger.warning("Ditodio shorts precheck failed: %s", exc.detail)
