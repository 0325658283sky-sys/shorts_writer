"""System visual style presets for Remotion BlogShorts (reference templates)."""

from __future__ import annotations

import copy
from typing import Any

DEFAULT_VISUAL_STYLE = "impact_full"
ALLOWED_TRANSITION_TYPES = frozenset({"fade", "none", "slide"})
DEFAULT_TRANSITION_TYPE = "fade"
DEFAULT_FONT_ID = "gmarket_sans"
ALLOWED_FONT_IDS = frozenset(
    {"pretendard", "paperlogy", "gmarket_sans", "suit", "jalnan"}
)

# Legacy slugs → current presets (DB rows created before the 5-template refresh).
_LEGACY_SLUG_MAP = {
    "fullscreen": "impact_full",
    "card_news": "card_white",
    "info_dark": "info_navy",
    "bold_hook": "viral_cyan",
}

# Normalized canvas coords (1080×1920). fontSize is px at composition width.
_LAYER = dict[str, Any]

def _overlay_with_fonts(layers: dict[str, _LAYER | None]) -> dict[str, Any]:
    return {
        "titleFont": DEFAULT_FONT_ID,
        "captionFont": DEFAULT_FONT_ID,
        **layers,
    }


DEFAULT_OVERLAYS: dict[str, dict[str, Any]] = {
    # Sizes calibrated to reference Shorts samples (1080×1920).
    "impact_full": _overlay_with_fonts(
        {
            "title": {"x": 0.5, "y": 0.08, "fontSize": 72, "color": "#ffffff", "align": "center", "maxWidth": 0.86, "visible": False},
            "subtitle": {"x": 0.5, "y": 0.14, "fontSize": 56, "color": "#ffffff", "align": "center", "maxWidth": 0.86, "visible": False},
            "caption": {"x": 0.5, "y": 0.42, "fontSize": 92, "color": "#ffffff", "align": "center", "maxWidth": 0.82, "visible": True},
        }
    ),
    # Two-line header: title/subtitle 110px, tight stack (ref: Super-Shorts style).
    "info_black": _overlay_with_fonts(
        {
            "title": {"x": 0.5, "y": 0.055, "fontSize": 110, "color": "#ffffff", "align": "center", "maxWidth": 0.92, "visible": True},
            "subtitle": {"x": 0.5, "y": 0.118, "fontSize": 110, "color": "#FFE566", "align": "center", "maxWidth": 0.92, "visible": True},
            "caption": {"x": 0.5, "y": 0.70, "fontSize": 48, "color": "#ffffff", "align": "center", "maxWidth": 0.88, "visible": True},
        }
    ),
    "info_navy": _overlay_with_fonts(
        {
            "title": {"x": 0.5, "y": 0.055, "fontSize": 110, "color": "#ffffff", "align": "center", "maxWidth": 0.92, "visible": True},
            "subtitle": {"x": 0.5, "y": 0.118, "fontSize": 110, "color": "#7CFFB2", "align": "center", "maxWidth": 0.92, "visible": True},
            "caption": {"x": 0.5, "y": 0.685, "fontSize": 46, "color": "#ffffff", "align": "center", "maxWidth": 0.86, "visible": True},
        }
    ),
    "viral_cyan": _overlay_with_fonts(
        {
            "title": {"x": 0.5, "y": 0.05, "fontSize": 110, "color": "#5EF2D0", "align": "center", "maxWidth": 0.92, "visible": True},
            "subtitle": {"x": 0.5, "y": 0.113, "fontSize": 110, "color": "#ffffff", "align": "center", "maxWidth": 0.92, "visible": True},
            "caption": {"x": 0.5, "y": 0.64, "fontSize": 46, "color": "#ffffff", "align": "center", "maxWidth": 0.84, "visible": True},
        }
    ),
    "card_white": _overlay_with_fonts(
        {
            "title": {"x": 0.5, "y": 0.05, "fontSize": 110, "color": "#151515", "align": "center", "maxWidth": 0.9, "visible": True},
            "subtitle": {"x": 0.5, "y": 0.113, "fontSize": 110, "color": "#151515", "align": "center", "maxWidth": 0.9, "visible": False},
            "caption": {"x": 0.5, "y": 0.72, "fontSize": 44, "color": "#151515", "align": "center", "maxWidth": 0.84, "visible": True},
        }
    ),
    # AlphaCut-style: white/yellow header + letterbox video + channel profile footer.
    "yt_profile": _overlay_with_fonts(
        {
            "title": {"x": 0.5, "y": 0.06, "fontSize": 92, "color": "#ffffff", "align": "center", "maxWidth": 0.9, "visible": True},
            "subtitle": {"x": 0.5, "y": 0.125, "fontSize": 92, "color": "#FFE566", "align": "center", "maxWidth": 0.9, "visible": True},
            "caption": {"x": 0.5, "y": 0.58, "fontSize": 40, "color": "#ffffff", "align": "center", "maxWidth": 0.86, "visible": True},
        }
    ),
}

