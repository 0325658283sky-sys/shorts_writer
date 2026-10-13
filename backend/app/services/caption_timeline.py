"""Turn a transcript into captions that follow the speech, for Remotion.

docs/FLOW_REDESIGN.md §1: the video-clipping path renders through Remotion
now, so captions are drawn by the motion engine instead of being burned into
the source as ASS pixels. That engine wants, per caption, the text and the
per-word timings — the same material ``subtitle_utils`` turns into ASS
events, shaped for ``BlogBoardProps.captionLines`` instead.

All times coming out of here are **relative to the clip's own start**, which
is what a Remotion Sequence inside the board expects. Times coming in are
absolute positions in the source video.

Word timings are used when the transcript has them (Whisper gives them for
most audio). When it does not, each segment still becomes its own caption
with no word timings, so the caption changes as the speaker moves on even
though nothing highlights word by word.
"""

from __future__ import annotations

from typing import Any

from app.services.subtitle_utils import (
    chunk_words_for_subtitle,
    clean_subtitle_text,
    split_text_for_duration,
)

#: Caption lines shorter than this are folded into the next one. A caption
#: that appears for a fifth of a second reads as a flicker, not as text.
MIN_LINE_SECONDS = 0.35


def _float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _words_in_window(
    segments: list[dict[str, Any]], clip_start: float, clip_end: float
) -> list[dict[str, Any]]:
    """Every timed word that is spoken inside the clip, in order."""
    collected: list[dict[str, Any]] = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        raw = segment.get("words") or []
        if not isinstance(raw, list):
            continue
        for word in raw:
            if not isinstance(word, dict):
                continue
            text = str(word.get("word") or word.get("text") or "").strip()
            if not text:
                continue
            start = _float(word.get("start"))
            end = _float(word.get("end"), start)
            # A word that straddles the boundary counts as inside: dropping it
            # would leave a hole in a caption the viewer can hear being said.
            if end <= clip_start or start >= clip_end:
                continue
            collected.append({"text": text, "start": start, "end": max(end, start)})
    collected.sort(key=lambda item: item["start"])
    return collected


def _from_word_timings(
    words: list[dict[str, Any]], clip_start: float, clip_end: float, max_chars: int
) -> list[dict[str, Any]]:
    clip_length = max(0.0, clip_end - clip_start)
    lines: list[dict[str, Any]] = []

    for group in chunk_words_for_subtitle(
        [{"word": word["text"], "start": word["start"], "end": word["end"]} for word in words],
        max_chars,
    ):
        flat = [word for line in group for word in line]
        if not flat:
            continue

        start = max(0.0, _float(flat[0].get("start")) - clip_start)
        end = min(clip_length, _float(flat[-1].get("end")) - clip_start)
        if end <= start:
            continue

        timings = []
        for word in flat:
            word_start = max(0.0, _float(word.get("start")) - clip_start)
            word_end = min(clip_length, _float(word.get("end"), word.get("start")) - clip_start)
            timings.append(
                {
                    "text": str(word.get("word") or "").strip(),
                    "startSec": round(word_start, 3),
                    "endSec": round(max(word_end, word_start), 3),
                }
            )

        text = " ".join(timing["text"] for timing in timings if timing["text"]).strip()
        if not text:
            continue

        lines.append(
            {
                "text": text,
                "words": timings,
                "startSec": round(start, 3),
                "endSec": round(end, 3),
            }
        )

    return lines


def _from_segments(
    segments: list[dict[str, Any]], clip_start: float, clip_end: float, max_chars: int
) -> list[dict[str, Any]]:
    """No word timings: one caption per segment, split if the text is long."""
    clip_length = max(0.0, clip_end - clip_start)
    lines: list[dict[str, Any]] = []

    for segment in segments:
        if not isinstance(segment, dict):
            continue
        seg_start = _float(segment.get("start"))
        seg_end = _float(segment.get("end"), seg_start)
        if seg_end <= clip_start or seg_start >= clip_end:
            continue

        text = clean_subtitle_text(str(segment.get("text") or ""))
        if not text:
            continue

        start = max(0.0, max(seg_start, clip_start) - clip_start)
        end = min(clip_length, min(seg_end, clip_end) - clip_start)
        if end <= start:
            continue

        pieces = split_text_for_duration(text, end - start, max_chars) or [text]
        step = (end - start) / len(pieces)
        for index, piece in enumerate(pieces):
            piece_start = start + step * index
            lines.append(
                {
                    "text": piece,
                    "words": [],
                    "startSec": round(piece_start, 3),
                    "endSec": round(min(end, piece_start + step), 3),
                }
            )

    return lines


def _merge_flickers(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fold a caption too short to read into the one after it."""
    merged: list[dict[str, Any]] = []
    for line in lines:
        duration = line["endSec"] - line["startSec"]
        if duration >= MIN_LINE_SECONDS or not merged:
            merged.append(dict(line))
            continue
        previous = merged[-1]
        previous["text"] = f"{previous['text']} {line['text']}".strip()
        previous["words"] = list(previous.get("words") or []) + list(line.get("words") or [])
        previous["endSec"] = line["endSec"]
    return merged


def caption_lines_for_clip(
    segments: list[dict[str, Any]],
    clip_start: float,
    clip_end: float,
    *,
    max_chars: int = 18,
) -> list[dict[str, Any]]:
    """Captions for one clip, as ``BlogBoardProps.captionLines``.

    ``segments`` are transcript segments with absolute times, as
    ``transcription_service.transcript_segments`` returns them. The result is
    ordered, non-overlapping and relative to ``clip_start``; an empty list
    means there is nothing to caption, which the renderer treats as a board
    with no captions rather than an error.
    """
    if clip_end <= clip_start or not segments:
        return []

    words = _words_in_window(segments, clip_start, clip_end)
    lines = (
        _from_word_timings(words, clip_start, clip_end, max_chars)
        if words
        else _from_segments(segments, clip_start, clip_end, max_chars)
    )
    lines = _merge_flickers(lines)

    # Never let one caption outlive the start of the next: two captions on
    # screen at once is the bug the ASS path used to produce.
    for index in range(len(lines) - 1):
        if lines[index]["endSec"] > lines[index + 1]["startSec"]:
            lines[index]["endSec"] = lines[index + 1]["startSec"]

    return [line for line in lines if line["endSec"] > line["startSec"]]
