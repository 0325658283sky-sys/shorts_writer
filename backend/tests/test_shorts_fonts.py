from app.services.visual_style_catalog import (
    DEFAULT_FONT_ID,
    default_style_overlay,
    merge_style_overlay,
    normalize_font_id,
    sanitize_style_overlay,
)


def test_default_overlay_uses_gmarket_sans():
    overlay = default_style_overlay("impact_full")
    assert overlay["titleFont"] == "gmarket_sans"
    assert overlay["captionFont"] == "gmarket_sans"
    assert DEFAULT_FONT_ID == "gmarket_sans"


def test_normalize_font_id_allowlist():
    assert normalize_font_id("suit") == "suit"
    assert normalize_font_id("Paperlogy") == "paperlogy"
    assert normalize_font_id("unknown") == "gmarket_sans"
    assert normalize_font_id(None) == "gmarket_sans"


def test_sanitize_keeps_fonts_and_drops_unknown():
    cleaned = sanitize_style_overlay(
        {
            "titleFont": "jalnan",
            "captionFont": "not-a-font",
            "title": {"fontSize": 80, "x": 0.5},
            "extra": {"nope": True},
        }
    )
    assert cleaned["titleFont"] == "jalnan"
    assert cleaned["captionFont"] == "gmarket_sans"
    assert cleaned["title"]["fontSize"] == 80
    assert "extra" not in cleaned


def test_merge_preserves_user_fonts_over_template_defaults():
    merged = merge_style_overlay(
        "info_black",
        {"titleFont": "paperlogy", "captionFont": "pretendard", "title": {"fontSize": 90}},
    )
    assert merged["titleFont"] == "paperlogy"
    assert merged["captionFont"] == "pretendard"
    assert merged["title"]["fontSize"] == 90
    assert merged["subtitle"]["visible"] is True
