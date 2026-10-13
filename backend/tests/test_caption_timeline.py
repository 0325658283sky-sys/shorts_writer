from app.services.caption_timeline import MIN_LINE_SECONDS, caption_lines_for_clip


def _segment(start, end, text, words=None):
    segment = {"start": start, "end": end, "text": text}
    if words is not None:
        segment["words"] = [
            {"word": word, "start": w_start, "end": w_end} for word, w_start, w_end in words
        ]
    return segment


def test_times_are_relative_to_the_clip():
    # A Sequence inside the board counts from the board's own start, so an
    # absolute transcript time would put every caption in the wrong place.
    segments = [
        _segment(
            30.0,
            33.0,
            "이게 핵심입니다",
            [("이게", 30.0, 30.6), ("핵심", 30.6, 31.4), ("입니다", 31.4, 32.2)],
        )
    ]
    lines = caption_lines_for_clip(segments, 30.0, 40.0)

    assert lines
    assert lines[0]["startSec"] == 0.0
    assert lines[0]["words"][0]["startSec"] == 0.0
    assert all(line["startSec"] >= 0 for line in lines)


def test_speech_outside_the_clip_is_left_out():
    segments = [
        _segment(0.0, 2.0, "앞부분", [("앞부분", 0.0, 2.0)]),
        _segment(31.0, 32.0, "가운데", [("가운데", 31.0, 32.0)]),
        _segment(90.0, 92.0, "뒷부분", [("뒷부분", 90.0, 92.0)]),
    ]
    lines = caption_lines_for_clip(segments, 30.0, 40.0)

    joined = " ".join(line["text"] for line in lines)
    assert "가운데" in joined
    assert "앞부분" not in joined
    assert "뒷부분" not in joined


def test_captions_never_overlap():
    # Two captions on screen at once is the bug the ASS path used to produce.
    words = [(f"단어{i}", 10.0 + i * 0.4, 10.0 + i * 0.4 + 0.38) for i in range(40)]
    lines = caption_lines_for_clip([_segment(10.0, 26.0, "x" * 40, words)], 10.0, 30.0)

    assert len(lines) > 1
    for earlier, later in zip(lines, lines[1:]):
        assert earlier["endSec"] <= later["startSec"]


def test_no_caption_is_too_short_to_read():
    words = [("가", 5.0, 5.05), ("나", 5.05, 5.1), ("다라마바사", 5.1, 7.0)]
    lines = caption_lines_for_clip([_segment(5.0, 7.0, "가 나 다라마바사", words)], 5.0, 9.0)

    for line in lines:
        assert line["endSec"] - line["startSec"] >= MIN_LINE_SECONDS


def test_falls_back_to_segments_without_word_timings():
    # Older transcripts have no per-word data. The caption should still change
    # as the speaker moves on, just without word-by-word highlighting.
    segments = [
        _segment(0.0, 3.0, "첫 문장입니다"),
        _segment(3.0, 6.0, "둘째 문장입니다"),
    ]
    lines = caption_lines_for_clip(segments, 0.0, 6.0)

    assert len(lines) >= 2
    assert all(line["words"] == [] for line in lines)
    assert lines[0]["startSec"] < lines[-1]["startSec"]


def test_empty_input_is_not_an_error():
    # A clip with no captions is still a clip; the renderer treats an empty
    # list as "no captions" rather than failing.
    assert caption_lines_for_clip([], 0.0, 10.0) == []
    assert caption_lines_for_clip([_segment(0.0, 1.0, "")], 0.0, 10.0) == []
    assert caption_lines_for_clip([_segment(0.0, 1.0, "말")], 10.0, 5.0) == []


def test_junk_in_the_transcript_is_skipped():
    segments = [
        None,
        "not a segment",
        {"start": "bad", "end": None, "text": "깨진 값"},
        _segment(1.0, 2.0, "정상", [("정상", 1.0, 2.0)]),
    ]
    lines = caption_lines_for_clip(segments, 0.0, 5.0)

    assert [line["text"] for line in lines] == ["정상"]


def test_word_order_matches_the_text():
    # The renderer prints `words` in order and uses `text` for the static
    # fallback; if they disagree the caption changes when the motion changes.
    words = [("하나", 0.0, 0.5), ("둘", 0.5, 1.0), ("셋", 1.0, 1.6)]
    lines = caption_lines_for_clip([_segment(0.0, 1.6, "하나 둘 셋", words)], 0.0, 5.0)

    for line in lines:
        assert line["text"] == " ".join(word["text"] for word in line["words"])
