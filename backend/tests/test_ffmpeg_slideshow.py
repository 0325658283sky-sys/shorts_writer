"""Regression: multi-image slideshow must advance through every board image."""

from __future__ import annotations

import shutil
import struct
import zlib
from pathlib import Path

import pytest

from app.services.ffmpeg_service import (
    FFmpegNotAvailableError,
    create_image_slideshow,
    create_silence_mp3,
    ensure_ffmpeg_available,
)


def _write_solid_png(path: Path, rgb: tuple[int, int, int], width: int = 64, height: int = 64) -> None:
    r, g, b = rgb
    raw = b"".join(b"\x00" + bytes([r, g, b]) * width for _ in range(height))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    )


@pytest.fixture()
def ffmpeg_or_skip():
    try:
        ensure_ffmpeg_available()
    except FFmpegNotAvailableError:
        pytest.skip("ffmpeg not available")


def test_slideshow_renders_all_boards(tmp_path: Path, ffmpeg_or_skip):
    images = []
    colors = [(220, 40, 40), (40, 180, 60), (40, 80, 220), (230, 200, 40)]
    for index, color in enumerate(colors):
        path = tmp_path / f"board-{index}.png"
        _write_solid_png(path, color)
        images.append(str(path))

    audio = tmp_path / "narration.mp3"
    durations = [0.8, 0.8, 0.8, 0.8]
    create_silence_mp3(sum(durations), str(audio))

    output = tmp_path / "slideshow.mp4"
    create_image_slideshow(images, str(audio), str(output), durations)

    assert output.is_file()
    assert output.stat().st_size > 5_000

    # Sample midpoints of board 0 and board 3 — frames must differ if slides advance.
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg
    samples = []
    for index, midpoint in enumerate((0.4, 2.8)):
        frame = tmp_path / f"sample-{index}.png"
        import subprocess

        result = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-ss",
                f"{midpoint:.2f}",
                "-i",
                str(output),
                "-frames:v",
                "1",
                str(frame),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert result.returncode == 0, result.stderr[-500:]
        samples.append(frame.read_bytes())

    assert samples[0] != samples[1], "slideshow froze: later board frame matches early board"


def _png_to_gif(ffmpeg: str, png_path: Path, gif_path: Path) -> None:
    import subprocess

    result = subprocess.run(
        [ffmpeg, "-y", "-i", str(png_path), "-frames:v", "1", str(gif_path)],
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr[-500:]


def test_slideshow_accepts_gif_board(tmp_path: Path, ffmpeg_or_skip):
    import subprocess

    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg

    still = tmp_path / "still.png"
    _write_solid_png(still, (40, 180, 60))
    animated = tmp_path / "motion.gif"
    _png_to_gif(ffmpeg, still, animated)

    other = tmp_path / "other.png"
    _write_solid_png(other, (220, 40, 40))

    audio = tmp_path / "narration.mp3"
    durations = [0.8, 0.8]
    create_silence_mp3(sum(durations), str(audio))

    output = tmp_path / "gif-slideshow.mp4"
    create_image_slideshow([str(animated), str(other)], str(audio), str(output), durations)

    assert output.is_file()
    assert output.stat().st_size > 5_000

    probe = subprocess.run(
        [ffmpeg, "-y", "-i", str(output), "-f", "null", "-"],
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert probe.returncode == 0, probe.stderr[-500:]
