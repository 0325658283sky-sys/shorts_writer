"""System-provided video templates, built on template schema v1.

These are the templates a user picks from before anything is customized. The
quality of this catalog is most of what a user judges the product by, so the
rules from docs/FLOW_REDESIGN.md apply here:

- Names say what the template is FOR, never a number. "강연 · 큰 자막", not
  "추천 스타일 13".
- Every genre the analyzer can infer has templates, so the result screen can
  put fitting ones first.
- Every caption motion appears at least once, so the catalog actually shows
  what the renderer can do.

Each entry is a sparse override merged through ``normalize_template``, so a
template can never drift out of schema: unknown keys are dropped and
out-of-range values are clamped at import time.
"""

from __future__ import annotations

from typing import Any

from app.services.template_schema import (
    ALLOWED_CAPTION_MOTIONS,
    normalize_template,
    validate_template,
)

# Shared ink/accent pairs. Keeping them named means a palette change is one
# edit rather than a search across eighteen literals.
INK_ON_DARK = "#ffffff"
INK_ON_LIGHT = "#15171c"
AMBER = "#f2a33c"
ON_AMBER = "#1a1206"
MINT = "#7cffb2"
CYAN = "#5ef2d0"
LEMON = "#ffe566"

_DROP_SHADOW = {
    "enabled": True,
    "color": "#000000",
    "offset": 4,
    "blur": 18,
    "angle": 45,
    "strength": 3,
}
_NO_SHADOW = {"enabled": False, "color": "#000000", "offset": 0, "blur": 0, "angle": 0, "strength": 0}

