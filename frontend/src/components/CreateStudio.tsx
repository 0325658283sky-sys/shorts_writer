import { useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  NARRATION_LANGUAGE_LABELS,
  NARRATION_LANGUAGES,
  SCRIPT_MODEL_LABELS,
  SCRIPT_MODELS,
  SUBTITLE_STYLE_LABELS,
  SUBTITLE_STYLES,
  TARGET_LENGTH_LABELS,
  TARGET_LENGTHS,
  YOUTUBE_LENGTH_BAND_LABELS,
  YOUTUBE_LENGTH_BANDS,
  YOUTUBE_SHORTS_COUNTS,
  type YoutubeLengthBand,
} from "../constants";
import type { NarrationLanguage, ScriptModel, SubtitleStyle, TargetLength, Usage, VisualStyleSlug } from "../types";
import { formatBytes } from "../utils/format";
import { YoutubeConfirmStep, type YoutubePreview } from "./YoutubeConfirmStep";

export type CreateSource = "blog" | "product" | "youtube" | "mp4";

const SOURCE_BADGE: Record<CreateSource, string> = {
  blog: "블로그 글",
  product: "상품 페이지",
  youtube: "유튜브",
  mp4: "MP4 파일",
};

/** URL 패턴으로 소스 종류를 추론한다(백엔드가 블로그/상품을 최종 판별). */
function detectSource(value: string): CreateSource | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (/youtube\.com|youtu\.be/.test(v)) return "youtube";
  if (/amazon\.|amzn\.|smartstore\.naver\.|brand\.naver\.|smartstore\.|m\.smartstore\./.test(v)) return "product";
  if (/^https?:\/\//.test(v) || /\.[a-z]{2,}(\/|$)/.test(v)) return "blog";
  return null;
}

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
  onPreviewYoutube,
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
  onPreviewYoutube: (event: FormEvent<HTMLFormElement>) => void;
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
}) {
  const [url, setUrl] = useState(() => youtubeUrl || blogUrl || "");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = isCreatingBlogShort || isImportingYoutube || isUploading || isPreviewingYoutube;
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const kind = detectSource(url) ?? source;
    if (kind === "youtube") {
      onPreviewYoutube(event);
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
          : "쇼츠 만들기"
      : isCreatingBlogShort
        ? "생성 중…"
        : "쇼츠 만들기";

  return (
    <section className="create-studio" aria-label="쇼츠 만들기">
      <div className="create-studio-copy">
        <p className="create-kicker">새 프로젝트</p>
        <h2>링크 하나로 쇼츠 만들기</h2>
        <p className="create-lead">블로그 글·상품 페이지·유튜브 링크를 붙여넣으면 종류를 알아서 인식합니다.</p>
      </div>

      <div className="create-hero">
        <div className="create-hero-main">
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
            <form className="create-input-row" onSubmit={handleSubmit}>
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
                  placeholder="blog.naver.com/… · smartstore.naver.com/… · youtube.com/…"
                  aria-label="소스 URL"
                  required
                />
              </div>
              <button className="btn-primary btn-lg" type="submit" disabled={busy || !url.trim()}>
                {primaryLabel}
              </button>
            </form>
          )}

          <p className="create-mp4-hint">
            영상 파일이 있나요?{" "}
            <button
              type="button"
              className="create-linklike"
              onClick={() => fileInputRef.current?.click()}
            >
              MP4 파일 올리기
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,.mp4"
              hidden
              onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
            />
          </p>

          {detected === "youtube" && youtubePreview && onCancelYoutubePreview && onConfirmYoutubeImport && onToastMessage ? (
            <YoutubeConfirmStep
              preview={youtubePreview}
              importing={isImportingYoutube}
              inline
              onCancel={onCancelYoutubePreview}
              onConfirm={onConfirmYoutubeImport}
              onMessage={onToastMessage}
            />
          ) : null}

          <div className="create-quick-settings">
            <div className="create-chip-group">
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

            {!isVideoKind ? (
              <div className="create-chip-group">
                <span className="create-chip-label">자막 템플릿</span>
                <div className="create-swatch-row">
                  {SUBTITLE_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      className={`create-swatch create-swatch-${style}${
                        blogSubtitleStyle === style ? " is-active" : ""
                      }`}
                      aria-label={SUBTITLE_STYLE_LABELS[style]}
                      title={SUBTITLE_STYLE_LABELS[style]}
                      onClick={() => onBlogSubtitleStyleChange(style)}
                    >
                      가
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="create-credit-box">
              <span>이 쇼츠에 쓰는 크레딧</span>
              <strong>1</strong>
              <span className="create-credit-rest">
                {creditRemaining != null ? `/ ${creditRemaining}회 남음` : ""}
              </span>
            </div>
          </div>

          <details className="create-advanced">
            <summary>
              세부 설정
              <span className="create-advanced-summary">
                {isVideoKind
                  ? `쇼츠 ${youtubeShortsCount}편`
                  : `${NARRATION_LANGUAGE_LABELS[blogNarrationLanguage]} · ${SCRIPT_MODEL_LABELS[blogScriptModel]}`}
              </span>
            </summary>
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

          <ol className="create-steps">
            {isVideoKind ? (
              <>
                <li>영상 확인 후 템플릿 선택</li>
                <li>하이라이트 상위 {youtubeShortsCount}편 자동 생성</li>
                <li>프로젝트에서 편집 · 다운로드</li>
              </>
            ) : (
              <>
                <li>{detected === "product" ? "상품 정보·이미지 수집" : "글 읽고 대본 3종 생성"}</li>
                <li>이미지 · 말투 선택</li>
                <li>렌더 · 다운로드</li>
              </>
            )}
          </ol>
        </div>

        <div className="create-hero-preview" aria-hidden="true">
          <div className={`create-preview-phone create-preview-${isVideoKind ? "video" : blogSubtitleStyle}`}>
            <span className="create-preview-badge">{SOURCE_BADGE[detected]}</span>
            <p className="create-preview-title">제목이 여기 표시돼요</p>
            <div className="create-preview-media" />
            <p className="create-preview-caption">자막이 이렇게 보여요</p>
          </div>
          <p className="create-preview-note">설정을 바꾸면 이 미리보기가 바뀝니다</p>
        </div>
      </div>
    </section>
  );
}
