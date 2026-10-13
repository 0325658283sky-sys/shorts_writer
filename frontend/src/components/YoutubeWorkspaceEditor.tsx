import { useEffect, useMemo, useRef, useState } from "react";
import { authorizedBlob, authorizedRequest } from "../api/client";
import { TTS_MODE_LABELS, TTS_MODES } from "../constants";
import type { Clip, ClipMetadata, Highlight, SubtitleStyle, TtsMode, Usage } from "../types";
import { CreditMeter } from "./CreditMeter";
import { MetadataBox } from "./MetadataBox";
import { ScoreBadge } from "./ScoreBadge";
import { TemplateTuner } from "./TemplateTuner";

/**
 * 결과 화면 — 목업 Results.dc.html ("7. 결과 목록").
 * 왼쪽 클립 목록(점수순) · 가운데 실제 결과 영상 · 오른쪽 템플릿 바꾸기 / 왜 이 클립인가 / 업로드 정보.
 * 밝은 화면(관리 화면)이다. 가운데 영상은 서버가 렌더한 결과 그대로이며, 화면에서 따로 그린 흉내 틀을 씌우지 않는다.
 */

type TemplateOverrides = Record<string, string>;

type SwapTemplate = {
  slug: string;
  name: string;
  genre: string;
  motion: string;
  canvasBg: string;
  titleColor: string;
  accent: string;
  capColor: string;
  capBg: string;
};

type VideoTemplateList = {
  schemaVersion: number;
  defaultSlug: string;
  templates: Array<{
    slug: string;
    name: string;
    genre: string;
    caption?: {
      motion?: string;
      highlightColor?: string;
      color?: string;
      background?: { enabled?: boolean; color?: string };
    };
    layout?: { canvasBg?: string };
    title?: { color?: string };
  }>;
};

