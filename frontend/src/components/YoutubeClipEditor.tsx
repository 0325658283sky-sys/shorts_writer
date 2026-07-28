import { useEffect, useRef, useState } from "react";
import { authorizedBlob } from "../api/client";
import {
  CLIP_STATUS_LABELS,
  SUBTITLE_STYLE_LABELS,
  SUBTITLE_STYLES,
  TTS_MODE_LABELS,
  TTS_MODES,
} from "../constants";
import type { Clip, ClipMetadata, Highlight, SubtitleStyle, TtsMode } from "../types";
import { formatTime } from "../utils/format";
import { MetadataBox } from "./MetadataBox";

export function YoutubeClipEditor({
  clip,
  highlight,
  videoTitle,
  metadata,
  copiedKey,
  selectedStyle,
  selectedTtsMode,
  downloadingClipId,
  generatingMetadataId,
  narratingClipId,
  subtitlingClipId,
  onClose,
  onBurnSubtitles,
  onApplyNarration,
  onGenerateMetadata,
  onDownloadClip,
  onCopyText,
  onStyleChange,
  onTtsModeChange,
  onMessage,
}: {
  clip: Clip;
  highlight: Highlight | null;
  videoTitle: string;
  metadata?: ClipMetadata;
  copiedKey: string | null;
  selectedStyle: SubtitleStyle;
  selectedTtsMode: TtsMode;
  downloadingClipId: number | null;
  generatingMetadataId: number | null;
  narratingClipId: number | null;
  subtitlingClipId: number | null;
  onClose: () => void;
  onBurnSubtitles: (clip: Clip, style?: SubtitleStyle) => Promise<Clip | null>;
  onApplyNarration: (clip: Clip) => void | Promise<void>;
  onGenerateMetadata: (clip: Clip) => void | Promise<void>;
  onDownloadClip: (clip: Clip) => void;
  onCopyText: (key: string, text: string) => void;
  onStyleChange: (clipId: number, style: SubtitleStyle) => void;
  onTtsModeChange: (clipId: number, mode: TtsMode) => void;
  onMessage: (message: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [rendering, setRendering] = useState(false);
  const urlRef = useRef<string | null>(null);
  const previewKey = `${clip.id}:${clip.updated_at}:${clip.subtitled_output_path ?? ""}:${clip.narrated_output_path ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError("");
    authorizedBlob(`/clips/${clip.id}/preview`)
      .then((blob) => {
        if (cancelled) return;
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setPreviewUrl(url);
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewUrl(null);
          setPreviewError(error instanceof Error ? error.message : "미리보기를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewKey, clip.id]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function handleRender() {
    setRendering(true);
    try {
      const updated = await onBurnSubtitles(clip, selectedStyle);
      if (updated) {
        onMessage("자막을 입혀 미리보기를 갱신했습니다.");
      }
    } finally {
      setRendering(false);
    }
  }

  const hasOutput = Boolean(clip.output_path || clip.subtitled_output_path || clip.narrated_output_path);

  return (
    <div className="board-editor" role="dialog" aria-modal="true" aria-label="유튜브 클립 세부 편집">
      <header className="board-editor-header">
        <div>
          <p className="eyebrow">세부 편집</p>
          <h2>{highlight?.title ?? videoTitle}</h2>
          <span className="muted">
            {highlight
              ? `${formatTime(highlight.start_time)}–${formatTime(highlight.end_time)} · ${highlight.content_type}`
              : videoTitle}
          </span>
        </div>
        <div className="board-editor-actions">
          <button className="ghost-button" type="button" onClick={() => void handleRender()} disabled={!hasOutput || rendering || subtitlingClipId === clip.id}>
            {rendering || subtitlingClipId === clip.id ? "렌더링 중…" : "자막 적용 · 미리보기"}
          </button>
          <button className="primary-button" type="button" onClick={onClose}>
            편집 완료
          </button>
        </div>
      </header>

      {clip.error_message ? (
        <div className="board-editor-error" role="alert">
          <p className="form-message dashboard-message">{clip.error_message}</p>
        </div>
      ) : null}
      {previewError ? (
        <div className="board-editor-error" role="alert">
          <p className="form-message dashboard-message">{previewError}</p>
        </div>
      ) : null}

      <div className="board-editor-layout yt-clip-editor-layout">
        <aside className="board-list" aria-label="클립 정보">
          <div className="board-list-header">
            <strong>클립 정보</strong>
            <span className="muted">{CLIP_STATUS_LABELS[clip.status]}</span>
          </div>
          <div className="yt-clip-info">
            <p>
              <strong>원본</strong>
              <span className="muted">{videoTitle}</span>
            </p>
            {highlight ? (
              <>
                <p>
                  <strong>하이라이트</strong>
                  <span className="muted">{highlight.title}</span>
                </p>
                <p>
                  <strong>구간</strong>
                  <span className="muted">
                    {formatTime(highlight.start_time)}–{formatTime(highlight.end_time)}
                  </span>
                </p>
                <p className="yt-clip-reason">{highlight.reason}</p>
              </>
            ) : null}
            <p>
              <strong>현재 자막</strong>
              <span className="muted">
                {clip.subtitle_style
                  ? SUBTITLE_STYLE_LABELS[clip.subtitle_style as SubtitleStyle] ?? clip.subtitle_style
                  : "미적용"}
              </span>
            </p>
            <p>
              <strong>음성</strong>
              <span className="muted">{TTS_MODE_LABELS[clip.tts_mode as TtsMode] ?? clip.tts_mode}</span>
            </p>
          </div>
        </aside>

        <section className="preview-pane yt-clip-preview-pane" aria-label="미리보기">
          <div className="preview-pane-header">
            <strong>미리보기</strong>
            <span className="muted">블로그 세부 편집과 같은 작업 화면입니다</span>
          </div>
          <div className="yt-clip-preview-stage">
            {loadingPreview ? <p className="muted">미리보기 불러오는 중…</p> : null}
            {!loadingPreview && previewUrl ? (
              <video key={previewUrl} className="yt-clip-preview-video" src={previewUrl} controls playsInline />
            ) : null}
            {!loadingPreview && !previewUrl ? <p className="muted">미리보기를 표시할 수 없습니다.</p> : null}
          </div>
        </section>

        <aside className="media-panel" aria-label="편집 패널">
          <div className="board-list-header">
            <strong>편집</strong>
            <span className="muted">자막 · 음성 · 업로드 문구</span>
          </div>

          <label className="create-field">
            <span>자막 스타일</span>
            <select value={selectedStyle} onChange={(event) => onStyleChange(clip.id, event.target.value as SubtitleStyle)}>
              {SUBTITLE_STYLES.map((style) => (
                <option value={style} key={style}>
                  {SUBTITLE_STYLE_LABELS[style]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="small-button"
            type="button"
            disabled={subtitlingClipId === clip.id || !hasOutput}
            onClick={() => void onBurnSubtitles(clip, selectedStyle)}
          >
            {subtitlingClipId === clip.id ? "자막 삽입 중…" : "자막 삽입"}
          </button>

          <label className="create-field">
            <span>음성 모드</span>
            <select value={selectedTtsMode} onChange={(event) => onTtsModeChange(clip.id, event.target.value as TtsMode)}>
              {TTS_MODES.map((mode) => (
                <option value={mode} key={mode}>
                  {TTS_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="small-button"
            type="button"
            disabled={narratingClipId === clip.id || !hasOutput}
            onClick={() => void onApplyNarration(clip)}
          >
            {narratingClipId === clip.id ? "음성 적용 중…" : "음성 적용"}
          </button>

          {clip.narration_script ? <p className="narration-script">{clip.narration_script}</p> : null}

          <button
            className="small-button"
            type="button"
            disabled={generatingMetadataId === clip.id || Boolean(metadata)}
            onClick={() => void onGenerateMetadata(clip)}
          >
            {generatingMetadataId === clip.id ? "작성 중…" : metadata ? "메타데이터 준비됨" : "메타데이터 생성"}
          </button>
          {metadata ? (
            <MetadataBox
              copiedKey={copiedKey}
              idPrefix={`yt-clip-${metadata.id}`}
              titleCandidates={metadata.title_candidates}
              description={metadata.description}
              hashtags={metadata.hashtags}
              onCopyText={onCopyText}
            />
          ) : null}

          <button
            className="cta-button"
            type="button"
            disabled={downloadingClipId === clip.id || !hasOutput}
            onClick={() => onDownloadClip(clip)}
          >
            {downloadingClipId === clip.id ? "다운로드 중…" : "다운로드"}
          </button>
        </aside>
      </div>
    </div>
  );
}
