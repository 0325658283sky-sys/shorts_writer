from app.services.visual_style_catalog import (
    normalize_transition_type,
    normalize_visual_style,
    remotion_style_payload,
    resolve_visual_style,
)


def test_normalize_visual_style_fallback():
    assert normalize_visual_style(None) == "fullscreen"
    assert normalize_visual_style("bold_hook") == "bold_hook"


def test_normalize_transition_type():
    assert normalize_transition_type("slide") == "slide"
    assert normalize_transition_type("wipe") == "fade"


def test_remotion_style_payload_includes_transition_type():
    payload = remotion_style_payload("bold_hook")
    assert payload["transitionType"] == "slide"
    assert payload["transitionSec"] == 0.25
    assert "accent" in payload


def test_style_pack_recommendations_present():
    style = resolve_visual_style("card_news")
    assert style["recommendedBgmSlug"] == "soft_pad"
    assert style["packHint"]