function mmss(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** 파일명으로 대체된 제목에서 "YouTube - " 와 ".mp4" 를 걷어낸다. */
function cleanTitle(title: string): string {
  return title.replace(/^YouTube - /, "").replace(/\.mp4$/i, "");
}

export function YoutubeWorkspaceEditor({
  clips,
  highlights,
  selectedClipId,
  videoTitle,
  visualStyleSlug,
  metadata,
  copiedKey,
  selectedTtsMode,
  downloadingClipId,
  generatingMetadataId,
  narratingClipId,
  subtitlingClipId,
  onSelectClip,
  onClose,
  onApplyNarration,
  onGenerateMetadata,
  onDownloadClip,
  onCopyText,
  onTtsModeChange,
  onSwapTemplate,
  swappingTemplate = false,
  templateOverrides = {},
  onTemplateOverridesChange,
  genreJudgement,
  onReanalyze,
  reanalyzing = false,
  reanalyzeCost = 1,
  usage,
  onMessage,
}: {
  clips: Clip[];
  highlights: Highlight[];
  selectedClipId: number;
  videoTitle: string;
  channel?: string | null;
  channelAvatarUrl?: string | null;
  visualStyleSlug?: string | null;
  metadata?: ClipMetadata;
  copiedKey: string | null;
  selectedStyle?: SubtitleStyle;
  selectedTtsMode: TtsMode;
  downloadingClipId: number | null;
  generatingMetadataId: number | null;
  narratingClipId: number | null;
  subtitlingClipId: number | null;
  onSelectClip: (clipId: number) => void;
  onClose: () => void;
  onBurnSubtitles?: (clip: Clip, style?: SubtitleStyle) => Promise<Clip | null>;
  onApplyNarration: (clip: Clip) => void | Promise<void>;
  onGenerateMetadata: (clip: Clip) => void | Promise<void>;
  onDownloadClip: (clip: Clip) => void;
  onCopyText: (key: string, text: string) => void;
  onStyleChange?: (clipId: number, style: SubtitleStyle) => void;
  onTtsModeChange: (clipId: number, mode: TtsMode) => void;
  /** Re-renders this clip with another look. Keeps the cut, so it costs nothing. */
  onSwapTemplate?: (
    clip: Clip,
    visualStyle: string,
    overrides?: Record<string, string>,
  ) => Promise<Clip | null>;
  swappingTemplate?: boolean;
  /** The analyser's own account of what it cut and why. */
  genreJudgement?: string | null;
  /** 모양 tweaks on top of the chosen template. Free, re-render only. */
  templateOverrides?: TemplateOverrides;
  onTemplateOverridesChange?: (next: TemplateOverrides) => void;
  /** Re-cuts the video. Costs credits, so the button says so. */
  onReanalyze?: () => void;
  reanalyzing?: boolean;
  /** Printed in the label — the user should see the price before pressing. */
  reanalyzeCost?: number;
  /** 상단 바의 크레딧 미터. */
  usage?: Usage | null;
  onMessage: (message: string) => void;
}) {
  const clip = clips.find((item) => item.id === selectedClipId) ?? clips[0] ?? null;
  const highlight =
    clip == null ? null : highlights.find((item) => item.id === clip.highlight_id) ?? null;

  const [swapTemplates, setSwapTemplates] = useState<SwapTemplate[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});
  const [sortMode, setSortMode] = useState<"score" | "order">("score");
  const [applyingAll, setApplyingAll] = useState(false);
  const [tunerOpen, setTunerOpen] = useState(false);
  const urlRef = useRef<string | null>(null);
  const thumbRefs = useRef<Record<number, string>>({});

  // 지금 이 클립에 실제로 적용된 템플릿. 화면을 다시 열어도 서버 값이 맞다.
  const currentSlug = clip?.visual_style || visualStyleSlug || "";
  const [pendingSlug, setPendingSlug] = useState(currentSlug);
  useEffect(() => {
    setPendingSlug(currentSlug);
  }, [currentSlug, clip?.id]);

  const previewKey = clip
    ? `${clip.id}:${clip.updated_at}:${clip.templated_output_path ?? ""}:${clip.narrated_output_path ?? ""}`
    : "none";

  useEffect(() => {
    let cancelled = false;
    authorizedRequest<VideoTemplateList>("/video-templates")
      .then((loaded) => {
        if (cancelled) return;
        setSwapTemplates(
          loaded.templates.map((item) => ({
            slug: item.slug,
            name: item.name,
            genre: item.genre,
            motion: item.caption?.motion ?? "",
            canvasBg: item.layout?.canvasBg ?? "#16181f",
            titleColor: item.title?.color ?? "#ffffff",
            accent: item.caption?.highlightColor ?? "#f2a33c",
            capColor: item.caption?.color ?? "#ffffff",
            capBg: item.caption?.background?.enabled ? item.caption.background.color ?? "transparent" : "transparent",
          })),
        );
      })
      .catch(() => {
        // 템플릿 띠만 숨긴다. 나머지는 그대로 쓸 수 있다.
        if (!cancelled) setSwapTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const sortedClips = useMemo(() => {
    const scoreOf = (item: Clip) => highlights.find((h) => h.id === item.highlight_id)?.score ?? 0;
    const startOf = (item: Clip) => highlights.find((h) => h.id === item.highlight_id)?.start_time ?? 0;
    return [...clips].sort((a, b) =>
      sortMode === "score" ? scoreOf(b) - scoreOf(a) || startOf(a) - startOf(b) : startOf(a) - startOf(b),
    );
  }, [clips, highlights, sortMode]);

  /** 고른 템플릿을 모든 쇼츠에. 한 편씩 다시 그리므로 순서대로 돈다. */
  async function applyToAll() {
    if (!onSwapTemplate || !pendingSlug) return;
    setApplyingAll(true);
    try {
      for (const item of clips) {
        await onSwapTemplate(item, pendingSlug, templateOverrides);
      }
      onMessage(`전체 ${clips.length}개에 같은 템플릿을 적용했어요.`);
    } finally {
      setApplyingAll(false);
    }
  }

  if (!clip) {
    return (
      <div className="rs-page">
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
  const busy = swappingTemplate || applyingAll || subtitlingClipId === clip.id;
  const duration = highlight ? Math.max(0, highlight.end_time - highlight.start_time) : null;
  const selectedThumb = thumbUrls[clip.id] ?? null;
  const title = cleanTitle(videoTitle);

  return (
    <div className="rs-page" role="dialog" aria-modal="true" aria-label="결과">
      <header className="rs-topbar">
        <button className="rs-back" type="button" aria-label="프로젝트 목록으로" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M12 4 6 10l6 6" />
          </svg>
        </button>
        <h2 className="rs-topbar-title">{title}</h2>
        <span className="rs-topbar-meta ncut-num">클립 {clips.length}개</span>
        <span className="rs-grow" />
        <CreditMeter usage={usage} />
      </header>

      {genreJudgement ? (
        <div className="ws-judgement" role="status">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.2 13.2 3.3 3.3" />
          </svg>
          <p>{genreJudgement}</p>
          {onReanalyze ? (
            <button className="rs-btn rs-btn-accent-outline ws-judgement-redo" type="button" disabled={reanalyzing} onClick={onReanalyze}>
              {reanalyzing ? "다시 찾는 중…" : `다르게 다시 찾기 · ${reanalyzeCost} 크레딧`}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="rs-body">
        <aside className="rs-list" aria-label="생성된 쇼츠 목록">
          <div className="rs-list-head">
            <strong>클립 {clips.length}개</strong>
            <select
              className="rs-select"
              aria-label="정렬"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as "score" | "order")}
            >
              <option value="score">점수 높은 순</option>
              <option value="order">영상 순서</option>
            </select>
          </div>
          <ul className="rs-cards">
            {sortedClips.map((item) => {
              const itemHighlight = highlights.find((h) => h.id === item.highlight_id);
              const selected = item.id === clip.id;
              const dur = itemHighlight ? mmss(Math.max(0, itemHighlight.end_time - itemHighlight.start_time)) : null;
              const thumb = thumbUrls[item.id];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`rs-card${selected ? " is-selected" : ""}`}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelectClip(item.id)}
                  >
                    <span className="rs-card-thumb" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined} aria-hidden="true" />
                    <span className="rs-card-copy">
                      <span className="rs-card-title">{itemHighlight?.title ?? `쇼츠 #${item.id}`}</span>
                      <span className="rs-card-foot">
                        {dur ? <span className="rs-card-dur ncut-num">{dur}</span> : null}
                        {itemHighlight ? <ScoreBadge score={itemHighlight.score} /> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="rs-player" aria-label="쇼츠 미리보기">
          <div className="rs-phone">
            {highlight ? (
              <span className="rs-phone-score">
                <ScoreBadge score={highlight.score} solid />
              </span>
            ) : null}
            {duration != null ? <span className="rs-phone-dur ncut-num">{mmss(duration)}</span> : null}
            {previewUrl ? (
              <video
                key={previewKey}
                className="rs-video"
                src={previewUrl}
                poster={selectedThumb ?? undefined}
                controls
                playsInline
              />
            ) : selectedThumb ? (
              <img className="rs-video" src={selectedThumb} alt="" />
            ) : null}
            {loadingPreview && !previewUrl ? <p className="rs-phone-note">영상 불러오는 중…</p> : null}
            {previewError ? <p className="rs-phone-note is-error">{previewError}</p> : null}
            {busy ? <div className="rs-phone-busy">다시 그리는 중…</div> : null}
          </div>

          <div className="rs-actions">
            <button
              className="rs-btn rs-btn-primary"
              type="button"
              aria-pressed={tunerOpen}
              onClick={() => setTunerOpen((open) => !open)}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" />
              </svg>
              편집
            </button>
            <button
              className="rs-btn"
              type="button"
              disabled={downloadingClipId === clip.id || !hasOutput}
              onClick={() => onDownloadClip(clip)}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M10 3.5v9M6.5 9 10 12.5 13.5 9" />
                <path d="M4 14v2.5h12V14" />
              </svg>
              {downloadingClipId === clip.id ? "받는 중…" : "내려받기"}
            </button>
          </div>
        </section>

        <aside className="rs-side" aria-label="쇼츠 설정">
          {onSwapTemplate ? (
            <div className="rs-section">
              <div className="rs-section-head">
                <h2>템플릿</h2>
                <span className="rs-free">무료 · 바로 반영</span>
              </div>
              <p className="rs-note">모양만 바꾸는 거라 크레딧이 들지 않아요. 몇 번이든 바꿔보세요.</p>

              <div className="rs-tpl-strip" role="listbox" aria-label="템플릿 고르기">
                {swapTemplates.map((template) => {
                  const picked = pendingSlug === template.slug;
                  return (
                    <button
                      key={template.slug}
                      type="button"
                      role="option"
                      aria-selected={picked}
                      className={`rs-tpl${picked ? " is-picked" : ""}`}
                      onClick={() => setPendingSlug(template.slug)}
                    >
                      <span className="rs-tpl-thumb" style={{ background: template.canvasBg }}>
                        <span className="rs-tpl-title" style={{ color: template.titleColor }}>
                          {(highlight?.title ?? title).slice(0, 14)}
                        </span>
                        <span
                          className="rs-tpl-cap"
                          style={{
                            color: template.capColor,
                            background: template.capBg,
                            padding: template.capBg === "transparent" ? 0 : "1px 3px",
                          }}
                        >
                          자막
                        </span>
                      </span>
                      <span className="rs-tpl-name">{template.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="rs-scope">
                <button
                  className="rs-btn rs-btn-accent-outline"
                  type="button"
                  disabled={busy || !pendingSlug || clips.length < 2}
                  onClick={() => void applyToAll()}
                >
                  {applyingAll ? "적용 중…" : `전체 ${clips.length}개에 적용`}
                </button>
                <button
                  className="rs-btn"
                  type="button"
                  disabled={busy || !pendingSlug || pendingSlug === currentSlug}
                  onClick={() => void onSwapTemplate(clip, pendingSlug, templateOverrides)}
                >
                  이 클립만
                </button>
              </div>

              {tunerOpen ? (
                <TemplateTuner
                  baseTemplate={swapTemplates.find((item) => item.slug === (pendingSlug || currentSlug)) ?? null}
                  overrides={templateOverrides}
                  busy={swappingTemplate}
                  onChange={onTemplateOverridesChange ?? (() => {})}
                  onApply={() => void onSwapTemplate(clip, pendingSlug || currentSlug, templateOverrides)}
                  onReset={() => {
                    onTemplateOverridesChange?.({});
                    void onSwapTemplate(clip, pendingSlug || currentSlug, {});
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {highlight ? (
            <div className="rs-section rs-divided">
              <div className="rs-section-head">
                <h2>왜 이 클립인가</h2>
                <ScoreBadge score={highlight.score} />
              </div>
              <p className="rs-body-text">{highlight.reason || "분석기가 남긴 근거가 없습니다."}</p>
              <p className="rs-note ncut-num">
                원본 {mmss(highlight.start_time)}–{mmss(highlight.end_time)}
              </p>
            </div>
          ) : null}

          <div className="rs-section rs-divided">
            <div className="rs-section-head">
              <h2>업로드 정보</h2>
              <button
                className="rs-btn rs-btn-small"
                type="button"
                disabled={generatingMetadataId === clip.id || Boolean(metadata)}
                onClick={() => void onGenerateMetadata(clip)}
              >
                {generatingMetadataId === clip.id ? "작성 중…" : metadata ? "준비됨" : "만들기"}
              </button>
            </div>
            {metadata ? (
              <MetadataBox
                copiedKey={copiedKey}
                idPrefix={`yt-ws-${metadata.id}`}
                titleCandidates={metadata.title_candidates}
                description={metadata.description}
                hashtags={metadata.hashtags}
                onCopyText={onCopyText}
              />
            ) : (
              <p className="rs-note">제목·설명·해시태그를 만들어 드려요.</p>
            )}
          </div>

          <details className="rs-section rs-divided rs-more">
            <summary>음성</summary>
            <label className="rs-field">
              <span>음성 모드</span>
              <select
                className="rs-select"
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
              className="rs-btn rs-btn-small"
              type="button"
              disabled={narratingClipId === clip.id || !hasOutput}
              onClick={() => void onApplyNarration(clip)}
            >
              {narratingClipId === clip.id ? "음성 적용 중…" : "음성 적용"}
            </button>
            {clip.narration_script ? <p className="rs-note">{clip.narration_script}</p> : null}
          </details>
        </aside>
      </div>
    </div>
  );
}
