from app.services.visual_style_catalog import (
    normalize_transition_type,
    normalize_visual_style,
    remotion_style_payload,
    resolve_visual_style,
)


def test_normalize_visual_style_fallback():
    assert normalize_visual_style(None) == "impact_full"
    assert normalize_visual_style("bold_hook") == "viral_cyan"
    assert normalize_visual_style("fullscreen") == "impact_full"
    assert normalize_visual_style("info_navy") == "info_navy"


def test_normalize_transition_type():
    assert normalize_transition_type("slide") == "slide"
    assert normalize_transition_type("wipe") == "fade"


def test_remotion_style_payload_includes_transition_type():
    payload = remotion_style_payload("viral_cyan")
    assert payload["transitionType"] == "slide"
    assert payload["transitionSec"] == 0.25
    assert payload["header"] == "viral_cyan"
    assert payload["caption"] == "black_box"
    assert payload["mediaFit"] == "cover"
    assert "accent" in payload


def test_style_pack_recommendations_present():
    style = resolve_visual_style("info_black")
    assert style["recommendedBgmSlug"] == "soft_pad"
    assert style["packHint"]
    assert style["layout"] == "letterbox"
    assert style["mediaFit"] == "cover"


def test_letterbox_styles_avoid_contain_letterboxing():
    for slug in ("info_black", "info_navy"):
        style = resolve_visual_style(slug)
        assert style["layout"] == "letterbox"
        assert style["mediaFit"] == "cover"


def test_default_overlay_and_merge():
    from app.services.visual_style_catalog import default_style_overlay, merge_style_overlay

    base = default_style_overlay("info_black")
    assert base["title"]["fontSize"] == 110
    assert base["subtitle"]["fontSize"] == 110
    assert base["title"]["y"] == 0.055
    assert base["subtitle"]["y"] == 0.118
    merged = merge_style_overlay("info_black", {"caption": {"y": 0.8, "fontSize": 40}})
    assert merged["caption"]["y"] == 0.8
    assert merged["caption"]["fontSize"] == 40
    assert merged["title"]["fontSize"] == 110
