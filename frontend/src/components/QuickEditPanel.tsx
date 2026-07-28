import { SUBTITLE_STYLE_LABELS, SUBTITLE_STYLES, TTS_MODE_LABELS, TTS_MODES } from "../constants";
import type { Clip, SubtitleStyle, TtsMode } from "../types";

/**
 * YouTube/MP4 quick-edit adapter: subtitle + voice only.
 * Blog quick path keeps QuickSettingsStep (voice/BGM) — no engine merge.
 */
export function YoutubeQuickEdit({
  clip,
  draftTitle,
  selectedStyle,
  selectedTtsMode,
  busy,
  subtitling,
  narrating,
  onStyleChange,
  onTtsModeChange,
  onApply,
  onOpenDetailed,
  onBackToDrafts,
}: {
  clip: Clip | null;
  draftTitle?: string;
  selectedStyle: SubtitleStyle;
  selectedTtsMode: TtsMode;
  busy: boolean;
  subtitling: boolean;
  narrating: boolean;
  onStyleChange: (style: SubtitleStyle) => void;
  onTtsModeChange: (mode: TtsMode) => void;
  onApply: () => void;
  onOpenDetailed: () => void;
  onBackToDrafts: () => void;
}) {
  return (
    <section className="flow-card quick-edit-panel" aria-label="빠른 수정">
      <p className="create-kicker">빠른 수정</p>
      <h1>초안을 빠르게 다듬을까요?</h1>
      <p className="flow-lead">
        {draftTitle
          ? `선택한 초안: ${draftTitle}. 자막·음성만 고른 뒤 바로 만들 수 있어요.`
          : "자막·음성만 고른 뒤 바로 만들 수 있어요. 세부 편집은 선택 사항입니다."}
      </p>

      <div className="quick-edit-fields">
        <label className="create-field inline-field">
          <span>자막 스타일</span>
          <select
            value={selectedStyle}
            disabled={busy}
            onChange={(event) => onStyleChange(event.target.value as SubtitleStyle)}
          >
            {SUBTITLE_STYLES.map((style) => (
              <option value={style} key={style}>
                {SUBTITLE_STYLE_LABELS[style]}
              </option>
            ))}
          </select>
        </label>
        <label className="create-field inline-field">
          <span>음성 모드</span>
          <select
            value={selectedTtsMode}
            disabled={busy}
            onChange={(event) => onTtsModeChange(event.target.value as TtsMode)}
          >
            {TTS_MODES.map((mode) => (
              <option value={mode} key={mode}>
                {TTS_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {clip ? (
        <p className="create-note muted">
          클립 #{clip.id}
          {clip.output_path ? " · 미리보기 준비됨" : " · 적용 시 클립을 생성합니다"}
        </p>
      ) : (
        <p className="create-note muted">적용 시 선택한 초안으로 클립을 만듭니다.</p>
      )}

      <div className="flow-step-actions">
        <button className="ghost-button" type="button" disabled={busy} onClick={onBackToDrafts}>
          ← 다른 초안
        </button>
        <button className="ghost-button" type="button" disabled={busy} onClick={onOpenDetailed}>
          세부 편집
        </button>
        <button
          className="cta-button flow-primary-cta"
          type="button"
          disabled={busy || subtitling || narrating}
          onClick={onApply}
        >
          {busy || subtitling || narrating ? "적용 중…" : "이 설정으로 만들기"}
        </button>
      </div>
    </section>
  );
}