# Media band presets, in normalized canvas coords (1080x1920).
_BAND_MID = {"x": 0.0, "y": 0.30, "w": 1.0, "h": 0.40}
_BAND_TALL = {"x": 0.0, "y": 0.17, "w": 1.0, "h": 0.56}
_BAND_FULL = {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
_BAND_CARD = {"x": 0.06, "y": 0.26, "w": 0.88, "h": 0.38}


def _default_title_strokes(color: str) -> list[dict[str, Any]]:
    """밝은 글자엔 검은 외곽선을 기본으로 둔다. 영상 위에서도 읽혀야 한다."""
    if color == INK_ON_LIGHT:
        return []
    return [{"color": "#000000", "width": 8}]


def _tpl(
    slug: str,
    name: str,
    genre: str,
    *,
    ratio: str = "4:3",
    canvas_bg: str = "#000000",
    screen_style: str = "solid",
    media_rect: dict[str, float] | None = None,
    title_color: str = INK_ON_DARK,
    title_size: int = 96,
    title_lines: int = 2,
    title_y: float = 0.14,
    title_visible: bool = True,
    title_strokes: list[dict[str, Any]] | None = None,
    title_shadow: dict[str, Any] | None = None,
    motion: str = "pop",
    scope: str = "word",
    caption_color: str = INK_ON_DARK,
    caption_size: int = 76,
    caption_y: float = 0.74,
    caption_lines: int = 2,
    caption_bg: dict[str, Any] | None = None,
    caption_shadow: dict[str, Any] | None = None,
    caption_strokes: list[dict[str, Any]] | None = None,
    highlight: str = AMBER,
    on_highlight: str = ON_AMBER,
) -> dict[str, Any]:
    return normalize_template(
        {
            "slug": slug,
            "name": name,
            "genre": genre,
            "layout": {
                "ratio": ratio,
                "screenStyle": screen_style,
                "canvasBg": canvas_bg,
                "mediaFit": "cover",
                "mediaRect": media_rect or _BAND_MID,
            },
            "title": {
                "visible": title_visible,
                "lines": title_lines,
                "fontSize": title_size,
                "color": title_color,
                "shadow": title_shadow or _DROP_SHADOW,
                "strokes": title_strokes if title_strokes is not None else _default_title_strokes(title_color),
                "position": {"x": 0.5, "y": title_y, "maxWidth": 0.9},
            },
            "caption": {
                "lines": caption_lines,
                "fontSize": caption_size,
                "color": caption_color,
                "motion": motion,
                "scope": scope,
                "highlightColor": highlight,
                "highlightTextColor": on_highlight,
                "background": caption_bg
                or {"enabled": False, "color": "#000000", "padding": 10, "radius": 6},
                "shadow": caption_shadow or _DROP_SHADOW,
                "strokes": caption_strokes or [],
                "position": {"x": 0.5, "y": caption_y, "maxWidth": 0.88},
            },
        }
    )


_BOX_BG = {"enabled": True, "color": "#000000", "padding": 12, "radius": 6}
_WHITE_BOX_BG = {"enabled": True, "color": "#ffffff", "padding": 12, "radius": 8}


SYSTEM_TEMPLATES: list[dict[str, Any]] = [
    # --- 강연 · 인터뷰 ------------------------------------------------------
    _tpl(
        "lecture_big_caption", "강연 · 큰 자막", "lecture",
        canvas_bg="#122a52", title_color=INK_ON_DARK, title_size=99,
        motion="pop", caption_size=78,
        title_strokes=[{"color": "#071630", "width": 6}],
    ),
    _tpl(
        "lecture_karaoke", "강연 · 따라 읽기", "lecture",
        canvas_bg="#101218", title_color=LEMON, title_size=97,
        motion="karaoke", caption_size=76, highlight=LEMON, on_highlight="#1a1500",
    ),
    _tpl(
        "lecture_mint_lift", "강연 · 민트 강조", "lecture",
        ratio="9:16", canvas_bg="#0f2b2a", media_rect=_BAND_TALL,
        title_color=MINT, title_size=94, motion="elevate",
        caption_size=73, highlight=MINT, on_highlight="#04221c",
    ),
    _tpl(
        "interview_lower_third", "인터뷰 · 하단 띠", "lecture",
        ratio="16:9", canvas_bg="#16181f", media_rect=_BAND_MID,
        title_size=88, motion="fade_in", caption_lines=1, caption_size=64,
        caption_y=0.86, caption_bg=_BOX_BG, caption_shadow=_NO_SHADOW,
    ),

    # --- 예능 · 리액션 ------------------------------------------------------
    _tpl(
        "variety_neon", "예능 · 네온", "entertainment",
        ratio="9:16", canvas_bg="#171a2a", media_rect=_BAND_TALL,
        title_color=CYAN, title_size=100, motion="neon",
        caption_lines=1, caption_size=80, highlight=CYAN, on_highlight="#04231d",
    ),
    _tpl(
        "variety_yellow_pop", "예능 · 노란 팝", "entertainment",
        canvas_bg="#2a1230", title_color=LEMON, title_size=100,
        motion="pop", caption_lines=1, caption_size=80,
        highlight=LEMON, on_highlight="#1a1500",
    ),
    _tpl(
        "reaction_box_pop", "리액션 · 박스 팝", "entertainment",
        canvas_bg="#1c1020", title_size=99, motion="box_highlight",
        caption_lines=1, caption_size=80, caption_shadow=_NO_SHADOW,
    ),
    _tpl(
        "variety_karaoke", "예능 · 가사처럼", "entertainment",
        canvas_bg="#201424", title_color=AMBER, title_size=99,
        motion="karaoke", caption_lines=1, caption_size=78,
    ),

    # --- 정보 · 뉴스 --------------------------------------------------------
    _tpl(
        "info_box_caption", "정보 · 박스 자막", "info",
        canvas_bg="#13283f", title_size=97, motion="box_highlight",
        caption_size=70, caption_shadow=_NO_SHADOW,
    ),
    _tpl(
        "news_reveal", "뉴스 · 한 줄씩", "info",
        canvas_bg="#1a1d24", title_size=91, motion="fade_in",
        caption_lines=1, caption_size=67, caption_y=0.84,
        caption_bg=_BOX_BG, caption_shadow=_NO_SHADOW,
    ),
    _tpl(
        "info_card_light", "정보 · 흰 카드", "info",
        ratio="1:1", canvas_bg="#f4f2ee", screen_style="image",
        media_rect=_BAND_CARD, title_color=INK_ON_LIGHT, title_size=94,
        title_shadow=_NO_SHADOW, motion="fade_in",
        caption_color=INK_ON_LIGHT, caption_size=64,
        caption_shadow=_NO_SHADOW, highlight=AMBER,
    ),
    _tpl(
        "info_point", "정보 · 짚어주기", "info",
        canvas_bg="#0d1b2a", title_size=94, motion="elevate",
        caption_lines=1, caption_size=67, highlight=CYAN, on_highlight="#04231d",
    ),

    # --- 리뷰 · 상품 --------------------------------------------------------
    _tpl(
        "review_static", "리뷰 · 정적 자막", "review",
        canvas_bg="#f1ece4", screen_style="image", media_rect=_BAND_CARD,
        title_color=INK_ON_LIGHT, title_size=91, title_shadow=_NO_SHADOW,
        motion="none", caption_color=INK_ON_LIGHT, caption_size=64,
        caption_bg=_WHITE_BOX_BG, caption_shadow=_NO_SHADOW,
    ),
    _tpl(
        "review_price_pop", "리뷰 · 가격 강조", "review",
        canvas_bg="#2a1a12", title_color=AMBER, title_size=99,
        motion="box_highlight", caption_size=76, caption_shadow=_NO_SHADOW,
    ),
    _tpl(
        "unboxing_typewriter", "언박싱 · 타자기", "review",
        ratio="9:16", canvas_bg="#141210", media_rect=_BAND_TALL,
        title_size=91, motion="typewriter", caption_lines=1, caption_size=70,
        caption_bg=_BOX_BG, caption_shadow=_NO_SHADOW,
    ),

    # --- 브이로그 -----------------------------------------------------------
    _tpl(
        "vlog_soft", "브이로그 · 부드럽게", "vlog",
        ratio="9:16", canvas_bg="#1b1714", media_rect=_BAND_FULL,
        title_visible=False, motion="fade_in", caption_lines=1,
        caption_size=64, caption_y=0.84,
    ),
    _tpl(
        "vlog_mint_pop", "브이로그 · 민트 팝", "vlog",
        ratio="9:16", canvas_bg="#191c1a", media_rect=_BAND_FULL,
        title_visible=False, motion="pop", caption_lines=1,
        caption_size=64, caption_y=0.82, highlight=MINT, on_highlight="#04221c",
    ),

    # --- 범용 ---------------------------------------------------------------
    _tpl(
        "basic_default", "기본", "any",
        canvas_bg="#16181f", title_size=94, motion="box_highlight", caption_size=73,
        caption_shadow=_NO_SHADOW,
    ),
    _tpl(
        "basic_yellow", "기본 · 노란 강조", "any",
        canvas_bg="#0e0e11", title_color=LEMON, motion="pop",
        highlight=LEMON, on_highlight="#1a1500",
    ),
    _tpl(
        "basic_box", "기본 · 박스 자막", "any",
        canvas_bg="#0f1a2e", motion="box_highlight", caption_size=74,
        caption_bg=_BOX_BG, caption_shadow=_NO_SHADOW, highlight=CYAN, on_highlight="#04231d",
    ),
]

SYSTEM_TEMPLATES_BY_SLUG: dict[str, dict[str, Any]] = {
    item["slug"]: item for item in SYSTEM_TEMPLATES
}

DEFAULT_TEMPLATE_SLUG = "basic_default"


def list_system_templates(genre: str | None = None) -> list[dict[str, Any]]:
    """Templates for the picker. With a genre, that genre's first, then the rest.

    Nothing is hidden — a user who wants an entertainment look on a lecture is
    not wrong, they just see fewer clicks to the likely choice.
    """
    items = [dict(item) for item in SYSTEM_TEMPLATES]
    if not genre or genre == "any":
        return items
    matching = [item for item in items if item["genre"] == genre]
    rest = [item for item in items if item["genre"] != genre]
    return matching + rest


def get_system_template(slug: str | None) -> dict[str, Any]:
    key = (slug or "").strip()
    return dict(SYSTEM_TEMPLATES_BY_SLUG.get(key, SYSTEM_TEMPLATES_BY_SLUG[DEFAULT_TEMPLATE_SLUG]))


def motions_in_use() -> set[str]:
    return {item["caption"]["motion"] for item in SYSTEM_TEMPLATES}


def unused_motions() -> set[str]:
    """Motions the renderer supports that no system template shows off."""
    return set(ALLOWED_CAPTION_MOTIONS) - motions_in_use()


# Fail at import rather than at render time if an entry drifts out of schema.
for _item in SYSTEM_TEMPLATES:
    _problems = validate_template(_item)
    if _problems:  # pragma: no cover - guarded by tests
        raise ValueError(f"invalid system template {_item['slug']}: {_problems}")
