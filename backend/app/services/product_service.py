"""Product URL → BlogContent adapters (Amazon + Naver Smart Store) for Shorts."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import parse_qs, unquote, urlparse

import requests
from bs4 import BeautifulSoup
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ProductContent:
    title: str
    text: str
    image_urls: list[str]

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
_BROWSER_HEADERS = {
    "User-Agent": _USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ko;q=0.8,ja;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

_ASIN_RE = re.compile(r"\b([A-Z0-9]{10})\b")
_AMAZON_HOST_RE = re.compile(
    r"(^|\.)amazon\.(com|co\.uk|de|fr|it|es|ca|com\.mx|co\.jp|in|com\.au|com\.br|nl|se|pl|com\.tr)(\.|$)",
    re.IGNORECASE,
)
# Amazon CDN asset id inside /images/I/<id>.… — used to dedupe size variants.
_AMAZON_IMAGE_ID_RE = re.compile(r"/images/I/([^./]+)", re.IGNORECASE)
_AMAZON_SIZE_TOKEN_RE = re.compile(r"\._[^./]+_\.")
_HIRES_URL_RE = re.compile(
    r'"(?:hiRes|large|mainUrl|thumbUrl|hiResImage)"\s*:\s*"(https:\\?/\\?/[^"]+)"',
    re.IGNORECASE,
)


def is_amazon_product_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return False
    if not host or not _AMAZON_HOST_RE.search(host):
        return False
    return parse_amazon_asin(url) is not None


def parse_amazon_asin(url: str) -> str | None:
    """Extract ASIN from common Amazon product URL shapes."""
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return None
    path = unquote(parsed.path or "")
    patterns = (
        r"/dp/([A-Z0-9]{10})(?:/|$)",
        r"/gp/product/([A-Z0-9]{10})(?:/|$)",
        r"/product/([A-Z0-9]{10})(?:/|$)",
        r"/ASIN/([A-Z0-9]{10})(?:/|$)",
        r"/exec/obidos/ASIN/([A-Z0-9]{10})(?:/|$)",
    )
    for pattern in patterns:
        match = re.search(pattern, path, flags=re.IGNORECASE)
        if match:
            return match.group(1).upper()

    query = parse_qs(parsed.query or "")
    for key in ("asin", "ASIN"):
        values = query.get(key) or []
        if values and _ASIN_RE.fullmatch(values[0].upper()):
            return values[0].upper()
    return None


def fetch_amazon_product(url: str) -> ProductContent:
    asin = parse_amazon_asin(url)
    if not asin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amazon 상품 URL에서 ASIN을 찾지 못했습니다. /dp/ASIN 형태 링크를 사용해 주세요.",
        )

    if _paapi_configured():
        try:
            return _fetch_via_paapi(asin, url)
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Amazon PA-API failed for ASIN=%s; falling back to HTML: %s", asin, exc)

    logger.warning(
        "Amazon PA-API credentials missing or failed; using HTML/og fallback for ASIN=%s",
        asin,
    )
    return _fetch_via_html_fallback(url, asin)


def _paapi_configured() -> bool:
    return bool(
        (settings.amazon_paapi_access_key or "").strip()
        and (settings.amazon_paapi_secret_key or "").strip()
        and (settings.amazon_paapi_partner_tag or "").strip()
    )


def _fetch_via_paapi(asin: str, source_url: str) -> ProductContent:
    host = (settings.amazon_paapi_host or "webservices.amazon.com").strip()
    region = (settings.amazon_paapi_region or "us-east-1").strip()
    marketplace = (settings.amazon_paapi_marketplace or "www.amazon.com").strip()
    payload = {
        "ItemIds": [asin],
        "Resources": [
            "ItemInfo.Title",
            "ItemInfo.Features",
            "ItemInfo.ByLineInfo",
            "Images.Primary.Large",
            "Images.Variants.Large",
            "OffersV2.Listings.Price",
        ],
        "PartnerTag": settings.amazon_paapi_partner_tag.strip(),
        "PartnerType": "Associates",
        "Marketplace": marketplace,
    }
    body = json.dumps(payload)
    amz_target = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems"
    headers = _paapi_signed_headers(
        host=host,
        region=region,
        amz_target=amz_target,
        payload=body,
    )
    response = requests.post(
        f"https://{host}/paapi5/getitems",
        data=body.encode("utf-8"),
        headers=headers,
        timeout=settings.blog_fetch_timeout_seconds,
    )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Amazon PA-API 오류 (HTTP {response.status_code}): {response.text[:300]}",
        )
    data = response.json()
    items = ((data.get("ItemsResult") or {}).get("Items")) or []
    if not items:
        errors = data.get("Errors") or ((data.get("ItemsResult") or {}).get("Errors")) or []
        detail = errors[0].get("Message") if errors and isinstance(errors[0], dict) else "상품을 찾지 못했습니다."
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Amazon 상품 조회 실패: {detail}")

    item = items[0]
    title = (((item.get("ItemInfo") or {}).get("Title") or {}).get("DisplayValue")) or f"Amazon {asin}"
    features = (((item.get("ItemInfo") or {}).get("Features") or {}).get("DisplayValues")) or []
    brand = (
        (((item.get("ItemInfo") or {}).get("ByLineInfo") or {}).get("Brand") or {}).get("DisplayValue")
        or ""
    )
    price = _extract_paapi_price(item)
    image_urls = _extract_paapi_images(item)
    image_urls = _ensure_min_images(image_urls)

    text_parts = [title]
    if brand:
        text_parts.append(f"Brand: {brand}")
    if price:
        text_parts.append(f"Price: {price}")
    if features:
        text_parts.append("Features:")
        text_parts.extend(f"- {feature}" for feature in features[:12])
    text_parts.append(f"Product URL: {source_url}")
    text = "\n".join(text_parts)[:6000]

    if len(image_urls) < settings.blog_image_min_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Amazon 상품 이미지가 부족합니다 "
                f"({len(image_urls)}개, 최소 {settings.blog_image_min_count}개 필요)."
            ),
        )
    return ProductContent(title=title[:300], text=text, image_urls=image_urls)


def _extract_paapi_price(item: dict) -> str | None:
    offers = item.get("OffersV2") or item.get("Offers") or {}
    listings = offers.get("Listings") or []
    if not listings:
        return None
    price = listings[0].get("Price") or {}
    display = price.get("DisplayAmount") or price.get("Amount")
    currency = price.get("Currency") or ""
    if display is None:
        return None
    if isinstance(display, (int, float)):
        return f"{currency} {display}".strip()
    return str(display)


def _extract_paapi_images(item: dict) -> list[str]:
    images: list[str] = []
    primary = ((item.get("Images") or {}).get("Primary") or {}).get("Large") or {}
    if primary.get("URL"):
        images.append(str(primary["URL"]))
    variants = ((item.get("Images") or {}).get("Variants")) or []
    for variant in variants:
        large = (variant or {}).get("Large") or {}
        url = large.get("URL")
        if url and url not in images:
            images.append(str(url))
    return images


def _paapi_signed_headers(*, host: str, region: str, amz_target: str, payload: str) -> dict[str, str]:
    """Minimal AWS SigV4 for PA-API 5.0."""
    access_key = settings.amazon_paapi_access_key.strip()
    secret_key = settings.amazon_paapi_secret_key.strip()
    service = "ProductAdvertisingAPI"
    method = "POST"
    canonical_uri = "/paapi5/getitems"
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    canonical_headers = (
        f"content-encoding:amz-1.0\n"
        f"content-type:application/json; charset=utf-8\n"
        f"host:{host}\n"
        f"x-amz-date:{amz_date}\n"
        f"x-amz-target:{amz_target}\n"
    )
    signed_headers = "content-encoding;content-type;host;x-amz-date;x-amz-target"
    canonical_request = "\n".join(
        [
            method,
            canonical_uri,
            "",
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    algorithm = "AWS4-HMAC-SHA256"
    credential_scope = f"{date_stamp}/{region}/{service}/aws4_request"
    string_to_sign = "\n".join(
        [
            algorithm,
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signing_key = _aws_signing_key(secret_key, date_stamp, region, service)
    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = (
        f"{algorithm} Credential={access_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return {
        "content-encoding": "amz-1.0",
        "content-type": "application/json; charset=utf-8",
        "host": host,
        "x-amz-date": amz_date,
        "x-amz-target": amz_target,
        "Authorization": authorization,
    }


def _aws_signing_key(secret_key: str, date_stamp: str, region: str, service: str) -> bytes:
    def _sign(key: bytes, msg: str) -> bytes:
        return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()

    k_date = _sign(("AWS4" + secret_key).encode("utf-8"), date_stamp)
    k_region = _sign(k_date, region)
    k_service = _sign(k_region, service)
    return _sign(k_service, "aws4_request")


def _fetch_via_html_fallback(url: str, asin: str) -> ProductContent:
    try:
        response = _fetch_amazon_html(url)
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Amazon 상품 페이지를 가져오지 못했습니다: {exc}",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Amazon 상품 페이지를 가져오지 못했습니다 (HTTP {response.status_code}).",
        )

    html = response.text
    if _looks_like_amazon_block(html):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Amazon이 상품 페이지 접근을 막았습니다 (봇/캡차). "
                "PA-API 키를 설정하거나 잠시 후 다시 시도해 주세요."
            ),
        )

    soup = BeautifulSoup(html, "html.parser")
    title = _html_title(soup) or f"Amazon {asin}"
    price = _html_price(soup)
    bullets = _html_bullets(soup)
    image_urls = _html_images(soup, asin, html=html)
    image_urls = _ensure_min_images(image_urls)

    text_parts = [title, "Source: Amazon product page (HTML fallback — prefer PA-API for production)."]
    if price:
        text_parts.append(f"Price: {price}")
    if bullets:
        text_parts.append("Features:")
        text_parts.extend(f"- {b}" for b in bullets[:12])
    text_parts.append(f"ASIN: {asin}")
    text_parts.append(f"Product URL: {url}")
    text = "\n".join(text_parts)[:6000]

    if not image_urls:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Amazon 상품 이미지를 추출하지 못했습니다. "
                "PA-API 키를 설정하거나 다른 상품 URL을 시도해 주세요."
            ),
        )
    if len(image_urls) < settings.blog_image_min_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Amazon 상품 이미지가 부족합니다 "
                f"({len(image_urls)}개, 최소 {settings.blog_image_min_count}개 필요). "
                "PA-API 키를 설정하면 갤러리 이미지를 더 가져올 수 있습니다."
            ),
        )
    return ProductContent(title=title[:300], text=text, image_urls=image_urls)


def _html_title(soup: BeautifulSoup) -> str | None:
    for selector in ("#productTitle", "#title", "meta[property='og:title']"):
        node = soup.select_one(selector)
        if node is None:
            continue
        if node.name == "meta":
            content = (node.get("content") or "").strip()
            if content:
                return content
        text = node.get_text(" ", strip=True)
        if text:
            return text
    if soup.title and soup.title.string:
        return soup.title.string.strip()
    return None


def _html_price(soup: BeautifulSoup) -> str | None:
    for selector in (
        "span.a-price .a-offscreen",
        "#priceblock_ourprice",
        "#priceblock_dealprice",
        "#corePrice_feature_div .a-offscreen",
    ):
        node = soup.select_one(selector)
        if node is not None:
            text = node.get_text(" ", strip=True)
            if text:
                return text
    return None


def _html_bullets(soup: BeautifulSoup) -> list[str]:
    bullets: list[str] = []
    for li in soup.select("#feature-bullets li span.a-list-item"):
        text = li.get_text(" ", strip=True)
        if text and text.lower() not in {"see more", "see less"}:
            bullets.append(text)
    return bullets


def _fetch_amazon_html(url: str) -> requests.Response:
    """Fetch product HTML with browser-like headers; warm up host to reduce soft blocks."""
    parsed = urlparse(url)
    home = f"{parsed.scheme}://{parsed.netloc}/"
    session = requests.Session()
    timeout = settings.blog_fetch_timeout_seconds
    try:
        session.get(home, headers=_BROWSER_HEADERS, timeout=timeout)
    except requests.RequestException:
        pass
    headers = {
        **_BROWSER_HEADERS,
        "Referer": home,
        "Sec-Fetch-Site": "same-origin",
    }
    return session.get(url, headers=headers, timeout=timeout)


def _looks_like_amazon_block(html: str) -> bool:
    lowered = html.lower()
    if len(html) < 8000 and ("robot" in lowered or "captcha" in lowered or "automated access" in lowered):
        return True
    return "opfcaptcha" in lowered or "enter the characters you see" in lowered


def _upgrade_amazon_image_url(url: str) -> str:
    """Rewrite sizing tokens (._AC_SX342_., ._AC_SR38,50_., …) to a large variant."""
    cleaned = url.strip().replace("\\u002F", "/").replace("\\/", "/")
    if cleaned.startswith("//"):
        cleaned = "https:" + cleaned
    return _AMAZON_SIZE_TOKEN_RE.sub("._SL1500_.", cleaned)


def _amazon_image_key(url: str) -> str:
    match = _AMAZON_IMAGE_ID_RE.search(url)
    if match:
        return match.group(1)
    return url


def _is_usable_amazon_image(url: str) -> bool:
    lowered = url.lower()
    if not lowered.startswith("http"):
        return False
    if any(token in lowered for token in ("sprite", "play-icon", "grey-pixel", "transparent-pixel")):
        return False
    if lowered.endswith(".svg") or lowered.endswith(".gif"):
        return False
    if "/images/s/" in lowered:  # UI chrome / sash assets
        return False
    return True


def _html_images(soup: BeautifulSoup, asin: str, html: str | None = None) -> list[str]:
    """Collect unique product gallery images (deduped by Amazon /images/I/<id>)."""
    ordered: list[str] = []
    seen_keys: set[str] = set()

    def _add(candidate: str | None) -> None:
        if not candidate:
            return
        cleaned = _upgrade_amazon_image_url(candidate)
        if not _is_usable_amazon_image(cleaned):
            return
        key = _amazon_image_key(cleaned)
        if key in seen_keys:
            return
        seen_keys.add(key)
        ordered.append(cleaned)

    raw_html = html or str(soup)

    # 1) Gallery JSON first — this is where additional product photos live.
    for match in _HIRES_URL_RE.finditer(raw_html):
        _add(match.group(1))

    # colorImages / imageGalleryData blobs sometimes use single quotes
    for match in re.finditer(
        r"['\"](?:hiRes|large|mainUrl)['\"]\s*:\s*['\"](https:\\?/\\?/[^'\"]+)['\"]",
        raw_html,
        flags=re.IGNORECASE,
    ):
        _add(match.group(1))

    # 2) Landing / og as fallbacks for the primary shot
    og = soup.select_one("meta[property='og:image']")
    if og is not None:
        _add(og.get("content"))

    landing = soup.select_one("#landingImage") or soup.select_one("#imgBlkFront")
    if landing is not None:
        _add(landing.get("data-old-hires") or landing.get("src"))
        dynamic = landing.get("data-a-dynamic-image")
        if dynamic:
            try:
                payload = json.loads(dynamic)
                # Prefer largest declared URL for this asset (keys are URLs).
                for key in sorted(payload.keys(), key=len, reverse=True):
                    _add(key)
            except (TypeError, json.JSONDecodeError):
                pass

    # 3) Thumbnail strip — upgrade to SL1500 via size-token rewrite
    for img in soup.select("#altImages img, #imageBlock_feature_div img, #altImages li img"):
        _add(img.get("data-old-hires") or img.get("src") or img.get("data-src"))

    if not ordered:
        # Last resort: media-amazon pattern by ASIN (may 404; download step skips failures)
        _add(f"https://m.media-amazon.com/images/P/{asin}.01.LZZZZZZZ.jpg")

    # Cap candidates — board pipeline already limits downloads.
    return ordered[: settings.blog_image_candidate_max_count]


def _ensure_min_images(image_urls: list[str]) -> list[str]:
    """Pad with the first image so board pipeline min-count can be met when gallery is thin."""
    if not image_urls:
        return []
    needed = settings.blog_image_min_count
    if len(image_urls) >= needed:
        return image_urls
    padded = list(image_urls)
    while len(padded) < needed:
        padded.append(image_urls[0])
    return padded


# ---------------------------------------------------------------------------
# Naver Smart Store / Brand Store
# ---------------------------------------------------------------------------

_SMARTSTORE_HOST_RE = re.compile(
    r"(^|\.)((m\.)?smartstore\.naver\.com|brand\.naver\.com)(\.|$)",
    re.IGNORECASE,
)
_SMARTSTORE_PRODUCT_PATH_RE = re.compile(
    r"^/([^/]+)/products/(\d+)(?:/|$)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class SmartStoreRef:
    host_kind: str  # "smartstore" | "brand"
    store_slug: str
    product_id: str
    source_url: str


def is_smartstore_product_url(url: str) -> bool:
    return parse_smartstore_ref(url) is not None


def parse_smartstore_ref(url: str) -> SmartStoreRef | None:
    """Parse smartstore.naver.com/{store}/products/{id} or brand.naver.com/{brand}/products/{id}."""
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return None
    host = (parsed.hostname or "").lower()
    if not host or not _SMARTSTORE_HOST_RE.search(host):
        return None
    path = unquote(parsed.path or "")
    match = _SMARTSTORE_PRODUCT_PATH_RE.match(path)
    if not match:
        return None
    store_slug = match.group(1).strip()
    product_id = match.group(2).strip()
    if not store_slug or store_slug.lower() in {"i", "n", "v1", "v2", "products"}:
        return None
    if not product_id.isdigit():
        return None
    host_kind = "brand" if "brand.naver.com" in host else "smartstore"
    # Normalize m.smartstore → smartstore canonical form for Referer/API.
    scheme = parsed.scheme or "https"
    canonical = f"{scheme}://{'brand.naver.com' if host_kind == 'brand' else 'smartstore.naver.com'}/{store_slug}/products/{product_id}"
    return SmartStoreRef(
        host_kind=host_kind,
        store_slug=store_slug,
        product_id=product_id,
        source_url=canonical,
    )


def is_supported_product_url(url: str) -> bool:
    return is_amazon_product_url(url) or is_smartstore_product_url(url)


def fetch_product(url: str) -> ProductContent:
    if is_amazon_product_url(url):
        return fetch_amazon_product(url)
    if is_smartstore_product_url(url):
        return fetch_smartstore_product(url)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="지원하지 않는 상품 URL입니다. Amazon 또는 네이버 스마트스토어/브랜드스토어 링크를 사용해 주세요.",
    )


_SMARTSTORE_429_DETAIL = (
    "네이버가 스마트스토어 접근을 잠시 제한했습니다 (HTTP 429). "
    "1–2분 뒤 다시 시도하거나, 브라우저에서 열리는 상품 URL인지 확인해 주세요."
)


def fetch_smartstore_product(url: str) -> ProductContent:
    ref = parse_smartstore_ref(url)
    if ref is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "스마트스토어 상품 URL 형식이 올바르지 않습니다. "
                "예: https://smartstore.naver.com/{스토어}/products/{상품번호}"
            ),
        )

    html_product: ProductContent | None = None
    channel_uid: str | None = None
    saw_rate_limit = False

    # 1) Lightweight HTTP HTML (no store-home warmup — that burns rate limit).
    html_response = _fetch_smartstore_html_with_retries(ref.source_url)
    if html_response is not None:
        if html_response.status_code == 429 or _looks_like_naver_rate_limit(html_response.text):
            saw_rate_limit = True
            logger.warning("Smart Store HTML rate-limited for %s", ref.source_url)
        elif _looks_like_naver_login(html_response.url, html_response.text):
            logger.warning("Smart Store HTML redirected to login for %s", ref.source_url)
        elif html_response.status_code < 400 and not _looks_like_naver_error_page(html_response.text):
            channel_uid = _extract_smartstore_channel_uid(html_response.text)
            html_product = _smartstore_product_from_html(html_response.text, ref)

    # 2) Browser fallback — often bypasses simple bot 429 on the document request.
    if html_product is None and getattr(settings, "smartstore_use_playwright", True):
        pw_html, pw_final_url = _fetch_smartstore_html_playwright(ref.source_url)
        if pw_html:
            if _looks_like_naver_rate_limit(pw_html) or _looks_like_naver_error_page(pw_html):
                saw_rate_limit = True
            elif _looks_like_naver_login(pw_final_url or "", pw_html):
                logger.warning("Smart Store Playwright hit login wall for %s", ref.source_url)
            else:
                channel_uid = channel_uid or _extract_smartstore_channel_uid(pw_html)
                html_product = _smartstore_product_from_html(pw_html, ref)

    # 3) Channel lookup + product JSON API (soft-fail 429).
    if not channel_uid:
        try:
            channel_uid = _resolve_smartstore_channel_uid(ref)
        except _SmartStoreRateLimited:
            saw_rate_limit = True
            channel_uid = None

    if channel_uid:
        try:
            api_product = _fetch_smartstore_via_api(ref, channel_uid)
            if api_product is not None:
                return api_product
        except _SmartStoreRateLimited:
            saw_rate_limit = True
        except HTTPException as exc:
            if exc.status_code != status.HTTP_409_CONFLICT:
                raise
            logger.warning(
                "Smart Store API image shortage for %s/%s; trying HTML fallback",
                ref.store_slug,
                ref.product_id,
            )
        except Exception as exc:
            logger.warning(
                "Smart Store product API failed for %s/%s: %s",
                ref.store_slug,
                ref.product_id,
                exc,
            )

    if html_product is not None and html_product.image_urls:
        return html_product

    if saw_rate_limit:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=_SMARTSTORE_429_DETAIL)

    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=(
            "스마트스토어 상품 정보·이미지를 추출하지 못했습니다. "
            "상품 URL을 확인하거나 잠시 후 다시 시도해 주세요."
        ),
    )


class _SmartStoreRateLimited(Exception):
    """Internal signal: Naver returned HTTP 429 / rate-limit page."""


def _smartstore_browser_headers(*, referer: str | None = None) -> dict[str, str]:
    headers = {
        **_BROWSER_HEADERS,
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,image/apng,*/*;q=0.8"
        ),
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none" if not referer else "same-site",
        "Sec-Fetch-User": "?1",
    }
    if referer:
        headers["Referer"] = referer
    return headers


def _fetch_smartstore_html_with_retries(url: str) -> requests.Response | None:
    """GET product HTML with short backoff. Never raises on 429 — caller decides."""
    timeout = settings.blog_fetch_timeout_seconds
    headers = _smartstore_browser_headers(referer="https://shopping.naver.com/")
    headers["Sec-Fetch-Site"] = "same-site"
    last: requests.Response | None = None
    attempts = max(1, int(getattr(settings, "smartstore_http_retries", 2)))
    for attempt in range(attempts):
        try:
            response = requests.get(url, headers=headers, timeout=timeout, allow_redirects=True)
        except requests.RequestException as exc:
            logger.warning("Smart Store HTML fetch failed (%s/%s): %s", attempt + 1, attempts, exc)
            time.sleep(0.8 * (attempt + 1))
            continue
        last = response
        if response.status_code != 429 and not _looks_like_naver_rate_limit(response.text):
            return response
        retry_after = response.headers.get("Retry-After")
        delay = 1.5 * (attempt + 1)
        if retry_after:
            try:
                delay = max(delay, float(retry_after))
            except ValueError:
                pass
        logger.warning(
            "Smart Store HTML HTTP %s; retry in %.1fs (%s/%s)",
            response.status_code,
            delay,
            attempt + 1,
            attempts,
        )
        time.sleep(min(delay, 4.0))
    return last


def _fetch_smartstore_html_playwright(url: str) -> tuple[str | None, str | None]:
    """Load product page in Chromium. Returns (html, final_url)."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.info("Playwright not installed; skip Smart Store browser fallback")
        return None, None

    timeout_ms = max(15000, int(settings.blog_fetch_timeout_seconds * 1000))
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                context = browser.new_context(
                    locale="ko-KR",
                    user_agent=_smartstore_browser_headers()["User-Agent"],
                    extra_http_headers={"Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8"},
                )
                page = context.new_page()
                # Warm cookies lightly — single naver.com hit, not smartstore home.
                try:
                    page.goto("https://www.naver.com/", wait_until="domcontentloaded", timeout=timeout_ms)
                    page.wait_for_timeout(800)
                except Exception:
                    pass
                page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
                try:
                    page.wait_for_load_state("networkidle", timeout=min(12000, timeout_ms))
                except Exception:
                    page.wait_for_timeout(1500)
                html = page.content()
                final_url = page.url
                return html, final_url
            finally:
                browser.close()
    except Exception as exc:
        logger.warning("Smart Store Playwright fetch failed for %s: %s", url, exc)
        return None, None