# Prompt hints for LLM hook-title generation per style (Korean Shorts / Super-Shorts style).
TITLE_STYLE_HINTS: dict[str, str] = {
    "impact_full": (
        "Single on-screen hook line in style_title; keep style_subtitle empty. "
        "Aim 18–28 Korean chars. Must use curiosity gap, FOMO/time-change, contrast, "
        "concrete scene, or result-first — never a topic label."
    ),
    "info_black": (
        "Two-line hook: style_title = white line (tension/setup), "
        "style_subtitle = yellow accent (payoff/checklist). Each line ~12–20 chars; "
        "combined feel like a scroll-stopping Shorts header."
    ),
    "info_navy": (
        "Two-line hook: style_title = white setup, style_subtitle = neon-green payoff. "
        "Same viral rules as info_black; clean but still curiosity-driven."
    ),
    "viral_cyan": (
        "Two-line viral hook: style_title = curiosity/FOMO line, "
        "style_subtitle = punchy follow-up. Energetic; grounded in the post."
    ),
    "card_white": (
        "Card headline: style_title may use a newline for 2 black lines (total ~28–40 chars). "
        "style_subtitle usually empty. News-card look but still hooky, not bland summary."
    ),
    "yt_profile": (
        "Two-line Shorts header: style_title = white hook (tension/FOMO), "
        "style_subtitle = yellow payoff. Each line ~10–18 Korean chars; "
        "must feel like AlphaCut info Shorts title stack."
    ),
}

