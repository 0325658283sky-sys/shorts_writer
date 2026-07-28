import json
import sqlite3
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status
from openai import APIConnectionError, APIStatusError, OpenAI, OpenAIError, RateLimitError

from app.core.config import settings
from app.db.models import Highlight
from app.services.ffmpeg_service import FFmpegExtractionError, FFmpegNotAvailableError, extract_video_frame_jpeg
from app.services.transcription_service import get_transcript_for_video, transcript_segments
from app.services.video_service import STORAGE_ROOT, get_video_for_user

THUMB_ROOT = STORAGE_ROOT / "highlight_thumbs"

ALLOWED_CONTENT_TYPES = {"정보형", "꿀팁형", "후킹형", "감정형", "논쟁형", "웃긴 장면"}


def _row_to_highlight(row: sqlite3.Row) -> Highlight:
    return Highlight(
        id=row["id"],
        video_id=row["video_id"],
        start_time=row["start_time"],
        end_time=row["end_time"],
        title=row["title"],
        reason=row["reason"],
        content_type=row["content_type"],
        score=row["score"],
        created_at=row["created_at"],
    )


def list_highlights_for_video(conn: sqlite3.Connection, video_id: int) -> list[Highlight]:
    rows = conn.execute(
        """
        SELECT id, video_id, start_time, end_time, title, reason, content_type, score, created_at
        FROM highlights
        WHERE video_id = ?
        ORDER BY score DESC, start_time ASC, id ASC
        """,
        (video_id,),
    ).fetchall()
    return [_row_to_highlight(row) for row in rows]