def _looks_like_naver_rate_limit(html: str) -> bool:
    lowered = (html or "").lower()
    if "너무 많은 요청" in (html or ""):
        return True
    title_hit = ("에러페이지" in (html or "")) or ("시스템오류" in (html or ""))
    return title_hit and len(html or "") < 40000


def _looks_like_naver_error_page(html: str) -> bool:
    return _looks_like_naver_rate_limit(html)


def _fetch_smartstore_html(url: str) -> requests.Response:
    """Backward-compatible single-shot fetch (tests / callers)."""
    response = _fetch_smartstore_html_with_retries(url)
    if response is None:
        raise requests.RequestException("Smart Store HTML fetch failed")
    return response


def _looks_like_naver_login(final_url: str, html: str) -> bool:
    lowered_url = (final_url or "").lower()
    if "nid.naver.com" in lowered_url or "nidlogin" in lowered_url:
        return True
    lowered = (html or "").lower()
    return "nidlogin" in lowered and "smartstore" not in lowered and len(html) < 40000


def _extract_smartstore_channel_uid(html: str) -> str | None:
    patterns = (
        r'"channelUid"\s*:\s*"([^"]+)"',
        r'"channel"\s*:\s*\{[^{}]*?"channelUid"\s*:\s*"([^"]+)"',
        r"/i/v2/channels/([^/\"'?]+)/products/",
        r"/n/v2/channels/([^/\"'?]+)/products/",
    )
    for pattern in patterns:
        match = re.search(pattern, html or "")
        if match:
            uid = match.group(1).strip()
            if uid and uid.lower() not in {"null", "undefined"}:
                return uid
    return None


