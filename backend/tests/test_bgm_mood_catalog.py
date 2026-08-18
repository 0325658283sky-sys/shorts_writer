from app.services.bgm_mood_catalog import (
    candidate_slugs_for_mood,
    get_bgm_mood,
    list_bgm_moods,
    resolve_candidate_slugs,
    resolve_mood,
)


def test_list_bgm_moods_has_six_with_keywords():
    moods = list_bgm_moods()
    assert len(moods) == 6
    ids = {m["id"] for m in moods}
    assert ids == {
        "hook_upbeat",
        "bright_vlog",
        "info_soft",
        "calm_mood",
        "promo_pulse",
        "neutral_bed",
    }
    for mood in moods:
        assert mood["label"]
        assert mood["keywords"]
        assert mood["slugs"]


def test_resolve_mood_by_tone():
    assert resolve_mood(script_tone="hook") == "hook_upbeat"
    assert resolve_mood(script_tone="summary") == "info_soft"
    assert resolve_mood(script_tone="detailed") == "calm_mood"
    assert resolve_mood(script_tone=None) == "neutral_bed"


def test_resolve_mood_prefers_visual_style_over_tone():
    assert resolve_mood(script_tone="detailed", visual_style="impact_full") == "hook_upbeat"
    assert resolve_mood(script_tone="summary", visual_style="viral_cyan") == "promo_pulse"
    assert resolve_mood(script_tone="hook", visual_style="info_black") == "info_soft"
    assert resolve_mood(script_tone="hook", visual_style="info_navy") == "info_soft"
    assert resolve_mood(script_tone="detailed", visual_style="card_white") == "bright_vlog"


def test_resolve_mood_legacy_style_slug():
    # fullscreen → impact_full → hook_upbeat
    assert resolve_mood(visual_style="fullscreen") == "hook_upbeat"


def test_candidate_slugs_priority():
    assert candidate_slugs_for_mood("hook_upbeat")[0] == "promo_pulse_1"
    assert candidate_slugs_for_mood("info_soft")[0] == "soft_pad_1"
    assert candidate_slugs_for_mood("calm_mood")[0] == "calm_drone_2"
    assert get_bgm_mood("promo_pulse")["slugs"][0] == "promo_pulse_3"


def test_each_mood_has_at_least_three_tracks():
    from app.services.bgm_mood_catalog import bundled_bgm_slugs

    moods = list_bgm_moods()
    for mood in moods:
        assert len(mood["slugs"]) >= 3
    assert len(bundled_bgm_slugs()) >= 15


def test_resolve_candidate_slugs_with_explicit_mood():
    mood_id, slugs = resolve_candidate_slugs(
        script_tone="detailed",
        visual_style="info_black",
        mood_id="bright_vlog",
        target_length="short",
    )
    assert mood_id == "bright_vlog"
    assert slugs[0] == "light_warm_1"