def get_highlight_for_user(conn: sqlite3.Connection, user_id: int, video_id: int, highlight_id: int) -> Highlight:
    video = get_video_for_user(conn, user_id, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    row = conn.execute(
        """
        SELECT id, video_id, start_time, end_time, title, reason, content_type, score, created_at
        FROM highlights
        WHERE id = ? AND video_id = ?
        """,
        (highlight_id, video_id),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found.")
    return _row_to_highlight(row)


def ensure_highlight_thumbnail(conn: sqlite3.Connection, user_id: int, video_id: int, highlight_id: int) -> Path:
    highlight = get_highlight_for_user(conn, user_id, video_id, highlight_id)
    video = get_video_for_user(conn, user_id, video_id)
    assert video is not None
    destination = THUMB_ROOT / str(video_id) / f"{highlight_id}.jpg"
    if destination.exists() and destination.stat().st_size > 0:
        return destination
    source = Path(video.storage_path)
    if not source.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source video file was not found.")
    try:
        extract_video_frame_jpeg(str(source), str(destination), at_seconds=float(highlight.start_time))
    except FFmpegNotAvailableError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    except FFmpegExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Highlight thumbnail failed: {str(exc)[-300:]}",
        ) from exc
    return destination


def _save_highlights(conn: sqlite3.Connection, video_id: int, highlights: list[dict[str, Any]]) -> list[Highlight]:
    conn.execute("DELETE FROM highlights WHERE video_id = ?", (video_id,))
    for item in highlights:
        conn.execute(
            """
            INSERT INTO highlights (video_id, start_time, end_time, title, reason, content_type, score)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                video_id,
                item["start_time"],
                item["end_time"],
                item["title"],
                item["reason"],
                item["content_type"],
                item["score"],
            ),
        )
    conn.commit()
    return list_highlights_for_video(conn, video_id)


def _transcript_context(video_title: str, transcript_text: str, segments: list[dict[str, Any]]) -> str:
    segment_lines: list[str] = []
    for segment in segments[:500]:
        start = float(segment.get("start") or 0)
        end = float(segment.get("end") or start)
        text = str(segment.get("text") or "").strip()
        if text:
            segment_lines.append(f"[{start:.1f}-{end:.1f}] {text}")
    joined_segments = "\n".join(segment_lines)
    clipped_text = transcript_text[:12000]
    return f"Video title: {video_title}\n\nTranscript summary source text:\n{clipped_text}\n\nTimestamped segments:\n{joined_segments}"


def _media_end_seconds(segments: list[dict[str, Any]], transcript_text: str = "") -> float:
    ends: list[float] = []
    for segment in segments:
        try:
            ends.append(float(segment.get("end") or segment.get("start") or 0))
        except (TypeError, ValueError):
            continue
    if ends:
        return max(0.0, max(ends))
    # Rough fallback when segments are missing: ~12 chars/sec for Korean speech.
    if transcript_text.strip():
        return max(8.0, min(float(settings.highlight_max_seconds), len(transcript_text.strip()) / 12.0))
    return 0.0


def _duration_bounds(media_end: float) -> tuple[float, float]:
    """Adapt 15–60s rule for short source videos."""
    configured_min = float(settings.highlight_min_seconds)
    configured_max = float(settings.highlight_max_seconds)
    if media_end <= 0:
        return configured_min, configured_max
    max_s = min(configured_max, media_end)
    if media_end < configured_min:
        # Whole clip is shorter than the usual shorts floor — use almost the full video.
        min_s = max(3.0, min(media_end, media_end * 0.85))
    elif media_end < configured_min * 2:
        min_s = max(8.0, min(configured_min, media_end * 0.55))
    else:
        min_s = configured_min
    min_s = min(min_s, max_s)
    return round(min_s, 2), round(max_s, 2)


def _normalize_window(start_time: float, end_time: float, *, min_s: float, max_s: float, media_end: float) -> tuple[float, float] | None:
    if media_end <= 0:
        return None
    start = max(0.0, float(start_time))
    end = float(end_time)
    if end <= start:
        end = start + min_s
    duration = end - start
    if duration < min_s:
        end = min(media_end, start + min_s)
        duration = end - start
        if duration < min_s:
            start = max(0.0, end - min_s)
            duration = end - start
    if duration > max_s:
        end = start + max_s
        if end > media_end:
            end = media_end
            start = max(0.0, end - max_s)
    if end > media_end:
        end = media_end
        start = max(0.0, end - min(max_s, max(min_s, media_end)))
    duration = end - start
    # Accept slightly short windows on very short media after normalization.
    floor = min(min_s, media_end) * 0.9 if media_end < settings.highlight_min_seconds else min_s * 0.95
    if duration < floor or duration <= 0.5:
        return None
    return round(start, 2), round(end, 2)


def _fallback_highlights_from_segments(segments: list[dict[str, Any]], transcript_text: str) -> list[dict[str, Any]]:
    media_end = _media_end_seconds(segments, transcript_text)
    min_s, max_s = _duration_bounds(media_end)
    if media_end < 3:
        return []

    windows: list[tuple[float, float]] = []
    if media_end <= max_s:
        windows.append((0.0, media_end))
    else:
        step = max(min_s * 0.75, 10.0)
        cursor = 0.0
        while cursor + min_s <= media_end + 0.05 and len(windows) < 4:
            end = min(media_end, cursor + min(max_s, max(min_s, 30.0)))
            windows.append((cursor, end))
            cursor += step
        if not windows:
            windows.append((0.0, min(media_end, max_s)))

    highlights: list[dict[str, Any]] = []
    for index, (raw_start, raw_end) in enumerate(windows):
        normalized = _normalize_window(raw_start, raw_end, min_s=min_s, max_s=max_s, media_end=media_end)
        if normalized is None:
            continue
        start, end = normalized
        snippet_parts: list[str] = []
        for segment in segments:
            try:
                seg_start = float(segment.get("start") or 0)
                seg_end = float(segment.get("end") or seg_start)
            except (TypeError, ValueError):
                continue
            if seg_end < start or seg_start > end:
                continue
            text = str(segment.get("text") or "").strip()
            if text:
                snippet_parts.append(text)
            if len(" ".join(snippet_parts)) > 80:
                break
        snippet = " ".join(snippet_parts).strip() or (transcript_text.strip()[:80] or "하이라이트")
        title = snippet[:40] + ("…" if len(snippet) > 40 else "")
        highlights.append(
            {
                "start_time": start,
                "end_time": end,
                "title": title[:120] or f"하이라이트 {index + 1}",
                "reason": "전사 구간을 기준으로 자동 선정한 쇼츠 후보입니다.",
                "content_type": "후킹형" if index == 0 else "정보형",
                "score": float(max(55, 90 - index * 8)),
            }
        )
    return highlights[:4]


def _parse_highlight_json(
    raw_text: str,
    *,
    min_s: float,
    max_s: float,
    media_end: float,
) -> list[dict[str, Any]]:
    print(f"[highlight_debug] raw GPT response: {raw_text}")
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="하이라이트 JSON 파싱에 실패했습니다.") from exc

    items = payload.get("highlights") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="GPT 응답에 highlights 배열이 없습니다.")
    print(f"[highlight_debug] GPT proposed {len(items)} raw candidate(s); bounds={min_s}-{max_s}s media_end={media_end:.1f}s")

    parsed: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            print(f"[highlight_debug] skip: not a dict -> {item!r}")
            continue
        try:
            start_time = float(item["start_time"])
            end_time = float(item["end_time"])
            title = str(item["title"]).strip()
            reason = str(item["reason"]).strip()
            content_type = str(item["content_type"]).strip()
            score = float(item["score"])
        except (KeyError, TypeError, ValueError) as exc:
            print(f"[highlight_debug] skip: missing/invalid field ({exc}) -> {item!r}")
            continue

        normalized = _normalize_window(start_time, end_time, min_s=min_s, max_s=max_s, media_end=media_end)
        if normalized is None:
            print(f"[highlight_debug] skip: could not normalize window -> {item!r}")
            continue
        start_time, end_time = normalized
        if not title or not reason:
            print(f"[highlight_debug] skip: empty title/reason -> {item!r}")
            continue
        if content_type not in ALLOWED_CONTENT_TYPES:
            content_type = "후킹형"
        parsed.append(
            {
                "start_time": start_time,
                "end_time": end_time,
                "title": title[:120],
                "reason": reason[:500],
                "content_type": content_type,
                "score": max(0.0, min(100.0, score)),
            }
        )

    return sorted(parsed, key=lambda value: value["score"], reverse=True)[:5]


def _generate_highlights_with_openai(video_title: str, transcript_text: str, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not settings.openai_api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OPENAI_API_KEY is not configured.")

    media_end = _media_end_seconds(segments, transcript_text)
    min_s, max_s = _duration_bounds(media_end)
    client = OpenAI(api_key=settings.openai_api_key)
    prompt = _transcript_context(video_title, transcript_text, segments)
    system_prompt = (
        "You recommend short-form video highlight clips from transcripts. "
        "Return only valid JSON. Recommend 3 to 5 clips.\n"
        f"CRITICAL DURATION RULE: end_time minus start_time MUST be at least "
        f"{min_s} seconds and at most {max_s} seconds. "
        f"The source media ends around {media_end:.1f} seconds — never exceed that. "
        "A single short sentence (typically 5-10 seconds) is often NOT long enough on its own. "
        "You MUST span multiple consecutive transcript segments/sentences to reach the minimum duration "
        "when the source is long enough. If a candidate is too short, extend end_time using nearby segments.\n"
        "Use Korean titles and reasons. content_type must be one of: 정보형, 꿀팁형, 후킹형, 감정형, 논쟁형, 웃긴 장면. "
        "score must be 0 to 100."
    )
    user_prompt = (
        "Analyze this transcript and choose the best shorts candidates. "
        f"Remember: every clip's (end_time - start_time) must be >= {min_s} seconds and <= {max_s} seconds. "
        "Return JSON exactly like: {\"highlights\":[{\"start_time\":0.0,\"end_time\":30.0,\"title\":\"...\",\"reason\":\"...\",\"content_type\":\"후킹형\",\"score\":90}]}\n\n"
        + prompt
    )

    try:
        response = client.chat.completions.create(
            model=settings.openai_highlight_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except RateLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="OpenAI rate limit reached. Try again later.") from exc
    except APIConnectionError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not connect to OpenAI GPT API.") from exc
    except APIStatusError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"OpenAI GPT API error: {exc.status_code}") from exc
    except OpenAIError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Highlight generation failed: {exc}") from exc

    raw_text = response.choices[0].message.content if response.choices else None
    if not raw_text:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="GPT가 빈 하이라이트 응답을 반환했습니다.")
    return _parse_highlight_json(raw_text, min_s=min_s, max_s=max_s, media_end=media_end)


def get_or_create_highlights(conn: sqlite3.Connection, user_id: int, video_id: int) -> list[Highlight]:
    video = get_video_for_user(conn, user_id, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")

    existing = list_highlights_for_video(conn, video_id)
    if existing:
        return existing

    transcript = get_transcript_for_video(conn, video_id)
    if transcript is None or transcript.status != "transcribed" or not transcript.text:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="하이라이트 추천 전에 음성 인식(전사)을 완료해 주세요. 먼저 ‘음성 인식’을 실행하세요.",
        )

    segments = transcript_segments(transcript)
    try:
        highlight_payload = _generate_highlights_with_openai(video.original_filename, transcript.text, segments)
    except HTTPException as exc:
        # Recover from empty/invalid GPT windows using transcript heuristics.
        if exc.status_code not in {502, 500}:
            raise
        highlight_payload = []

    if not highlight_payload:
        highlight_payload = _fallback_highlights_from_segments(segments, transcript.text or "")
    if not highlight_payload:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="하이라이트 후보를 찾지 못했습니다. 영상이 너무 짧거나 대본 내용이 부족할 수 있습니다.",
        )
    return _save_highlights(conn, video_id, highlight_payload)
