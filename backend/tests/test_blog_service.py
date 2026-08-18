from pathlib import Path

import pytest
from bs4 import BeautifulSoup
from fastapi import HTTPException

from app.services.blog_service import (
    _extract_image_urls,
    _narration_hook_guidance,
    _normalize_wizard_step,
    _plan_board_texts_and_images,
    _prefer_high_res_image_url,
    _resolve_downloaded_image,
    _split_script_into_board_texts,
    _split_script_into_units,
    create_blog_clip_board,
    download_blog_images,
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


def test_plan_boards_reuses_images_instead_of_cramming_text():
    script = "첫 훅입니다. 두 번째 긴장감. 세 번째 반전. 네 번째 디테일. 다섯 번째 CTA."
    images = ["/img/a.jpg", "/img/b.jpg", "/img/c.jpg"]
    texts, assigned = _plan_board_texts_and_images(script, images, max_boards=12)
    assert len(texts) == 5
    assert len(assigned) == 5
    assert assigned == [
        "/img/a.jpg",
        "/img/b.jpg",
        "/img/c.jpg",
        "/img/a.jpg",
        "/img/b.jpg",
    ]
    # One short unit per board — not a long packed paragraph on board 0.
    assert all("." not in text[:-1] for text in texts if text)
    assert max(len(text) for text in texts) < len(script)


def test_plan_boards_keeps_image_count_when_script_is_short():
    texts, assigned = _plan_board_texts_and_images("한 문장뿐입니다.", ["/a.jpg", "/b.jpg", "/c.jpg"])
    assert len(texts) == 3
    assert len(assigned) == 3
    assert assigned == ["/a.jpg", "/b.jpg", "/c.jpg"]


def test_hook_guidance_asks_for_short_caption_sentences():
    guidance = _narration_hook_guidance().lower()
    assert "caption" in guidance or "subtitle" in guidance
    assert "short" in guidance
    assert "one idea" in guidance or "sequence" in guidance
    assert "curiosity" in guidance
    assert "fomo" in guidance or "contrast" in guidance


def test_narration_candidates_use_mini_then_gpt4o_for_hook(monkeypatch):
    import json
    from types import SimpleNamespace

    from app.core.config import settings
    from app.services.blog_service import generate_blog_narration_script_candidates

    calls: list[str] = []

    class _Completions:
        def create(self, **kwargs):
            calls.append(kwargs["model"])
            if kwargs["model"] == "gpt-4o":
                payload = {"hook": "훅 문장입니다. 바로 이 장면입니다."}
            else:
                payload = {
                    "summary": "요약 나레이션입니다.",
                    "detailed": "상세 나레이션입니다.",
                    "hook": "미니 훅입니다.",
                }
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload, ensure_ascii=False)))]
            )

    class _Client:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(completions=_Completions())

    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr("app.services.blog_service.OpenAI", _Client)

    result = generate_blog_narration_script_candidates(
        "제목",
        "본문 사실입니다.",
        model=None,
    )
    assert calls == ["gpt-4o-mini", "gpt-4o"]
    assert set(result) == {"summary", "hook", "detailed"}
    assert result["summary"] == "요약 나레이션입니다."
    assert result["detailed"] == "상세 나레이션입니다."
    assert result["hook"] == "훅 문장입니다. 바로 이 장면입니다."


def test_explicit_script_model_forces_hook_model(monkeypatch):
    import json
    from types import SimpleNamespace

    from app.core.config import settings
    from app.services.blog_service import generate_blog_narration_script_candidates

    calls: list[str] = []

    class _Completions:
        def create(self, **kwargs):
            calls.append(kwargs["model"])
            payload = {
                "summary": "요약입니다.",
                "detailed": "상세입니다.",
                "hook": f"{kwargs['model']} 훅입니다.",
            }
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload, ensure_ascii=False)))]
            )

    class _Client:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(completions=_Completions())

    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr("app.services.blog_service.OpenAI", _Client)

    result = generate_blog_narration_script_candidates(
        "제목",
        "본문",
        model="gpt-4o-mini",
    )
    assert calls == ["gpt-4o-mini", "gpt-4o-mini"]
    assert result["hook"] == "gpt-4o-mini 훅입니다."


def test_hook_call_failure_falls_back_to_mini_hook(monkeypatch):
    import json
    from types import SimpleNamespace

    from fastapi import HTTPException

    from app.core.config import settings
    from app.services.blog_service import generate_blog_narration_script_candidates

    class _Completions:
        def create(self, **kwargs):
            if kwargs["model"] == "gpt-4o":
                raise HTTPException(status_code=429, detail="OpenAI rate limit reached. Try again later.")
            payload = {
                "summary": "요약입니다.",
                "detailed": "상세입니다.",
                "hook": "미니 폴백 훅입니다.",
            }
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload, ensure_ascii=False)))]
            )

    class _Client:
        def __init__(self, **_kwargs):
            self.chat = SimpleNamespace(completions=_Completions())

    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr("app.services.blog_service.OpenAI", _Client)

    result = generate_blog_narration_script_candidates("제목", "본문", model=None)
    assert result["hook"] == "미니 폴백 훅입니다."
    assert result["summary"] == "요약입니다."


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
        "info_black",
        apply_pack=True,
    )
    assert updated.visual_style == "info_black"
    assert updated.transition_type == "fade"
    assert updated.bgm_asset_id == 1
    assert updated.auto_bgm is True
    assert updated.default_voice == "nova"
    assert updated.style_title
    assert updated.style_overlay_json


