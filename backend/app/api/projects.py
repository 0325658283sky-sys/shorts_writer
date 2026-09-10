import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.users import get_current_user
from app.db.database import get_connection
from app.db.models import User
from app.db.schemas import ProjectResponse
from app.services import blog_service, video_service
from app.services.clip_service import list_clips_for_user
from app.services.project_service import (
    backfill_projects,
    classify_project_source_kind,
    get_project_by_blog_clip,
    get_project_by_video,
    get_project_for_user,
    list_projects_for_user,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _to_response(
    conn: sqlite3.Connection,
    project,
    *,
    shorts_by_video: dict[int, int] | None = None,
) -> ProjectResponse:
    status_value: str | None = None
    progress_percent: int | None = None
    source_url: str | None = None
    title = project.title
    shorts_count = 0
    original_filename: str | None = None

    if project.source_type == "blog" and project.blog_clip_id is not None:
        clip = blog_service.get_blog_clip_for_user(conn, project.user_id, project.blog_clip_id)
        if clip:
            status_value = clip.status
            progress_percent = int(clip.progress_percent or 0)
            source_url = clip.source_url
            title = (clip.blog_title or "").strip() or title
            shorts_count = 1 if clip.status == "completed" and (clip.subtitled_video_path or clip.video_path) else 0
    elif project.source_type == "video" and project.video_id is not None:
        video = video_service.get_video_for_user(conn, project.user_id, project.video_id)
        if video:
            status_value = video.status
            source_url = None
            title = video.original_filename or title
            original_filename = video.original_filename
            shorts_count = (shorts_by_video or {}).get(video.id, 0)
            if shorts_count > 0:
                status_value = "completed"

    return ProjectResponse(
        id=project.id,
        source_type=project.source_type,  # type: ignore[arg-type]
        source_kind=classify_project_source_kind(  # type: ignore[arg-type]
            source_type=project.source_type,
            source_url=source_url,
            original_filename=original_filename,
        ),
        blog_clip_id=project.blog_clip_id,
        video_id=project.video_id,
        title=title,
        status=status_value,
        progress_percent=progress_percent,
        shorts_count=shorts_count,
        source_url=source_url,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> list[ProjectResponse]:
    backfill_projects(conn)
    shorts_by_video: dict[int, int] = {}
    for clip in list_clips_for_user(conn, current_user.id):
        if clip.status != "completed":
            continue
        shorts_by_video[clip.video_id] = shorts_by_video.get(clip.video_id, 0) + 1
    return [
        _to_response(conn, item, shorts_by_video=shorts_by_video)
        for item in list_projects_for_user(conn, current_user.id)
    ]


@router.get("/by-blog-clip/{blog_clip_id}", response_model=ProjectResponse)
def read_project_by_blog_clip(
    blog_clip_id: int,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> ProjectResponse:
    project = get_project_by_blog_clip(conn, current_user.id, blog_clip_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return _to_response(conn, project)


@router.get("/by-video/{video_id}", response_model=ProjectResponse)
def read_project_by_video(
    video_id: int,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> ProjectResponse:
    project = get_project_by_video(conn, current_user.id, video_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return _to_response(conn, project)


@router.get("/{project_id}", response_model=ProjectResponse)
def read_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> ProjectResponse:
    project = get_project_for_user(conn, current_user.id, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return _to_response(conn, project)
