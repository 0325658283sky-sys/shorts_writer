import pytest
from fastapi import HTTPException

from app.services.remotion_props_service import (
    DEFAULT_BOARD_DURATION_SEC,
    build_blog_shorts_props,
    build_remotion_render_props,
    resolve_board_duration_sec,
    _estimate_word_timings,
    _props_from_boards,
)
from tests.conftest import make_blog_clip, make_board


def test_resolve_board_duration_uses_board_value():
    board = make_board(duration_seconds=4.2)
    assert resolve_board_duration_sec(board) == 4.2


def test_resolve_board_duration_defaults_when_missing():
    board = make_board(duration_seconds=None)
    assert resolve_board_duration_sec(board) == DEFAULT_BOARD_DURATION_SEC


def test_estimate_word_timings_empty_and_single_word():
    assert _estimate_word_timings("", 3.0) == []
    assert _estimate_word_timings("   ", 3.0) == []
    words = _estimate_word_timings("훅", 2.0)
    assert len(words) == 1
    assert words[0]["text"] == "훅"
    assert words[0]["startSec"] == 0.0
    assert words[0]["endSec"] == 2.0


def test_estimate_word_timings_weights_by_character_length():
    words = _estimate_word_timings("가나 다", 3.0)
    assert [item["text"] for item in words] == ["가나", "다"]
    assert words[0]["startSec"] == 0.0
    assert words[0]["endSec"] == 2.0
    assert words[1]["startSec"] == 2.0
    assert words[1]["endSec"] == 3.0


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
    assert props["visualStyle"] == "impact_full"
    assert props["style"]["caption"] == "center_stroke"
    assert len(props["boards"]) == 2
    assert props["boards"][0]["durationSec"] == 3.0
    assert props["boards"][1]["durationSec"] == DEFAULT_BOARD_DURATION_SEC
    assert props["boards"][0]["words"] == _estimate_word_timings("하나", 3.0)
    assert props["style"]["captionAnimation"] == "highlight"
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
    assert props["visualStyle"] == "viral_cyan"
    assert props["style"]["header"] == "viral_cyan"


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
    assert props["visualStyle"] == "card_white"
    assert props["style"]["caption"] == "white_pill"
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


def test_props_materialize_preserves_gif_extension(conn, tmp_path, monkeypatch):
    from app.services import blog_service, remotion_props_service

    public_root = tmp_path / "remotion-public"
    public_root.mkdir()
    monkeypatch.setattr(remotion_props_service, "remotion_public_dir", lambda: public_root)

    image_root = tmp_path / "blog-images"
    monkeypatch.setattr(blog_service, "BLOG_IMAGE_ROOT", image_root)

    clip = make_blog_clip(id=42)
    gif_dir = image_root / "1" / "42"
    gif_dir.mkdir(parents=True)
    gif_path = gif_dir / "motion.gif"
    gif_path.write_bytes(b"GIF89a" + (b"\x00" * 64))

    boards = [make_board(id=7, image_path=str(gif_path), text="움짤")]
    props = _props_from_boards(
        conn,
        user_id=1,
        blog_clip=clip,
        boards=boards,
        materialize=True,
        duration_overrides=None,
        narration_audio_path=None,
    )
    image_url = props["boards"][0]["imageUrl"]
    assert image_url is not None
    assert image_url.endswith(".gif")
    assert props["boards"][0]["animated"] is True
    assert (public_root / image_url).is_file()


def test_caption_template_payload_accepts_real_gallery_categories():
    from types import SimpleNamespace
    from unittest.mock import patch

    from app.services.remotion_props_service import _caption_template_payload

    def tpl(category):
        return SimpleNamespace(
            category=category, position="top", box_style="box", accent_color="#FFE500", font_family="jalnan"
        )

    for category in ("impact", "news", "minimal", "commerce"):
        with patch("app.services.template_service.get_template_by_id", return_value=tpl(category)):
            assert _caption_template_payload(None, 7) == {
                "position": "top", "boxStyle": "box", "accentColor": "#FFE500", "fontFamily": "jalnan",
            }
    with patch("app.services.template_service.get_template_by_id", return_value=tpl("legacy")):
        assert _caption_template_payload(None, 7) is None
