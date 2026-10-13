"""Turn a schema-v1 template into the props the Remotion renderer reads.

`visual_style_catalog.remotion_style_payload()` is the one funnel both
pipelines use to describe a look to `BlogShorts`. This module produces the
same shape from a v1 template, so the 18-template catalog can drive a render
without the renderer being rewritten first.

## What survives, and what does not

The renderer takes a *named variant* for its header and caption chrome
(`"bottom_outline"`, `"info_navy"`, …): each is a hardcoded component. A v1
template instead describes those by property — font size, strokes, shadow,
per-stroke colours, nine axes of layout. So the bridge is lossy in one
direction and honest about it:

| v1 field | renderer | fidelity |
|---|---|---|
| `caption.motion` | `captionAnimation` | exact |
| `caption.highlightColor` | `accent` | exact |
| `title.color` | `titleColor` | exact |
| `layout.canvasBg`, `mediaFit` | same | exact |
| `layout.ratio` | `layout` | mapped to the nearest renderer layout |
| `caption.background` / `strokes` | `caption` | mapped to the nearest caption variant |
| `title` size, strokes, shadow, position | `header` | **dropped** — the header variant is a fixed component |
| `texts`, `images`, `brand`, `outro`, `audio` | — | **dropped** — no renderer slot yet |

Closing those gaps is the Remotion unification in docs/FLOW_REDESIGN.md §9
step 0: the renderer reading the template directly instead of a variant name.
Until then, a v1 template renders with its motion, colours, ratio and canvas,
and borrows the nearest chrome.
"""

from __future__ import annotations

from typing import Any

from app.services.template_schema import (
    DEFAULT_CAPTION_MOTION,
    normalize_template,
)

# Fields a v1 template carries that the current renderer has nowhere to put.
# Named so callers can tell a user what a swap will not reproduce.
DROPPED_IN_BRIDGE = (
    "title.fontSize",
    "title.shadow",
    "title.position",
    "title.lines",
    "caption.fontSize",
    "caption.position",
    "caption.scope",
    "texts",
    "images",
    "brand",
    "outro",
    "audio",
)

# v1 ratio -> the renderer's layout component.
_RATIO_TO_LAYOUT = {
    "9:16": "fullscreen",
    "16:9": "letterbox",
    "4:3": "letterbox",
    "1:1": "card",
    "dual": "header_stack",
}
_DEFAULT_LAYOUT = "letterbox"

# The renderer's caption variants, in the order the bridge prefers them.
CAPTION_VARIANTS = ("center_stroke", "bottom_outline", "black_box", "white_pill")

# The renderer's header variants.
_HEADER_FOR_LAYOUT = {
    "fullscreen": "none",
    "letterbox": "info_black",
    "card": "card_white",
    "header_stack": "viral_cyan",
}
_DEFAULT_HEADER = "info_black"


def _is_light(hex_color: str) -> bool:
    value = (hex_color or "").lstrip("#")
    if len(value) != 6:
        return False
    r, g, b = (int(value[i : i + 2], 16) for i in (0, 2, 4))
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6


def pick_caption_variant(caption: dict[str, Any]) -> str:
    """Nearest renderer caption chrome for a v1 caption block.

    The v1 block says *how* the caption is drawn; the renderer only takes the
    name of one of four components. Order matters: a filled background is the
    strongest signal, then a heavy outline, then plain.
    """
    background = caption.get("background") or {}
    if background.get("enabled"):
        # A light box is the white pill; anything darker is the black box.
        return "white_pill" if _is_light(str(background.get("color") or "")) else "black_box"

    strokes = caption.get("strokes") or []
    widest = max((int(s.get("width") or 0) for s in strokes), default=0)
    if widest >= 5:
        return "center_stroke"

    return "bottom_outline"


def pick_layout(ratio: str) -> str:
    return _RATIO_TO_LAYOUT.get(ratio, _DEFAULT_LAYOUT)


