import logging
import shutil
import sqlite3
import uuid
from pathlib import Path

from fastapi import HTTPException, status

from app.db.models import Clip
from app.services.ffmpeg_service import (
    FFmpegClipError,
    FFmpegNotAvailableError,
    FFmpegNarrationError,
    FFmpegSubtitleError,
    burn_subtitles_into_video,
    create_vertical_clip,
    get_video_duration_seconds,
    replace_video_audio_with_narration,
)
from app.services.subtitle_utils import subtitle_events_for_segment, write_ass_file
from app.services.transcription_service import get_transcript_for_video, transcript_segments
from app.services.tts_service import generate_narration_script, synthesize_openai_tts
from app.services.video_service import STORAGE_ROOT, get_video_for_user

logger = logging.getLogger(__name__)

OUTPUT_ROOT = STORAGE_ROOT / "outputs"
SUBTITLE_ROOT = STORAGE_ROOT / "subtitles"
ALLOWED_SUBTITLE_STYLES = {"basic", "bold", "shorts"}
DEFAULT_CLIP_VISUAL_STYLE = "yt_profile"


def _row_to_clip(row: sqlite3.Row) -> Clip:
    keys = set(row.keys())
    return Clip(
        id=row["id"],
        user_id=row["user_id"],
        video_id=row["video_id"],
        highlight_id=row["highlight_id"],
        output_path=row["output_path"],
        subtitle_style=row["subtitle_style"],
        subtitle_path=row["subtitle_path"],
        subtitled_output_path=row["subtitled_output_path"],
        tts_mode=row["tts_mode"],
        narration_script=row["narration_script"],
        narration_audio_path=row["narration_audio_path"],
        narrated_output_path=row["narrated_output_path"],
        visual_style=(row["visual_style"] if "visual_style" in keys and row["visual_style"] else DEFAULT_CLIP_VISUAL_STYLE),
        style_title=row["style_title"] if "style_title" in keys else None,
        style_subtitle=row["style_subtitle"] if "style_subtitle" in keys else None,
        templated_output_path=row["templated_output_path"] if "templated_output_path" in keys else None,
        subtitle_template_id=row["subtitle_template_id"] if "subtitle_template_id" in keys else None,
        status=row["status"],
        error_message=row["error_message"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


_CLIP_COLUMNS = """
    id, user_id, video_id, highlight_id, output_path, subtitle_style,
    subtitle_path, subtitled_output_path, tts_mode, narration_script,
    narration_audio_path, narrated_output_path, visual_style, style_title,
    style_subtitle, templated_output_path, subtitle_template_id, status,
    error_message, created_at, updated_at
"""


def get_clip_for_user(conn: sqlite3.Connection, user_id: int, clip_id: int) -> Clip | None:
    row = conn.execute(
        f"SELECT {_CLIP_COLUMNS} FROM clips WHERE id = ? AND user_id = ?",
        (clip_id, user_id),
    ).fetchone()
    return _row_to_clip(row) if row else None


def list_clips_for_user(conn: sqlite3.Connection, user_id: int) -> list[Clip]:
    rows = conn.execute(
        f"""
        SELECT {_CLIP_COLUMNS}
        FROM clips
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (user_id,),
    ).fetchall()
    return [_row_to_clip(row) for row in rows]


def _get_highlight_for_user(conn: sqlite3.Connection, user_id: int, highlight_id: int) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT h.id, h.video_id, h.start_time, h.end_time
        FROM highlights h
        JOIN videos v ON v.id = h.video_id
        WHERE h.id = ? AND v.user_id = ?
        """,
        (highlight_id, user_id),
    ).fetchone()


def _get_highlight_for_clip(conn: sqlite3.Connection, clip: Clip) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT id, video_id, start_time, end_time
        FROM highlights
        WHERE id = ? AND video_id = ?
        """,
        (clip.highlight_id, clip.video_id),
    ).fetchone()


def _update_clip_status(
    conn: sqlite3.Connection,
    clip_id: int,
    status_value: str,
    output_path: str | None = None,
    error_message: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE clips
        SET status = ?, output_path = COALESCE(?, output_path), error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (status_value, output_path, error_message, clip_id),
    )
    conn.commit()


def _update_clip_subtitle(
    conn: sqlite3.Connection,
    clip_id: int,
    status_value: str,
    subtitle_style: str | None = None,
    subtitle_path: str | None = None,
    subtitled_output_path: str | None = None,
    error_message: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE clips
        SET status = ?,
            subtitle_style = COALESCE(?, subtitle_style),
            subtitle_path = COALESCE(?, subtitle_path),
            subtitled_output_path = COALESCE(?, subtitled_output_path),
            error_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (status_value, subtitle_style, subtitle_path, subtitled_output_path, error_message, clip_id),
    )
    conn.commit()


def create_clip_from_highlight(
    conn: sqlite3.Connection,
    user_id: int,
    highlight_id: int,
    *,
    visual_style: str | None = None,
) -> Clip:
    from app.services.visual_style_catalog import ALLOWED_VISUAL_STYLES, normalize_visual_style

    highlight = _get_highlight_for_user(conn, user_id, highlight_id)
    if highlight is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found.")

    video = get_video_for_user(conn, user_id, int(highlight["video_id"]))
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")

    start_time = float(highlight["start_time"])
    end_time = float(highlight["end_time"])
    if end_time <= start_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Highlight time range is invalid.")

    raw_style = (visual_style or DEFAULT_CLIP_VISUAL_STYLE).strip().lower()
    if raw_style not in ALLOWED_VISUAL_STYLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown visual_style for YouTube clip.",
        )
    style_slug = normalize_visual_style(raw_style)

    cursor = conn.execute(
        """
        INSERT INTO clips (user_id, video_id, highlight_id, output_path, visual_style, status, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, video.id, highlight_id, None, style_slug, "pending", None),
    )
    conn.commit()

    clip_id = int(cursor.lastrowid)
    output_dir = OUTPUT_ROOT / str(user_id)
    output_path = output_dir / f"{uuid.uuid4().hex}.mp4"
    _update_clip_status(conn, clip_id, "processing", None, None)

    try:
        create_vertical_clip(video.storage_path, str(output_path), start_time, end_time)
    except (FFmpegNotAvailableError, FFmpegClipError, TimeoutError) as exc:
        _update_clip_status(conn, clip_id, "failed", None, str(exc))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    except Exception as exc:
        _update_clip_status(conn, clip_id, "failed", None, "Unexpected clip generation failure.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected clip generation failure.") from exc

    _update_clip_status(conn, clip_id, "completed", str(output_path), None)
    clip = get_clip_for_user(conn, user_id, clip_id)
    if clip is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Clip status refresh failed.")
    return clip


def _subtitle_events_for_clip(conn: sqlite3.Connection, clip: Clip) -> list[tuple[float, float, str]]:
    highlight = _get_highlight_for_clip(conn, clip)
    if highlight is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found.")

    transcript = get_transcript_for_video(conn, clip.video_id)
    if transcript is None or transcript.status != "transcribed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed transcript is required before subtitles can be created.")

    clip_start = float(highlight["start_time"])
    clip_end = float(highlight["end_time"])
    clip_duration = max(0.1, clip_end - clip_start)
    events: list[tuple[float, float, str]] = []

    for segment in transcript_segments(transcript):
        events.extend(subtitle_events_for_segment(segment, clip_start, clip_end, clip_duration))

    if not events:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No transcript segments overlap this clip range.")
    return events


