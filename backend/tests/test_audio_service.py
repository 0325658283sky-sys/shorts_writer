from pathlib import Path
import logging

from app.services.audio_service import pick_default_bgm, seed_system_audio_assets
from app.services.bgm_mood_catalog import bundled_bgm_slugs


def _insert_bgm(conn, slug: str, path: Path) -> None:
    conn.execute(
        """
        INSERT INTO audio_assets (user_id, kind, name, slug, storage_path, duration_seconds)
        VALUES (NULL, 'bgm', ?, ?, ?, 12.0)
        """,
        (slug, slug, str(path)),
    )
    conn.commit()


def test_seed_skips_missing_bgm_without_error(conn, tmp_path, monkeypatch):
    import app.services.audio_service as audio_service

    monkeypatch.setattr(audio_service, "SYSTEM_AUDIO_ROOT", tmp_path)
    seed_system_audio_assets(conn)
    rows = conn.execute("SELECT slug FROM audio_assets WHERE kind = 'bgm'").fetchall()
    # conftest already inserts soft_pad_1; seeding must not crash or invent other bundled rows.
    bundled = set(bundled_bgm_slugs())
    bundled_present = {row["slug"] for row in rows if row["slug"] in bundled}
    assert bundled_present == {"soft_pad_1"}


def test_seed_logs_summary_when_no_bundled_bgm(conn, tmp_path, monkeypatch, caplog):
    import app.services.audio_service as audio_service

    monkeypatch.setattr(audio_service, "SYSTEM_AUDIO_ROOT", tmp_path)
    with caplog.at_level(logging.WARNING, logger="app.services.audio_service"):
        seed_system_audio_assets(conn)
    assert any(
        "Bundled BGM library is empty" in record.message for record in caplog.records
    )


def test_seed_registers_existing_bundled_mp3(conn, tmp_path, monkeypatch):
    import app.services.audio_service as audio_service

    monkeypatch.setattr(audio_service, "SYSTEM_AUDIO_ROOT", tmp_path)
    path = tmp_path / "promo_pulse_1.mp3"
    path.write_bytes(b"fake-mp3-bytes-xxxx")
    seed_system_audio_assets(conn)
    asset_row = conn.execute(
        "SELECT slug, storage_path FROM audio_assets WHERE slug = 'promo_pulse_1'"
    ).fetchone()
    assert asset_row is not None
    assert Path(asset_row["storage_path"]).name == "promo_pulse_1.mp3"


def test_pick_default_bgm_same_seed_is_stable(conn, tmp_path):
    slugs = ["promo_pulse_1", "promo_pulse_2", "bright_lift_1"]
    for slug in slugs:
        path = tmp_path / f"{slug}.mp3"
        path.write_bytes(b"fake-mp3-bytes-xxxx")
        _insert_bgm(conn, slug, path)

    first = pick_default_bgm(conn, "hook", "short", "impact_full", seed=42)
    second = pick_default_bgm(conn, "hook", "short", "impact_full", seed=42)
    assert first is not None and second is not None
    assert first.slug == second.slug


def test_pick_default_bgm_rotates_across_clip_ids(conn, tmp_path):
    slugs = ["promo_pulse_1", "promo_pulse_2", "bright_lift_1"]
    for slug in slugs:
        path = tmp_path / f"{slug}.mp3"
        path.write_bytes(b"fake-mp3-bytes-xxxx")
        _insert_bgm(conn, slug, path)

    picked = {
        pick_default_bgm(conn, "hook", "short", "impact_full", seed=seed).slug
        for seed in range(1, 21)
    }
    assert None not in picked
    assert len(picked) >= 2


def test_pick_default_bgm_skips_missing_files(conn, tmp_path):
    missing = tmp_path / "promo_pulse_1.mp3"
    present = tmp_path / "promo_pulse_2.mp3"
    present.write_bytes(b"fake-mp3-bytes-xxxx")
    _insert_bgm(conn, "promo_pulse_1", missing)
    _insert_bgm(conn, "promo_pulse_2", present)

    picked = pick_default_bgm(conn, "hook", "short", "impact_full", seed=7)
    assert picked is not None
    assert picked.slug == "promo_pulse_2"
