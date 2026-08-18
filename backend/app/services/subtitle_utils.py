"""Shared ASS subtitle building helpers.

These were originally part of clip_service.py (used for burning transcript-timed
captions onto highlight clips) and are reused as-is by blog_service.py to burn
narration-script-timed captions onto blog image slideshows. Keeping them here
avoids duplicating the exact font/style/wrapping conventions in two places.
"""

from __future__ import annotations

import math
import re
import textwrap
from dataclasses import dataclass
from pathlib import Path


def clean_subtitle_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _chunk_long_word(word: str, size: int) -> list[str]:
    return [word[index : index + size] for index in range(0, len(word), size)]


def wrap_subtitle_text(text: str, max_chars: int) -> str:
    text = clean_subtitle_text(text)
    if not text:
        return ""

    words: list[str] = []
    for word in text.split(" "):
        if len(word) > max_chars:
            words.extend(_chunk_long_word(word, max_chars))
        else:
            words.append(word)

    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
        if len(lines) == 2:
            break
    if current and len(lines) < 2:
        lines.append(current)

    return r"\N".join(lines[:2])


def build_karaoke_text(words: list[dict], line_start: float) -> str:
    """words: [{word, start, end}] (absolute seconds) → ASS \\k tagged text.

    ``\\k`` duration is centiseconds the highlight stays on that syllable.
    ``line_start`` fills a leading pause when the first word begins after the event.
    """
    parts: list[str] = []
    cursor = float(line_start)
    for item in words:
        if not isinstance(item, dict):
            continue
        token = str(item.get("word") or item.get("text") or "")
        if not token:
            continue
        try:
            start = float(item["start"])
            end = float(item["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if end < start:
            end = start
        if start > cursor + 0.005:
            gap_cs = max(1, round((start - cursor) * 100))
            parts.append(f"{{\\k{gap_cs}}}")
        dur_cs = max(1, round((end - start) * 100))
        parts.append(f"{{\\k{dur_cs}}}{token}")
        cursor = end
    return "".join(parts)


def _word_visible(item: dict) -> str:
    return str(item.get("word") or item.get("text") or "").strip()


def _words_visible_len(words: list[dict]) -> int:
    tokens = [_word_visible(word) for word in words if _word_visible(word)]
    if not tokens:
        return 0
    return len(clean_subtitle_text(" ".join(tokens)))


def chunk_words_for_subtitle(words: list[dict], max_chars: int) -> list[list[list[dict]]]:
    """Group words into dialogue events of at most two wrapped lines."""
    usable = [word for word in words if isinstance(word, dict) and _word_visible(word)]
    lines: list[list[dict]] = []
    current: list[dict] = []
    for item in usable:
        trial = current + [item]
        if current and _words_visible_len(trial) > max_chars:
            lines.append(current)
            current = [item]
        else:
            current = trial
    if current:
        lines.append(current)
    return [lines[index : index + 2] for index in range(0, len(lines), 2)]


def sanitize_ass_dialogue_text(text: str) -> str:
    """Strip raw braces except ASS karaoke ``{\\kN}`` override tags."""
    placeholders: list[str] = []

    def _stash(match: re.Match[str]) -> str:
        placeholders.append(match.group(0))
        return f"\x00K{len(placeholders) - 1}\x00"

    stashed = re.sub(r"\{\\k\d+\}", _stash, text)
    stashed = stashed.replace("{", "").replace("}", "")
    for index, tag in enumerate(placeholders):
        stashed = stashed.replace(f"\x00K{index}\x00", tag)
    return stashed


def split_text_for_duration(text: str, duration: float, max_chars: int) -> list[str]:
    text = clean_subtitle_text(text)
    if not text:
        return []
    chunk_size = max_chars * 2
    chunk_count = max(1, min(4, math.ceil(len(text) / chunk_size)))
    if chunk_count == 1:
        return [wrap_subtitle_text(text, max_chars)]
    raw_chunks = textwrap.wrap(text, width=chunk_size, break_long_words=True, break_on_hyphens=False)
    return [wrap_subtitle_text(chunk, max_chars) for chunk in raw_chunks[:chunk_count] if chunk.strip()]


def equal_split_subtitle_events(
    text: str,
    relative_start: float,
    relative_end: float,
    clip_duration: float,
    max_chars: int = 18,
) -> list[tuple[float, float, str]]:
    """Legacy timing: wrap by character count and split duration evenly."""
    duration = max(0.8, relative_end - relative_start)
    chunks = split_text_for_duration(text, duration, max_chars)
    if not chunks:
        return []
    events: list[tuple[float, float, str]] = []
    chunk_duration = duration / len(chunks)
    for index, chunk in enumerate(chunks):
        start = min(clip_duration, relative_start + index * chunk_duration)
        end = min(clip_duration, relative_start + (index + 1) * chunk_duration)
        if end - start < 0.4:
            end = min(clip_duration, start + 0.8)
        if end > start:
            events.append((start, end, chunk))
    return events


def karaoke_events_from_words(
    words: list[dict],
    clip_start: float,
    clip_end: float,
    clip_duration: float,
    max_chars: int = 18,
) -> list[tuple[float, float, str]]:
    clipped: list[dict] = []
    for item in words:
        if not isinstance(item, dict):
            continue
        try:
            start = float(item["start"])
            end = float(item["end"])
        except (KeyError, TypeError, ValueError):
            continue
        clipped_start = max(start, clip_start)
        clipped_end = min(end, clip_end)
        if clipped_end <= clipped_start:
            continue
        clipped.append({**item, "start": clipped_start, "end": clipped_end})
    if not clipped:
        return []

    events: list[tuple[float, float, str]] = []
    for line_groups in chunk_words_for_subtitle(clipped, max_chars):
        all_words = [word for line in line_groups for word in line]
        if not all_words:
            continue
        abs_start = float(all_words[0]["start"])
        abs_end = float(all_words[-1]["end"])
        rel_start = max(0.0, abs_start - clip_start)
        rel_end = min(clip_duration, abs_end - clip_start)
        if rel_end <= rel_start:
            continue
        karaoke_lines: list[str] = []
        for index, line in enumerate(line_groups):
            line_start = abs_start if index == 0 else float(line[0]["start"])
            karaoke_lines.append(build_karaoke_text(line, line_start))
        events.append((rel_start, rel_end, "\\N".join(karaoke_lines)))
    return events


def subtitle_events_for_segment(
    segment: dict,
    clip_start: float,
    clip_end: float,
    clip_duration: float,
    max_chars: int = 18,
) -> list[tuple[float, float, str]]:
    """Karaoke events when word timestamps exist; otherwise equal-split fallback."""
    try:
        segment_start = float(segment.get("start") or 0)
        segment_end = float(segment.get("end") or segment_start)
    except (TypeError, ValueError):
        return []
    if segment_end <= clip_start or segment_start >= clip_end:
        return []
    text = clean_subtitle_text(str(segment.get("text") or ""))
    if not text:
        return []
    relative_start = max(segment_start, clip_start) - clip_start
    relative_end = min(segment_end, clip_end) - clip_start
    raw_words = segment.get("words") or []
    if isinstance(raw_words, list):
        karaoke = karaoke_events_from_words(raw_words, clip_start, clip_end, clip_duration, max_chars)
        if karaoke:
            return karaoke
    return equal_split_subtitle_events(text, relative_start, relative_end, clip_duration, max_chars)


def ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    centiseconds = int(round(seconds * 100))
    hours = centiseconds // 360000
    centiseconds %= 360000
    minutes = centiseconds // 6000
    centiseconds %= 6000
    whole_seconds = centiseconds // 100
    centiseconds %= 100
    return f"{hours}:{minutes:02d}:{whole_seconds:02d}.{centiseconds:02d}"


@dataclass(frozen=True)
class AssStyleParams:
    font_name: str = "Malgun Gothic"
    font_size: int = 58
    primary_color: str = "#FFFFFF"
    outline_color: str = "#000000"
    back_color: str = "#000000"
    primary_alpha: int = 0  # 00 opaque .. FF transparent (ASS)
    outline_alpha: int = 0
    back_alpha: int = 0xCC
    bold: bool = False
    outline: float = 3.0
    shadow: float = 1.0
    alignment: int = 2
    margin_l: int = 80
    margin_r: int = 80
    margin_v: int = 150
    border_style: int = 1  # 1=outline+shadow, 3=opaque box
    # ASS \k highlight uses SecondaryColour.
    karaoke_color: str = "#FFFF00"


_HEX_RE = re.compile(r"^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


def normalize_hex_color(value: str, *, field_name: str = "color") -> str:
    cleaned = (value or "").strip()
    if not _HEX_RE.match(cleaned):
        raise ValueError(f"{field_name} must be #RRGGBB or #AARRGGBB")
    if len(cleaned) == 7:
        return cleaned.upper()
    # #AARRGGBB → keep as-is but normalize case; alpha is separate in ASS params for API simplicity
    return f"#{cleaned[3:].upper()}"


def hex_to_ass_color(hex_color: str, alpha: int = 0) -> str:
    """Convert #RRGGBB to ASS &HAABBGGRR."""
    cleaned = normalize_hex_color(hex_color)
    red = cleaned[1:3]
    green = cleaned[3:5]
    blue = cleaned[5:7]
    alpha_hex = f"{max(0, min(255, int(alpha))):02X}"
    return f"&H{alpha_hex}{blue}{green}{red}"


def builtin_style_params(style: str) -> AssStyleParams:
    presets = {
        "basic": AssStyleParams(
            font_size=58,
            primary_color="#FFFFFF",
            outline_color="#000000",
            back_color="#000000",
            outline_alpha=0xAA,
            back_alpha=0xCC,
            bold=False,
            outline=3,
            shadow=1,
            margin_l=80,
            margin_r=80,
            margin_v=150,
            border_style=1,
        ),
        "bold": AssStyleParams(
            font_size=66,
            primary_color="#FFFFFF",
            outline_color="#000000",
            back_color="#000000",
            outline_alpha=0x99,
            back_alpha=0xDD,
            bold=True,
            outline=4,
            shadow=1,
            margin_l=70,
            margin_r=70,
            margin_v=155,
            border_style=1,
        ),
        "shorts": AssStyleParams(
            font_size=72,
            primary_color="#FFFF00",
            outline_color="#000000",
            back_color="#000000",
            outline_alpha=0,
            back_alpha=0xCC,
            bold=True,
            outline=5,
            shadow=2,
            margin_l=58,
            margin_r=58,
            margin_v=210,
            border_style=1,
        ),
    }
    if style not in presets:
        raise KeyError(style)
    return presets[style]


def ass_style_line(params: AssStyleParams) -> str:
    bold_flag = -1 if params.bold else 0
    primary = hex_to_ass_color(params.primary_color, params.primary_alpha)
    secondary = hex_to_ass_color(params.karaoke_color)
    outline = hex_to_ass_color(params.outline_color, params.outline_alpha)
    back = hex_to_ass_color(params.back_color, params.back_alpha)
    font = (params.font_name or "Malgun Gothic").replace(",", " ")
    return (
        f"Style: Default,{font},{int(params.font_size)},"
        f"{primary},{secondary},{outline},{back},"
        f"{bold_flag},0,0,0,100,100,0,0,"
        f"{int(params.border_style)},{params.outline:g},{params.shadow:g},"
        f"{int(params.alignment)},{int(params.margin_l)},{int(params.margin_r)},"
        f"{int(params.margin_v)},1"
    )


def ass_style(style: str) -> str:
    """Legacy helper: builtin style key → ASS Style line."""
    return ass_style_line(builtin_style_params(style))


def ass_header_from_params(params: AssStyleParams) -> str:
    return "\n".join(
        [
            "[Script Info]",
            "ScriptType: v4.00+",
            "Collisions: Normal",
            "PlayResX: 1080",
            "PlayResY: 1920",
            "WrapStyle: 2",
            "ScaledBorderAndShadow: yes",
            "",
            "[V4+ Styles]",
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
            ass_style_line(params),
            "",
            "[Events]",
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        ]
    )


def ass_header(style: str) -> str:
    return ass_header_from_params(builtin_style_params(style))


def write_ass_file(
    path: Path,
    style: str | AssStyleParams,
    events: list[tuple[float, float, str]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    params = style if isinstance(style, AssStyleParams) else builtin_style_params(style)
    lines = [ass_header_from_params(params)]
    for start, end, text in events:
        safe_text = sanitize_ass_dialogue_text(text)
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Default,,0,0,0,,{safe_text}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8-sig")