def _resolve_smartstore_channel_uid(ref: SmartStoreRef) -> str | None:
    """Resolve channelUid from store slug via Naver internal store lookup."""
    if ref.host_kind == "brand":
        lookup_urls = (
            f"https://brand.naver.com/n/v1/channels?url={ref.store_slug}",
            f"https://smartstore.naver.com/i/v1/smart-stores?url={ref.store_slug}",
        )
    else:
        lookup_urls = (
            f"https://smartstore.naver.com/i/v1/smart-stores?url={ref.store_slug}",
            f"https://brand.naver.com/n/v1/channels?url={ref.store_slug}",
        )
    headers = {
        **_BROWSER_HEADERS,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": ref.source_url,
    }
    timeout = settings.blog_fetch_timeout_seconds
    for lookup_url in lookup_urls:
        try:
            response = requests.get(lookup_url, headers=headers, timeout=timeout)
        except requests.RequestException:
            continue
        if response.status_code == 429 or _looks_like_naver_rate_limit(response.text):
            raise _SmartStoreRateLimited()
        if response.status_code >= 400:
            continue
        try:
            data = response.json()
        except ValueError:
            uid = _extract_smartstore_channel_uid(response.text)
            if uid:
                return uid
            continue
        uid = _channel_uid_from_store_payload(data)
        if uid:
            return uid
    return None


