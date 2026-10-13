import re

from app.services.template_catalog import (
    DEFAULT_TEMPLATE_SLUG,
    SYSTEM_TEMPLATES,
    SYSTEM_TEMPLATES_BY_SLUG,
    get_system_template,
    list_system_templates,
    unused_motions,
)
from app.services.template_schema import (
    ALLOWED_CAPTION_MOTIONS,
    normalize_template,
    validate_template,
)


def _luminance(hex_color: str) -> float:
    hex_color = hex_color.lstrip("#")
    if len(hex_color) != 6:
        return 0.0

    def channel(value: int) -> float:
        srgb = value / 255
        return srgb / 12.92 if srgb <= 0.03928 else ((srgb + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_color[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)


def _contrast(a: str, b: str) -> float:
    la, lb = _luminance(a), _luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def test_catalog_size_and_unique_slugs():
    assert 15 <= len(SYSTEM_TEMPLATES) <= 20
    slugs = [item["slug"] for item in SYSTEM_TEMPLATES]
    assert len(slugs) == len(set(slugs))
    assert len(SYSTEM_TEMPLATES_BY_SLUG) == len(SYSTEM_TEMPLATES)


def test_every_template_is_schema_valid():
    for item in SYSTEM_TEMPLATES:
        assert validate_template(item) == [], item["slug"]
        # Already normalized at build time, so normalizing again is a no-op.
        assert normalize_template(item) == item, item["slug"]


def test_names_say_what_the_template_is_for():
    # The rule from FLOW_REDESIGN.md: no numbered names.
    for item in SYSTEM_TEMPLATES:
        name = item["name"]
        assert name.strip() == name and name
        assert not re.search(r"\d", name), f"numbered name: {name}"
        assert "스타일" not in name or "·" in name, f"generic name: {name}"


def test_every_genre_has_templates():
    genres = {item["genre"] for item in SYSTEM_TEMPLATES}
    for expected in ("lecture", "entertainment", "info", "review", "vlog", "any"):
        assert expected in genres, expected
    for genre in ("lecture", "entertainment", "info", "review"):
        count = sum(1 for item in SYSTEM_TEMPLATES if item["genre"] == genre)
        assert count >= 3, f"{genre} has only {count}"


def test_catalog_shows_off_every_motion():
    # A motion no template uses is a motion users never discover.
    assert unused_motions() == set(), f"motions with no template: {unused_motions()}"


def test_no_template_uses_a_dropped_motion():
    dropped = {"bounce", "slide_up", "pop_group", "box_line"}
    for item in SYSTEM_TEMPLATES:
        assert item["caption"]["motion"] not in dropped, item["slug"]
        # A name must not advertise an effect the template no longer has.
        for word in ("통통", "올라오", "줄 띠", "한 줄 등장"):
            assert word not in item["name"], f"{item['slug']}: stale name {item['name']}"


def test_highlight_fill_is_readable():
    # box_highlight paints the word on a filled box; the text on it must read.
    for item in SYSTEM_TEMPLATES:
        caption = item["caption"]
        if caption["motion"] != "box_highlight":
            continue
        ratio = _contrast(caption["highlightTextColor"], caption["highlightColor"])
        assert ratio >= 4.5, f"{item['slug']}: {ratio:.2f}:1 on the highlight fill"


def test_text_is_not_lost_against_its_own_canvas():
    # Captions sit over video, but the canvas shows through letterboxing and
    # solid bands — same-on-same is always a bug.
    for item in SYSTEM_TEMPLATES:
        bg = item["layout"]["canvasBg"]
        for role in ("title", "caption"):
            block = item[role]
            if not block["visible"]:
                continue
            ratio = _contrast(block["color"], bg)
            assert ratio >= 3.0, f"{item['slug']}.{role}: {ratio:.2f}:1 on {bg}"


def test_boxed_captions_read_on_their_box():
    for item in SYSTEM_TEMPLATES:
        caption = item["caption"]
        background = caption["background"]
        if not background["enabled"]:
            continue
        ratio = _contrast(caption["color"], background["color"])
        assert ratio >= 4.5, f"{item['slug']}: {ratio:.2f}:1 on its caption box"


def test_genre_listing_puts_matching_first_and_hides_nothing():
    everything = list_system_templates()
    assert len(everything) == len(SYSTEM_TEMPLATES)

    listed = list_system_templates("entertainment")
    assert len(listed) == len(SYSTEM_TEMPLATES)
    leading = [item for item in listed if item["genre"] == "entertainment"]
    assert listed[: len(leading)] == leading

    # "any" and None mean no reordering.
    assert list_system_templates("any") == everything
    assert list_system_templates(None) == everything


def test_get_falls_back_to_the_default():
    assert get_system_template("lecture_big_caption")["slug"] == "lecture_big_caption"
    assert get_system_template("nope")["slug"] == DEFAULT_TEMPLATE_SLUG
    assert get_system_template(None)["slug"] == DEFAULT_TEMPLATE_SLUG
    assert DEFAULT_TEMPLATE_SLUG in SYSTEM_TEMPLATES_BY_SLUG


def test_listing_returns_copies():
    first = list_system_templates()[0]
    first["name"] = "mutated"
    assert SYSTEM_TEMPLATES[0]["name"] != "mutated"


def test_all_motions_referenced_are_known():
    for item in SYSTEM_TEMPLATES:
        assert item["caption"]["motion"] in ALLOWED_CAPTION_MOTIONS, item["slug"]
