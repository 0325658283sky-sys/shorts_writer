"""Video template schema v1 — the 9-axis spec described in docs/FLOW_REDESIGN.md.

This module defines the structured template format that replaces the flat
preset dicts in ``visual_style_catalog.py``. It is additive: the legacy
catalog keeps working for the blog pipeline, and ``from_visual_style`` bridges
a legacy slug (plus its overlay) into a v1 template so both can coexist during
the migration.

The nine axes:

    1. layers     element z-order and visibility
    2. layout     aspect ratio, screen style, media placement
    3. title      the header text block
    4. caption    the spoken-word subtitle block (title spec + motion + scope)
    5. texts      additional fixed text elements
    6. images     fixed image elements
    7. brand      logo / CTA
    8. outro      trailing clip
    9. audio      background music

Nothing here renders. It defines, validates and normalizes the data that the
Remotion renderer and the template editor both read.
"""

from __future__ import annotations

import copy
from typing import Any

from app.services.visual_style_catalog import (
    ALLOWED_FONT_IDS,
    DEFAULT_FONT_ID,
    default_style_overlay,
    normalize_font_id,
    normalize_visual_style,
    resolve_visual_style,
)

TEMPLATE_SCHEMA_VERSION = 1

# --- axis 2: layout ---------------------------------------------------------

ALLOWED_RATIOS = frozenset({"16:9", "4:3", "1:1", "9:16", "dual"})
DEFAULT_RATIO = "4:3"

ALLOWED_SCREEN_STYLES = frozenset({"solid", "glass", "image"})
DEFAULT_SCREEN_STYLE = "solid"

ALLOWED_MEDIA_FITS = frozenset({"cover", "contain"})
DEFAULT_MEDIA_FIT = "cover"

# --- axis 1: layers ---------------------------------------------------------

LAYER_KINDS = ("caption", "title", "text", "image", "brand", "outro")

# --- axis 4: caption motion -------------------------------------------------
# Eight presets. Keep in sync with remotion/src/captionMotion.ts.
#
# Four were cut after watching them render (remotion/out/motions):
#   bounce, slide_up   — indistinguishable from pop and fade_in; the transform
#                        settles in ~0.2s and only the colour change reads.
#   pop_group, box_line — animated the line once on entry, then sat still for
#                        the rest of the board. A line-level motion worth
#                        having would follow the spoken word across the line,
#                        which is a different design, not a tweak to these.

CAPTION_MOTIONS = (
    "none",
    "pop",
    "box_highlight",
    "fade_in",
    "elevate",
    "karaoke",
    "neon",
    "typewriter",
)
ALLOWED_CAPTION_MOTIONS = frozenset(CAPTION_MOTIONS)
DEFAULT_CAPTION_MOTION = "pop"

MOTION_LABELS_KO = {
    "none": "효과 없음",
    "pop": "팝",
    "box_highlight": "박스 하이라이팅",
    "fade_in": "페이드 인",
    "elevate": "엘리베이트",
    "karaoke": "카라오케",
    "neon": "네온사인",
    "typewriter": "타자기",
}

ALLOWED_CAPTION_SCOPES = frozenset({"word", "line", "segment"})
DEFAULT_CAPTION_SCOPE = "word"

# --- shared text spec -------------------------------------------------------

ALLOWED_ALIGN = frozenset({"left", "center", "right"})

# Legacy visual-style slug -> genre, used by from_visual_style().
_STYLE_GENRE_HINT = {
    "impact_full": "any",
    "info_black": "info",
    "info_navy": "info",
    "viral_cyan": "entertainment",
    "card_white": "review",
    "yt_profile": "lecture",
}

ALLOWED_GENRES = frozenset(
    {"any", "lecture", "entertainment", "info", "review", "vlog"}
)
DEFAULT_GENRE = "any"

GENRE_LABELS_KO = {
    "any": "자동",
    "lecture": "강연·인터뷰",
    "entertainment": "예능·리액션",
    "info": "정보·뉴스",
    "review": "리뷰·상품",
    "vlog": "브이로그·일상",
}