def _channel_uid_from_store_payload(data: object) -> str | None:
    if isinstance(data, dict):
        for key in ("channelUid", "channelId", "id"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                # Prefer channelUid-looking tokens; skip pure numeric store nos when others exist.
                if key == "channelUid" or not value.isdigit():
                    return value.strip()
        channel = data.get("channel")
        if isinstance(channel, dict):
            nested = _channel_uid_from_store_payload(channel)
            if nested:
                return nested
        for key in ("smartStore", "store", "result", "data"):
            nested_obj = data.get(key)
            nested = _channel_uid_from_store_payload(nested_obj)
            if nested:
                return nested
    if isinstance(data, list):
        for item in data:
            nested = _channel_uid_from_store_payload(item)
            if nested:
                return nested
    return None


def _fetch_smartstore_via_api(ref: SmartStoreRef, channel_uid: str) -> ProductContent | None:
    if ref.host_kind == "brand":
        api_urls = (
            f"https://brand.naver.com/n/v2/channels/{channel_uid}/products/{ref.product_id}?withWindow=false",
            f"https://smartstore.naver.com/i/v2/channels/{channel_uid}/products/{ref.product_id}?withWindow=false",
        )
    else:
        api_urls = (
            f"https://smartstore.naver.com/i/v2/channels/{channel_uid}/products/{ref.product_id}?withWindow=false",
            f"https://brand.naver.com/n/v2/channels/{channel_uid}/products/{ref.product_id}?withWindow=false",
        )
    headers = {
        **_BROWSER_HEADERS,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Referer": ref.source_url,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    }
    timeout = settings.blog_fetch_timeout_seconds
    last_status: int | None = None
    for api_url in api_urls:
        try:
            response = requests.get(api_url, headers=headers, timeout=timeout)
        except requests.RequestException as exc:
            logger.warning("Smart Store API request failed %s: %s", api_url, exc)
            continue
        last_status = response.status_code
        if response.status_code == 429 or _looks_like_naver_rate_limit(response.text):
            raise _SmartStoreRateLimited()
        if response.status_code >= 400:
            continue
        try:
            data = response.json()
        except ValueError:
            continue
        if not isinstance(data, dict):
            continue
        product = _smartstore_product_from_api(data, ref)
        if product is not None:
            return product
    if last_status and last_status >= 400:
        logger.warning(
            "Smart Store API returned HTTP %s for product %s",
            last_status,
            ref.product_id,
        )
    return None


def _smartstore_product_from_api(data: dict, ref: SmartStoreRef) -> ProductContent | None:
    title = str(data.get("dispName") or data.get("name") or data.get("productName") or "").strip()
    if not title:
        return None

    price = _smartstore_price_from_api(data)
    bullets = _smartstore_bullets_from_api(data)
    image_urls = _smartstore_images_from_api(data)
    image_urls = _ensure_min_images(image_urls)

    text_parts = [title, f"Source: Naver Smart Store ({ref.store_slug})"]
    if price:
        text_parts.append(f"Price: {price}")
    if bullets:
        text_parts.append("Features:")
        text_parts.extend(f"- {item}" for item in bullets[:12])
    text_parts.append(f"Product URL: {ref.source_url}")
    text = "\n".join(text_parts)[:6000]

    if len(image_urls) < settings.blog_image_min_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"스마트스토어 상품 이미지가 부족합니다 "
                f"({len(image_urls)}개, 최소 {settings.blog_image_min_count}개 필요)."
            ),
        )
    return ProductContent(title=title[:300], text=text, image_urls=image_urls)


