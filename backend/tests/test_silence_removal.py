from app.services.ffmpeg_service import (
    compute_keep_intervals,
    parse_silence_intervals,
    remap_events_through_keeps,
    remap_time_through_keeps,
)


def test_parse_and_keep_intervals():
    stderr = "silence_start: 2.0\nsilence_end: 4.0 | silence_duration: 2.0\nsilence_start: 8.5"
    silences = parse_silence_intervals(stderr, 10.0)
    assert silences == [(2.0, 4.0), (8.5, 10.0)]
    keeps = compute_keep_intervals(10.0, silences, pad=0.15)
    assert keeps[0] == (0.0, 2.15)
    assert keeps[1][0] == 3.85
    assert keeps[1][1] == 8.65
    assert keeps[-1] == (9.85, 10.0)


def test_short_silence_is_ignored():
    assert compute_keep_intervals(5.0, [(1.0, 1.2)], pad=0.15) == [(0.0, 5.0)]


def test_remap_time_and_events():
    keeps = [(0.0, 2.0), (4.0, 6.0)]
    assert remap_time_through_keeps(1.0, keeps) == 1.0
    assert remap_time_through_keeps(3.0, keeps) is None
    assert remap_time_through_keeps(5.0, keeps) == 3.0
    events = [(0.5, 1.5, "a"), (2.5, 3.5, "gone"), (4.5, 5.5, "b"), (1.5, 4.5, "span")]
    out = remap_events_through_keeps(events, keeps)
    assert (0.5, 1.5, "a") in out
    assert all(text != "gone" for _, _, text in out)
    assert (2.5, 3.5, "b") in [(round(s, 2), round(e, 2), t) for s, e, t in out]
    span = [e for e in out if e[2] == "span"][0]
    assert round(span[0], 2) == 1.5 and round(span[1], 2) == 2.5
