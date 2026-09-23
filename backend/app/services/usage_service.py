import sqlite3
from datetime import datetime, timezone

from fastapi import HTTPException, status

# Aligned with Ditodio unified catalog (shorts/month as primary short export quota).
# Analyze credits reuse the same monthly_video_limit as a soft local fallback.
PLAN_POLICIES = {
    "free": {
        "id": "free",
        "name": "Free",
        "monthly_video_limit": 3,
        "max_video_minutes": 10,
        "description": "Ditodio 통합 — 쇼츠 3/월 · 포스트 한도는 허브에서 관리",
    },
    "lite": {
        "id": "lite",
        "name": "Lite",
        "monthly_video_limit": 20,
        "max_video_minutes": 30,
        "description": "Ditodio 통합 — 쇼츠 20/월",
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "monthly_video_limit": 80,
        "max_video_minutes": 120,
        "description": "Ditodio 통합 — 쇼츠 80/월",
    },
    # 내부 테스트/운영 계정 전용 — 일반 가입 플랜 목록(list_plan_policies로 노출되는 /plans)에는
    # 포함하지 않고, DB에서 plan='admin'으로 직접 지정한 계정에만 적용된다.
    "admin": {
        "id": "admin",
        "name": "Admin",
        "monthly_video_limit": 1_000_000,
        "max_video_minutes": 600,
        "description": "내부 테스트 계정 — 사실상 무제한",
    },
}


def current_usage_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def plan_policy(plan: str | None) -> dict:
    normalized = (plan or "free").lower()
    return PLAN_POLICIES.get(normalized, PLAN_POLICIES["free"])


def list_plan_policies() -> list[dict]:
    # "admin"은 내부 전용이라 일반 사용자에게 노출되는 /plans 목록에서는 제외한다.
    return [policy for key, policy in PLAN_POLICIES.items() if key != "admin"]


def _fetch_user_usage_row(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    row = conn.execute(
        """
        SELECT id, plan, monthly_usage, usage_limit, usage_month
        FROM users
        WHERE id = ?
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    return row


def sync_user_usage_policy(conn: sqlite3.Connection, user_id: int) -> dict:
    row = _fetch_user_usage_row(conn, user_id)
    policy = plan_policy(row["plan"])
    month = current_usage_month()
    stored_month = row["usage_month"]
    monthly_usage = int(row["monthly_usage"])

    if stored_month != month:
        monthly_usage = 0
        stored_month = month

    if row["plan"] != policy["id"] or int(row["usage_limit"]) != policy["monthly_video_limit"] or row["usage_month"] != stored_month or int(row["monthly_usage"]) != monthly_usage:
        conn.execute(
            """
            UPDATE users
            SET plan = ?, monthly_usage = ?, usage_limit = ?, usage_month = ?
            WHERE id = ?
            """,
            (policy["id"], monthly_usage, policy["monthly_video_limit"], stored_month, user_id),
        )
        conn.commit()

    return {
        "plan": policy["id"],
        "plan_name": policy["name"],
        "monthly_usage": monthly_usage,
        "usage_limit": policy["monthly_video_limit"],
        "remaining": max(policy["monthly_video_limit"] - monthly_usage, 0),
        "usage_month": stored_month,
        "max_video_minutes": policy["max_video_minutes"],
    }


def assert_can_analyze_video(conn: sqlite3.Connection, user_id: int, duration_seconds: float) -> dict:
    usage = sync_user_usage_policy(conn, user_id)
    if usage["monthly_usage"] >= usage["usage_limit"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Monthly analysis limit reached for {usage['plan_name']} plan ({usage['usage_limit']} videos/month).",
        )

    duration_minutes = duration_seconds / 60
    if duration_minutes > usage["max_video_minutes"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Video is {duration_minutes:.1f} minutes. {usage['plan_name']} plan supports up to {usage['max_video_minutes']} minutes per video.",
        )
    return usage


def increment_monthly_usage(conn: sqlite3.Connection, user_id: int) -> dict:
    usage = sync_user_usage_policy(conn, user_id)
    next_usage = min(usage["monthly_usage"] + 1, usage["usage_limit"])
    conn.execute(
        """
        UPDATE users
        SET monthly_usage = ?, usage_limit = ?, usage_month = ?
        WHERE id = ?
        """,
        (next_usage, usage["usage_limit"], usage["usage_month"], user_id),
    )
    conn.commit()
    usage["monthly_usage"] = next_usage
    usage["remaining"] = max(usage["usage_limit"] - next_usage, 0)
    return usage