def _smartstore_price_from_api(data: dict) -> str | None:
    for key in (
        "dispDiscountedSalePrice",
        "discountedSalePrice",
        "salePrice",
        "dispSalePrice",
        "benefitsView",
    ):
        value = data.get(key)
        if key == "benefitsView" and isinstance(value, dict):
            for nested_key in ("dispDiscountedSalePrice", "discountedSalePrice", "salePrice"):
                nested = value.get(nested_key)
                formatted = _format_krw(nested)
                if formatted:
                    return formatted
            continue
        formatted = _format_krw(value)
        if formatted:
            return formatted
    return None


def _format_krw(value: object) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("원") or "," in text:
            return text
        if text.isdigit():
            return f"{int(text):,}원"
        return text
    if isinstance(value, (int, float)):
        return f"{int(value):,}원"
    return None


def _smartstore_bullets_from_api(data: dict) -> list[str]:
    bullets: list[str] = []

    def _add(text: object) -> None:
        if not isinstance(text, str):
            return
        cleaned = re.sub(r"\s+", " ", text).strip()
        if cleaned and cleaned not in bullets:
            bullets.append(cleaned)

    for key in ("seoInfo", "productInfoProvidedNotice", "detailContents", "benefitsView"):
        value = data.get(key)
        if isinstance(value, dict):
            for nested_key in ("sellerTags", "tagNames", "keywords", "productInfo", "contents"):
                nested = value.get(nested_key)
                if isinstance(nested, list):
                    for item in nested[:8]:
                        if isinstance(item, str):
                            _add(item)
                        elif isinstance(item, dict):
                            _add(item.get("text") or item.get("name") or item.get("value"))
                elif isinstance(nested, str):
                    _add(nested)
        elif isinstance(value, str):
            _add(value)

    category = data.get("category") or data.get("productCategory")
    if isinstance(category, dict):
        path = category.get("categoryName") or category.get("wholeCategoryName")
        _add(path)
    elif isinstance(category, str):
        _add(category)

    brand = data.get("brandName") or data.get("brand")
    if isinstance(brand, dict):
        _add(brand.get("name"))
    else:
        _add(brand)

    return bullets


