import sqlite3

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.api.users import get_current_user
from app.db.database import get_connection
from app.db.models import User
from app.db.schemas import (
    CreditQuoteResponse,
    HighlightResponse,
    ReanalyzeRequest,
    ReanalyzeResponse,
    TranscriptResponse,
    TranscriptSegmentResponse,
    VideoResponse,
    VideoStatusResponse,
    YoutubeImportRequest,
    YoutubePreviewResponse,
)
from app.services.highlight_service import (
    ensure_highlight_thumbnail,
    get_or_create_highlights,
    regenerate_highlights,
)
from app.services.usage_service import (
    REANALYZE_CREDIT_COST,
    assert_can_analyze_video,
    increment_monthly_usage,
    release_monthly_usage,
)
from app.services.transcription_service import transcript_segments, transcribe_video
from app.services.video_service import (
    analyze_video_audio,
    create_video,
    get_video_for_user,
    import_youtube_video,
    list_videos_for_user,
    preview_youtube_video,
)

router = APIRouter(prefix="/videos", tags=["videos"])


def _to_response(video) -> VideoResponse:
    return VideoResponse(
        id=video.id,
        original_filename=video.original_filename,
        stored_filename=video.stored_filename,
        content_type=video.content_type,
        file_size=video.file_size,
        status=video.status,
        audio_path=video.audio_path,
        error_message=video.error_message,
        created_at=video.created_at,
        updated_at=video.updated_at,
        genre=getattr(video, "genre", None),
        genre_judgement=getattr(video, "genre_judgement", None),
    )


def _to_status_response(video) -> VideoStatusResponse:
    return VideoStatusResponse(
        id=video.id,
        status=video.status,
        audio_path=video.audio_path,
        error_message=video.error_message,
        updated_at=video.updated_at,
    )


def _to_transcript_response(transcript) -> TranscriptResponse:
    segments = [TranscriptSegmentResponse(**segment) for segment in transcript_segments(transcript)]
    return TranscriptResponse(
        id=transcript.id,
        video_id=transcript.video_id,
        status=transcript.status,
        text=transcript.text,
        segments=segments,
        error_message=transcript.error_message,
        created_at=transcript.created_at,
        updated_at=transcript.updated_at,
    )


def _to_highlight_response(highlight) -> HighlightResponse:
    return HighlightResponse(
        id=highlight.id,
        video_id=highlight.video_id,
        start_time=highlight.start_time,
        end_time=highlight.end_time,
        title=highlight.title,
        reason=highlight.reason,
        content_type=highlight.content_type,
        score=highlight.score,
        created_at=highlight.created_at,
    )


@router.post("/youtube-preview", response_model=YoutubePreviewResponse)
def youtube_preview(
    request: YoutubeImportRequest,
    current_user: User = Depends(get_current_user),
) -> YoutubePreviewResponse:
    _ = current_user
    preview = preview_youtube_video(str(request.url))
    return YoutubePreviewResponse(**preview)


@router.get("/credit-quote", response_model=CreditQuoteResponse)
def read_credit_quote(
    duration_seconds: float = 0.0,
    current_user: User = Depends(get_current_user),
) -> CreditQuoteResponse:
    """Price a source by its length, so the convert button can say the number.

    Read-only and charges nothing. The length comes from the YouTube preview
    or from the file the user picked, both of which the client has before it
    asks for a conversion.
    """
    from app.services.credit_service import SourceTooLongError, cost_for_duration, tier_label

    try:
        credits = cost_for_duration(duration_seconds)
    except SourceTooLongError as exc:
        return CreditQuoteResponse(
            duration_seconds=duration_seconds,
            supported=False,
            reason=str(exc),
        )

    return CreditQuoteResponse(
        duration_seconds=duration_seconds,
        credits=credits,
        tier_label=tier_label(duration_seconds),
    )


@router.get("/credit-tiers")
def read_credit_tiers(current_user: User = Depends(get_current_user)) -> dict:
    """The whole price table, so a pricing screen is not a second copy of it."""
    from app.services.credit_service import MAX_SOURCE_MINUTES, list_tiers

    return {"tiers": list_tiers(), "maxSourceMinutes": MAX_SOURCE_MINUTES}


@router.post("/upload", response_model=VideoResponse, status_code=201)
def upload_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> VideoResponse:
    video = create_video(conn, current_user.id, file)
    from app.services.project_service import ensure_project_for_video

    ensure_project_for_video(conn, current_user.id, video.id, video.original_filename)
    return _to_response(video)


