import re
import sqlite3
import uuid
from pathlib import Path
from urllib.parse import urlparse

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.db.models import Video
from app.services.ffmpeg_service import (
    FFmpegExtractionError,
    FFmpegNotAvailableError,
    FFmpegProbeError,
    FFprobeNotAvailableError,
    extract_audio_to_wav,
    get_video_duration_seconds,
)
from app.services.usage_service import assert_can_analyze_video, increment_monthly_usage

STORAGE_ROOT = Path(__file__).resolve().parents[1] / "storage"
UPLOAD_ROOT = STORAGE_ROOT / "uploads"
TEMP_ROOT = STORAGE_ROOT / "temp"
ALLOWED_CONTENT_TYPES = {"video/mp4", "application/mp4", "video/x-m4v"}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"}


def _row_to_video(row: sqlite3.Row) -> Video:
    return Video(
        id=row["id"],
        user_id=row["user_id"],
        original_filename=row["original_filename"],
        stored_filename=row["stored_filename"],
        storage_path=row["storage_path"],
        content_type=row["content_type"],
        file_size=row["file_size"],
        status=row["status"],
        audio_path=row["audio_path"],
        error_message=row["error_message"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _validate_mp4(file: UploadFile) -> None:
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix != ".mp4":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .mp4 files are allowed.")
    if file.content_type and file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only MP4 video uploads are allowed.")


def _copy_with_limit(file: UploadFile, destination: Path, max_bytes: int) -> int:
    total = 0
    with destination.open("wb") as output:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                output.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File is too large. Max upload size is {settings.max_upload_mb} MB.",
                )
            output.write(chunk)
    return total


def _safe_filename(value: str, fallback: str = "youtube-video") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9가-힣._ -]+", "", value).strip().strip(".")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        cleaned = fallback
    return cleaned[:120]


def _validate_youtube_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="YouTube URL must start with http:// or https://.")
    host = parsed.netloc.lower()
    if host not in YOUTUBE_HOSTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only YouTube URLs are supported.")
    return parsed.geturl()


