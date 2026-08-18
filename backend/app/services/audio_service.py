"""BGM / SFX asset library (Stage 23)."""

from __future__ import annotations

import logging
import random
import sqlite3
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.db.models import AudioAsset
from app.services.bgm_mood_catalog import bundled_bgm_slugs, get_bgm_mood
from app.services.ffmpeg_service import (
    FFmpegAudioError,
    FFmpegNotAvailableError,
    generate_tone_mp3,
    get_video_duration_seconds,
)
from app.services.video_service import STORAGE_ROOT

logger = logging.getLogger(__name__)

AUDIO_ROOT = STORAGE_ROOT / "audio"
SYSTEM_AUDIO_ROOT = AUDIO_ROOT / "system"
USER_AUDIO_ROOT = AUDIO_ROOT / "users"
ALLOWED_AUDIO_KINDS = {"bgm", "sfx"}
ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg"}
DEFAULT_BGM_VOLUME = 0.32
DEFAULT_SFX_VOLUME = 0.50
BGM_VOLUME_MIN = 0.0
BGM_VOLUME_MAX = 0.55  # hard cap so BGM cannot bury TTS

_ASSET_COLUMNS = """
    id, user_id, kind, name, slug, storage_path, duration_seconds, created_at, updated_at
"""

# Preference order for auto-pick moved to bgm_mood_catalog (KR Shorts moods).
_SFX_ROTATION = ["tick", "pop", "whoosh", "click", "swell"]

# Display names for bundled BGM slugs (files live at SYSTEM_AUDIO_ROOT/<slug>.mp3).
_BGM_SEED_NAMES: dict[str, str] = {
    "promo_pulse_1": "프로모 펄스 1",
    "promo_pulse_2": "프로모 펄스 2",
    "promo_pulse_3": "프로모 펄스 3",
    "promo_pulse_4": "프로모 펄스 4",
    "bright_lift_1": "브라이트 리프트 1",
    "bright_lift_2": "브라이트 리프트 2",
    "bright_lift_3": "브라이트 리프트 3",
    "bright_lift_4": "브라이트 리프트 4",
    "light_warm_1": "라이트 웜 1",
    "light_warm_2": "라이트 웜 2",
    "light_warm_3": "라이트 웜 3",
    "soft_pad_1": "소프트 패드 1",
    "soft_pad_2": "소프트 패드 2",
    "soft_pad_3": "소프트 패드 3",
    "soft_pad_4": "소프트 패드 4",
    "soft_pad_5": "소프트 패드 5",
    "calm_drone_1": "칼름 드론 1",
    "calm_drone_2": "칼름 드론 2",
    "calm_drone_3": "칼름 드론 3",
}


