"""Vision ranking for product-page images (Amazon / Smart Store).

Never raises into the blog pipeline: OpenAI/quota/parse failures fall back to
the original scrape order so boards still get created.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from openai import OpenAI, OpenAIError

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_CATEGORIES = frozenset(
    {"product_shot", "banner_text", "size_chart", "lifestyle", "other"}
)
VISION_BATCH_SIZE = 5
VISION_MAX_IMAGES = 20
VISION_MODEL = "gpt-4o-mini"

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)


def classify_product_images(image_urls: list[str], product_title: str) -> list[dict]:
    """Classify product images for Shorts boards.

    Returns ``[{url, category, score}]`` where category is one of
    product_shot / banner_text / size_chart / lifestyle / other and score is 0–100.
    On any failure (missing key, rate limit, bad JSON) returns ``[]`` so callers
    keep the scrape order.
    """
    urls = [str(url).strip() for url in image_urls if str(url or "").strip()]
    urls = urls[:VISION_MAX_IMAGES]
    if not urls:
        return []
    if not (settings.openai_api_key or "").strip():
        logger.info("Skipping product image vision: OPENAI_API_KEY is not configured.")
        return []

    title = (product_title or "").strip() or "Unknown product"
    classified: list[dict] = []
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        for start in range(0, len(urls), VISION_BATCH_SIZE):
            batch = urls[start : start + VISION_BATCH_SIZE]
            try:
                classified.extend(_classify_batch(client, batch, title))
            except Exception:
                logger.warning(
                    "Product image vision batch failed (%s urls starting at %s); continuing.",
                    len(batch),
                    start,
                    exc_info=True,
                )
    except Exception:
        logger.warning("Product image vision classification failed; using scrape order.", exc_info=True)
        return []
    return classified


def rank_product_image_urls(image_urls: list[str], product_title: str) -> list[str]:
    """Return URLs with the first ``VISION_MAX_IMAGES`` ranked by vision score.

    Images beyond the cap keep their original order after the ranked head.
    Empty classification → original list unchanged.
    """
    urls = list(image_urls)
    if not urls:
        return []
    head = urls[:VISION_MAX_IMAGES]
    tail = urls[VISION_MAX_IMAGES:]
    try:
        classified = classify_product_images(head, product_title)
    except Exception:
        logger.warning("Product image ranking failed; using scrape order.", exc_info=True)
        return urls
    score_by_url = _scores_by_url(classified)
    if not score_by_url:
        return urls
    ranked_head = sorted(
        range(len(head)),
        key=lambda index: (-score_by_url.get(head[index], 0), index),
    )
    return [head[index] for index in ranked_head] + tail


def reorder_downloaded_product_images(
    downloaded: list[tuple[Path, str]],
    product_title: str,
) -> list[tuple[Path, str]]:
    """Reorder downloaded (path, source_url) tuples by vision score; never raises."""
    if not downloaded:
        return downloaded
    try:
        urls = [source_url for _path, source_url in downloaded]
        ranked_urls = rank_product_image_urls(urls, product_title)
        buckets: dict[str, list[tuple[Path, str]]] = {}
        for item in downloaded:
            buckets.setdefault(item[1], []).append(item)
        ordered: list[tuple[Path, str]] = []
        for url in ranked_urls:
            bucket = buckets.get(url)
            if bucket:
                ordered.append(bucket.pop(0))
        for leftover in buckets.values():
            ordered.extend(leftover)
        if len(ordered) != len(downloaded):
            return downloaded
        return ordered
    except Exception:
        logger.warning("Product image reorder failed; using scrape order.", exc_info=True)
        return downloaded


def _scores_by_url(classified: list[dict]) -> dict[str, int]:
    scores: dict[str, int] = {}
    for item in classified:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        try:
            score = int(item.get("score"))
        except (TypeError, ValueError):
            continue
        scores[url] = max(0, min(100, score))
    return scores


def _classify_batch(client: OpenAI, batch: list[str], product_title: str) -> list[dict]:
    numbered = "\n".join(f"{index + 1}. {url}" for index, url in enumerate(batch))
    prompt = f"""You rank product listing images for a vertical Shorts video.

Product title: {product_title}

Score each image 0-100:
- High (75-100): clean product close-up or hero shot; the product fills most of the frame; no heavy overlay text.
- Mid (40-74): lifestyle / in-use photo where the product is still clearly visible.
- Low (0-39): text banners, watermarks, size charts, infographics, detail-page screenshots, logos-only, collages of tiny thumbnails.

Categories (pick one): product_shot, lifestyle, banner_text, size_chart, other.

Images:
{numbered}

Return ONLY JSON:
{{"images":[{{"index":1,"url":"<exact url>","category":"product_shot","score":90}}]}}
Include every image. index is 1-based in this batch.
"""
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for url in batch:
        content.append({"type": "image_url", "image_url": {"url": url, "detail": "low"}})

    try:
        response = client.chat.completions.create(
            model=VISION_MODEL,
            messages=[{"role": "user", "content": content}],
            response_format={"type": "json_object"},
            max_tokens=800,
        )
        raw = (response.choices[0].message.content or "").strip()
    except OpenAIError:
        raise

    parsed = _parse_images_payload(raw)
    by_index: dict[int, dict] = {}
    by_url: dict[str, dict] = {}
    for item in parsed:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        category = str(item.get("category") or "other").strip().lower()
        if category not in ALLOWED_CATEGORIES:
            category = "other"
        try:
            score = max(0, min(100, int(item.get("score"))))
        except (TypeError, ValueError):
            score = 0
        record = {"url": url, "category": category, "score": score}
        try:
            index = int(item.get("index"))
        except (TypeError, ValueError):
            index = 0
        if index:
            by_index[index] = record
        if url:
            by_url[url] = record

    out: list[dict] = []
    for position, url in enumerate(batch, start=1):
        record = by_url.get(url) or by_index.get(position)
        if record is None:
            out.append({"url": url, "category": "other", "score": 0})
            continue
        out.append({"url": url, "category": record["category"], "score": record["score"]})
    return out


def _parse_images_payload(raw: str) -> list[Any]:
    text = (raw or "").strip()
    if not text:
        return []
    fenced = _JSON_FENCE_RE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        images = data.get("images")
        if isinstance(images, list):
            return images
    return []