VISUAL_STYLES: dict[str, dict[str, Any]] = {
    "impact_full": {
        "slug": "impact_full",
        "label": "전체 · 임팩트",
        "description": "풀스크린 배경 + 중앙 임팩트 자막.",
        "badge": "NEW",
        "previewImage": "/style-previews/impact_full.png",
        "layout": "fullscreen",
        "mediaFit": "cover",
        "canvasBg": "#000000",
        "caption": "center_stroke",
        "header": "none",
        "titleColor": "#ffffff",
        "accent": "#ffffff",
        "transitionSec": 0.35,
        "transitionType": "fade",
        "kenBurns": True,
        "packHint": "브라이트 BGM · 전환 SFX",
        "recommendedVoice": "alloy",
        "recommendedBgmSlug": "bright_lift",
        "recommendedAutoSfx": True,
    },
    "info_black": {
        "slug": "info_black",
        "label": "정보성 · 블랙",
        "description": "검정 레터박스 + 가로형 미디어 + 상단 투톤 타이틀.",
        "badge": None,
        "previewImage": "/style-previews/info_black.png",
        "layout": "letterbox",
        "mediaFit": "cover",
        "canvasBg": "#000000",
        "caption": "bottom_outline",
        "header": "info_black",
        "titleColor": "#ffffff",
        "accent": "#FFE566",
        "transitionSec": 0.35,
        "transitionType": "fade",
        "kenBurns": False,
        "packHint": "소프트 패드 BGM",
        "recommendedVoice": "nova",
        "recommendedBgmSlug": "soft_pad",
        "recommendedAutoSfx": False,
    },
    "info_navy": {
        "slug": "info_navy",
        "label": "정보성 · 네이비",
        "description": "네이비 배경 + 가로형 미디어 + 네온 포인트 타이틀.",
        "badge": None,
        "previewImage": "/style-previews/info_navy.png",
        "layout": "letterbox",
        "mediaFit": "cover",
        "canvasBg": "#0B1F3A",
        "caption": "black_box",
        "header": "info_navy",
        "titleColor": "#ffffff",
        "accent": "#7CFFB2",
        "transitionSec": 0.35,
        "transitionType": "fade",
        "kenBurns": False,
        "packHint": "칼름 드론 BGM",
        "recommendedVoice": "onyx",
        "recommendedBgmSlug": "calm_drone",
        "recommendedAutoSfx": False,
    },
    "viral_cyan": {
        "slug": "viral_cyan",
        "label": "바이럴 · 시안",
        "description": "검정 상단 타이틀 바 + 풀폭 미디어 + 블랙박스 자막.",
        "badge": None,
        "previewImage": "/style-previews/viral_cyan.png",
        "layout": "header_stack",
        "mediaFit": "cover",
        "canvasBg": "#000000",
        "caption": "black_box",
        "header": "viral_cyan",
        "titleColor": "#5EF2D0",
        "accent": "#ffffff",
        "transitionSec": 0.25,
        "transitionType": "slide",
        "kenBurns": True,
        "packHint": "프로모 펄스 · 전환 SFX",
        "recommendedVoice": "shimmer",
        "recommendedBgmSlug": "promo_pulse",
        "recommendedAutoSfx": True,
    },
    "card_white": {
        "slug": "card_white",
        "label": "카드 · 화이트",
        "description": "흰 배경 상단 타이틀 + 인셋 미디어 + 흰 알약 자막.",
        "badge": None,
        "previewImage": "/style-previews/card_white.png",
        "layout": "card",
        "mediaFit": "cover",
        "canvasBg": "#ffffff",
        "caption": "white_pill",
        "header": "card_white",
        "titleColor": "#151515",
        "accent": "#151515",
        "transitionSec": 0.35,
        "transitionType": "fade",
        "kenBurns": True,
        "packHint": "라이트 웜 BGM",
        "recommendedVoice": "nova",
        "recommendedBgmSlug": "light_warm",
        "recommendedAutoSfx": False,
    },
    "yt_profile": {
        "slug": "yt_profile",
        "label": "유튜브 · 프로필",
        "description": "상단 투톤 타이틀 + 가로형 영상 + 채널 프로필·제목 하단.",
        "badge": "NEW",
        "previewImage": None,
        "layout": "letterbox",
        "mediaFit": "contain",
        "canvasBg": "#1B2838",
        "caption": "black_box",
        "header": "yt_profile",
        "titleColor": "#ffffff",
        "accent": "#FFE566",
        "transitionSec": 0.35,
        "transitionType": "fade",
        "kenBurns": False,
        "packHint": "정보형 쇼츠 · 채널 프로필",
        "recommendedVoice": "onyx",
        "recommendedBgmSlug": "calm_drone",
        "recommendedAutoSfx": False,
    },
}

ALLOWED_VISUAL_STYLES = set(VISUAL_STYLES.keys()) | set(_LEGACY_SLUG_MAP.keys())
ALLOWED_OVERLAY_KEYS = frozenset({"title", "subtitle", "caption"})


def normalize_font_id(value: str | None) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned in ALLOWED_FONT_IDS:
        return cleaned
    return DEFAULT_FONT_ID
ALLOWED_ALIGN = frozenset({"left", "center", "right"})


def list_visual_styles() -> list[dict[str, Any]]:
    items = [dict(item) for item in VISUAL_STYLES.values()]
    items.sort(key=lambda item: 0 if item.get("slug") == "yt_profile" else 1)
    return items


def normalize_visual_style(slug: str | None) -> str:
    if not slug:
        return DEFAULT_VISUAL_STYLE
    cleaned = slug.strip().lower()
    cleaned = _LEGACY_SLUG_MAP.get(cleaned, cleaned)
    if cleaned in VISUAL_STYLES:
        return cleaned
    return DEFAULT_VISUAL_STYLE


def normalize_transition_type(value: str | None) -> str:
    if value and value in ALLOWED_TRANSITION_TYPES:
        return value
    return DEFAULT_TRANSITION_TYPE


