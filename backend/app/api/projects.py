import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.users import get_current_user
from app.db.database import get_connection
from app.db.models import User
from app.db.schemas import ProjectResponse
from app.services import blog_service, video_service
from app.services.project_service import (
    get_project_by_blog_clip,
    get_project_by_video,
    get_project_for_user,
    list_projects_for_user,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _source_status(conn: sqlite3.Connection, project) -> str | None:
    if project.source_type == "blog" and project.blog_clip_id is not None:
        clip = blog_service.get_blog_clip_for_user(conn, project.user_id, project.blog_clip_id)
        return clip.status if clip else None
    if project.source_type == "video" and project.video_id is not None:
        video = video_service.get_video_for_user(conn, project.user_id, project.video_id)
        return video.status if video else None
    return None


def _to_response(conn: sqlite3.Connection, project) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        source_type=project.source_type,  # type: ignore[arg-type]
        blog_clip_id=project.blog_clip_id,
        video_id=project.video_id,
        title=project.title,
        status=_source_status(conn, project),
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_connection),
) -> list[ProjectResponse]:
    return [_to_response(conn, item) for item in list_projects_for_user(conn, current_user.id)]


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
