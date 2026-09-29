from pathlib import Path

import pytest
from fastapi import HTTPException

from app.services import stock_service


def _prepare(conn, awaiting_boards_clip):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS blog_clip_image_candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT, blog_clip_id INTEGER NOT NULL,
            order_index INTEGER NOT NULL, storage_path TEXT NOT NULL, source_url TEXT,
            selected INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)
        """
    )
    conn.execute("UPDATE blog_clips SET status = 'awaiting_images' WHERE id = ?", (awaiting_boards_clip,))
    conn.commit()


def test_stock_fill_adds_candidates(conn, awaiting_boards_clip, tmp_path, monkeypatch):
    _prepare(conn, awaiting_boards_clip)
    monkeypatch.setattr(
        stock_service,
        "search_stock_images",
        lambda q, page=1, per_page=12: {"photos": [{"download_url": f"https://images.pexels.com/{i}.jpg"} for i in range(6)]},
    )

    def fake_download(user_id, blog_clip_id, url):
        path = tmp_path / url.rsplit("/", 1)[-1]
        path.write_bytes(b"x")
        return path

    monkeypatch.setattr(stock_service, "download_stock_image_to_clip", fake_download)
    ids = stock_service.add_stock_candidates_for_shortage(conn, 1, awaiting_boards_clip, 2)
    assert len(ids) == 2
    rows = conn.execute("SELECT source_url, selected FROM blog_clip_image_candidates").fetchall()
    assert len(rows) == 2 and all("pexels" in r["source_url"] and r["selected"] == 0 for r in rows)


def test_stock_fill_requires_awaiting_images(conn, awaiting_boards_clip):
    with pytest.raises(HTTPException) as exc:
        stock_service.add_stock_candidates_for_shortage(conn, 1, awaiting_boards_clip, 1)
    assert exc.value.status_code == 409