def resolve_visual_style(slug: str | None) -> dict[str, Any]:
    return dict(VISUAL_STYLES[normalize_visual_style(slug)])


def default_style_overlay(slug: str | None) -> dict[str, Any]:
    key = normalize_visual_style(slug)
    return copy.deepcopy(DEFAULT_OVERLAYS[key])


def merge_style_overlay(slug: str | None, custom: dict[str, Any] | None) -> dict[str, Any]:
    base = default_style_overlay(slug)
    if not custom:
        return base
    if "titleFont" in custom:
        base["titleFont"] = normalize_font_id(str(custom.get("titleFont") or ""))
    if "captionFont" in custom:
        base["captionFont"] = normalize_font_id(str(custom.get("captionFont") or ""))
    for key in ALLOWED_OVERLAY_KEYS:
        layer = custom.get(key)
        if not isinstance(layer, dict):
            continue
        merged = dict(base.get(key) or {})
        for field, value in layer.items():
            if field == "align" and value not in ALLOWED_ALIGN:
                continue
            if field in {"x", "y", "maxWidth"} and isinstance(value, (int, float)):
                merged[field] = max(0.0, min(1.0, float(value)))
            elif field == "fontSize" and isinstance(value, (int, float)):
                merged[field] = max(16, min(140, int(value)))
            elif field == "color" and isinstance(value, str) and value.strip():
                merged[field] = value.strip()
            elif field == "align" and isinstance(value, str):
                merged[field] = value
            elif field == "visible" and isinstance(value, bool):
                merged[field] = value
        base[key] = merged
    return base


def sanitize_style_overlay(payload: dict[str, Any] | None) -> dict[str, Any]:
    """Persist only known overlay fields (layers + role fonts)."""
    if not payload:
        return {}
    out: dict[str, Any] = {}
    if "titleFont" in payload:
        out["titleFont"] = normalize_font_id(str(payload.get("titleFont") or ""))
    if "captionFont" in payload:
        out["captionFont"] = normalize_font_id(str(payload.get("captionFont") or ""))
    for key in ALLOWED_OVERLAY_KEYS:
        layer = payload.get(key)
        if not isinstance(layer, dict):
            continue
        cleaned: dict[str, Any] = {}
        if "x" in layer and isinstance(layer["x"], (int, float)):
            cleaned["x"] = max(0.0, min(1.0, float(layer["x"])))
        if "y" in layer and isinstance(layer["y"], (int, float)):
            cleaned["y"] = max(0.0, min(1.0, float(layer["y"])))
        if "fontSize" in layer and isinstance(layer["fontSize"], (int, float)):
            cleaned["fontSize"] = max(16, min(140, int(layer["fontSize"])))
        if "color" in layer and isinstance(layer["color"], str) and layer["color"].strip():
            cleaned["color"] = layer["color"].strip()
        if "align" in layer and layer["align"] in ALLOWED_ALIGN:
            cleaned["align"] = layer["align"]
        if "maxWidth" in layer and isinstance(layer["maxWidth"], (int, float)):
            cleaned["maxWidth"] = max(0.2, min(1.0, float(layer["maxWidth"])))
        if "visible" in layer and isinstance(layer["visible"], bool):
            cleaned["visible"] = layer["visible"]
        if cleaned:
            out[key] = cleaned
    return out


def remotion_style_payload(slug: str | None) -> dict[str, Any]:
    style = resolve_visual_style(slug)
    return {
        "layout": style["layout"],
        "mediaFit": style.get("mediaFit", "cover"),
        "canvasBg": style.get("canvasBg", "#000000"),
        "caption": style["caption"],
        "header": style["header"],
        "titleColor": style.get("titleColor", "#ffffff"),
        "accent": style["accent"],
        "transitionSec": style["transitionSec"],
        "transitionType": style.get("transitionType", DEFAULT_TRANSITION_TYPE),
        "kenBurns": style["kenBurns"],
    }


def title_style_hint(slug: str | None) -> str:
    return TITLE_STYLE_HINTS.get(normalize_visual_style(slug), TITLE_STYLE_HINTS[DEFAULT_VISUAL_STYLE])
