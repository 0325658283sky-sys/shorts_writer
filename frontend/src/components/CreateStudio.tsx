import type { FormEvent } from "react";
import {
  NARRATION_LANGUAGE_LABELS,
  NARRATION_LANGUAGES,
  SCRIPT_MODEL_LABELS,
  SCRIPT_MODELS,
  SUBTITLE_STYLE_LABELS,
  SUBTITLE_STYLES,
  TARGET_LENGTH_LABELS,
  TARGET_LENGTHS,
} from "../constants";
import type { NarrationLanguage, ScriptModel, SubtitleStyle, TargetLength } from "../types";
import { formatBytes } from "../utils/format";

export type CreateSource = "blog" | "product" | "youtube" | "mp4";

const SOURCES: Array<{ id: CreateSource; label: string; hint: string }> = [
  { id: "blog", label: "블로그 URL", hint: "글 → 쇼츠 자동 제작" },
  { id: "product", label: "상품 URL", hint: "아마존·스마트스토어 → 쇼츠" },
  { id: "youtube", label: "유튜브 URL", hint: "영상 가져와 클립" },
  { id: "mp4", label: "MP4 업로드", hint: "로컬 파일로 시작" },
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
  onPreviewYoutube,
  onSelectedFileChange,
  onUpload,
  isPreviewingYoutube = false,
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
}) {
  const busy = isCreatingBlogShort || isImportingYoutube || isUploading || isPreviewingYoutube;
  const isProduct = source === "product";

  return (
    <section className="create-studio" aria-label="쇼츠 만들기">
      <div className="create-studio-copy">
        <p className="create-kicker">새 프로젝트</p>
        <h2>어떤 소스로 시작할까요?</h2>
        <p className="create-lead">블로그·상품·유튜브·MP4 중 하나를 고르면, 바로 아래에서 입력하고 생성합니다.</p>
      </div>

      <div className="source-tabs" role="tablist" aria-label="소스 선택">
        {SOURCES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={source === item.id}
            className={`source-tab ${source === item.id ? "is-active" : ""}`}
            onClick={() => onSourceChange(item.id)}
          >
            <span className="source-tab-label">{item.label}</span>
            <span className="source-tab-hint">{item.hint}</span>
          </button>
        ))}
      </div>

      <div className="create-panel" role="tabpanel">
        {source === "blog" || source === "product" ? (
          <form className="create-form" onSubmit={onCreateBlogShort}>
            <label className="create-field">
              <span>{isProduct ? "상품 URL" : "블로그 / 글 URL"}</span>
              <div className="url-row">
                <input
                  type="url"
                  value={blogUrl}
                  onChange={(event) => onBlogUrlChange(event.target.value)}
                  placeholder={
                    isProduct
                      ? "https://smartstore.naver.com/.../products/... 또는 amazon.com/dp/..."
                      : "https://blog.naver.com/... 또는 티스토리, 브런치"
                  }
                  required
                />
                <button className="cta-button" type="submit" disabled={busy}>
                  {isCreatingBlogShort ? "생성 중…" : "쇼츠 만들기"}
                </button>
              </div>
            </label>

            <div className="create-options" aria-label="생성 옵션">
              <label className="create-field inline-field">
                <span>영상 길이</span>
                <select
                  value={blogTargetLength}
                  onChange={(event) => onBlogTargetLengthChange(event.target.value as TargetLength)}
                >
                  {TARGET_LENGTHS.map((length) => (
                    <option value={length} key={length}>
                      {TARGET_LENGTH_LABELS[length]}
                    </option>
                  ))}
                </select>
              </label>
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
                <span>자막 스타일</span>
                <select
                  value={blogSubtitleStyle}
                  onChange={(event) => onBlogSubtitleStyleChange(event.target.value as SubtitleStyle)}
                >
                  {SUBTITLE_STYLES.map((style) => (
                    <option value={style} key={style}>
                      {SUBTITLE_STYLE_LABELS[style]}
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
            </div>

            <ol className="create-steps">
              <li>{isProduct ? "상품 정보·이미지 수집" : "글 읽고 대본 3종 생성"}</li>
              <li>톤 선택 → 보드 편집</li>
              <li>렌더 · 다운로드 · 버전</li>
            </ol>
            {isProduct ? (
              <p className="create-note">
                Amazon(/dp/ASIN)과 네이버 스마트스토어·브랜드스토어(/products/상품번호) 링크를 지원합니다.
              </p>
            ) : null}
          </form>
        ) : null}

        {source === "youtube" ? (
          <form className="create-form" onSubmit={onPreviewYoutube}>
            <label className="create-field">
              <span>유튜브 URL</span>
              <div className="url-row">
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(event) => onYoutubeUrlChange(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
                <button className="cta-button" type="submit" disabled={busy}>
                  {isPreviewingYoutube ? "확인 중…" : isImportingYoutube ? "가져오는 중…" : "확인"}
                </button>
              </div>
            </label>
            <ol className="create-steps">
              <li>영상 확인 후 템플릿 선택</li>
              <li>음성·하이라이트 자동 추출</li>
              <li>퀵 / 세부 편집 → 렌더</li>
            </ol>
            <p className="create-note">본인이 소유했거나 처리 권한이 있는 영상만 사용하세요.</p>
          </form>
        ) : null}

        {source === "mp4" ? (
          <form className="create-form" onSubmit={onUpload}>
            <label className="create-field file-drop">
              <span>MP4 파일</span>
              <input type="file" accept="video/mp4,.mp4" onChange={(event) => onSelectedFileChange(event.target.files?.[0] ?? null)} />
              {selectedFile ? (
                <p className="create-note">
                  선택됨: {selectedFile.name} ({formatBytes(selectedFile.size)})
                </p>
              ) : (
                <p className="create-note">파일을 선택하거나 위 칸을 눌러 업로드하세요.</p>
              )}
            </label>
            <button className="cta-button" type="submit" disabled={busy || !selectedFile}>
              {isUploading ? "업로드 중…" : "클립 만들기"}
            </button>
            <ol className="create-steps">
              <li>음성·하이라이트 자동 추출</li>
              <li>하이라이트 썸네일 선택</li>
              <li>퀵 / 세부 편집 → 렌더</li>
            </ol>
            <p className="create-note">유튜브와 같은 가이드 흐름으로 이어집니다. Projects → 영상에서도 고전 방식으로 다시 작업할 수 있습니다.</p>
          </form>
        ) : null}
      </div>
    </section>
  );
}
