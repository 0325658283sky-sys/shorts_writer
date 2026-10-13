import type { ProjectListItem } from "../lib/projectAdapters";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  NARRATION_LANGUAGE_LABELS,
  NARRATION_LANGUAGES,
  SCRIPT_MODEL_LABELS,
  SCRIPT_MODELS,
  TARGET_LENGTH_LABELS,
  TARGET_LENGTHS,
  YOUTUBE_LENGTH_BAND_LABELS,
  YOUTUBE_LENGTH_BANDS,
  YOUTUBE_SHORTS_COUNTS,
  type YoutubeLengthBand,
} from "../constants";
import type {
  CreditQuote,
  NarrationLanguage,
  ScriptModel,
  SubtitleStyle,
  TargetLength,
  Usage,
  VisualStyleSlug,
} from "../types";
import { authorizedRequest } from "../api/client";
import { formatBytes } from "../utils/format";
import { type YoutubePreview } from "./YoutubeConfirmStep";

export type CreateSource = "blog" | "product" | "youtube" | "mp4";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const SOURCE_BADGE: Record<CreateSource, string> = {
  blog: "블로그 글",
  product: "상품 페이지",
  youtube: "유튜브",
  mp4: "MP4 파일",
};

/** URL 패턴으로 소스 종류를 추론한다(백엔드가 블로그/상품을 최종 판별). */
export function detectSource(value: string): CreateSource | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (/youtube\.com|youtu\.be/.test(v)) return "youtube";
  // Only what the backend can actually scrape (product_service.is_supported_product_url).
  // Claiming a source we then reject with a 400 is worse than not claiming it.
  if (/amazon\.|amzn\.|smartstore\.naver\.|brand\.naver\.|smartstore\.|m\.smartstore\./.test(v)) return "product";
  if (/^https?:\/\//.test(v) || /\.[a-z]{2,}(\/|$)/.test(v)) return "blog";
  return null;
}

/** 홈 아래쪽 안내 카드. 누르면 입력에 들어간다(MP4만 파일 선택창). */
const SOURCE_EXAMPLES: { kind: CreateSource; sample: string; note: string }[] = [
  { kind: "youtube", sample: "youtube.com/watch?v=…", note: "최대 120분" },
  { kind: "blog", sample: "blog.naver.com/…", note: "본문과 사진으로 만듭니다" },
  { kind: "product", sample: "smartstore.naver.com/…", note: "상품 소개 숏폼" },
  { kind: "mp4", sample: "interview_final.mp4", note: "끌어다 놓아도 됩니다" },
];

