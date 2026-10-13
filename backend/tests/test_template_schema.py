import re

from app.services.template_schema import (
    ALLOWED_CAPTION_MOTIONS,
    CAPTION_MOTIONS,
    MOTION_LABELS_KO,
    TEMPLATE_SCHEMA_VERSION,
    default_template,
    from_visual_style,
    list_caption_motions,
    list_genres,
    normalize_caption,
    normalize_template,
    validate_template,
)


def test_default_template_has_every_axis():
    tpl = default_template()
    for axis in (
        "layers",
        "layout",
        "title",
        "caption",
        "texts",
        "images",
        "brand",
        "outro",
        "audio",
    ):
        assert axis in tpl, f"missing axis: {axis}"
    assert tpl["schemaVersion"] == TEMPLATE_SCHEMA_VERSION
    assert validate_template(tpl) == []


def test_eight_caption_motions():
    assert len(CAPTION_MOTIONS) == 8
    assert len(set(CAPTION_MOTIONS)) == 8
    listed = list_caption_motions()
    assert len(listed) == 8
    assert all(item["label"] for item in listed)
    assert {item["id"] for item in listed} == set(ALLOWED_CAPTION_MOTIONS)


def test_dropped_motions_are_gone():
    # Cut after watching them render: two were duplicates of other presets,
    # two only animated once on line entry and were static after that.
    for motion in ("bounce", "slide_up", "pop_group", "box_line"):
        assert motion not in ALLOWED_CAPTION_MOTIONS
        # A stored row holding one must not silently keep it.
        assert normalize_caption({"motion": motion})["motion"] == "pop"
        assert any("motion" in p for p in validate_template({"caption": {"motion": motion}}))


def test_scope_is_whatever_the_caller_asked():
    # With no line-level motions left, nothing overrides the chosen scope.
    for scope in ("word", "line", "segment"):
        assert normalize_caption({"motion": "pop", "scope": scope})["scope"] == scope


def test_unknown_values_fall_back_without_raising():
    tpl = normalize_template(
        {
            "layout": {"ratio": "21:9", "screenStyle": "hologram"},
            "caption": {"motion": "explode", "scope": "pixel"},
            "title": {"fontSize": 9999, "color": "not-a-color"},
        }
    )
    assert tpl["layout"]["ratio"] == "4:3"
    assert tpl["layout"]["screenStyle"] == "solid"
    assert tpl["caption"]["motion"] == "pop"
    assert tpl["caption"]["scope"] == "word"
    assert tpl["title"]["fontSize"] == 200  # clamped, not rejected
    assert tpl["title"]["color"].startswith("#")


def test_validate_reports_what_normalize_would_replace():
    problems = validate_template(
        {"layout": {"ratio": "21:9"}, "caption": {"motion": "explode"}}
    )
    assert any("ratio" in p for p in problems)
    assert any("motion" in p for p in problems)


def test_normalize_is_idempotent():
    once = normalize_template({"name": "강연 · 큰 자막", "caption": {"motion": "karaoke"}})
    twice = normalize_template(once)
    assert once == twice


def test_strokes_are_capped_and_cleaned():
    tpl = normalize_template(
        {
            "title": {
                "strokes": [
                    {"color": "#174fd5", "width": 5},
                    {"color": "bad", "width": 9999},
                    {"color": "#000000", "width": 3},
                    {"color": "#111111", "width": 2},
                    {"color": "#222222", "width": 1},
                    {"color": "#333333", "width": 1},
                ]
            }
        }
    )
    strokes = tpl["title"]["strokes"]
    assert len(strokes) == 4
    assert strokes[0] == {"color": "#174fd5", "width": 5}
    assert strokes[1]["color"] == "#000000"  # bad hex replaced
    assert strokes[1]["width"] == 40  # clamped


def test_from_visual_style_bridges_legacy_presets():
    for slug in ("impact_full", "info_black", "info_navy", "viral_cyan", "card_white", "yt_profile"):
        tpl = from_visual_style(slug)
        assert validate_template(tpl) == []
        assert tpl["slug"] == slug
        assert tpl["name"]
        # legacy knew only none/highlight
        assert tpl["caption"]["motion"] in {"none", "pop"}


def test_legacy_highlight_maps_to_pop_not_box():
    # The old renderer drew a colour change + scale pop for "highlight".
    # Mapping it to box_highlight would restyle every existing clip.
    tpl = from_visual_style("info_black")
    assert tpl["caption"]["motion"] == "pop"


def test_from_visual_style_moves_subtitle_into_texts():
    # info_black has a visible subtitle layer in the legacy overlay.
    tpl = from_visual_style("info_black")
    ids = {item["id"] for item in tpl["texts"]}
    assert "subtitle" in ids
    assert any(layer["id"] == "subtitle" for layer in tpl["layers"])


def test_from_visual_style_accepts_legacy_slugs():
    tpl = from_visual_style("card_news")  # legacy alias for card_white
    assert tpl["slug"] == "card_white"


def test_motion_table_matches_the_renderer():
    # remotion/src/captionMotion.ts is the other half of this table; if the
    # two drift, a template renders as something the editor never offered.
    from pathlib import Path

    ts = Path(__file__).resolve().parents[2] / "remotion" / "src" / "captionMotion.ts"
    if not ts.exists():  # renderer not checked out alongside the backend
        return
    source = ts.read_text(encoding="utf-8")
    # The declaration is `export const CAPTION_MOTIONS: readonly CaptionMotion[] = [...]`
    # — split on the assignment, not the first "]", which is part of the type.
    block = source.split("export const CAPTION_MOTIONS", 1)[1].split("= [", 1)[1].split("]", 1)[0]
    in_ts = set(re.findall(r'"([a-z_]+)"', block))
    assert in_ts, "could not parse CAPTION_MOTIONS out of captionMotion.ts"
    assert in_ts == set(CAPTION_MOTIONS), f"ts={sorted(in_ts)} py={sorted(CAPTION_MOTIONS)}"
    for motion in CAPTION_MOTIONS:
        assert f'"{motion}"' in source
    assert set(MOTION_LABELS_KO) == set(CAPTION_MOTIONS)


def test_genres_listed():
    genres = list_genres()
    assert {g["id"] for g in genres} == {
        "any",
        "lecture",
        "entertainment",
        "info",
        "review",
        "vlog",
    }
    assert all(g["label"] for g in genres)
