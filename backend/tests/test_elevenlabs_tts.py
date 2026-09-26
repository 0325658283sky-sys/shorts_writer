import pytest
from fastapi import HTTPException

from app.services import tts_service


class _Resp:
    def __init__(self, status_code=200, payload=None, content=b"mp3"):
        self.status_code = status_code
        self._payload = payload or {}
        self.content = content
        self.text = "err"

    def json(self):
        return self._payload


@pytest.fixture(autouse=True)
def _eleven_env(monkeypatch, tmp_path):
    monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setattr(tts_service, "_refresh_tts_env", lambda: None)
    monkeypatch.setattr(tts_service, "TTS_ROOT", tmp_path)
    monkeypatch.setattr(tts_service, "_elevenlabs_voice_cache", None)


def test_catalog_and_validate(monkeypatch):
    payload = {"voices": [{"voice_id": "v1", "name": "Rachel", "labels": {"gender": "female", "accent": "korean"}}]}
    monkeypatch.setattr(tts_service.requests, "get", lambda *a, **k: _Resp(payload=payload))
    catalog = tts_service.list_voice_catalog()
    assert catalog == [{"id": "v1", "name": "Rachel", "description": "female · korean"}]
    assert tts_service.validate_voice_id("v1") == "v1"
    assert tts_service.default_tts_voice() == "v1"
    with pytest.raises(HTTPException):
        tts_service.validate_voice_id("nope")


def test_synthesize_clamps_speed_and_writes_file(monkeypatch):
    payload = {"voices": [{"voice_id": "v1", "name": "Rachel"}]}
    monkeypatch.setattr(tts_service.requests, "get", lambda *a, **k: _Resp(payload=payload))
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured["json"] = kwargs["json"]
        return _Resp(content=b"audio-bytes")

    monkeypatch.setattr(tts_service.requests, "post", fake_post)
    path = tts_service.synthesize_openai_tts(1, 5, "안녕하세요", voice="v1", speed=2.0)
    assert captured["url"].endswith("/v1/text-to-speech/v1")
    assert captured["json"]["voice_settings"]["speed"] == 1.2
    assert open(path, "rb").read() == b"audio-bytes"


def test_invalid_key_maps_to_401(monkeypatch):
    monkeypatch.setattr(tts_service.requests, "get", lambda *a, **k: _Resp(status_code=401))
    with pytest.raises(HTTPException) as exc:
        tts_service.list_voice_catalog()
    assert exc.value.status_code == 401
