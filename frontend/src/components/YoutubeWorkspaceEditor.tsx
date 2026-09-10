import { useEffect, useMemo, useRef, useState } from "react";
import { authorizedBlob, authorizedRequest } from "../api/client";
import {
  SUBTITLE_STYLE_LABELS,
  SUBTITLE_STYLES,
  TTS_MODE_LABELS,
  TTS_MODES,
} from "../constants";
import { normalizeVisualStyleSlug } from "../lib/blogShortsProps";
import type { Clip, ClipMetadata, Highlight, SubtitleStyle, TtsMode, VisualStyle } from "../types";
import { formatTime } from "../utils/format";
import { MetadataBox } from "./MetadataBox";

function channelInitial(channel: string | null | undefined): string {
  const name = (channel || "YT").trim();
  return name.slice(0, 1).toUpperCase() || "Y";
}

function hookLines(
  highlight: Highlight | null,
  videoTitle: string,
): { title: string; subtitle: string } {
  const raw = (highlight?.title || videoTitle).trim();
  if (raw.includes("\n")) {
    const [first, ...rest] = raw.split("\n").map((part) => part.trim()).filter(Boolean);
    return { title: first || videoTitle, subtitle: rest.join(" ") || "하이라이트 구간" };
  }
  const reason = (highlight?.reason || "").trim();
  if (reason) {
    return {
      title: raw.length > 22 ? `${raw.slice(0, 20)}…` : raw,
      subtitle: reason.length > 24 ? `${reason.slice(0, 22)}…` : reason,
    };
  }
  if (raw.length > 20) {
    return { title: raw.slice(0, 12), subtitle: raw.slice(12, 34) };
  }
  return { title: raw, subtitle: "하이라이트 쇼츠" };
}

function captionLine(highlight: Highlight | null, clip: Clip | null, videoTitle: string): string {
  if (clip?.narration_script?.trim()) {
    const line = clip.narration_script.trim().split(/[\n.。!?]/)[0]?.trim() || "";
    if (line) return line.slice(0, 28);
  }
  if (highlight?.title) return highlight.title.slice(0, 28);
  return videoTitle.slice(0, 28);
}

function YtProfileFrame({
  titleLine,
  subtitleLine,
  caption,
  channel,
  channelAvatarUrl,
  videoTitle,
  mediaUrl,
  mediaPoster,
  showControls,
  compact,
  durationLabel,
}: {
  titleLine: string;
  subtitleLine: string;
  caption: string;
  channel: string | null;
  channelAvatarUrl: string | null;
  videoTitle: string;
  mediaUrl: string | null;
  mediaPoster?: string | null;
  showControls?: boolean;
  compact?: boolean;
  durationLabel?: string | null;
}) {
  return (
    <div className={`yt-profile-frame ${compact ? "is-compact" : ""}`}>
      <div className="yt-profile-header">
        <p className="yt-profile-title">{titleLine}</p>
        <p className="yt-profile-subtitle">{subtitleLine}</p>
      </div>

      <div className="yt-profile-video-band">
        {mediaPoster || mediaUrl ? (
          <div
            className="yt-profile-blur"
            style={{
              backgroundImage: `url(${mediaPoster || ""})`,
            }}
            aria-hidden
          >
            {mediaUrl && !compact ? (
              <video className="yt-profile-blur-video" src={mediaUrl} muted playsInline aria-hidden />
            ) : mediaPoster ? (
              <img src={mediaPoster} alt="" />
            ) : null}
          </div>
        ) : (
          <div className="yt-profile-blur yt-profile-blur-empty" aria-hidden />
        )}

        <div className="yt-profile-video-main">
          {mediaUrl && !compact ? (
            <video
              className="yt-profile-video"
              src={mediaUrl}
              controls={showControls}
              playsInline
              poster={mediaPoster || undefined}
            />
          ) : mediaPoster ? (
            <img className="yt-profile-video-still" src={mediaPoster} alt="" />
          ) : (
            <div className="yt-profile-video-empty" />
          )}
          <div className="yt-profile-caption">{caption}</div>
        </div>
      </div>

      <div className="yt-profile-footer">
        <div className="yt-profile-channel">
          {channelAvatarUrl ? (
            <img className="yt-profile-avatar" src={channelAvatarUrl} alt="" />
          ) : (
            <span className="yt-profile-avatar yt-profile-avatar-fallback" aria-hidden>
              {channelInitial(channel)}
            </span>
          )}
          <strong>{channel || "YouTube"}</strong>
        </div>
        <p className="yt-profile-video-title">{videoTitle}</p>
      </div>

      {durationLabel ? <span className="yt-profile-duration">{durationLabel}</span> : null}
    </div>
  );
}