def test_prefer_high_res_does_not_mutate_gif_urls():
    url = "https://blogfiles.naver.net/2024/foo/bar.gif"
    assert _prefer_high_res_image_url(url) == url


def test_prefer_high_res_strips_naver_gif_blur_type():
    url = (
        "https://postfiles.pstatic.net/MjAyNjA1MTFfMTk1/MDAx.GIF/22.gif?type=w80_blur"
    )
    assert _prefer_high_res_image_url(url) == (
        "https://postfiles.pstatic.net/MjAyNjA1MTFfMTk1/MDAx.GIF/22.gif"
    )


def test_extract_image_urls_includes_gif_attachments():
    html = """
    <div class="se-main-container">
      <img src="https://cdn.example.com/photo.jpg" />
      <a href="https://cdn.example.com/motion.gif">첨부 GIF</a>
      <video poster="https://cdn.example.com/poster.gif">
        <source src="https://cdn.example.com/clip.mp4" type="video/mp4" />
      </video>
      <source src="https://cdn.example.com/extra.gif" />
    </div>
    """
    container = BeautifulSoup(html, "html.parser").select_one(".se-main-container")
    urls = _extract_image_urls(container, "https://blog.example.com/post")
    assert "https://cdn.example.com/photo.jpg" in urls or any("photo.jpg" in u for u in urls)
    assert any(u.endswith("motion.gif") for u in urls)
    assert any(u.endswith("poster.gif") for u in urls)
    assert any(u.endswith("extra.gif") for u in urls)
    assert not any(u.endswith(".mp4") for u in urls)


def test_extract_skips_naver_gif_mp4_proxy_and_dedupes_blur():
    html = """
    <div class="se-main-container">
      <img src="https://postfiles.pstatic.net/x.GIF/a.gif?type=w80_blur" />
      <img src="https://mblogvideo-phinf.pstatic.net/x.GIF/a.gif?type=mp4w800" />
      <img src="https://postfiles.pstatic.net/x.GIF/a.gif" />
      <img src="https://postfiles.pstatic.net/y.GIF/b.gif?type=w80_blur" />
    </div>
    """
    container = BeautifulSoup(html, "html.parser").select_one(".se-main-container")
    urls = _extract_image_urls(container, "https://blog.naver.com/post")
    assert urls == [
        "https://postfiles.pstatic.net/x.GIF/a.gif",
        "https://postfiles.pstatic.net/y.GIF/b.gif",
    ]


def test_download_blog_images_keeps_gifs_beyond_selection_max(tmp_path: Path, monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "blog_image_max_count", 8)
    monkeypatch.setattr(config.settings, "blog_image_candidate_max_count", 12)

    class FakeResponse:
        def __init__(self, payload: bytes, content_type: str):
            self.status_code = 200
            self.headers = {"Content-Type": content_type}
            self.content = payload

    def fake_get(url, **kwargs):
        if url.endswith(".gif"):
            return FakeResponse(b"GIF89a" + (b"\x01" * 2_500), "image/gif")
        return FakeResponse(b"\xff\xd8\xff" + (b"\x00" * 16_000), "image/jpeg")

    monkeypatch.setattr("app.services.blog_service.requests.get", fake_get)
    urls = [f"https://cdn.example.com/still-{i}.jpg" for i in range(10)]
    urls.append("https://cdn.example.com/motion.gif")
    saved = download_blog_images(urls, tmp_path)
    assert len(saved) == 11
    assert any(path.suffix == ".gif" for path, _ in saved)


def test_resolve_downloaded_image_accepts_small_gif_octet_stream():
    content = b"GIF89a" + (b"\x00" * 2_400)
    resolved = _resolve_downloaded_image(content, "application/octet-stream")
    assert resolved is not None
    assert resolved[1] == "image/gif"


def test_resolve_downloaded_image_rejects_tiny_gif():
    content = b"GIF89a" + (b"\x00" * 100)
    assert _resolve_downloaded_image(content, "image/gif") is None


def test_resolve_downloaded_image_still_rejects_tiny_jpeg():
    content = b"\xff\xd8\xff" + (b"\x00" * 100)
    assert _resolve_downloaded_image(content, "image/jpeg") is None


def test_download_blog_images_saves_gif_from_magic_bytes(tmp_path: Path, monkeypatch):
    gif_bytes = b"GIF89a" + (b"\x01" * 2_500)

    class FakeResponse:
        status_code = 200
        headers = {"Content-Type": "application/octet-stream"}
        content = gif_bytes

    monkeypatch.setattr(
        "app.services.blog_service.requests.get",
        lambda *args, **kwargs: FakeResponse(),
    )
    saved = download_blog_images(["https://cdn.example.com/clip.gif"], tmp_path)
    assert len(saved) == 1
    path, source = saved[0]
    assert path.suffix == ".gif"
    assert path.read_bytes().startswith(b"GIF89a")
    assert source.endswith("clip.gif")


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