def create_subtitled_clip(conn: sqlite3.Connection, user_id: int, clip_id: int, style: str) -> Clip:
    if style not in ALLOWED_SUBTITLE_STYLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subtitle style must be basic, bold, or shorts.")

    clip = get_clip_for_user(conn, user_id, clip_id)
    if clip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found.")
    if clip.status != "completed" or not clip.output_path:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed clip is required before subtitles can be burned in.")

    source_path = Path(clip.output_path)
    if not source_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip video file was not found.")

    subtitle_path = SUBTITLE_ROOT / str(user_id) / f"clip_{clip.id}_{style}.ass"
    output_path = OUTPUT_ROOT / str(user_id) / f"{source_path.stem}_{style}_subtitled.mp4"

    try:
        events = _subtitle_events_for_clip(conn, clip)
        write_ass_file(subtitle_path, style, events)
        _update_clip_subtitle(conn, clip.id, "processing", style, str(subtitle_path), None, None)
        burn_subtitles_into_video(str(source_path), str(subtitle_path), str(output_path))
    except HTTPException:
        raise
    except (FFmpegNotAvailableError, FFmpegSubtitleError, TimeoutError) as exc:
        _update_clip_subtitle(conn, clip.id, "failed", style, str(subtitle_path), None, str(exc))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    except Exception as exc:
        _update_clip_subtitle(conn, clip.id, "failed", style, str(subtitle_path), None, "Unexpected subtitle burn-in failure.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected subtitle burn-in failure.") from exc

    _update_clip_subtitle(conn, clip.id, "completed", style, str(subtitle_path), str(output_path), None)
    refreshed = get_clip_for_user(conn, user_id, clip.id)
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Clip refresh failed.")
    return refreshed