def _smartstore_images_from_api(data: dict) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()

    def _add(url: object) -> None:
        if not isinstance(url, str):
            return
        cleaned = url.strip().replace("\\u002F", "/").replace("\\/", "/")
        if not cleaned.startswith("http"):
            return
        if "shop-phinf" not in cleaned and "pstatic.net" not in cleaned and "shopping-phinf" not in cleaned:
            # Still allow other https images from Naver CDNs.
            if "naver" not in cleaned and "pstatic" not in cleaned:
                return
        key = cleaned.split("?")[0]
        if key in seen:
            return
        seen.add(key)
        ordered.append(cleaned)

    represent = data.get("representImage")
    if isinstance(represent, dict):
        _add(represent.get("url") or represent.get("imageUrl"))
    elif isinstance(represent, str):
        _add(represent)

    for key in ("productImages", "optionalImages", "images", "detailImages"):
        items = data.get(key)
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, str):
                _add(item)
            elif isinstance(item, dict):
                _add(item.get("url") or item.get("imageUrl") or item.get("src"))

    return ordered[: settings.blog_image_candidate_max_count]


def _smartstore_product_from_html(html: str, ref: SmartStoreRef) -> ProductContent | None:
    if _looks_like_naver_rate_limit(html) or _looks_like_naver_error_page(html):
        return None

    # Prefer embedded product JSON when present (Playwright pages often include it).
    embedded = _extract_embedded_smartstore_product_json(html, ref.product_id)
    if embedded:
        try:
            product = _smartstore_product_from_api(embedded, ref)
            if product is not None:
                return product
        except HTTPException:
            pass

    soup = BeautifulSoup(html or "", "html.parser")
    title = _smartstore_html_title(soup)
    if not title:
        # Try embedded dispName before giving up.
        match = re.search(r'"dispName"\s*:\s*"((?:\\.|[^"\\])*)"', html or "")
        if match:
            title = _unescape_json_string(match.group(1)).strip()
    if not title:
        return None

    price = None
    for key in ("dispDiscountedSalePrice", "discountedSalePrice", "salePrice"):
        match = re.search(rf'"{key}"\s*:\s*("?)(\d+)\1', html or "")
        if match:
            price = _format_krw(match.group(2))
            if price:
                break

    image_urls = _smartstore_html_images(soup, html or "")
    image_urls = _ensure_min_images(image_urls)
    if not image_urls:
        return None

    text_parts = [title, f"Source: Naver Smart Store page ({ref.store_slug})"]
    if price:
        text_parts.append(f"Price: {price}")
    text_parts.append(f"Product URL: {ref.source_url}")
    text = "\n".join(text_parts)[:6000]
    return ProductContent(title=title[:300], text=text, image_urls=image_urls)


