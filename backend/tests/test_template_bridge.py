from app.services.template_bridge import (
    CAPTION_VARIANTS,
    bridge_report,
    pick_caption_variant,
    pick_layout,
    template_to_remotion_style,
    template_to_style_overlay,
)
from app.services.template_catalog import SYSTEM_TEMPLATES, get_system_template
from app.services.template_schema import (
    ALLOWED_CAPTION_MOTIONS,
    default_template,
    normalize_template,
)
from app.services.visual_style_catalog import remotion_style_payload


def test_bridge_shape_matches_the_legacy_payload():
    # The renderer reads one shape. If the bridge grows or loses a key, the
    # render silently falls back to a default instead of failing.
    legacy = set(remotion_style_payload("info_black"))
    bridged = set(template_to_remotion_style(default_template()))
    assert bridged == legacy, f"only legacy={legacy - bridged} only bridged={bridged - legacy}"


def test_every_system_template_bridges():
    for item in SYSTEM_TEMPLATES:
        style = template_to_remotion_style(item)
        assert style["caption"] in CAPTION_VARIANTS, item["slug"]
        assert style["layout"] in {"fullscreen", "letterbox", "card", "header_stack"}, item["slug"]
        assert style["captionAnimation"] in ALLOWED_CAPTION_MOTIONS, item["slug"]
        assert style["canvasBg"].startswith("#"), item["slug"]
        assert style["accent"].startswith("#"), item["slug"]


def test_motion_and_colours_survive_exactly():
    for item in SYSTEM_TEMPLATES:
        style = template_to_remotion_style(item)
        assert style["captionAnimation"] == item["caption"]["motion"], item["slug"]
        assert style["accent"] == item["caption"]["highlightColor"], item["slug"]
        assert style["titleColor"] == item["title"]["color"], item["slug"]
        assert style["canvasBg"] == item["layout"]["canvasBg"], item["slug"]
        assert style["mediaFit"] == item["layout"]["mediaFit"], item["slug"]


def test_ratio_maps_to_a_layout():
    assert pick_layout("9:16") == "fullscreen"
    assert pick_layout("16:9") == "letterbox"
    assert pick_layout("4:3") == "letterbox"
    assert pick_layout("1:1") == "card"
    assert pick_layout("dual") == "header_stack"
    assert pick_layout("21:9") == "letterbox"  # unknown falls back, never crashes


def test_caption_variant_follows_how_the_caption_is_drawn():
    plain = normalize_template({})["caption"]
    assert pick_caption_variant(plain) == "bottom_outline"

    dark_box = dict(plain, background={"enabled": True, "color": "#000000", "padding": 12, "radius": 6})
    assert pick_caption_variant(dark_box) == "black_box"

    light_box = dict(plain, background={"enabled": True, "color": "#ffffff", "padding": 12, "radius": 8})
    assert pick_caption_variant(light_box) == "white_pill"

    outlined = dict(plain, strokes=[{"color": "#000000", "width": 9}])
    assert pick_caption_variant(outlined) == "center_stroke"

    # A hairline outline is not the heavy-stroke look.
    hairline = dict(plain, strokes=[{"color": "#000000", "width": 2}])
    assert pick_caption_variant(hairline) == "bottom_outline"


def test_hidden_title_means_no_header():
    hidden = normalize_template({"title": {"visible": False}})
    assert template_to_remotion_style(hidden)["header"] == "none"
    shown = normalize_template({"title": {"visible": True}})
    assert template_to_remotion_style(shown)["header"] != "none"


def test_overlay_carries_positions_and_sizes():
    tpl = get_system_template("lecture_big_caption")
    overlay = template_to_style_overlay(tpl)
    for role in ("title", "caption"):
        assert overlay[role]["fontSize"] == tpl[role]["fontSize"]
        assert overlay[role]["color"] == tpl[role]["color"]
        assert overlay[role]["y"] == tpl[role]["position"]["y"]
        assert overlay[role]["maxWidth"] == tpl[role]["position"]["maxWidth"]
    assert overlay["captionAnimation"] == tpl["caption"]["motion"]
    assert set(overlay) >= {"titleFont", "captionFont", "title", "subtitle", "caption"}


def test_overlay_has_a_subtitle_layer_even_without_one():
    # The renderer merges all three layers; a missing one would read as the
    # style default rather than "off".
    overlay = template_to_style_overlay(default_template())
    assert overlay["subtitle"]["visible"] is False


def test_report_says_what_will_not_render():
    exact = bridge_report(get_system_template("basic_default"))
    assert exact["exact"] is True
    assert exact["dropped"] == []
    assert any("자막 효과" in line for line in exact["carried"])

    rich = bridge_report(
        normalize_template(
            {
                "slug": "rich",
                "name": "많이 얹은 템플릿",
                "title": {"strokes": [{"color": "#000000", "width": 6}]},
                "images": [{"id": "logo", "assetId": 4}],
                "audio": {"bgmAssetId": 9},
            }
        )
    )
    assert rich["exact"] is False
    assert "제목 외곽선" not in rich["dropped"]  # 제목 외곽선은 이제 렌더에 반영된다
    assert "추가 이미지" in rich["dropped"]
    assert "음원" in rich["dropped"]


def test_bridge_accepts_a_raw_dict():
    # Callers may hand over something straight off the wire.
    style = template_to_remotion_style({"caption": {"motion": "karaoke"}})
    assert style["captionAnimation"] == "karaoke"
    style = template_to_remotion_style({"caption": {"motion": "explode"}})
    assert style["captionAnimation"] == "pop"
