import json

import pytest
from fastapi import HTTPException

from app.services import blog_service


def _set(conn, clip_id, status, body="본문입니다"):
    conn.execute(
        "UPDATE blog_clips SET status = ?, blog_body_text = ? WHERE id = ?",
        (status, body, clip_id),
    )
    conn.commit()


def test_rewrite_uses_style_and_stores_candidates(conn, awaiting_boards_clip, monkeypatch):
    _set(conn, awaiting_boards_clip, "awaiting_script")
    seen = {}

    def fake_generate(title, body, **kwargs):
        seen.update(kwargs)
        return {"summary": "s", "hook": "h", "detailed": "d"}

    monkeypatch.setattr(blog_service, "generate_blog_narration_script_candidates", fake_generate)
    updated = blog_service.regenerate_blog_clip_script_candidates(conn, 1, awaiting_boards_clip, "calm_info")
    assert seen["speech_style"] == "calm_info"
    assert json.loads(updated.script_candidates_json) == {"summary": "s", "hook": "h", "detailed": "d"}


def test_rewrite_rejects_unknown_style_and_wrong_status(conn, awaiting_boards_clip):
    _set(conn, awaiting_boards_clip, "awaiting_script")
    with pytest.raises(HTTPException) as exc:
        blog_service.regenerate_blog_clip_script_candidates(conn, 1, awaiting_boards_clip, "weird")
    assert exc.value.status_code == 400
    _set(conn, awaiting_boards_clip, "awaiting_boards")
    with pytest.raises(HTTPException) as exc:
        blog_service.regenerate_blog_clip_script_candidates(conn, 1, awaiting_boards_clip, None)
    assert exc.value.status_code == 409