def _extract_embedded_smartstore_product_json(html: str, product_id: str) -> dict | None:
    """Best-effort extract of a product object that contains this product id + dispName."""
    if not html or not product_id:
        return None
    # Narrow windows around product id to avoid scanning multi-MB HTML repeatedly.
    for match in re.finditer(re.escape(product_id), html):
        start = max(0, match.start() - 2500)
        end = min(len(html), match.end() + 8000)
        window = html[start:end]
        if "dispName" not in window and "representImage" not in window:
            continue
        # Find a JSON object that includes dispName near this id.
        name_match = re.search(r'"dispName"\s*:\s*"((?:\\.|[^"\\])*)"', window)
        if not name_match:
            continue
        # Reconstruct a minimal product dict from nearby fields.
        data: dict[str, object] = {
            "dispName": _unescape_json_string(name_match.group(1)),
            "id": product_id,
            "productNo": product_id,
        }
        for key in ("dispDiscountedSalePrice", "discountedSalePrice", "salePrice"):
            price_match = re.search(rf'"{key}"\s*:\s*(\d+)', window)
            if price_match:
                data[key] = int(price_match.group(1))
                break
        images: list[dict[str, str]] = []
        for img_match in re.finditer(
            r'"url"\s*:\s*"(https:[^"]+(?:shop-phinf|shopping-phinf)\.pstatic\.net[^"]*)"',
            window,
        ):
            images.append({"url": img_match.group(1).encode("utf-8").decode("unicode_escape", errors="ignore")})
        if images:
            data["representImage"] = images[0]
            data["productImages"] = images
        if data.get("dispName"):
            return data
    return None


