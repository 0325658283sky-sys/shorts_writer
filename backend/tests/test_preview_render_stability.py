"""Regression locks for preview/render stability (GIF, mediaFit, selection cap, WYSIWYG)."""

from pathlib import Path

import pytest
from fastapi import HTTPException

from app.core import config
from app.services import blog_service
from app.services.blog_service import (
    _assert_remotion_wysiwyg_props,
    _ensure_render_output_playable,
    _replace_blog_clip_image_candidates,
)
from app.services.visual_style_catalog import remotion_style_payload
from tests.conftest import make_blog_clip, make_board


def test_letterbox_styles_use_cover_media_fit():
    for slug in ("info_black", "info_navy"):
        payload = remotion_style_payload(slug)
        assert payload["layout"] == "letterbox"
        assert payload["mediaFit"] == "cover"


def test_image_candidate_default_selection_respects_max(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(config.settings, "blog_image_max_count", 8)
    conn = __import__("sqlite3").connect(":memory:")
    conn.row_factory = __import__("sqlite3").Row
    conn.execute(
        """
        CREATE TABLE blog_clip_image_candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blog_clip_id INTEGER NOT NULL,
            order_index INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            source_url TEXT,
            selected INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    downloaded = []
    for index in range(12):
        path = tmp_path / f"img-{index}.jpg"
        path.write_bytes(b"\xff\xd8\xff" + bytes([index]) * 16)
        downloaded.append((path, f"https://cdn.example.com/{index}.jpg"))

    _replace_blog_clip_image_candidates(conn, blog_clip_id=99, downloaded=downloaded)
    rows = conn.execute(
        "SELECT order_index, selected FROM blog_clip_image_candidates ORDER BY order_index"
    ).fetchall()
    assert len(rows) == 12
    selected = [row["order_index"] for row in rows if row["selected"]]
    assert selected == list(range(8))


def test_wysiwyg_guard_requires_animated_for_gif_boards():
    clip = make_blog_clip()
    boards = [make_board(id=1, image_path="/tmp/motion.gif", text="움짤")]
    props = {
        "visualStyle": "impact_full",
        "styleTitle": "훅",
        "overlay": {"title": {}},
        "boards": [{"boardId": 1, "animated": False, "imageUrl": "clips/1/board-1.gif"}],
    }
    with pytest.raises(HTTPException) as exc:
        _assert_remotion_wysiwyg_props(clip, boards, props)
    assert exc.value.status_code == 500
    assert "animated" in exc.value.detail.lower()


def test_wysiwyg_guard_accepts_animated_gif_boards():
    clip = make_blog_clip()
    boards = [make_board(id=1, image_path="/tmp/motion.gif", text="움짤")]
    props = {
        "visualStyle": "impact_full",
        "styleTitle": "훅",
        "overlay": {"title": {}},
        "boards": [{"boardId": 1, "animated": True, "imageUrl": "clips/1/board-1.gif"}],
    }
    _assert_remotion_wysiwyg_props(clip, boards, props)


def test_ensure_render_output_playable_rejects_tiny_file(tmp_path: Path):
    tiny = tmp_path / "empty.mp4"
    tiny.write_bytes(b"x" * 32)
    with pytest.raises(HTTPException) as exc:
        _ensure_render_output_playable(tiny)
    assert exc.value.status_code == 500


def test_ensure_render_output_playable_accepts_file(tmp_path: Path):
    ok = tmp_path / "ok.mp4"
    ok.write_bytes(b"0" * 2048)
    _ensure_render_output_playable(ok)


def test_props_from_boards_marks_gif_animated_without_materialize():
    from app.services.remotion_props_service import _props_from_boards

    clip = make_blog_clip()
    boards = [make_board(id=3, image_path=r"C:\data\clip\motion.GIF", text="gif")]
    # conn unused for non-materialize path beyond style resolve
    import sqlite3

    connection = sqlite3.connect(":memory:")
    props = _props_from_boards(
        connection,
        user_id=1,
        blog_clip=clip,
        boards=boards,
        materialize=False,
        duration_overrides=None,
        narration_audio_path=None,
    )
    assert props["boards"][0]["animated"] is True


def test_confirm_selection_rejects_over_max(conn, awaiting_boards_clip, monkeypatch, tmp_path: Path):
    monkeypatch.setattr(config.settings, "blog_image_max_count", 8)
    monkeypatch.setattr(config.settings, "blog_image_min_count", 1)
    monkeypatch.setattr(blog_service, "BLOG_IMAGE_ROOT", tmp_path)

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS blog_clip_image_candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blog_clip_id INTEGER NOT NULL,
            order_index INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            source_url TEXT,
            selected INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    clip_id = awaiting_boards_clip
    conn.execute("UPDATE blog_clips SET status = 'awaiting_images' WHERE id = ?", (clip_id,))
    image_ids = []
    for index in range(9):
        path = tmp_path / "1" / str(clip_id) / f"{index}.jpg"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"\xff\xd8\xff" + bytes([index]) * 200)
        cursor = conn.execute(
            """
            INSERT INTO blog_clip_image_candidates (
                blog_clip_id, order_index, storage_path, source_url, selected
            ) VALUES (?, ?, ?, ?, 0)
            """,
            (clip_id, index, str(path), f"https://example.com/{index}.jpg"),
        )
        image_ids.append(int(cursor.lastrowid))
    conn.commit()

    with pytest.raises(HTTPException) as exc:
        blog_service.confirm_blog_clip_image_selection(conn, 1, clip_id, image_ids)
    assert exc.value.status_code == 400
    assert "at most" in exc.value.detail.lower()
