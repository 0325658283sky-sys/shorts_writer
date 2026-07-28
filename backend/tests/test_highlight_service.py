from app.services.highlight_service import (
    _duration_bounds,
    _fallback_highlights_from_segments,
    _media_end_seconds,
    _normalize_window,
    _parse_highlight_json,
)


def test_duration_bounds_short_media():
    min_s, max_s = _duration_bounds(12.0)
    assert max_s == 12.0
    assert 3.0 <= min_s <= 12.0


def test_duration_bounds_normal_media():
    min_s, max_s = _duration_bounds(180.0)
    assert min_s == 15.0
    assert max_s == 60.0


def test_normalize_window_extends_short_clip():
    normalized = _normalize_window(10.0, 18.0, min_s=15.0, max_s=60.0, media_end=120.0)
    assert normalized is not None
    start, end = normalized
    assert end - start >= 14.0
    assert start == 10.0


def test_normalize_window_pulls_start_back_near_end():
    normalized = _normalize_window(110.0, 115.0, min_s=15.0, max_s=60.0, media_end=120.0)
    assert normalized is not None
    start, end = normalized
    assert end == 120.0
    assert end - start >= 14.0


def test_parse_highlight_json_normalizes_short_candidates():
    raw = """
    {"highlights":[
      {"start_time":0,"end_time":8,"title":"훅","reason":"오프닝","content_type":"후킹형","score":88},
      {"start_time":20,"end_time":50,"title":"본문","reason":"핵심","content_type":"정보형","score":80}
    ]}
    """
    parsed = _parse_highlight_json(raw, min_s=15.0, max_s=60.0, media_end=90.0)
    assert len(parsed) >= 2
    assert all(item["end_time"] - item["start_time"] >= 14.0 for item in parsed)


def test_fallback_highlights_from_segments():
    segments = [
        {"start": 0, "end": 5, "text": "안녕하세요"},
        {"start": 5, "end": 12, "text": "오늘은 리뷰입니다"},
        {"start": 12, "end": 25, "text": "핵심 포인트는 이겁니다"},
        {"start": 25, "end": 40, "text": "마무리하겠습니다"},
    ]
    assert _media_end_seconds(segments) == 40.0
    items = _fallback_highlights_from_segments(segments, "안녕하세요 오늘은 리뷰입니다")
    assert 1 <= len(items) <= 4
    assert items[0]["title"]
    assert items[0]["end_time"] > items[0]["start_time"]