def apply_clip_template(conn: sqlite3.Connection, user_id: int, clip_id: int, template_id: int) -> Clip:
    """④ 템플릿 갤러리에서 고른 subtitle_template을 유튜브 클립에 적용.

    blog_service.apply_blog_clip_template과 동일한 검증(assert_template_usable)을 쓰되,
    blog_clip의 "awaiting boards" 가드 대신 YouTube 클립 고유의 "completed" 상태 가드를 쓴다.
    """
    from app.services.template_service import assert_template_usable

    clip = get_clip_for_user(conn, user_id, clip_id)
    if clip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found.")
    if clip.status != "completed" or not clip.output_path:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed clip is required before a template can be applied.")

    template = assert_template_usable(conn, user_id, template_id)
    style = template.slug if template.slug in ALLOWED_SUBTITLE_STYLES else clip.subtitle_style
    conn.execute(
        """
        UPDATE clips
        SET subtitle_template_id = ?, subtitle_style = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (template.id, style, clip_id),
    )
    conn.commit()
    refreshed = get_clip_for_user(conn, user_id, clip_id)
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Template apply failed.")
    return refreshed


def _update_clip_narration(
    conn: sqlite3.Connection,
    clip_id: int,
    status_value: str,
    tts_mode: str,
    narration_script: str | None = None,
    narration_audio_path: str | None = None,
    narrated_output_path: str | None = None,
    error_message: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE clips
        SET status = ?,
            tts_mode = ?,
            narration_script = ?,
            narration_audio_path = ?,
            narrated_output_path = ?,
            error_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (status_value, tts_mode, narration_script, narration_audio_path, narrated_output_path, error_message, clip_id),
    )
    conn.commit()


def apply_clip_narration(conn: sqlite3.Connection, user_id: int, clip_id: int, mode: str) -> Clip:
    if mode not in {"original_audio", "ai_narration"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TTS mode must be original_audio or ai_narration.")

    clip = get_clip_for_user(conn, user_id, clip_id)
    if clip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found.")
    if clip.status != "completed" or not clip.output_path:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Completed clip is required before narration can be applied.")

    if mode == "original_audio":
        _update_clip_narration(conn, clip.id, "completed", "original_audio", None, None, None, None)
        refreshed = get_clip_for_user(conn, user_id, clip.id)
        if refreshed is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Clip refresh failed.")
        return refreshed

    highlight = conn.execute(
        """
        SELECT id, video_id, start_time, end_time, title, reason, content_type, score
        FROM highlights
        WHERE id = ? AND video_id = ?
        """,
        (clip.highlight_id, clip.video_id),
    ).fetchone()
    if highlight is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found.")

    source_path = Path(clip.subtitled_output_path or clip.output_path)
    if not source_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip video file was not found.")

    try:
        _update_clip_narration(conn, clip.id, "processing", "ai_narration", None, None, None, None)
        script = generate_narration_script(conn, user_id, clip.video_id, highlight)
        audio_path = synthesize_openai_tts(user_id, clip.id, script)
        output_path = OUTPUT_ROOT / str(user_id) / f"{source_path.stem}_ai_narration.mp4"
        replace_video_audio_with_narration(str(source_path), audio_path, str(output_path))
    except HTTPException as exc:
        _update_clip_narration(conn, clip.id, "failed", "ai_narration", None, None, None, str(exc.detail))
        raise
    except (FFmpegNotAvailableError, FFmpegNarrationError, TimeoutError) as exc:
        _update_clip_narration(conn, clip.id, "failed", "ai_narration", None, None, None, str(exc))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    except Exception as exc:
        _update_clip_narration(conn, clip.id, "failed", "ai_narration", None, None, None, "Unexpected AI narration failure.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected AI narration failure.") from exc

    _update_clip_narration(conn, clip.id, "completed", "ai_narration", script, audio_path, str(output_path), None)
    refreshed = get_clip_for_user(conn, user_id, clip.id)
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Clip refresh failed.")
    return refreshed


def apply_clip_template(
    conn: sqlite3.Connection,
    user_id: int,
    clip_id: int,
    template_id: int,
) -> Clip:
    from app.services.template_service import assert_template_usable

    clip = get_clip_for_user(conn, user_id, clip_id)
    if clip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found.")
    if clip.status != "completed" or not clip.output_path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Completed clip is required before a subtitle template can be applied.",
        )
    template = assert_template_usable(conn, user_id, template_id)
    style = template.slug if template.slug in ALLOWED_SUBTITLE_STYLES else clip.subtitle_style
    conn.execute(
        """
        UPDATE clips
        SET subtitle_template_id = ?, subtitle_style = COALESCE(?, subtitle_style), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (template.id, style, clip_id),
    )
    conn.commit()
    refreshed = get_clip_for_user(conn, user_id, clip_id)
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Template apply failed.")
    return refreshed


