import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.db.models import BlogClip, BlogClipBoard


@pytest.fixture()
def conn() -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    connection.execute(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            plan TEXT NOT NULL DEFAULT 'free',
            monthly_usage INTEGER NOT NULL DEFAULT 0,
            usage_limit INTEGER NOT NULL DEFAULT 3,
            usage_month TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE audio_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            kind TEXT NOT NULL,
            name TEXT NOT NULL,
            slug TEXT,
            storage_path TEXT NOT NULL,
            duration_seconds REAL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE blog_clips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            source_url TEXT NOT NULL,
            blog_title TEXT,
            blog_body_text TEXT,
            narration_script TEXT,
            script_tone TEXT,
            script_candidates_json TEXT,
            subtitle_style TEXT NOT NULL DEFAULT 'shorts',
            subtitle_template_id INTEGER,
            video_path TEXT,
            subtitled_video_path TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            progress_stage TEXT NOT NULL DEFAULT 'queued',
            progress_percent INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            title_candidates_json TEXT,
            description TEXT,
            hashtags_json TEXT,
            metadata_error TEXT,
            tts_speed REAL NOT NULL DEFAULT 1.0,
            bgm_asset_id INTEGER,
            bgm_volume REAL NOT NULL DEFAULT 0.30,
            active_version_id INTEGER,
            target_length TEXT NOT NULL DEFAULT 'short',
            narration_language TEXT NOT NULL DEFAULT 'original',
            script_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
            default_voice TEXT,
            auto_bgm INTEGER NOT NULL DEFAULT 0,
            auto_sfx INTEGER NOT NULL DEFAULT 0,
            wizard_step TEXT,
            visual_style TEXT NOT NULL DEFAULT 'fullscreen',
            style_title TEXT,
            style_subtitle TEXT,
            style_overlay_json TEXT,
            transition_sec REAL,
            transition_type TEXT,
            render_spec_json TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE blog_clip_boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blog_clip_id INTEGER NOT NULL,
            order_index INTEGER NOT NULL,
            image_path TEXT NOT NULL,
            text TEXT NOT NULL DEFAULT '',
            speaker TEXT,
            duration_seconds REAL,
            sfx_asset_id INTEGER,
            text_style_json TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE blog_clip_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blog_clip_id INTEGER NOT NULL,
            label TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'boards',
            script_tone TEXT,
            narration_script TEXT,
            video_path TEXT,
            subtitled_video_path TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            progress_stage TEXT NOT NULL DEFAULT 'queued',
            progress_percent INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            title_candidates_json TEXT,
            description TEXT,
            hashtags_json TEXT,
            metadata_error TEXT,
            render_spec_json TEXT,
            override_json TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    connection.execute(
        """
        INSERT INTO users (email, password_hash, plan, monthly_usage, usage_limit, usage_month)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        ("tester@example.com", "hash", "free", 1, 3, month),
    )
    connection.execute(
        """
        INSERT INTO audio_assets (user_id, kind, name, slug, storage_path, duration_seconds)
        VALUES (NULL, 'bgm', '소프트 패드', 'soft_pad_1', '/tmp/soft_pad_1.mp3', 12.0)
        """
    )
    connection.commit()
    yield connection
    connection.close()


@pytest.fixture()
def awaiting_boards_clip(conn: sqlite3.Connection) -> int:
    cursor = conn.execute(
        """
        INSERT INTO blog_clips (
            user_id, source_url, blog_title, narration_script, status, progress_stage,
            progress_percent, visual_style, style_title, style_subtitle, wizard_step
        )
        VALUES (?, ?, ?, ?, 'awaiting_boards', 'awaiting_boards', 50, 'fullscreen',
                '테스트 *타이틀*', '보조', 'edit_mode')
        """,
        (1, "https://example.com/post", "블로그 제목", "첫 문장입니다. 둘째 문장입니다."),
    )
    conn.commit()
    return int(cursor.lastrowid)


def make_blog_clip(**overrides) -> BlogClip:
    base = dict(
        id=1,
        user_id=1,
        source_url="https://example.com/post",
        blog_title="블로그 제목",
        blog_body_text=None,
        narration_script="나레이션",
        script_tone="hook",
        script_candidates_json=None,
        subtitle_style="shorts",
        subtitle_template_id=None,
        video_path=None,
        subtitled_video_path=None,
        status="awaiting_boards",
        progress_stage="awaiting_boards",
        progress_percent=50,
        error_message=None,
        title_candidates_json=None,
        description=None,
        hashtags_json=None,
        metadata_error=None,
        tts_speed=1.0,
        bgm_asset_id=None,
        bgm_volume=0.3,
        active_version_id=None,
        target_length="short",
        narration_language="original",
        script_model="gpt-4o-mini",
        default_voice=None,
        auto_bgm=False,
        auto_sfx=False,
        wizard_step="edit_mode",
        visual_style="bold_hook",
        style_title="스타일 *타이틀*",
        style_subtitle="보조",
        style_overlay_json=None,
        transition_sec=0.5,
        transition_type="slide",
        render_spec_json=None,
        created_at="2026-01-01T00:00:00",
        updated_at="2026-01-01T00:00:00",
    )
    base.update(overrides)
    return BlogClip(**base)


def make_board(**overrides) -> BlogClipBoard:
    base = dict(
        id=10,
        blog_clip_id=1,
        order_index=0,
        image_path="/tmp/missing.jpg",
        text="보드 텍스트",
        speaker=None,
        duration_seconds=3.0,
        sfx_asset_id=None,
        created_at="2026-01-01T00:00:00",
        updated_at="2026-01-01T00:00:00",
    )
    base.update(overrides)
    return BlogClipBoard(**base)


@pytest.fixture()
def tmp_board_image(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    from app.services import blog_service

    root = tmp_path / "blog-images"
    monkeypatch.setattr(blog_service, "BLOG_IMAGE_ROOT", root)
    image_dir = root / "1" / "1"
    image_dir.mkdir(parents=True)
    image = image_dir / "shot.jpg"
    image.write_bytes(b"\xff\xd8\xff\xd9fakejpeg")
    return image