def _insert_video_record(
    conn: sqlite3.Connection,
    user_id: int,
    original_filename: str,
    stored_filename: str,
    destination: Path,
    file_size: int,
) -> Video:
    cursor = conn.execute(
        """
        INSERT INTO videos (
            user_id, original_filename, stored_filename, storage_path,
            content_type, file_size, status, audio_path, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            original_filename,
            stored_filename,
            str(destination),
            "video/mp4",
            file_size,
            "uploaded",
            None,
            None,
        ),
    )
    conn.commit()

    video = get_video_for_user(conn, user_id, int(cursor.lastrowid))
    if video is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Video record creation failed.")
    return video


def create_video(conn: sqlite3.Connection, user_id: int, file: UploadFile) -> Video:
    _validate_mp4(file)

    user_dir = UPLOAD_ROOT / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    original_filename = Path(file.filename or "video.mp4").name
    stored_filename = f"{uuid.uuid4().hex}.mp4"
    destination = user_dir / stored_filename
    max_bytes = settings.max_upload_mb * 1024 * 1024

    try:
        file_size = _copy_with_limit(file, destination, max_bytes)
    except HTTPException:
        raise
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Video upload failed.") from exc
    finally:
        file.file.close()

    return _insert_video_record(conn, user_id, original_filename, stored_filename, destination, file_size)


def _youtube_video_id(url: str) -> str | None:
    parsed = urlparse(url.strip())
    host = parsed.netloc.lower()
    if host in {"youtu.be", "www.youtu.be"}:
        vid = parsed.path.lstrip("/").split("/")[0]
        return vid or None
    if "v=" in parsed.query:
        for part in parsed.query.split("&"):
            if part.startswith("v="):
                return part[2:] or None
    # /shorts/{id} or /embed/{id}
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live"}:
        return parts[1]
    return None


def preview_youtube_video(youtube_url: str) -> dict[str, str | int | None]:
    """Fetch title/thumbnail without downloading the video (AlphaCut-style confirm)."""
    url = _validate_youtube_url(youtube_url)
    video_id = _youtube_video_id(url)
    fallback_thumb = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg" if video_id else None

    try:
        from yt_dlp import YoutubeDL
        from yt_dlp.utils import DownloadError
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="yt-dlp is not installed. Run pip install -r requirements.txt in the backend virtual environment.",
        ) from exc

    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 15,
        "retries": 1,
    }
    try:
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
            # Do NOT fetch channel page here — yt-dlp channel extract can hang for minutes
            # and blocks the confirm UI. Avatar is resolved lazily elsewhere (or skipped).
            channel_avatar = _channel_avatar_from_video_info(info if isinstance(info, dict) else {})
    except DownloadError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"YouTube preview failed: {str(exc)[-500:]}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected YouTube preview failure.",
        ) from exc

    if not isinstance(info, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read YouTube video info.")

    title = str(info.get("title") or "YouTube video").strip()
    thumbnail = None
    thumbnails = info.get("thumbnails")
    if isinstance(thumbnails, list) and thumbnails:
        # Prefer highest resolution entry with a URL
        for item in reversed(thumbnails):
            if isinstance(item, dict) and item.get("url"):
                thumbnail = str(item["url"])
                break
    if not thumbnail and info.get("thumbnail"):
        thumbnail = str(info["thumbnail"])
    if not thumbnail:
        thumbnail = fallback_thumb

    duration = info.get("duration")
    duration_seconds = int(duration) if isinstance(duration, (int, float)) else None
    resolved_id = str(info.get("id") or video_id or "")

    return {
        "url": url,
        "video_id": resolved_id or None,
        "title": title,
        "thumbnail_url": thumbnail,
        "duration_seconds": duration_seconds,
        "channel": str(info.get("uploader") or info.get("channel") or "") or None,
        "channel_avatar_url": channel_avatar,
    }


def _channel_avatar_from_video_info(info: dict) -> str | None:
    """Best-effort avatar from video info only (no second network extract)."""
    if not info:
        return None
    # Rare direct fields some extractors expose
    for key in ("channel_avatar_url", "uploader_avatar_url"):
        value = info.get(key)
        if value:
            return str(value)
    # Prefer yt3/ggpht URLs if present among thumbnails (usually video thumbs, not avatar)
    thumbs = info.get("thumbnails")
    if isinstance(thumbs, list):
        for item in thumbs:
            if not isinstance(item, dict) or not item.get("url"):
                continue
            avatar_url = str(item["url"])
            if "yt3." in avatar_url or "ggpht.com" in avatar_url:
                # Skip typical video frame thumbs; channel avatars are usually small square on yt3
                width = item.get("width") or item.get("height") or 0
                try:
                    size = int(width)
                except (TypeError, ValueError):
                    size = 0
                if 0 < size <= 900:
                    return avatar_url
    return None


def _extract_channel_avatar(ydl: object, info: dict) -> str | None:
    """Resolve channel profile image via yt-dlp channel page when possible.

    Prefer calling this off the critical preview path — channel extract is slow.
    """
    quick = _channel_avatar_from_video_info(info)
    if quick:
        return quick
    if not info:
        return None

    channel_url = info.get("channel_url") or info.get("uploader_url")
    channel_id = info.get("channel_id")
    if not channel_url and channel_id:
        channel_url = f"https://www.youtube.com/channel/{channel_id}"
    if not channel_url:
        return None

    try:
        channel_info = ydl.extract_info(str(channel_url), download=False)  # type: ignore[attr-defined]
    except Exception:
        return None

    if not isinstance(channel_info, dict):
        return None

    thumbs = channel_info.get("thumbnails")
    if isinstance(thumbs, list):
        preferred: str | None = None
        for item in thumbs:
            if not isinstance(item, dict) or not item.get("url"):
                continue
            avatar_url = str(item["url"])
            preferred = avatar_url
            if "yt3." in avatar_url or "ggpht.com" in avatar_url:
                return avatar_url
        return preferred

    thumb = channel_info.get("thumbnail")
    return str(thumb) if thumb else None


def import_youtube_video(conn: sqlite3.Connection, user_id: int, youtube_url: str) -> Video:
    url = _validate_youtube_url(youtube_url)
    try:
        from yt_dlp import YoutubeDL
        from yt_dlp.utils import DownloadError
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="yt-dlp is not installed. Run pip install -r requirements.txt in the backend virtual environment.",
        ) from exc

    user_dir = UPLOAD_ROOT / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{uuid.uuid4().hex}.mp4"
    destination = user_dir / stored_filename
    max_bytes = settings.max_upload_mb * 1024 * 1024

    options = {
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
        "merge_output_format": "mp4",
        "outtmpl": str(destination.with_suffix(".%(ext)s")),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "retries": 2,
        "fragment_retries": 2,
    }

    try:
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
    except DownloadError as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"YouTube download failed: {str(exc)[-500:]}") from exc
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected YouTube import failure.") from exc

    if not destination.exists():
        candidates = sorted(user_dir.glob(f"{destination.stem}.*"))
        for candidate in candidates:
            if candidate.suffix.lower() == ".mp4":
                candidate.rename(destination)
                break
    if not destination.exists():
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Downloaded YouTube video was not saved as MP4.")

    file_size = destination.stat().st_size
    if file_size > max_bytes:
        destination.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Downloaded video is too large. Max upload size is {settings.max_upload_mb} MB.",
        )

    title = _safe_filename(str(info.get("title") or "youtube-video")) if isinstance(info, dict) else "youtube-video"
    original_filename = f"YouTube - {title}.mp4"
    return _insert_video_record(conn, user_id, original_filename, stored_filename, destination, file_size)


def list_videos_for_user(conn: sqlite3.Connection, user_id: int) -> list[Video]:
    rows = conn.execute(
        """
        SELECT id, user_id, original_filename, stored_filename, storage_path,
               content_type, file_size, status, audio_path, error_message, created_at, updated_at
        FROM videos
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (user_id,),
    ).fetchall()
    return [_row_to_video(row) for row in rows]