def pick_header(layout: str, title_visible: bool) -> str:
    if not title_visible:
        return "none"
    return _HEADER_FOR_LAYOUT.get(layout, _DEFAULT_HEADER)


def template_to_remotion_style(template: dict[str, Any]) -> dict[str, Any]:
    """Build a renderer `style` payload from a v1 template.

    The returned dict has exactly the keys
    `visual_style_catalog.remotion_style_payload()` returns, so it is a drop-in
    for either pipeline.
    """
    tpl = normalize_template(template)
    layout_axis = tpl["layout"]
    title = tpl["title"]
    caption = tpl["caption"]

    layout = pick_layout(layout_axis["ratio"])

    return {
        "layout": layout,
        "mediaFit": layout_axis["mediaFit"],
        "canvasBg": layout_axis["canvasBg"],
        "caption": pick_caption_variant(caption),
        "header": pick_header(layout, bool(title["visible"])),
        "titleColor": title["color"],
        "accent": caption["highlightColor"],
        # v1 has no transition axis; the caller sets these per job.
        "transitionSec": 0.0,
        "transitionType": "none",
        "kenBurns": False,
        "captionAnimation": caption.get("motion") or DEFAULT_CAPTION_MOTION,
    }


def template_to_style_overlay(template: dict[str, Any]) -> dict[str, Any]:
    """Build the per-layer overlay the renderer merges over the style payload.

    This is where a v1 template's positions and sizes DO survive: the overlay
    carries x/y/fontSize/colour per layer, so the caption and title land where
    the template puts them even though the chrome component is borrowed.
    """
    tpl = normalize_template(template)
    title = tpl["title"]
    caption = tpl["caption"]

    def layer(block: dict[str, Any]) -> dict[str, Any]:
        position = block["position"]
        strokes = block.get("strokes") or []
        outline = (
            {"strokeWidth": int(strokes[0]["width"]), "strokeColor": strokes[0]["color"]}
            if strokes
            else {"strokeWidth": 0}
        )
        return {
            **outline,
            "x": position["x"],
            "y": position["y"],
            "fontSize": block["fontSize"],
            "color": block["color"],
            "align": block["align"],
            "maxWidth": position["maxWidth"],
            "visible": bool(block["visible"]),
        }

    subtitle = next(
        (item for item in tpl["texts"] if item.get("id") == "subtitle"),
        None,
    )

    return {
        "titleFont": title["font"],
        "captionFont": caption["font"],
        "captionAnimation": caption.get("motion") or DEFAULT_CAPTION_MOTION,
        "title": layer(title),
        "subtitle": layer(subtitle) if subtitle else {**layer(title), "visible": False},
        "caption": layer(caption),
    }


def bridge_report(template: dict[str, Any]) -> dict[str, Any]:
    """What a render of this template will and will not reproduce.

    Returned alongside a swap so the UI can be honest rather than silently
    dropping half a template.
    """
    tpl = normalize_template(template)
    carried = []
    dropped = []

    if tpl["caption"]["strokes"]:
        dropped.append("자막 외곽선")
    if tpl["texts"]:
        dropped.append("추가 텍스트")
    if tpl["images"]:
        dropped.append("추가 이미지")
    if tpl["brand"]["logo"]["assetId"] or tpl["brand"]["cta"]["enabled"]:
        dropped.append("로고/CTA")
    if tpl["outro"]["assetId"]:
        dropped.append("아웃트로")
    if tpl["audio"]["bgmAssetId"]:
        dropped.append("음원")

    carried.append(f"자막 효과 {tpl['caption']['motion']}")
    carried.append(f"비율 {tpl['layout']['ratio']}")
    carried.append("색과 글자 크기")

    return {
        "slug": tpl["slug"],
        "name": tpl["name"],
        "carried": carried,
        "dropped": dropped,
        "exact": not dropped,
    }
