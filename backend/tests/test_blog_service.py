import pytest
from fastapi import HTTPException

from app.services.blog_service import (
    _normalize_wizard_step,
    _split_script_into_board_texts,
    _split_script_into_units,
    create_blog_clip_board,
    update_blog_clip_motion_settings,
    update_blog_clip_style_copy,
    update_blog_clip_visual_style,
    update_blog_clip_wizard_step,
)


def test_normalize_wizard_step_maps_legacy():
    assert _normalize_wizard_step(None) is None
    assert _normalize_wizard_step("boards") == "edit_mode"
    assert _normalize_wizard_step("voice") == "edit_mode"
    assert _normalize_wizard_step("quick") == "quick"


def test_split_script_into_units_sentences():
    units = _split_script_into_units("첫 문장입니다. 둘째 문장입니다!")
    assert len(units) >= 2
    assert "첫" in units[0]


def test_split_script_into_board_texts_fills_all_boards():
    script = "하나. 둘. 셋. 넷. 다섯."
    texts = _split_script_into_board_texts(script, 3)
    assert len(texts) == 3
    assert all(texts)


def test_split_script_into_board_texts_empty_script():
    assert _split_script_into_board_texts("", 4) == ["", "", "", ""]


def test_update_wizard_step(conn, awaiting_boards_clip):
    updated = update_blog_clip_wizard_step(conn, 1, awaiting_boards_clip, "quick")
    assert updated.wizard_step == "quick"


def test_update_wizard_step_rejects_invalid(conn, awaiting_boards_clip):
    with pytest.raises(HTTPException) as exc:
        update_blog_clip_wizard_step(conn, 1, awaiting_boards_clip, "not_a_step")
    assert exc.value.status_code == 400


def test_update_style_copy(conn, awaiting_boards_clip):
    updated = update_blog_clip_style_copy(
        conn,
        1,
        awaiting_boards_clip,
        style_title="새 *타이틀*",
        style_subtitle="새 보조",
        title_set=True,
        subtitle_set=True,
    )
    assert updated.style_title == "새 *타이틀*"
    assert updated.style_subtitle == "새 보조"


def test_update_motion_settings(conn, awaiting_boards_clip):
    updated = update_blog_clip_motion_settings(
        conn,
        1,
        awaiting_boards_clip,
        transition_sec=0.55,
        transition_type="slide",
        sec_set=True,
        type_set=True,
    )
    assert updated.transition_sec == 0.55
    assert updated.transition_type == "slide"


def test_update_motion_settings_rejects_bad_type(conn, awaiting_boards_clip):
    with pytest.raises(HTTPException) as exc:
        update_blog_clip_motion_settings(
            conn,
            1,
            awaiting_boards_clip,
            transition_type="wipe",
            type_set=True,
        )
    assert exc.value.status_code == 400


def test_update_visual_style_applies_pack(conn, awaiting_boards_clip, monkeypatch):
    monkeypatch.setattr("app.services.tts_service.is_known_voice", lambda voice_id: voice_id == "nova")
    updated = update_blog_clip_visual_style(
        conn,
        1,
        awaiting_boards_clip,
        "card_news",
        apply_pack=True,
    )
    assert updated.visual_style == "card_news"
    assert updated.transition_type == "fade"
    assert updated.bgm_asset_id == 1
    assert updated.auto_bgm is True
    assert updated.default_voice == "nova"


def test_create_intro_board_at_front(conn, awaiting_boards_clip, tmp_board_image):
    # Fix clip id path: fixture creates id=1 when DB is fresh.
    clip_id = awaiting_boards_clip
    image = tmp_board_image
    # Ensure image lives under user/clip_id path for this clip.
    from app.services import blog_service

    target_dir = blog_service.BLOG_IMAGE_ROOT / "1" / str(clip_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / "shot.jpg"
    if not target.exists():
        target.write_bytes(image.read_bytes())

    first = create_blog_clip_board(conn, 1, clip_id, str(target), text="본문", order_index=None)
    intro = create_blog_clip_board(conn, 1, clip_id, str(target), text="인트로", order_index=0)
    assert intro.order_index == 0
    assert intro.text == "인트로"
    # After normalize, first board should be pushed to 1.
    from app.services.blog_service import list_blog_clip_boards

    boards = list_blog_clip_boards(conn, 1, clip_id)
    assert [b.id for b in boards] == [intro.id, first.id]
