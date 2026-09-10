"""Thin Project wrapper over blog_clips / videos. No engine or credit changes."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


@dataclass(frozen=True)
class Project:
    id: int
    user_id: int
    source_type: str  # "blog" | "video"
    blog_clip_id: int | None
    video_id: int | None
    title: str
    created_at: str
    updated_at: str


def _row_to_project(row: sqlite3.Row) -> Project:
    return Project(
        id=int(row["id"]),
        user_id=int(row["user_id"]),
        source_type=str(row["source_type"]),
        blog_clip_id=int(row["blog_clip_id"]) if row["blog_clip_id"] is not None else None,
        video_id=int(row["video_id"]) if row["video_id"] is not None else None,
        title=str(row["title"] or ""),
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def ensure_project_for_blog_clip(
    conn: sqlite3.Connection,
    user_id: int,
    blog_clip_id: int,
    title: str | None = None,
) -> Project:
    existing = conn.execute(
        """
        SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
        FROM projects
        WHERE user_id = ? AND blog_clip_id = ?
        """,
        (user_id, blog_clip_id),
    ).fetchone()
    if existing:
        if title and title.strip() and title != existing["title"]:
            conn.execute(
                "UPDATE projects SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (title.strip(), existing["id"]),
            )
            conn.commit()
            row = conn.execute(
                """
                SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
                FROM projects WHERE id = ?
                """,
                (existing["id"],),
            ).fetchone()
            return _row_to_project(row)
        return _row_to_project(existing)

    display = (title or "").strip() or f"블로그 쇼츠 #{blog_clip_id}"
    cursor = conn.execute(
        """
        INSERT INTO projects (user_id, source_type, blog_clip_id, video_id, title)
        VALUES (?, 'blog', ?, NULL, ?)
        """,
        (user_id, blog_clip_id, display),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
        FROM projects WHERE id = ?
        """,
        (int(cursor.lastrowid),),
    ).fetchone()
    return _row_to_project(row)


def ensure_project_for_video(
    conn: sqlite3.Connection,
    user_id: int,
    video_id: int,
    title: str | None = None,
) -> Project:
    existing = conn.execute(
        """
        SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
        FROM projects
        WHERE user_id = ? AND video_id = ?
        """,
        (user_id, video_id),
    ).fetchone()
    if existing:
        if title and title.strip() and title != existing["title"]:
            conn.execute(
                "UPDATE projects SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (title.strip(), existing["id"]),
            )
            conn.commit()
            row = conn.execute(
                """
                SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
                FROM projects WHERE id = ?
                """,
                (existing["id"],),
            ).fetchone()
            return _row_to_project(row)
        return _row_to_project(existing)

    display = (title or "").strip() or f"영상 #{video_id}"
    cursor = conn.execute(
        """
        INSERT INTO projects (user_id, source_type, blog_clip_id, video_id, title)
        VALUES (?, 'video', NULL, ?, ?)
        """,
        (user_id, video_id, display),
    )
    conn.commit()
    row = conn.execute(
        """
        SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
        FROM projects WHERE id = ?
        """,
        (int(cursor.lastrowid),),
    ).fetchone()
    return _row_to_project(row)


def get_project_for_user(conn: sqlite3.Connection, user_id: int, project_id: int) -> Project | None:
    row = conn.execute(
        """
        SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
        FROM projects
        WHERE id = ? AND user_id = ?
        """,
        (project_id, user_id),
    ).fetchone()
    return _row_to_project(row) if row else None


def get_project_by_blog_clip(conn: sqlite3.Connection, user_id: int, blog_clip_id: int) -> Project | None:
    row = conn.execute(
        """
        SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
        FROM projects
        WHERE user_id = ? AND blog_clip_id = ?
        """,
        (user_id, blog_clip_id),
    ).fetchone()
    return _row_to_project(row) if row else None


def get_project_by_video(conn: sqlite3.Connection, user_id: int, video_id: int) -> Project | None:
    row = conn.execute(
        """
        SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
        FROM projects
        WHERE user_id = ? AND video_id = ?
        """,
        (user_id, video_id),
    ).fetchone()
    return _row_to_project(row) if row else None


def classify_project_source_kind(*, source_type: str, source_url: str | None, original_filename: str | None) -> str:
    if source_type == "blog":
        from app.services.product_service import is_supported_product_url

        if source_url and is_supported_product_url(source_url):
            return "product"
        return "blog"
    name = (original_filename or "").strip()
    if name.startswith("YouTube - "):
        return "youtube"
    return "mp4"


def list_projects_for_user(conn: sqlite3.Connection, user_id: int) -> list[Project]:
    rows = conn.execute(
        """
        SELECT id, user_id, source_type, blog_clip_id, video_id, title, created_at, updated_at
        FROM projects
        WHERE user_id = ?
        ORDER BY datetime(updated_at) DESC, id DESC
        """,
        (user_id,),
    ).fetchall()
    return [_row_to_project(row) for row in rows]


def backfill_projects(conn: sqlite3.Connection) -> int:
    """Create missing project rows for existing blog clips and videos. Idempotent."""
    created = 0
    blog_rows = conn.execute(
        """
        SELECT bc.id, bc.user_id, bc.blog_title
        FROM blog_clips bc
        LEFT JOIN projects p ON p.blog_clip_id = bc.id
        WHERE p.id IS NULL
        """
    ).fetchall()
    for row in blog_rows:
        ensure_project_for_blog_clip(conn, int(row["user_id"]), int(row["id"]), row["blog_title"])
        created += 1

    video_rows = conn.execute(
        """
        SELECT v.id, v.user_id, v.original_filename
        FROM videos v
        LEFT JOIN projects p ON p.video_id = v.id
        WHERE p.id IS NULL
        """
    ).fetchall()
    for row in video_rows:
        ensure_project_for_video(conn, int(row["user_id"]), int(row["id"]), row["original_filename"])
        created += 1

    return created


def touch_project_updated(conn: sqlite3.Connection, project_id: int) -> None:
    conn.execute(
        "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (project_id,),
    )
    conn.commit()
