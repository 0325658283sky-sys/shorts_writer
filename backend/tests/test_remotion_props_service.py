import pytest
from fastapi import HTTPException

from app.services.remotion_props_service import (
    DEFAULT_BOARD_DURATION_SEC,
    build_blog_shorts_props,
    build_remotion_render_props,
    resolve_board_duration_sec,
    _props_from_boards,
)
from tests.conftest import make_blog_clip, make_board


def test_resolve_board_duration_uses_board_value():
    board = make_board(duration_seconds=4.2)
    assert resolve_board_duration_sec(board) == 4.2


def test_resolve_board_duration_defaults_when_missing():
    board = make_board(duration_seconds=None)
    assert resolve_board_duration_sec(board) == DEFAULT_BOARD_DURATION_SEC


def test_props_from_boards_applies_clip_transition_overrides(conn):
    clip = make_blog_clip(
        visual_style="fullscreen",
        transition_sec=0.8,
        transition_type="none",
        style_title="훅 *강조*",
        style_subtitle="서브",
    )
    boards = [make_board(id=1, text="하나"), make_board(id=2, order_index=1, text="둘", duration_seconds=None)]
    props = _props_from_boards(
        conn,
        user_id=1,
        blog_clip=clip,
        boards=boards,
        materialize=False,
        duration_overrides=None,
        narration_audio_path=None,
    )
    assert props["blogClipId"] == 1
    assert props["styleTitle"] == "훅 *강조*"
    assert props["styleSubtitle"] == "서브"
    assert props["transitionSec"] == 0.8
    assert props["transitionType"] == "none"
    assert props["style"]["transitionType"] == "none"
    assert props["visualStyle"] == "fullscreen"
    assert len(props["boards"]) == 2
    assert props["boards"][0]["durationSec"] == 3.0
    assert props["boards"][1]["durationSec"] == DEFAULT_BOARD_DURATION_SEC
    assert props["boards"][0]["imageUrl"].endswith("/blog-clips/1/boards/1/image")


def test_props_from_boards_uses_catalog_transition_when_clip_unset(conn):
    clip = make_blog_clip(
        visual_style="bold_hook",
        transition_sec=None,
        transition_type=None,
    )
    props = _props_from_boards(
        conn,
        user_id=1,
        blog_clip=clip,
        boards=[make_board()],
        materialize=False,
        duration_overrides=None,
        narration_audio_path=None,
    )
    assert props["transitionSec"] == 0.25
    assert props["transitionType"] == "slide"
    assert props["style"]["header"] == "viral_black"


def test_build_blog_shorts_props_requires_boards(conn, awaiting_boards_clip):
    with pytest.raises(HTTPException) as exc:
        build_blog_shorts_props(conn, 1, awaiting_boards_clip, materialize=False)
    assert exc.value.status_code == 409


def test_build_blog_shorts_props_with_boards(conn, awaiting_boards_clip):
    conn.execute(
        """
        INSERT INTO blog_clip_boards (blog_clip_id, order_index, image_path, text, duration_seconds)
        VALUES (?, 0, ?, '보드 A', 2.0)
        """,
        (awaiting_boards_clip, "/tmp/x.jpg"),
    )
    conn.execute(
        "UPDATE blog_clips SET transition_sec = 0.4, transition_type = 'fade', visual_style = 'card_news' WHERE id = ?",
        (awaiting_boards_clip,),
    )
    conn.commit()
    props = build_blog_shorts_props(conn, 1, awaiting_boards_clip, materialize=False)
    assert props["visualStyle"] == "card_news"
    assert props["transitionSec"] == 0.4
    assert props["boards"][0]["text"] == "보드 A"
    assert props["boards"][0]["durationSec"] == 2.0


def test_build_remotion_render_props_rejects_duration_mismatch(conn):
    clip = make_blog_clip()
    boards = [make_board(), make_board(id=11, order_index=1)]
    with pytest.raises(HTTPException) as exc:
        build_remotion_render_props(
            conn,
            user_id=1,
            blog_clip=clip,
            boards=boards,
            board_durations=[1.0],
            narration_audio_path="/tmp/missing.mp3",
        )
    assert exc.value.status_code == 500