def _smartstore_html_title(soup: BeautifulSoup) -> str | None:
    for selector in ('meta[property="og:title"]', 'meta[name="title"]', "title"):
        node = soup.select_one(selector)
        if node is None:
            continue
        if node.name == "meta":
            content = (node.get("content") or "").strip()
            if content:
                return content
        text = node.get_text(" ", strip=True)
        if text:
            return text
    return None


def _smartstore_html_images(soup: BeautifulSoup, html: str) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()

    def _add(url: object) -> None:
        if not isinstance(url, str):
            return
        cleaned = url.strip().replace("\\u002F", "/").replace("\\/", "/")
        if not cleaned.startswith("http"):
            return
        key = cleaned.split("?")[0]
        if key in seen:
            return
        seen.add(key)
        ordered.append(cleaned)

    for meta in soup.select('meta[property="og:image"], meta[name="og:image"]'):
        _add(meta.get("content"))

    for match in re.finditer(
        r"https:\\?/\\?/(?:shop-phinf|shopping-phinf)\.pstatic\.net/[^\"'\\s>]+",
        html,
    ):
        _add(match.group(0).replace("\\/", "/").replace("\\u002F", "/"))

    for match in re.finditer(r'"url"\s*:\s*"(https:[^"]+pstatic\.net[^"]+)"', html):
        _add(match.group(1).encode("utf-8").decode("unicode_escape", errors="ignore"))

    return ordered[: settings.blog_image_candidate_max_count]


def _unescape_json_string(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except json.JSONDecodeError:
        return value.replace('\\"', '"').replace("\\n", " ").replace("\\/", "/")
