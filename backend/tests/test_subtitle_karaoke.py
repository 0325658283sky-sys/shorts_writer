from pathlib import Path

import pytest

from app.services.subtitle_utils import (
    ass_style,
    ass_style_line,
    build_karaoke_text,
    builtin_style_params,
    equal_split_subtitle_events,
    hex_to_ass_color,
    sanitize_ass_dialogue_text,
    split_text_for_duration,
    subtitle_events_for_segment,
    wrap_subtitle_text,
    write_ass_file,
)
from app.services.transcription_service import _extract_segments


def test_wrap_and_split_keep_two_line_limit():
    wrapped = wrap_subtitle_text("이것은 열여덟 자를 넘는 긴 자막 문장입니다", 18)
    assert wrapped.count(r"\N") <= 1
    assert all(len(line) <= 18 for line in wrapped.split(r"\N"))
    chunks = split_text_for_duration("짧은 한 줄", 2.0, 18)
    assert chunks == [wrap_subtitle_text("짧은 한 줄", 18)]


def test_builtin_presets_keep_visual_fields():
    expected = {
        "basic": {
            "font_size": 58,
            "primary_color": "#FFFFFF",
            "outline_color": "#000000",
            "back_color": "#000000",
            "outline_alpha": 0xAA,
            "back_alpha": 0xCC,
            "bold": False,
            "outline": 3,
            "shadow": 1,
            "margin_l": 80,
            "margin_r": 80,
            "margin_v": 150,
            "border_style": 1,
            "alignment": 2,
            "font_name": "Malgun Gothic",
        },
        "bold": {
            "font_size": 66,
            "primary_color": "#FFFFFF",
            "outline_color": "#000000",
            "back_color": "#000000",
            "outline_alpha": 0x99,
            "back_alpha": 0xDD,
            "bold": True,
            "outline": 4,
            "shadow": 1,
            "margin_l": 70,
            "margin_r": 70,
            "margin_v": 155,
            "border_style": 1,
            "alignment": 2,
            "font_name": "Malgun Gothic",
        },
        "shorts": {
            "font_size": 72,
            "primary_color": "#FFFF00",
            "outline_color": "#000000",
            "back_color": "#000000",
            "outline_alpha": 0,
            "back_alpha": 0xCC,
            "bold": True,
            "outline": 5,
            "shadow": 2,
            "margin_l": 58,
            "margin_r": 58,
            "margin_v": 210,
            "border_style": 1,
            "alignment": 2,
            "font_name": "Malgun Gothic",
        },
    }
    for name, fields in expected.items():
        params = builtin_style_params(name)
        for field, value in fields.items():
            assert getattr(params, field) == value, f"{name}.{field}"
        assert params.karaoke_color == "#FFFF00"


def test_ass_style_presets_only_change_secondary_colour():
    for name in ("basic", "bold", "shorts"):
        params = builtin_style_params(name)
        line = ass_style(name)
        expected_secondary = hex_to_ass_color(params.karaoke_color)
        parts = line.split(",")
        assert parts[0] == "Style: Default"
        assert parts[1] == params.font_name
        assert parts[2] == str(params.font_size)
        assert parts[3] == hex_to_ass_color(params.primary_color, params.primary_alpha)
        assert parts[4] == expected_secondary
        assert parts[5] == hex_to_ass_color(params.outline_color, params.outline_alpha)
        assert parts[6] == hex_to_ass_color(params.back_color, params.back_alpha)
        assert parts[7] == ("-1" if params.bold else "0")
        assert ass_style_line(params) == line


def test_build_karaoke_text_uses_centiseconds():
    words = [
        {"word": "안녕", "start": 1.00, "end": 1.12},
        {"word": "하세요", "start": 1.12, "end": 1.40},
    ]
    text = build_karaoke_text(words, 1.00)
    assert text == r"{\k12}안녕{\k28}하세요"
    delayed = build_karaoke_text(words, 0.90)
    assert delayed.startswith(r"{\k10}")
    assert r"{\k12}안녕" in delayed


def test_events_fall_back_to_equal_split_without_words():
    segment = {"start": 10.0, "end": 14.0, "text": "단어 타임스탬프가 없는 자막입니다", "words": []}
    fallback = equal_split_subtitle_events("단어 타임스탬프가 없는 자막입니다", 0.0, 4.0, 4.0, 18)
    events = subtitle_events_for_segment(segment, 10.0, 14.0, 4.0)
    assert events == fallback
    assert events
    assert all(r"{\k" not in text for _, _, text in events)


def test_events_use_karaoke_when_word_timestamps_exist():
    segment = {
        "start": 5.0,
        "end": 7.0,
        "text": "안녕 하세요",
        "words": [
            {"word": "안녕", "start": 5.0, "end": 5.4},
            {"word": "하세요", "start": 5.4, "end": 6.2},
        ],
    }
    events = subtitle_events_for_segment(segment, 5.0, 7.0, 2.0)
    assert len(events) == 1
    start, end, text = events[0]
    assert start == pytest.approx(0.0)
    assert end == pytest.approx(1.2)
    assert r"{\k40}안녕" in text
    assert r"{\k80}하세요" in text


def test_write_ass_file_preserves_karaoke_tags(tmp_path: Path):
    path = tmp_path / "clip.ass"
    write_ass_file(path, "basic", [(0.0, 1.0, r"{\k12}안녕{raw}하세요")])
    body = path.read_text(encoding="utf-8-sig")
    assert r"{\k12}안녕raw하세요" in body
    assert "{raw}" not in body


def test_sanitize_strips_non_karaoke_braces():
    assert sanitize_ass_dialogue_text(r"{\k8}hi{bad}") == r"{\k8}hibad"


def test_extract_segments_attaches_words():
    response = {
        "text": "hello world",
        "segments": [{"start": 0.0, "end": 1.0, "text": " hello world"}],
        "words": [
            {"word": " hello", "start": 0.0, "end": 0.4},
            {"word": " world", "start": 0.4, "end": 1.0},
        ],
    }
    text, segments = _extract_segments(response, offset_seconds=10.0)
    assert text == "hello world"
    assert segments[0]["start"] == 10.0
    assert segments[0]["end"] == 11.0
    assert segments[0]["words"] == [
        {"word": " hello", "start": 10.0, "end": 10.4},
        {"word": " world", "start": 10.4, "end": 11.0},
    ]


def test_extract_segments_empty_words_when_missing():
    response = {
        "text": "only segments",
        "segments": [{"start": 0.0, "end": 1.0, "text": " only segments"}],
    }
    _, segments = _extract_segments(response, 0.0)
    assert segments[0]["words"] == []