def get_video_for_user(conn: sqlite3.Connection, user_id: int, video_id: int) -> Video | None:
    row = conn.execute(
        """
        SELECT id, user_id, original_filename, stored_filename, storage_path,
               content_type, file_size, status, audio_path, error_message, created_at, updated_at
        FROM videos
        WHERE user_id = ? AND id = ?
        """,
        (user_id, video_id),
    ).fetchone()
    return _row_to_video(row) if row else None


def update_video_status(
    conn: sqlite3.Connection,
    video_id: int,
    status_value: str,
    audio_path: str | None = None,
    error_message: str | None = None,
) -> None:
    conn.execute(
        """
        UPDATE videos
        SET status = ?, audio_path = COALESCE(?, audio_path), error_message = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (status_value, audio_path, error_message, video_id),
    )
    conn.commit()


def analyze_video_audio(conn: sqlite3.Connection, user_id: int, video_id: int) -> Video:
    video = get_video_for_user(conn, user_id, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    if video.status not in {"uploaded", "failed", "audio_extracted", "transcribed"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Video is currently {video.status}.")

    should_count_usage = video.status in {"uploaded", "failed"}
    if should_count_usage:
        try:
            duration_seconds = get_video_duration_seconds(video.storage_path)
        except (FFprobeNotAvailableError, FFmpegProbeError, TimeoutError) as exc:
            update_video_status(conn, video.id, "failed", None, str(exc))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
        assert_can_analyze_video(conn, user_id, duration_seconds)

    audio_dir = TEMP_ROOT / str(user_id)
    audio_path = audio_dir / f"{video.stored_filename}.wav"
    update_video_status(conn, video.id, "extracting_audio", video.audio_path, None)

    try:
        extract_audio_to_wav(video.storage_path, str(audio_path))
    except (FFmpegNotAvailableError, FFmpegExtractionError, TimeoutError) as exc:
        update_video_status(conn, video.id, "failed", None, str(exc))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    except Exception as exc:
        update_video_status(conn, video.id, "failed", None, "Unexpected audio extraction failure.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected audio extraction failure.") from exc

    update_video_status(conn, video.id, "audio_extracted", str(audio_path), None)
    if should_count_usage:
        increment_monthly_usage(conn, user_id)
    refreshed = get_video_for_user(conn, user_id, video.id)
    if refreshed is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Video status refresh failed.")
    return refreshed