export function CreateStudio({
  source,
  onSourceChange,
  blogUrl,
  blogSubtitleStyle,
  blogTargetLength,
  blogNarrationLanguage,
  blogScriptModel,
  isCreatingBlogShort,
  youtubeUrl,
  isImportingYoutube,
  selectedFile,
  isUploading,
  onBlogUrlChange,
  onBlogSubtitleStyleChange,
  onBlogTargetLengthChange,
  onBlogNarrationLanguageChange,
  onBlogScriptModelChange,
  onCreateBlogShort,
  onYoutubeUrlChange,
  onStartYoutube,
  onAutoPreviewYoutube,
  onSelectedFileChange,
  onUpload,
  isPreviewingYoutube = false,
  youtubePreview = null,
  onCancelYoutubePreview,
  onConfirmYoutubeImport,
  onToastMessage,
  youtubeShortsCount = 2,
  youtubeLengthBand = "medium",
  onYoutubeShortsCountChange,
  onYoutubeLengthBandChange,
  usage = null,
  recentItems = [],
  onGoToProjects,
  message = "",
}: {
  source: CreateSource;
  onSourceChange: (source: CreateSource) => void;
  blogUrl: string;
  blogSubtitleStyle: SubtitleStyle;
  blogTargetLength: TargetLength;
  blogNarrationLanguage: NarrationLanguage;
  blogScriptModel: ScriptModel;
  isCreatingBlogShort: boolean;
  youtubeUrl: string;
  isImportingYoutube: boolean;
  isPreviewingYoutube?: boolean;
  selectedFile: File | null;
  isUploading: boolean;
  onBlogUrlChange: (value: string) => void;
  onBlogSubtitleStyleChange: (value: SubtitleStyle) => void;
  onBlogTargetLengthChange: (value: TargetLength) => void;
  onBlogNarrationLanguageChange: (value: NarrationLanguage) => void;
  onBlogScriptModelChange: (value: ScriptModel) => void;
  onCreateBlogShort: (event: FormEvent<HTMLFormElement>) => void;
  onYoutubeUrlChange: (value: string) => void;
  /** Converts in one press. Fetches the preview itself if it is not in yet. */
  onStartYoutube: (url: string) => void;
  /** Recognition only, called while the user types. No side effects on screen. */
  onAutoPreviewYoutube?: (url: string) => void;
  onSelectedFileChange: (file: File | null) => void;
  onUpload: (event: FormEvent<HTMLFormElement>) => void;
  youtubePreview?: YoutubePreview | null;
  onCancelYoutubePreview?: () => void;
  onConfirmYoutubeImport?: (visualStyle: VisualStyleSlug | string) => void;
  onToastMessage?: (message: string) => void;
  youtubeShortsCount?: number;
  youtubeLengthBand?: YoutubeLengthBand;
  onYoutubeShortsCountChange?: (value: number) => void;
  onYoutubeLengthBandChange?: (value: YoutubeLengthBand) => void;
  usage?: Usage | null;
  /** 홈의 "이어서 작업하기" — 최근 프로젝트. */
  recentItems?: ProjectListItem[];
  onGoToProjects?: () => void;
  /** 방금 한 일의 결과(오류 포함). 변환 버튼 바로 아래에 보여준다. */
  message?: string;
}) {
  const [url, setUrl] = useState(() => youtubeUrl || blogUrl || "");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = isCreatingBlogShort || isImportingYoutube || isUploading || isPreviewingYoutube;

  // What this source costs, quoted from its length. Only video sources have a
  // length to quote; a blog or product page is not priced by duration.
  const [quote, setQuote] = useState<CreditQuote | null>(null);
  const quotedSeconds = youtubePreview?.duration_seconds ?? null;

  useEffect(() => {
    if (quotedSeconds == null) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    authorizedRequest<CreditQuote>(`/videos/credit-quote?duration_seconds=${quotedSeconds}`)
      .then((loaded) => {
        if (!cancelled) setQuote(loaded);
      })
      .catch(() => {
        // No quote shown rather than a wrong one. The conversion still works;
        // the charge is decided server-side either way.
        if (!cancelled) setQuote(null);
      });
    return () => {
      cancelled = true;
    };
  }, [quotedSeconds]);
  const detected = detectSource(url) ?? (source === "mp4" ? "mp4" : source);
  const isVideoKind = detected === "youtube" || detected === "mp4";
  const isMp4 = detected === "mp4" && selectedFile != null;

  function syncUrl(next: string) {
    setUrl(next);
    const kind = detectSource(next);
    if (kind === "youtube") {
      onYoutubeUrlChange(next);
      onBlogUrlChange("");
    } else {
      onBlogUrlChange(next);
      onYoutubeUrlChange("");
    }
    if (kind && kind !== source) {
      if (kind !== "youtube" && youtubePreview) onCancelYoutubePreview?.();
      onSourceChange(kind);
    }
  }

  // Recognise a pasted video link without making the user press anything.
  // Debounced because a URL arrives one keystroke at a time when typed.
  useEffect(() => {
    const trimmed = url.trim();
    if (!onAutoPreviewYoutube) return;
    if (detectSource(trimmed) !== "youtube") return;
    if (youtubePreview?.url === trimmed) return;
    const timer = window.setTimeout(() => onAutoPreviewYoutube(trimmed), 600);
    return () => window.clearTimeout(timer);
    // onAutoPreviewYoutube is a stable handler on App; re-running on its
    // identity would re-fire the fetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, youtubePreview?.url]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const kind = detectSource(url) ?? source;
    if (kind === "youtube") {
      event.preventDefault();
      onStartYoutube(url);
    } else {
      onCreateBlogShort(event);
    }
  }

  function acceptFile(file: File | null) {
    if (!file) return;
    const looksMp4 = /\.mp4$/i.test(file.name) || file.type === "video/mp4";
    if (!looksMp4) {
      onToastMessage?.("MP4 파일만 올릴 수 있어요.");
      return;
    }
    onSourceChange("mp4");
    onSelectedFileChange(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    acceptFile(event.dataTransfer?.files?.[0] ?? null);
  }

  // 길이 칩 — 영상 소스는 밴드, 글 소스는 target_length
  const lengthChips = isVideoKind
    ? YOUTUBE_LENGTH_BANDS.map((band) => ({
        key: band,
        label: YOUTUBE_LENGTH_BAND_LABELS[band],
        active: youtubeLengthBand === band,
        onPick: () => onYoutubeLengthBandChange?.(band),
      }))
    : TARGET_LENGTHS.map((length) => ({
        key: length,
        label: TARGET_LENGTH_LABELS[length],
        active: blogTargetLength === length,
        onPick: () => onBlogTargetLengthChange(length),
      }));

  const activeLengthLabel = lengthChips.find((chip) => chip.active)?.label ?? "길이 자동";

  const creditRemaining = isVideoKind
    ? usage?.remaining
    : usage?.shorts_remaining ?? usage?.remaining;

  const primaryLabel = isMp4
    ? isUploading
      ? "업로드 중…"
      : "클립 만들기"
    : detected === "youtube"
      ? isPreviewingYoutube
        ? "확인 중…"
        : isImportingYoutube
          ? "가져오는 중…"
          : quote?.credits
            ? `${quote.credits} 크레딧으로 변환하기`
            : "쇼츠 만들기"
      : isCreatingBlogShort
        ? "생성 중…"
        : "쇼츠 만들기";

  return (
    <section className="create-studio" aria-label="쇼츠 만들기">
      {/* 어두운 작업대 — 넣고 누르는 것만 들어간다 (FLOW_REDESIGN §7) */}
      <div className="create-workbench" data-surface="dark">
      <div className="create-workbench-inner">
      <div className="create-studio-copy">
        <p className="create-kicker">새 프로젝트</p>
        <h2>링크 하나로 쇼츠 만들기</h2>
        <p className="create-lead">
          유튜브·블로그 글·상품 페이지 링크를 붙여넣거나 MP4 파일을 끌어다 놓으면 종류를 알아서 인식합니다.
        </p>
      </div>

          {isMp4 ? (
            <form className="create-mp4-row" onSubmit={onUpload}>
              <div className="create-mp4-file">
                <span className="create-source-badge">MP4 파일</span>
                <span className="create-mp4-name">
                  {selectedFile?.name} ({selectedFile ? formatBytes(selectedFile.size) : ""})
                </span>
                <button
                  type="button"
                  className="btn-ghost create-mp4-clear"
                  onClick={() => onSelectedFileChange(null)}
                >
                  다른 파일
                </button>
              </div>
              <button className="btn-primary btn-lg" type="submit" disabled={busy || !selectedFile}>
                {primaryLabel}
              </button>
            </form>
          ) : (
            <form id="create-url-form" className="create-input-row" onSubmit={handleSubmit}>
              <div
                className={`create-input-shell${dragOver ? " is-dragover" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {detectSource(url) ? (
                  <span className="create-source-badge">{SOURCE_BADGE[detected]}</span>
                ) : null}
                <input
                  type="text"
                  className="create-single-input"
                  value={url}
                  onChange={(event) => syncUrl(event.target.value)}
                  placeholder="youtube.com/… · blog.naver.com/… · smartstore.naver.com/… · MP4 끌어다 놓기"
                  aria-label="소스 URL"
                  required
                />
              </div>
              <button type="button" className="create-file-btn" onClick={() => fileInputRef.current?.click()}>
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M10 13.5V4M6.5 7.5 10 4l3.5 3.5" />
                  <path d="M4 13.5V16h12v-2.5" />
                </svg>
                파일
              </button>
            </form>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,.mp4"
            hidden
            onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
          />

          {detected === "youtube" && youtubePreview ? (
            <div className="create-detected-card">
              <span className="create-detected-thumb create-detected-thumb-img">
                {youtubePreview.thumbnail_url ? (
                  <img src={youtubePreview.thumbnail_url} alt="" />
                ) : null}
              </span>
              <div className="create-detected-body">
                <p className="create-detected-check">✓ 유튜브로 인식됨</p>
                <p className="create-detected-title">{youtubePreview.title}</p>
                <p className="create-detected-note">
                  {[youtubePreview.channel, formatDuration(youtubePreview.duration_seconds)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          ) : null}

          {detected !== "youtube" && detectSource(url) ? (
            <div className="create-detected-card">
              <span className="create-detected-thumb" aria-hidden="true" />
              <div className="create-detected-body">
                <p className="create-detected-check">✓ {SOURCE_BADGE[detected]}로 인식됨</p>
                {detected === "blog" ? (
                  <p className="create-detected-note">사진이 3장보다 적은 글은 만들 수 없어요</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {quote && !quote.supported ? (
            <p className="error-text create-too-long">{quote.reason}</p>
          ) : null}

          <details className="create-advanced">
            <summary>
              옵션
              <span className="create-advanced-summary">
                {isVideoKind
                  ? `${activeLengthLabel} · 쇼츠 ${youtubeShortsCount}편`
                  : `${activeLengthLabel} · ${NARRATION_LANGUAGE_LABELS[blogNarrationLanguage]} · ${SCRIPT_MODEL_LABELS[blogScriptModel]}`}
              </span>
            </summary>
            <div className="create-chip-group create-option-lengths">
              <span className="create-chip-label">길이</span>
              <div className="create-chip-row">
                {lengthChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    className={`create-chip${chip.active ? " is-active" : ""}`}
                    onClick={chip.onPick}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="create-options" aria-label="생성 옵션">
              {isVideoKind ? (
                <label className="create-field inline-field">
                  <span>생성 개수</span>
                  <select
                    value={youtubeShortsCount}
                    onChange={(event) => onYoutubeShortsCountChange?.(Number(event.target.value))}
                  >
                    {YOUTUBE_SHORTS_COUNTS.map((count) => (
                      <option value={count} key={count}>
                        {count}편
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="create-field inline-field">
                    <span>나레이션 언어</span>
                    <select
                      value={blogNarrationLanguage}
                      onChange={(event) => onBlogNarrationLanguageChange(event.target.value as NarrationLanguage)}
                    >
                      {NARRATION_LANGUAGES.map((language) => (
                        <option value={language} key={language}>
                          {NARRATION_LANGUAGE_LABELS[language]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="create-field inline-field">
                    <span>훅 대본 모델</span>
                    <select
                      value={blogScriptModel}
                      onChange={(event) => onBlogScriptModelChange(event.target.value as ScriptModel)}
                    >
                      {SCRIPT_MODELS.map((model) => (
                        <option value={model} key={model}>
                          {SCRIPT_MODEL_LABELS[model]}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </details>

          {!isMp4 ? (
            <div className="create-convert-row">
              <span className="create-convert-note">
                {quote?.tier_label ? `${quote.tier_label} 구간 · 클립이 몇 개 나와도 비용은 같아요` : "링크를 넣으면 비용을 알려드려요"}
                {creditRemaining != null ? ` · ${creditRemaining}회 남음` : ""}
              </span>
              <button
                className="create-convert-btn"
                type="submit"
                form="create-url-form"
                disabled={busy || !url.trim() || quote?.supported === false}
              >
                {primaryLabel}
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 10h11M11 6l4 4-4 4" />
                </svg>
              </button>
            </div>
          ) : null}

          {message ? (
            <p className="create-message" role="status" aria-live="polite">
              {message}
            </p>
          ) : null}

      </div>
      </div>

      {/* 밝은 영역 — 읽는 것들 */}
      <div className="create-studio-guide">
        <h3>이런 걸 넣을 수 있어요</h3>
        <p className="create-note">눌러서 바로 넣어볼 수 있습니다.</p>
        <div className="create-source-guide">
          {SOURCE_EXAMPLES.map((example) => (
            <button
              key={example.kind}
              type="button"
              className="create-source-card"
              onClick={() => (example.kind === "mp4" ? fileInputRef.current?.click() : syncUrl(example.sample))}
            >
              <span className="create-source-card-name">{SOURCE_BADGE[example.kind]}</span>
              <span className="create-source-card-sample">{example.sample}</span>
              <span className="create-source-card-note">{example.note}</span>
            </button>
          ))}
        </div>
      </div>

      {recentItems.length > 0 ? (
        <div className="create-recent">
          <div className="create-recent-head">
            <h3>이어서 작업하기</h3>
            <span className="create-recent-grow" />
            {onGoToProjects ? (
              <button type="button" className="create-recent-all" onClick={onGoToProjects}>
                전체 보기
              </button>
            ) : null}
          </div>
          <div className="create-recent-list">
            {recentItems.map((item) => (
              <button key={item.key} type="button" className="create-recent-card" onClick={onGoToProjects}>
                <span className="create-recent-copy">
                  <span className="create-recent-title">{item.title}</span>
                  <span className={`create-recent-state ${item.bucket === "done" ? "is-done" : "is-running"}`}>
                    {item.bucket === "done" && item.shortsCount > 0
                      ? `클립 ${item.shortsCount}개`
                      : item.progressLabel || item.statusLabel}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

    </section>
  );
}