def clip_download_path(clip: Clip) -> Path:
    if clip.templated_output_path:
        path = Path(clip.templated_output_path)
    elif clip.narrated_output_path:
        path = Path(clip.narrated_output_path)
    elif clip.subtitled_output_path:
        path = Path(clip.subtitled_output_path)
    elif clip.output_path:
        path = Path(clip.output_path)
    else:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Clip output is not ready for download.")

    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip file was not found.")
    return path


def render_clip_with_template(
    conn: sqlite3.Connection,
    user_id: int,
    clip_id: int,
    *,
    visual_style: str | None = None,
    style_title: str | None = None,
    style_subtitle: str | None = None,
    channel_name: str | None = None,
    channel_avatar_url: str | None = None,
    video_title: str | None = None,
    burn_subtitles: bool = True,
    subtitle_style: str = "bold",
) -> Clip:
    """Wrap YouTube clip MP4 in Remotion BlogShorts chrome and save templated_output_path."""
    from app.services.remotion_props_service import _caption_template_payload, remotion_public_dir
    from app.services.remotion_render_service import RemotionRenderError, render_blog_shorts_with_remotion
    from app.services.visual_style_catalog import (
        ALLOWED_VISUAL_STYLES,
        default_style_overlay,
        merge_style_overlay,
        normalize_visual_style,
        remotion_style_payload,
    )

    clip = get_clip_for_user(conn, user_id, clip_id)
    if clip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found.")
    if clip.status != "completed" or not clip.output_path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Completed clip is required before template render.",
        )

    raw_style = (visual_style or clip.visual_style or DEFAULT_CLIP_VISUAL_STYLE).strip().lower()
    if raw_style not in ALLOWED_VISUAL_STYLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown visual_style.")
    style_slug = normalize_visual_style(raw_style)

    # Best-effort ASS burn so timed captions ride inside the wrapped video.
    working = clip
    if burn_subtitles and not clip.subtitled_output_path:
        try:
            working = create_subtitled_clip(conn, user_id, clip_id, subtitle_style)
        except HTTPException as exc:
            logger.warning("YouTube template: subtitle burn skipped clip=%s: %s", clip_id, exc.detail)

    source = Path(
        working.narrated_output_path
        or working.subtitled_output_path
        or working.output_path
        or ""
    )
    if not source.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip video file was not found.")

    highlight = conn.execute(
        """
        SELECT id, title, reason, start_time, end_time
        FROM highlights
        WHERE id = ? AND video_id = ?
        """,
        (working.highlight_id, working.video_id),
    ).fetchone()

    try:
        duration_sec = max(0.5, get_video_duration_seconds(str(source)))
    except Exception:
        if highlight is not None:
            duration_sec = max(0.5, float(highlight["end_time"]) - float(highlight["start_time"]))
        else:
            duration_sec = 8.0

    hook_title = (style_title if style_title is not None else working.style_title) or (
        str(highlight["title"]).strip() if highlight and highlight["title"] else None
    )
    hook_subtitle = (style_subtitle if style_subtitle is not None else working.style_subtitle) or (
        str(highlight["reason"]).strip() if highlight and highlight["reason"] else None
    )
    caption_text = hook_subtitle or hook_title or ""

    public_dir = remotion_public_dir()
    materialize_dir = public_dir / "clips" / f"yt-{working.id}"
    materialize_dir.mkdir(parents=True, exist_ok=True)
    dest_video = materialize_dir / "source.mp4"
    shutil.copy2(source, dest_video)

    avatar_rel: str | None = None
    if channel_avatar_url and channel_avatar_url.startswith("http"):
        # Keep remote URL — Remotion Img can fetch https during render.
        avatar_rel = channel_avatar_url.strip()

    style_payload = remotion_style_payload(style_slug)
    overlay = merge_style_overlay(style_slug, default_style_overlay(style_slug))
    caption_template = _caption_template_payload(conn, working.subtitle_template_id)
    props = {
        "blogClipId": working.id,
        "title": video_title or hook_title,
        "styleTitle": hook_title,
        "styleSubtitle": hook_subtitle,
        "transitionSec": 0,
        "transitionType": "none",
        "source": "youtube_clip",
        "narrationUrl": None,
        "visualStyle": style_slug,
        "style": style_payload,
        "overlay": overlay,
        "captionTemplate": caption_template,
        "channelName": (channel_name or "").strip() or None,
        "channelAvatarUrl": avatar_rel,
        "videoTitle": (video_title or "").strip() or None,
        "boards": [
            {
                "boardId": working.id,
                "imageUrl": None,
                "videoUrl": f"clips/yt-{working.id}/source.mp4",
                "animated": False,
                "text": caption_text,
                "durationSec": duration_sec,
                "backgroundColor": style_payload.get("canvasBg"),
            }
        ],
    }

    output_path = OUTPUT_ROOT / str(user_id) / f"{source.stem}_{style_slug}_templated.mp4"
    try:
        render_blog_shorts_with_remotion(props, output_path)
    except RemotionRenderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"템플릿 Remotion 렌더 실패: {exc}",
        ) from exc

    conn.execute(
        """
        UPDATE clips
        SET visual_style = ?,
            style_title = ?,
            style_subtitle = ?,
            templated_output_path = ?,
            status = 'completed',
            error_message = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (style_slug, hook_title, hook_subtitle, str(output_path), working.id),
    )
    conn.commit()
    refreshed = get_clip_for_user(conn, user_id, working.id)
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Clip refresh failed.")
    return refreshed