@router.post("/import-youtube", response_model=VideoResponse, status_code=201)
def import_youtube(
    request: YoutubeImportRequest,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> VideoResponse:
    video = import_youtube_video(conn, current_user.id, str(request.url))
    from app.services.project_service import ensure_project_for_video

    ensure_project_for_video(conn, current_user.id, video.id, video.original_filename)
    return _to_response(video)


@router.get("", response_model=list[VideoResponse])
def list_videos(
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> list[VideoResponse]:
    return [_to_response(video) for video in list_videos_for_user(conn, current_user.id)]


@router.get("/{video_id}", response_model=VideoResponse)
def read_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> VideoResponse:
    video = get_video_for_user(conn, current_user.id, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    return _to_response(video)


@router.post("/{video_id}/analyze", response_model=VideoStatusResponse)
def analyze_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> VideoStatusResponse:
    video = analyze_video_audio(conn, current_user.id, video_id)
    return _to_status_response(video)


@router.get("/{video_id}/status", response_model=VideoStatusResponse)
def read_video_status(
    video_id: int,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> VideoStatusResponse:
    video = get_video_for_user(conn, current_user.id, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")
    return _to_status_response(video)


@router.get("/{video_id}/transcript", response_model=TranscriptResponse)
def read_video_transcript(
    video_id: int,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> TranscriptResponse:
    transcript = transcribe_video(conn, current_user.id, video_id)
    return _to_transcript_response(transcript)


@router.get("/{video_id}/highlights", response_model=list[HighlightResponse])
def read_video_highlights(
    video_id: int,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> list[HighlightResponse]:
    highlights = get_or_create_highlights(conn, current_user.id, video_id)
    return [_to_highlight_response(highlight) for highlight in highlights]


@router.post("/{video_id}/reanalyze", response_model=ReanalyzeResponse)
def reanalyze_video(
    video_id: int,
    payload: ReanalyzeRequest | None = None,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> ReanalyzeResponse:
    """Find different clips. Costs a credit — it runs the model again.

    Charged before the re-run, like the first analysis, so a user at their
    limit is refused rather than handed work they cannot pay for. The clips
    from the previous cut are discarded inside regenerate_highlights; the
    response says how many, so the screen can be honest about what it lost.
    """
    video = get_video_for_user(conn, current_user.id, video_id)
    if video is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found.")

    clips_before = conn.execute(
        "SELECT COUNT(*) FROM clips WHERE user_id = ? AND video_id = ?",
        (current_user.id, video_id),
    ).fetchone()[0]

    # Duration 0: this only needs the monthly-limit half of the check. The
    # video's length was already accepted when it was imported, and the
    # re-cut cannot make it longer.
    assert_can_analyze_video(conn, current_user.id, 0)
    usage = increment_monthly_usage(conn, current_user.id)
    charged = REANALYZE_CREDIT_COST

    try:
        highlights = regenerate_highlights(
            conn,
            current_user.id,
            video_id,
            genre=(payload.genre if payload else None),
        )
    except Exception:
        # Charged before the work, so a failure has to give it back — the user
        # would otherwise have paid for nothing. The original error is what
        # they need to see, so it is re-raised untouched.
        # One, not REANALYZE_CREDIT_COST: the stored meter counts conversions,
        # not credits, and increment_monthly_usage added exactly one. Moving
        # the meter to credits is the open pricing decision (FLOW_REDESIGN §10).
        release_monthly_usage(conn, current_user.id, 1)
        raise

    refreshed = get_video_for_user(conn, current_user.id, video_id)
    return ReanalyzeResponse(
        video_id=video_id,
        genre=getattr(refreshed, "genre", None),
        genre_judgement=getattr(refreshed, "genre_judgement", None),
        highlights=[_to_highlight_response(highlight) for highlight in highlights],
        discarded_clips=int(clips_before),
        credits_remaining=int(usage["remaining"]),
        credits_charged=charged,
    )


@router.get("/{video_id}/highlights/{highlight_id}/thumbnail")
def read_highlight_thumbnail(
    video_id: int,
    highlight_id: int,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> FileResponse:
    path = ensure_highlight_thumbnail(conn, current_user.id, video_id, highlight_id)
    return FileResponse(path=path, media_type="image/jpeg", filename=path.name)