def _clamp(value: Any, low: float, high: float, fallback: float) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return fallback
    return max(low, min(high, float(value)))


def _clamp_int(value: Any, low: int, high: int, fallback: int) -> int:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return fallback
    return max(low, min(high, int(value)))


def _hex_color(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned.startswith("#") and len(cleaned) in (4, 7, 9):
            return cleaned.lower()
    return fallback


def _bool(value: Any, fallback: bool) -> bool:
    return value if isinstance(value, bool) else fallback


def _one_of(value: Any, allowed: frozenset[str], fallback: str) -> str:
    if isinstance(value, str) and value.strip().lower() in allowed:
        return value.strip().lower()
    return fallback


# --- defaults ---------------------------------------------------------------


def default_text_spec(
    *,
    font_size: int = 70,
    color: str = "#ffffff",
    y: float = 0.08,
    lines: int = 2,
    visible: bool = True,
) -> dict[str, Any]:
    """One text block: the shape shared by title, caption and free text."""
    return {
        "visible": visible,
        "lines": lines,
        "font": DEFAULT_FONT_ID,
        "fontSize": font_size,
        "fontWeight": 700,
        "letterSpacing": 0,
        "lineHeight": 1.3,
        "align": "center",
        "color": color,
        "background": {
            "enabled": False,
            "color": "#000000",
            "padding": 8,
            "radius": 6,
        },
        "shadow": {
            "enabled": True,
            "color": "#000000",
            "offset": 4,
            "blur": 20,
            "angle": 45,
            "strength": 3,
        },
        # Multiple strokes stack outward; index 0 is innermost.
        "strokes": [],
        "position": {"x": 0.5, "y": y, "maxWidth": 0.88},
    }


def default_caption_spec() -> dict[str, Any]:
    spec = default_text_spec(font_size=54, y=0.81, lines=2)
    spec["motion"] = DEFAULT_CAPTION_MOTION
    spec["scope"] = DEFAULT_CAPTION_SCOPE
    spec["highlightColor"] = "#f2a33c"
    spec["highlightTextColor"] = "#1a1206"
    return spec


def default_layers() -> list[dict[str, Any]]:
    return [
        {"id": "caption", "kind": "caption", "visible": True, "locked": True},
        {"id": "title", "kind": "title", "visible": True, "locked": True},
        {"id": "brand", "kind": "brand", "visible": False, "locked": False},
    ]


def default_template(
    slug: str = "untitled",
    name: str = "새 템플릿",
    genre: str = DEFAULT_GENRE,
) -> dict[str, Any]:
    """A complete, valid v1 template with every axis present."""
    return {
        "schemaVersion": TEMPLATE_SCHEMA_VERSION,
        "slug": slug,
        "name": name,
        "genre": _one_of(genre, ALLOWED_GENRES, DEFAULT_GENRE),
        "layers": default_layers(),
        "layout": {
            "ratio": DEFAULT_RATIO,
            "screenStyle": DEFAULT_SCREEN_STYLE,
            "canvasBg": "#000000",
            "mediaFit": DEFAULT_MEDIA_FIT,
            # Media box in normalized canvas coords (1080x1920).
            "mediaRect": {"x": 0.0, "y": 0.22, "w": 1.0, "h": 0.42},
        },
        "title": default_text_spec(font_size=70, y=0.08, lines=2),
        "caption": default_caption_spec(),
        "texts": [],
        "images": [],
        "brand": {
            "logo": {"assetId": None, "x": 0.88, "y": 0.06, "scale": 1.0},
            "cta": {"enabled": False, "text": "", "showFromSec": 0.0},
        },
        "outro": {"assetId": None, "durationSec": 0.0},
        "audio": {"bgmAssetId": None, "volume": 0.25, "duckUnderVoice": True},
    }


#: The axes a render actually reproduces today, as dotted paths into a
#: template. The editor offers exactly these, because template_bridge drops
#: the rest (see its DROPPED_IN_BRIDGE) and a control that changes nothing is
#: a lie. Grow this list only when the renderer grows with it.
EDITABLE_PATHS: tuple[str, ...] = (
    "layout.ratio",
    "layout.canvasBg",
    "layout.mediaFit",
    "title.color",
    "caption.motion",
    "caption.color",
    "caption.highlightColor",
    "caption.background",
)


def apply_overrides(template: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    """Return ``template`` with the editable paths in ``overrides`` applied.

    Paths outside ``EDITABLE_PATHS`` are ignored rather than rejected: a
    client sending a field this build cannot render should get the render it
    can have, not a 400. The result goes through ``normalize_template``, so a
    bad value is clamped to something renderable instead of reaching Remotion.
    """
    merged = normalize_template(template)
    for path in EDITABLE_PATHS:
        if path not in overrides:
            continue
        value = overrides[path]
        if value is None:
            continue
        section, _, key = path.partition(".")
        if section in merged and isinstance(merged[section], dict):
            merged[section][key] = value
    return normalize_template(merged)


# --- normalization ----------------------------------------------------------


def normalize_text_spec(payload: Any, base: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    if not isinstance(payload, dict):
        return out

    out["visible"] = _bool(payload.get("visible"), out["visible"])
    out["lines"] = _clamp_int(payload.get("lines"), 1, 3, out["lines"])
    out["font"] = normalize_font_id(payload.get("font") or out["font"])
    out["fontSize"] = _clamp_int(payload.get("fontSize"), 12, 200, out["fontSize"])
    out["fontWeight"] = _clamp_int(payload.get("fontWeight"), 100, 900, out["fontWeight"])
    out["letterSpacing"] = _clamp(payload.get("letterSpacing"), -20, 40, out["letterSpacing"])
    out["lineHeight"] = _clamp(payload.get("lineHeight"), 0.8, 3.0, out["lineHeight"])
    out["align"] = _one_of(payload.get("align"), ALLOWED_ALIGN, out["align"])
    out["color"] = _hex_color(payload.get("color"), out["color"])

    bg = payload.get("background")
    if isinstance(bg, dict):
        out["background"] = {
            "enabled": _bool(bg.get("enabled"), out["background"]["enabled"]),
            "color": _hex_color(bg.get("color"), out["background"]["color"]),
            "padding": _clamp_int(bg.get("padding"), 0, 80, out["background"]["padding"]),
            "radius": _clamp_int(bg.get("radius"), 0, 80, out["background"]["radius"]),
        }

    sh = payload.get("shadow")
    if isinstance(sh, dict):
        out["shadow"] = {
            "enabled": _bool(sh.get("enabled"), out["shadow"]["enabled"]),
            "color": _hex_color(sh.get("color"), out["shadow"]["color"]),
            "offset": _clamp_int(sh.get("offset"), 0, 60, out["shadow"]["offset"]),
            "blur": _clamp_int(sh.get("blur"), 0, 100, out["shadow"]["blur"]),
            "angle": _clamp_int(sh.get("angle"), 0, 360, out["shadow"]["angle"]),
            "strength": _clamp_int(sh.get("strength"), 0, 10, out["shadow"]["strength"]),
        }

    strokes = payload.get("strokes")
    if isinstance(strokes, list):
        cleaned: list[dict[str, Any]] = []
        for item in strokes[:4]:  # 4 outline layers is already excessive
            if not isinstance(item, dict):
                continue
            cleaned.append(
                {
                    "color": _hex_color(item.get("color"), "#000000"),
                    "width": _clamp_int(item.get("width"), 1, 40, 5),
                }
            )
        out["strokes"] = cleaned

    pos = payload.get("position")
    if isinstance(pos, dict):
        out["position"] = {
            "x": _clamp(pos.get("x"), 0.0, 1.0, out["position"]["x"]),
            "y": _clamp(pos.get("y"), 0.0, 1.0, out["position"]["y"]),
            "maxWidth": _clamp(pos.get("maxWidth"), 0.2, 1.0, out["position"]["maxWidth"]),
        }

    return out


def normalize_caption(payload: Any) -> dict[str, Any]:
    out = normalize_text_spec(payload, default_caption_spec())
    if isinstance(payload, dict):
        out["motion"] = _one_of(
            payload.get("motion"), ALLOWED_CAPTION_MOTIONS, DEFAULT_CAPTION_MOTION
        )
        out["scope"] = _one_of(
            payload.get("scope"), ALLOWED_CAPTION_SCOPES, DEFAULT_CAPTION_SCOPE
        )
        out["highlightColor"] = _hex_color(
            payload.get("highlightColor"), out["highlightColor"]
        )
        out["highlightTextColor"] = _hex_color(
            payload.get("highlightTextColor"), out["highlightTextColor"]
        )
    return out


def normalize_layers(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        return default_layers()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in payload[:40]:
        if not isinstance(item, dict):
            continue
        kind = item.get("kind")
        if kind not in LAYER_KINDS:
            continue
        layer_id = str(item.get("id") or kind)[:64]
        if layer_id in seen:
            continue
        seen.add(layer_id)
        out.append(
            {
                "id": layer_id,
                "kind": kind,
                "visible": _bool(item.get("visible"), True),
                "locked": _bool(item.get("locked"), False),
            }
        )
    return out or default_layers()


def normalize_layout(payload: Any) -> dict[str, Any]:
    base = default_template()["layout"]
    if not isinstance(payload, dict):
        return base
    rect = payload.get("mediaRect")
    if isinstance(rect, dict):
        base["mediaRect"] = {
            "x": _clamp(rect.get("x"), 0.0, 1.0, base["mediaRect"]["x"]),
            "y": _clamp(rect.get("y"), 0.0, 1.0, base["mediaRect"]["y"]),
            "w": _clamp(rect.get("w"), 0.05, 1.0, base["mediaRect"]["w"]),
            "h": _clamp(rect.get("h"), 0.05, 1.0, base["mediaRect"]["h"]),
        }
    return {
        "ratio": _one_of(payload.get("ratio"), ALLOWED_RATIOS, base["ratio"]),
        "screenStyle": _one_of(
            payload.get("screenStyle"), ALLOWED_SCREEN_STYLES, base["screenStyle"]
        ),
        "canvasBg": _hex_color(payload.get("canvasBg"), base["canvasBg"]),
        "mediaFit": _one_of(payload.get("mediaFit"), ALLOWED_MEDIA_FITS, base["mediaFit"]),
        "mediaRect": base["mediaRect"],
    }


def _normalize_elements(payload: Any, kind: str) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        return []
    out: list[dict[str, Any]] = []
    for index, item in enumerate(payload[:20]):
        if not isinstance(item, dict):
            continue
        if kind == "text":
            spec = normalize_text_spec(item, default_text_spec(font_size=40, y=0.5))
            spec["id"] = str(item.get("id") or f"text{index}")[:64]
            spec["content"] = str(item.get("content") or "")[:200]
            out.append(spec)
        else:
            out.append(
                {
                    "id": str(item.get("id") or f"image{index}")[:64],
                    "assetId": item.get("assetId") or None,
                    "x": _clamp(item.get("x"), 0.0, 1.0, 0.5),
                    "y": _clamp(item.get("y"), 0.0, 1.0, 0.5),
                    "scale": _clamp(item.get("scale"), 0.05, 4.0, 1.0),
                    "opacity": _clamp(item.get("opacity"), 0.0, 1.0, 1.0),
                    "visible": _bool(item.get("visible"), True),
                }
            )
    return out


def normalize_template(payload: Any) -> dict[str, Any]:
    """Return a complete, valid v1 template. Unknown fields are dropped."""
    source = payload if isinstance(payload, dict) else {}
    base = default_template()

    slug = str(source.get("slug") or base["slug"]).strip()[:64] or base["slug"]
    name = str(source.get("name") or base["name"]).strip()[:80] or base["name"]

    brand_src = source.get("brand") if isinstance(source.get("brand"), dict) else {}
    logo_src = brand_src.get("logo") if isinstance(brand_src.get("logo"), dict) else {}
    cta_src = brand_src.get("cta") if isinstance(brand_src.get("cta"), dict) else {}
    outro_src = source.get("outro") if isinstance(source.get("outro"), dict) else {}
    audio_src = source.get("audio") if isinstance(source.get("audio"), dict) else {}

    return {
        "schemaVersion": TEMPLATE_SCHEMA_VERSION,
        "slug": slug,
        "name": name,
        "genre": _one_of(source.get("genre"), ALLOWED_GENRES, base["genre"]),
        "layers": normalize_layers(source.get("layers")),
        "layout": normalize_layout(source.get("layout")),
        "title": normalize_text_spec(source.get("title"), base["title"]),
        "caption": normalize_caption(source.get("caption")),
        "texts": _normalize_elements(source.get("texts"), "text"),
        "images": _normalize_elements(source.get("images"), "image"),
        "brand": {
            "logo": {
                "assetId": logo_src.get("assetId") or None,
                "x": _clamp(logo_src.get("x"), 0.0, 1.0, base["brand"]["logo"]["x"]),
                "y": _clamp(logo_src.get("y"), 0.0, 1.0, base["brand"]["logo"]["y"]),
                "scale": _clamp(logo_src.get("scale"), 0.05, 4.0, 1.0),
            },
            "cta": {
                "enabled": _bool(cta_src.get("enabled"), False),
                "text": str(cta_src.get("text") or "")[:60],
                "showFromSec": _clamp(cta_src.get("showFromSec"), 0.0, 600.0, 0.0),
            },
        },
        "outro": {
            "assetId": outro_src.get("assetId") or None,
            "durationSec": _clamp(outro_src.get("durationSec"), 0.0, 30.0, 0.0),
        },
        "audio": {
            "bgmAssetId": audio_src.get("bgmAssetId") or None,
            "volume": _clamp(audio_src.get("volume"), 0.0, 1.0, 0.25),
            "duckUnderVoice": _bool(audio_src.get("duckUnderVoice"), True),
        },
    }


def validate_template(payload: Any) -> list[str]:
    """Return a list of problems. Empty list means the payload is usable.

    normalize_template() never fails — it falls back to defaults. This reports
    what WOULD be silently replaced, so the editor can warn instead.
    """
    problems: list[str] = []
    if not isinstance(payload, dict):
        return ["template must be an object"]

    version = payload.get("schemaVersion")
    if version is not None and version != TEMPLATE_SCHEMA_VERSION:
        problems.append(
            f"schemaVersion {version!r} is not {TEMPLATE_SCHEMA_VERSION}"
        )

    layout = payload.get("layout")
    if isinstance(layout, dict):
        if layout.get("ratio") not in ALLOWED_RATIOS and "ratio" in layout:
            problems.append(f"unknown layout.ratio {layout.get('ratio')!r}")
        if (
            "screenStyle" in layout
            and layout.get("screenStyle") not in ALLOWED_SCREEN_STYLES
        ):
            problems.append(
                f"unknown layout.screenStyle {layout.get('screenStyle')!r}"
            )

    caption = payload.get("caption")
    if isinstance(caption, dict):
        motion = caption.get("motion")
        if motion is not None and motion not in ALLOWED_CAPTION_MOTIONS:
            problems.append(f"unknown caption.motion {motion!r}")
        scope = caption.get("scope")
        if scope is not None and scope not in ALLOWED_CAPTION_SCOPES:
            problems.append(f"unknown caption.scope {scope!r}")

    for role in ("title", "caption"):
        block = payload.get(role)
        if isinstance(block, dict):
            font = block.get("font")
            if font is not None and font not in ALLOWED_FONT_IDS:
                problems.append(f"unknown {role}.font {font!r}")

    return problems


# --- bridge from the legacy catalog ----------------------------------------


def from_visual_style(
    slug: str | None, overlay: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Build a v1 template from a legacy visual-style slug and its overlay.

    Lets the blog pipeline's existing styles be read through the new schema
    without rewriting visual_style_catalog.py. Values the old format has no
    place for (motion presets, strokes, outro, brand) take v1 defaults.
    """
    key = normalize_visual_style(slug)
    style = resolve_visual_style(key)
    legacy = overlay if isinstance(overlay, dict) else default_style_overlay(key)

    template = default_template(
        slug=key,
        name=str(style.get("label") or key),
        genre=_STYLE_GENRE_HINT.get(key, DEFAULT_GENRE),
    )

    template["layout"]["canvasBg"] = _hex_color(
        style.get("canvasBg"), template["layout"]["canvasBg"]
    )
    template["layout"]["mediaFit"] = _one_of(
        style.get("mediaFit"), ALLOWED_MEDIA_FITS, DEFAULT_MEDIA_FIT
    )
    template["layout"]["ratio"] = (
        "9:16" if style.get("layout") == "fullscreen" else DEFAULT_RATIO
    )

    def _apply(role: str, legacy_key: str, font_key: str) -> None:
        layer = legacy.get(legacy_key)
        if not isinstance(layer, dict):
            return
        spec = template[role]
        spec["visible"] = _bool(layer.get("visible"), spec["visible"])
        spec["fontSize"] = _clamp_int(layer.get("fontSize"), 12, 200, spec["fontSize"])
        spec["color"] = _hex_color(layer.get("color"), spec["color"])
        spec["align"] = _one_of(layer.get("align"), ALLOWED_ALIGN, spec["align"])
        spec["font"] = normalize_font_id(legacy.get(font_key) or DEFAULT_FONT_ID)
        spec["position"] = {
            "x": _clamp(layer.get("x"), 0.0, 1.0, spec["position"]["x"]),
            "y": _clamp(layer.get("y"), 0.0, 1.0, spec["position"]["y"]),
            "maxWidth": _clamp(
                layer.get("maxWidth"), 0.2, 1.0, spec["position"]["maxWidth"]
            ),
        }

    _apply("title", "title", "titleFont")
    _apply("caption", "caption", "captionFont")

    # The legacy format only knew "none" and "highlight". Despite the name,
    # "highlight" rendered as a colour change plus a scale pop — not a box —
    # so it maps to "pop". remotion/src/BlogShorts.tsx maps it the same way;
    # changing one without the other silently restyles every existing clip.
    legacy_motion = legacy.get("captionAnimation") or style.get("captionAnimation")
    template["caption"]["motion"] = "pop" if legacy_motion == "highlight" else "none"
    template["caption"]["scope"] = "word"
    template["caption"]["highlightColor"] = _hex_color(
        style.get("accent"), template["caption"]["highlightColor"]
    )

    # The legacy "subtitle" layer becomes a fixed text element, since v1 has a
    # single title block rather than a title/subtitle pair.
    subtitle = legacy.get("subtitle")
    if isinstance(subtitle, dict) and subtitle.get("visible"):
        spec = default_text_spec(
            font_size=_clamp_int(subtitle.get("fontSize"), 12, 200, 56),
            color=_hex_color(subtitle.get("color"), "#ffffff"),
            y=_clamp(subtitle.get("y"), 0.0, 1.0, 0.14),
            lines=1,
        )
        spec["id"] = "subtitle"
        spec["content"] = ""
        spec["font"] = normalize_font_id(legacy.get("titleFont") or DEFAULT_FONT_ID)
        spec["position"]["x"] = _clamp(subtitle.get("x"), 0.0, 1.0, 0.5)
        spec["position"]["maxWidth"] = _clamp(
            subtitle.get("maxWidth"), 0.2, 1.0, 0.92
        )
        template["texts"].append(spec)
        template["layers"].insert(
            0, {"id": "subtitle", "kind": "text", "visible": True, "locked": False}
        )

    return template


def list_caption_motions() -> list[dict[str, str]]:
    """Motion presets for the template editor, in display order."""
    return [
        {"id": motion, "label": MOTION_LABELS_KO[motion]} for motion in CAPTION_MOTIONS
    ]


def list_genres() -> list[dict[str, str]]:
    return [
        {"id": genre, "label": GENRE_LABELS_KO[genre]}
        for genre in ("any", "lecture", "entertainment", "info", "review", "vlog")
    ]
