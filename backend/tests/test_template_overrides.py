from app.services.template_bridge import DROPPED_IN_BRIDGE, template_to_remotion_style
from app.services.template_catalog import get_system_template
from app.services.template_schema import (
    ALLOWED_CAPTION_MOTIONS,
    ALLOWED_RATIOS,
    EDITABLE_PATHS,
    apply_overrides,
)


def _base():
    return get_system_template("basic_default")


def test_every_editable_path_survives_a_render():
    # An editable path whose value the bridge throws away would be a control
    # that does nothing — the thing this list exists to prevent.
    for path in EDITABLE_PATHS:
        assert path not in DROPPED_IN_BRIDGE, path


def test_overrides_change_what_they_name():
    template = _base()
    result = apply_overrides(
        template,
        {
            "caption.motion": "neon",
            "layout.canvasBg": "#112233",
            "title.color": "#FF0000",
            "caption.highlightColor": "#00FF00",
        },
    )

    assert result["caption"]["motion"] == "neon"
    assert result["layout"]["canvasBg"].lower() == "#112233"
    assert result["title"]["color"].upper() == "#FF0000"
    assert result["caption"]["highlightColor"].upper() == "#00FF00"


def test_the_system_template_is_not_mutated():
    # Overrides are per render. Leaking them into the catalog would give the
    # next user someone else's colours.
    template = _base()
    before = template["caption"]["motion"]
    apply_overrides(template, {"caption.motion": "typewriter"})
    assert template["caption"]["motion"] == before
    assert get_system_template("basic_default")["caption"]["motion"] == before


def test_bad_values_are_clamped_not_raised():
    # A render the user already waited for should not fail over a stray value
    # from an older client.
    result = apply_overrides(
        _base(),
        {"caption.motion": "nonsense", "layout.ratio": "7:3", "layout.canvasBg": "not-a-colour"},
    )
    assert result["caption"]["motion"] in ALLOWED_CAPTION_MOTIONS
    assert result["layout"]["ratio"] in ALLOWED_RATIOS


def test_paths_outside_the_editable_set_are_ignored():
    # Not rejected: a client that knows about an axis this build cannot render
    # still gets the render this build can do.
    result = apply_overrides(
        _base(),
        {"audio.volume": 9.0, "outro.durationSec": 99.0, "texts": [{"text": "몰래"}]},
    )
    assert result["audio"]["volume"] != 9.0
    assert result["outro"]["durationSec"] != 99.0
    assert result["texts"] == []


def test_none_means_leave_it_alone():
    # The editor sends a sparse object; an unset control must not blank a value.
    template = _base()
    result = apply_overrides(template, {"caption.motion": None, "title.color": None})
    assert result["caption"]["motion"] == template["caption"]["motion"]
    assert result["title"]["color"] == template["title"]["color"]


def test_an_override_reaches_the_renderer_payload():
    # The end-to-end claim: what the editor sets is what Remotion is told.
    overridden = apply_overrides(_base(), {"caption.motion": "karaoke", "layout.canvasBg": "#0A0A0A"})
    payload = template_to_remotion_style(overridden)

    assert payload["captionAnimation"] == "karaoke"
    assert payload["canvasBg"].upper() == "#0A0A0A"


def test_empty_overrides_are_a_no_op():
    template = _base()
    assert apply_overrides(template, {}) == apply_overrides(template, {})
    assert apply_overrides(template, {})["slug"] == template["slug"]