def _row_to_asset(row: sqlite3.Row) -> AudioAsset:
    return AudioAsset(
        id=row["id"],
        user_id=row["user_id"],
        kind=row["kind"],
        name=row["name"],
        slug=row["slug"],
        storage_path=row["storage_path"],
        duration_seconds=float(row["duration_seconds"]) if row["duration_seconds"] is not None else None,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def get_audio_asset(conn: sqlite3.Connection, asset_id: int) -> AudioAsset | None:
    row = conn.execute(
        f"SELECT {_ASSET_COLUMNS} FROM audio_assets WHERE id = ?",
        (asset_id,),
    ).fetchone()
    return _row_to_asset(row) if row else None


def assert_audio_asset_usable(
    conn: sqlite3.Connection,
    user_id: int,
    asset_id: int,
    *,
    kind: str | None = None,
) -> AudioAsset:
    asset = get_audio_asset(conn, asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio asset not found.")
    if asset.user_id is not None and asset.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio asset not found.")
    if kind is not None and asset.kind != kind:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Audio asset kind must be '{kind}'.",
        )
    path = Path(asset.storage_path)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio asset file is missing on disk.")
    return asset


def list_audio_assets(
    conn: sqlite3.Connection,
    user_id: int,
    kind: str | None = None,
) -> list[AudioAsset]:
    if kind is not None and kind not in ALLOWED_AUDIO_KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kind must be bgm or sfx.")
    if kind:
        rows = conn.execute(
            f"""
            SELECT {_ASSET_COLUMNS} FROM audio_assets
            WHERE (user_id IS NULL OR user_id = ?) AND kind = ?
            ORDER BY CASE WHEN user_id IS NULL THEN 0 ELSE 1 END, id ASC
            """,
            (user_id, kind),
        ).fetchall()
    else:
        rows = conn.execute(
            f"""
            SELECT {_ASSET_COLUMNS} FROM audio_assets
            WHERE user_id IS NULL OR user_id = ?
            ORDER BY kind ASC, CASE WHEN user_id IS NULL THEN 0 ELSE 1 END, id ASC
            """,
            (user_id,),
        ).fetchall()
    return [_row_to_asset(row) for row in rows]


def get_system_audio_by_slug(conn: sqlite3.Connection, slug: str) -> AudioAsset | None:
    row = conn.execute(
        f"SELECT {_ASSET_COLUMNS} FROM audio_assets WHERE user_id IS NULL AND slug = ?",
        (slug,),
    ).fetchone()
    return _row_to_asset(row) if row else None


def _asset_file_ready(asset: AudioAsset | None) -> AudioAsset | None:
    if asset is None:
        return None
    path = Path(asset.storage_path)
    if not path.is_file() or path.stat().st_size <= 0:
        return None
    return asset


def pick_default_bgm(
    conn: sqlite3.Connection,
    script_tone: str | None,
    target_length: str,
    visual_style: str | None = None,
    *,
    mood_id: str | None = None,
    seed: int | None = None,
) -> AudioAsset | None:
    """Pick a system BGM with weighted random among ready bundled tracks.

    Mood-primary slugs get higher weight than length/fallback slugs.
    ``seed`` (typically blog_clip.id) keeps the same clip on the same track
    across re-renders while still rotating across new clips.
    """
    from app.services.bgm_mood_catalog import resolve_candidate_slugs

    mood_key, candidates = resolve_candidate_slugs(
        script_tone=script_tone,
        visual_style=visual_style,
        target_length=target_length,
        mood_id=mood_id,
    )
    mood = get_bgm_mood(mood_key)
    primary = set(mood["slugs"]) if mood else set()

    available: list[AudioAsset] = []
    weights: list[int] = []
    for index, slug in enumerate(candidates):
        asset = _asset_file_ready(get_system_audio_by_slug(conn, slug))
        if asset is None:
            continue
        available.append(asset)
        # Prefer mood playlist; earlier candidates still slightly heavier.
        base = 4 if slug in primary else 1
        weights.append(max(1, base + max(0, len(candidates) - index) // 8))

    if not available:
        return None
    rng = random.Random(seed) if seed is not None else random.Random()
    return rng.choices(available, weights=weights, k=1)[0]


def pick_default_sfx(conn: sqlite3.Connection, *, board_index: int = 1) -> AudioAsset | None:
    """Pick a system transition SFX; rotate by board index for variety."""
    order = _SFX_ROTATION[board_index % len(_SFX_ROTATION) :] + _SFX_ROTATION[: board_index % len(_SFX_ROTATION)]
    for slug in order:
        asset = _asset_file_ready(get_system_audio_by_slug(conn, slug))
        if asset is not None:
            return asset
    return None


def clamp_bgm_volume(volume: float | None) -> float:
    if volume is None:
        return DEFAULT_BGM_VOLUME
    try:
        value = float(volume)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="bgm_volume must be a number.") from exc
    if value < BGM_VOLUME_MIN or value > BGM_VOLUME_MAX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"bgm_volume must be between {BGM_VOLUME_MIN} and {BGM_VOLUME_MAX}.",
        )
    return round(value, 3)


def _insert_system_asset(
    conn: sqlite3.Connection,
    *,
    kind: str,
    name: str,
    slug: str,
    path: Path,
) -> None:
    existing = conn.execute(
        "SELECT id FROM audio_assets WHERE user_id IS NULL AND slug = ?",
        (slug,),
    ).fetchone()
    if existing is not None:
        return
    try:
        duration = get_video_duration_seconds(str(path))
    except Exception:
        duration = None
    conn.execute(
        """
        INSERT INTO audio_assets (user_id, kind, name, slug, storage_path, duration_seconds)
        VALUES (NULL, ?, ?, ?, ?, ?)
        """,
        (kind, name, slug, str(path.resolve()), duration),
    )


def _ensure_sfx_seed_file(path: Path, recipe: str) -> None:
    """Synthesize short transition SFX when missing. BGM is never synthesized."""
    if path.exists() and path.stat().st_size > 0:
        return
    if recipe == "tick":
        generate_tone_mp3(str(path), frequency=1200, duration=0.12, volume=0.42, fade_out=0.08)
    elif recipe == "pop":
        generate_tone_mp3(str(path), frequency=660, duration=0.18, volume=0.45, fade_out=0.1)
    elif recipe == "whoosh":
        generate_tone_mp3(str(path), frequency=480, duration=0.28, volume=0.4, fade_out=0.22)
    elif recipe == "click":
        generate_tone_mp3(str(path), frequency=1800, duration=0.07, volume=0.38, fade_out=0.05)
    elif recipe == "swell":
        generate_tone_mp3(str(path), frequency=320, duration=0.45, volume=0.35, fade_out=0.35)
    else:
        generate_tone_mp3(str(path), frequency=440, duration=0.2, volume=0.35, fade_out=0.1)


def seed_system_audio_assets(conn: sqlite3.Connection) -> None:
    """Register bundled BGM mp3s if present; synthesize SFX tones if missing.

    BGM files are expected at ``SYSTEM_AUDIO_ROOT/<slug>.mp3`` (see LICENSES.md).
    Missing BGM is a warning-only skip so startup never fails.
    """
    SYSTEM_AUDIO_ROOT.mkdir(parents=True, exist_ok=True)

    expected = list(bundled_bgm_slugs())
    seeded = 0
    for slug in expected:
        path = SYSTEM_AUDIO_ROOT / f"{slug}.mp3"
        if not path.is_file() or path.stat().st_size <= 0:
            logger.debug("Bundled BGM missing; skip seeding slug=%s path=%s", slug, path)
            continue
        name = _BGM_SEED_NAMES.get(slug, slug)
        _insert_system_asset(conn, kind="bgm", name=name, slug=slug, path=path)
        seeded += 1
    if seeded == 0:
        logger.warning(
            "Bundled BGM library is empty: 0 of %s tracks found under %s "
            "(add mp3s named after bundled slugs; see LICENSES.md)",
            len(expected),
            SYSTEM_AUDIO_ROOT,
        )

    sfx_seeds = [
        ("틱", "tick", SYSTEM_AUDIO_ROOT / "tick.mp3", "tick"),
        ("팝", "pop", SYSTEM_AUDIO_ROOT / "pop.mp3", "pop"),
        ("후슈", "whoosh", SYSTEM_AUDIO_ROOT / "whoosh.mp3", "whoosh"),
        ("클릭", "click", SYSTEM_AUDIO_ROOT / "click.mp3", "click"),
        ("스웰", "swell", SYSTEM_AUDIO_ROOT / "swell.mp3", "swell"),
    ]
    try:
        for name, slug, path, recipe in sfx_seeds:
            _ensure_sfx_seed_file(path, recipe)
            _insert_system_asset(conn, kind="sfx", name=name, slug=slug, path=path)
    except (FFmpegNotAvailableError, FFmpegAudioError):
        logger.warning("SFX seed skipped; FFmpeg unavailable")

    conn.commit()


async def create_user_audio_asset(
    conn: sqlite3.Connection,
    user_id: int,
    *,
    kind: str,
    name: str,
    upload: UploadFile,
) -> AudioAsset:
    if kind not in ALLOWED_AUDIO_KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="kind must be bgm or sfx.")
    cleaned_name = (name or "").strip() or (upload.filename or "audio").rsplit(".", 1)[0]
    if len(cleaned_name) > 80:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="name must be 1–80 characters.")

    original = Path(upload.filename or "upload.mp3")
    extension = original.suffix.lower() or ".mp3"
    if extension not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported audio type. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}",
        )

    destination_dir = USER_AUDIO_ROOT / str(user_id)
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / f"{kind}_{uuid.uuid4().hex}{extension}"
    content = await upload.read()
    if len(content) < 1000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio file is too small.")
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio file must be under 20MB.")
    destination.write_bytes(content)

    try:
        duration = get_video_duration_seconds(str(destination))
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read audio duration.") from exc

    cursor = conn.execute(
        """
        INSERT INTO audio_assets (user_id, kind, name, slug, storage_path, duration_seconds)
        VALUES (?, ?, ?, NULL, ?, ?)
        """,
        (user_id, kind, cleaned_name, str(destination.resolve()), duration),
    )
    conn.commit()
    asset = get_audio_asset(conn, int(cursor.lastrowid))
    if asset is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Audio asset creation failed.")
    return asset


def delete_user_audio_asset(conn: sqlite3.Connection, user_id: int, asset_id: int) -> None:
    asset = get_audio_asset(conn, asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio asset not found.")
    if asset.user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="시스템 오디오는 삭제할 수 없습니다.")
    if asset.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio asset not found.")

    conn.execute("UPDATE blog_clips SET bgm_asset_id = NULL WHERE bgm_asset_id = ? AND user_id = ?", (asset_id, user_id))
    conn.execute(
        """
        UPDATE blog_clip_boards
        SET sfx_asset_id = NULL
        WHERE sfx_asset_id = ?
          AND blog_clip_id IN (SELECT id FROM blog_clips WHERE user_id = ?)
        """,
        (asset_id, user_id),
    )
    conn.execute("DELETE FROM audio_assets WHERE id = ? AND user_id = ?", (asset_id, user_id))
    conn.commit()
    Path(asset.storage_path).unlink(missing_ok=True)