export function YoutubeWorkspaceEditor({
  clips,
  highlights,
  selectedClipId,
  videoTitle,
  channel,
  channelAvatarUrl,
  visualStyleSlug,
  metadata,
  copiedKey,
  selectedStyle,
  selectedTtsMode,
  downloadingClipId,
  generatingMetadataId,
  narratingClipId,
  subtitlingClipId,
  onSelectClip,
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
  clips: Clip[];
  highlights: Highlight[];
  selectedClipId: number;
  videoTitle: string;
  channel: string | null;
  channelAvatarUrl?: string | null;
  visualStyleSlug?: string | null;
  metadata?: ClipMetadata;
  copiedKey: string | null;
  selectedStyle: SubtitleStyle;
  selectedTtsMode: TtsMode;
  downloadingClipId: number | null;
  generatingMetadataId: number | null;
  narratingClipId: number | null;
  subtitlingClipId: number | null;
  onSelectClip: (clipId: number) => void;
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
  const clip = clips.find((item) => item.id === selectedClipId) ?? clips[0] ?? null;
  const highlight =
    clip == null ? null : highlights.find((item) => item.id === clip.highlight_id) ?? null;

  const [styleMeta, setStyleMeta] = useState<VisualStyle | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});
  const [sideTab, setSideTab] = useState<"screen" | "voice" | "motion">("screen");
  const urlRef = useRef<string | null>(null);
  const thumbRefs = useRef<Record<number, string>>({});

  const previewKey = clip
    ? `${clip.id}:${clip.updated_at}:${clip.subtitled_output_path ?? ""}:${clip.narrated_output_path ?? ""}`
    : "none";

  const styleSlug = normalizeVisualStyleSlug(visualStyleSlug || "yt_profile");
  const isYtProfile = styleSlug === "yt_profile" || styleMeta?.header === "yt_profile";

  useEffect(() => {
    let cancelled = false;
    authorizedRequest<VisualStyle[]>("/visual-styles")
      .then((list) => {
        if (cancelled) return;
        setStyleMeta(list.find((item) => item.slug === styleSlug) ?? list[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setStyleMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [styleSlug]);

  useEffect(() => {
    if (!clip) return;
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
  }, [previewKey, clip?.id]);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      Object.values(thumbRefs.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    clips.forEach((item) => {
      if (thumbRefs.current[item.id]) return;
      authorizedBlob(`/videos/${item.video_id}/highlights/${item.highlight_id}/thumbnail`)
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          thumbRefs.current[item.id] = url;
          setThumbUrls((current) => ({ ...current, [item.id]: url }));
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [clips]);

  const lines = useMemo(() => hookLines(highlight, videoTitle), [highlight, videoTitle]);
  const caption = useMemo(() => captionLine(highlight, clip, videoTitle), [highlight, clip, videoTitle]);

  async function handleRender() {
    if (!clip) return;
    setRendering(true);
    try {
      const updated = await onBurnSubtitles(clip, selectedStyle);
      if (updated) onMessage("템플릿·자막을 적용해 다운로드 파일을 갱신했습니다.");
    } finally {
      setRendering(false);
    }
  }

  if (!clip) {
    return (
      <div className="board-editor">
        <p className="form-message">생성된 쇼츠가 없습니다.</p>
        <button className="primary-button" type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    );
  }

  const hasOutput = Boolean(
    clip.templated_output_path || clip.output_path || clip.subtitled_output_path || clip.narrated_output_path,
  );
  const layout = styleMeta?.layout ?? "letterbox";
  const captionMode = styleMeta?.caption ?? "black_box";
  const canvasBg = styleMeta?.canvasBg ?? "#1B2838";
  const selectedThumb = thumbUrls[clip.id] ?? null;

  return (
    <div className="board-editor yt-workspace" role="dialog" aria-modal="true" aria-label="쇼츠 세부 편집">
      <header className="board-editor-header">
        <div>
          <p className="eyebrow">쇼츠 편집</p>
          <h2>{videoTitle}</h2>
          <span className="muted">
            {clips.length}개 · {styleMeta?.label ?? "템플릿"} · {channel || "YouTube"}
          </span>
        </div>
        <div className="board-editor-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => void handleRender()}
            disabled={!hasOutput || rendering || subtitlingClipId === clip.id}
          >
            {rendering || subtitlingClipId === clip.id ? "렌더링 중…" : "렌더"}
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={downloadingClipId === clip.id || !hasOutput}
            onClick={() => onDownloadClip(clip)}
          >
            {downloadingClipId === clip.id ? "다운로드 중…" : "다운로드"}
          </button>
          <button className="primary-button" type="button" onClick={onClose}>
            완료
          </button>
        </div>
      </header>

      <div className="board-editor-layout yt-workspace-layout">
        <aside className="yt-workspace-list" aria-label="생성된 쇼츠 목록">
          <div className="yt-workspace-list-head">
            <strong>생성된 쇼츠 ({clips.length})</strong>
            <span className="yt-workspace-sort">타임라인순 ⌵</span>
          </div>
          <ul className="yt-workspace-cards">
            {clips.map((item) => {
              const itemHighlight = highlights.find((h) => h.id === item.highlight_id);
              const selected = item.id === clip.id;
              const itemLines = hookLines(itemHighlight ?? null, videoTitle);
              const itemCaption = captionLine(itemHighlight ?? null, item, videoTitle);
              const duration = itemHighlight
                ? formatTime(Math.max(0, itemHighlight.end_time - itemHighlight.start_time))
                : null;
              return (
                <li key={item.id}>
                  <div className={`yt-workspace-card ${selected ? "is-selected" : ""}`}>
                    <button
                      type="button"
                      className="yt-workspace-card-main"
                      onClick={() => onSelectClip(item.id)}
                    >
                      <div className="yt-workspace-card-preview">
                        <YtProfileFrame
                          compact
                          titleLine={itemLines.title}
                          subtitleLine={itemLines.subtitle}
                          caption={itemCaption}
                          channel={channel}
                          channelAvatarUrl={channelAvatarUrl ?? null}
                          videoTitle={videoTitle}
                          mediaUrl={null}
                          mediaPoster={thumbUrls[item.id] ?? null}
                          durationLabel={duration}
                        />
                      </div>
                      <div className="yt-workspace-card-body">
                        <span className="yt-workspace-card-status">하이라이트 훅 ✓</span>
                        <strong>{itemHighlight?.title ?? `쇼츠 #${item.id}`}</strong>
                      </div>
                    </button>
                    <div className="yt-workspace-card-actions">
                      <button
                        className="yt-action-btn yt-action-download"
                        type="button"
                        disabled={downloadingClipId === item.id}
                        onClick={() => onDownloadClip(item)}
                      >
                        {downloadingClipId === item.id ? "…" : "다운로드"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="yt-workspace-preview" aria-label="쇼츠 미리보기">
          {isYtProfile ? (
            <div className="yt-profile-phone" style={{ background: canvasBg }}>
              {loadingPreview ? <p className="yt-profile-loading muted">미리보기 불러오는 중…</p> : null}
              {previewError ? <p className="error-text">{previewError}</p> : null}
              <YtProfileFrame
                titleLine={lines.title}
                subtitleLine={lines.subtitle}
                caption={caption}
                channel={channel}
                channelAvatarUrl={channelAvatarUrl ?? null}
                videoTitle={videoTitle}
                mediaUrl={previewUrl}
                mediaPoster={selectedThumb}
                showControls
              />
            </div>
          ) : (
            <div
              className={`yt-ws-phone layout-${layout} caption-${captionMode}`}
              style={{ background: canvasBg }}
            >
              <div className="yt-ws-stage">
                <div className="yt-ws-hook" style={{ color: styleMeta?.titleColor || "#fff" }}>
                  <p>{lines.title}</p>
                  <p className="yt-ws-hook-sub" style={{ color: styleMeta?.accent || "#FFE566" }}>
                    {lines.subtitle}
                  </p>
                </div>
                <div className="yt-ws-media">
                  {loadingPreview ? <p className="muted">미리보기 불러오는 중…</p> : null}
                  {previewError ? <p className="error-text">{previewError}</p> : null}
                  {previewUrl ? <video className="yt-ws-video" src={previewUrl} controls playsInline /> : null}
                  <div className={`yt-ws-caption caption-${captionMode}`}>{caption}</div>
                </div>
                <div className="yt-ws-profile">
                  {channelAvatarUrl ? (
                    <img className="yt-ws-avatar-img" src={channelAvatarUrl} alt="" />
                  ) : (
                    <span className="yt-ws-avatar" aria-hidden>
                      {channelInitial(channel)}
                    </span>
                  )}
                  <div className="yt-ws-profile-copy">
                    <strong>{channel || "YouTube"}</strong>
                    <span>{videoTitle}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="media-panel yt-workspace-side" aria-label="쇼츠 설정">
          <div className="media-tabs" role="tablist">
            {(
              [
                ["screen", "화면"],
                ["voice", "음성"],
                ["motion", "모션"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={`media-tab ${sideTab === id ? "active" : ""}`}
                type="button"
                role="tab"
                aria-selected={sideTab === id}
                onClick={() => setSideTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {sideTab === "screen" ? (
            <div className="media-tab-body">
              <p className="create-note">자막 스타일을 고른 뒤 헤더의 렌더로 파일을 갱신합니다.</p>
              <label className="create-field inline-field">
                <span>자막 스타일</span>
                <select
                  value={selectedStyle}
                  onChange={(event) => onStyleChange(clip.id, event.target.value as SubtitleStyle)}
                >
                  {SUBTITLE_STYLES.map((style) => (
                    <option value={style} key={style}>
                      {SUBTITLE_STYLE_LABELS[style]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="small-button metadata-button"
                type="button"
                disabled={generatingMetadataId === clip.id || Boolean(metadata)}
                onClick={() => void onGenerateMetadata(clip)}
              >
                {generatingMetadataId === clip.id ? "작성 중…" : metadata ? "메타데이터 준비됨" : "메타데이터 생성"}
              </button>
              {metadata ? (
                <MetadataBox
                  copiedKey={copiedKey}
                  idPrefix={`yt-ws-${metadata.id}`}
                  titleCandidates={metadata.title_candidates}
                  description={metadata.description}
                  hashtags={metadata.hashtags}
                  onCopyText={onCopyText}
                />
              ) : null}
            </div>
          ) : null}

          {sideTab === "voice" ? (
            <div className="media-tab-body">
              <label className="create-field inline-field">
                <span>음성 모드</span>
                <select
                  value={selectedTtsMode}
                  onChange={(event) => onTtsModeChange(clip.id, event.target.value as TtsMode)}
                >
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
            </div>
          ) : null}

          {sideTab === "motion" ? (
            <div className="media-tab-body">
              {highlight ? (
                <p className="create-note">
                  원본 구간 {formatTime(highlight.start_time)}–{formatTime(highlight.end_time)}
                </p>
              ) : (
                <p className="muted">하이라이트 구간 정보가 없습니다.</p>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
