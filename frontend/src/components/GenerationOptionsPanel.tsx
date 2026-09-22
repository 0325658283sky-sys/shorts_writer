import { useEffect, useRef, useState } from "react";
import { authorizedBlob, authorizedRequest } from "../api/client";
import { NARRATION_LANGUAGE_LABELS, TTS_MODE_LABELS } from "../constants";
import type { BlogClip, Clip, TtsMode, Voice } from "../types";

/** Pikaclip식 통합 화면의 좌측 옵션 패널.
 *  블로그/상품 소스(원본 음성 없음): TTS 보이스 선택 + 속도 + 언어 표시.
 *  유튜브/mp4 소스(원본 음성 있음): 언어/오디오 모드 표시 위주의 가벼운 패널. */
export function GenerationOptionsPanel(
  props:
    | {
        clipKind: "blog";
        blogClip: BlogClip;
        onBlogClipUpdated: (updated: BlogClip) => void;
        onMessage: (message: string) => void;
      }
    | {
        clipKind: "youtube";
        clip: Clip;
      },
) {
  if (props.clipKind === "youtube") {
    return <YoutubeOptionsPanel clip={props.clip} />;
  }
  return <BlogOptionsPanel blogClip={props.blogClip} onBlogClipUpdated={props.onBlogClipUpdated} onMessage={props.onMessage} />;
}

function YoutubeOptionsPanel({ clip }: { clip: Clip }) {
  const audioLabel = TTS_MODE_LABELS[clip.tts_mode as TtsMode] ?? clip.tts_mode;
  return (
    <div className="options-panel">
      <p className="options-panel-title">생성 옵션</p>
      <div className="options-field">
        <span className="options-field-label">언어</span>
        <span className="options-field-value">한국어</span>
      </div>
      <div className="options-field">
        <span className="options-field-label">오디오</span>
        <span className="options-field-value">{audioLabel}</span>
      </div>
      <p className="options-panel-hint">원본 소스의 음성을 그대로 쓰거나 상세 편집기에서 나레이션으로 바꿀 수 있어요.</p>
    </div>
  );
}

function BlogOptionsPanel({
  blogClip,
  onBlogClipUpdated,
  onMessage,
}: {
  blogClip: BlogClip;
  onBlogClipUpdated: (updated: BlogClip) => void;
  onMessage: (message: string) => void;
}) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(blogClip.default_voice ?? "");
  const [speedDraft, setSpeedDraft] = useState(String(blogClip.tts_speed || 1));
  const [saving, setSaving] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authorizedRequest<Voice[]>("/voices")
      .then((loaded) => {
        if (cancelled) return;
        setVoices(loaded);
        setSelectedVoice((current) => {
          if (current && loaded.some((voice) => voice.id === current)) return current;
          if (blogClip.default_voice && loaded.some((voice) => voice.id === blogClip.default_voice)) {
            return blogClip.default_voice;
          }
          return loaded[0]?.id ?? "";
        });
      })
      .catch((error) => {
        if (!cancelled) onMessage(error instanceof Error ? error.message : "보이스 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogClip.id]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (sampleUrlRef.current) URL.revokeObjectURL(sampleUrlRef.current);
    };
  }, []);

  async function handlePlaySample(voiceId: string) {
    try {
      audioRef.current?.pause();
      if (sampleUrlRef.current) {
        URL.revokeObjectURL(sampleUrlRef.current);
        sampleUrlRef.current = null;
      }
      setPlayingVoiceId(voiceId);
      const blob = await authorizedBlob(`/voices/${encodeURIComponent(voiceId)}/sample`);
      const url = URL.createObjectURL(blob);
      sampleUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingVoiceId(null);
      await audio.play();
    } catch (error) {
      setPlayingVoiceId(null);
      onMessage(error instanceof Error ? error.message : "샘플 재생에 실패했습니다.");
    }
  }

  async function handleApply(nextVoice: string, nextSpeedDraft: string) {
    const speed = Number(nextSpeedDraft);
    if (!nextVoice || !Number.isFinite(speed) || speed < 0.25 || speed > 4) return;
    setSaving(true);
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/default-voice`, {
        method: "PATCH",
        body: JSON.stringify({ voice_id: nextVoice, tts_speed: speed, apply_to_all_boards: true }),
      });
      onBlogClipUpdated(updated);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "보이스 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function handleVoiceChange(voiceId: string) {
    setSelectedVoice(voiceId);
    void handleApply(voiceId, speedDraft);
  }

  function handleSpeedBlur() {
    void handleApply(selectedVoice, speedDraft);
  }

  const languageLabel = NARRATION_LANGUAGE_LABELS[blogClip.narration_language] ?? blogClip.narration_language;

  return (
    <div className="options-panel">
      <p className="options-panel-title">생성 옵션</p>

      <div className="options-field">
        <span className="options-field-label">언어</span>
        <span className="options-field-value">{languageLabel}</span>
      </div>

      <label className="options-field">
        <span className="options-field-label">TTS 보이스{saving ? " · 저장 중…" : ""}</span>
        <select
          className="options-select"
          value={selectedVoice}
          disabled={loading || saving}
          onChange={(e) => handleVoiceChange(e.target.value)}
        >
          {loading ? <option value="">불러오는 중…</option> : null}
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name}
            </option>
          ))}
        </select>
      </label>

      {selectedVoice ? (
        <button type="button" className="ghost-button options-preview-btn" onClick={() => void handlePlaySample(selectedVoice)}>
          {playingVoiceId === selectedVoice ? "재생 중…" : "미리듣기"}
        </button>
      ) : null}

      <label className="options-field">
        <span className="options-field-label">재생 속도</span>
        <input
          type="number"
          className="options-input"
          min={0.25}
          max={4}
          step={0.05}
          value={speedDraft}
          onChange={(e) => setSpeedDraft(e.target.value)}
          onBlur={handleSpeedBlur}
        />
      </label>

      <p className="options-panel-hint">원본 소스에 음성이 없어 AI 나레이션으로 읽어드려요.</p>
    </div>
  );
}
