import { useEffect, useRef, useState } from "react";
import { SCRIPT_TONE_HINTS, SCRIPT_TONE_LABELS, SCRIPT_TONES, userFacingProgressLabel } from "../constants";
import type { BlogClip, ScriptTone, VisualStyleSlug } from "../types";
import { AliveProgressBar } from "./AliveProgressBar";
import { detectSource } from "./CreateStudio";
import type { FlowCrumbState, FlowStepKey } from "./FlowCrumbs";
import { BlogClipRestylePanel } from "./BlogClipRestylePanel";
import { BlogClipVersionsPanel } from "./BlogClipVersionsPanel";
import { CompletedShortPlayer } from "./CompletedShortPlayer";
import { ImageSelectStep } from "./ImageSelectStep";
import { MetadataBox } from "./MetadataBox";
import { GenerationOptionsPanel } from "./GenerationOptionsPanel";
import { WaitScreen } from "./WaitScreen";
import { TemplateGalleryStep } from "./TemplateGalleryStep";

const PHASE2_STAGES = new Set(["synthesizing_audio", "rendering_video", "burning_subtitles"]);

function isPhase2Render(blogClip: BlogClip): boolean {
  if (blogClip.status !== "pending" && blogClip.status !== "processing") return false;
  if (blogClip.progress_percent >= 55) return true;
  return PHASE2_STAGES.has(blogClip.progress_stage);
}

export function BlogClipFlow({
  blogClip,
  copiedKey,
  downloadingBlogClipId,
  generatingBlogMetadataId,
  selectingBlogScriptId,
  confirmingImageSelection,
  renderingFromFlow,
  onBackToStudio,
  onCopyText,
  onDownloadBlogClip,
  onGenerateMetadata,
  onSelectScript,
  onConfirmImages,
  onRender,
  onOpenBoardEditor,
  onBlogClipUpdated,
  onMessage,
  flowMessage,
  onCrumbChange,
}: {
  blogClip: BlogClip;
  copiedKey: string | null;
  downloadingBlogClipId: number | null;
  generatingBlogMetadataId: number | null;
  selectingBlogScriptId: number | null;
  confirmingImageSelection: boolean;
  renderingFromFlow: boolean;
  onBackToStudio: () => void;
  onCopyText: (key: string, text: string) => void;
  onDownloadBlogClip: (blogClip: BlogClip) => void;
  onGenerateMetadata: (blogClip: BlogClip) => void;
  onSelectScript: (blogClip: BlogClip, tone: ScriptTone, options?: { openEditor?: boolean }) => void;
  onConfirmImages: (blogClip: BlogClip, imageIds: number[], visualStyle: VisualStyleSlug | string) => void;
  onRender: (blogClip: BlogClip) => void;
  onOpenBoardEditor: (blogClip: BlogClip) => void;
  onBlogClipUpdated: (blogClip: BlogClip) => void;
  onMessage: (message: string) => void;
  flowMessage?: string;
  onCrumbChange?: (crumb: FlowCrumbState | null) => void;
}) {
  const [versionRefresh, setVersionRefresh] = useState(0);
  // ④ 템플릿 갤러리: awaiting_boards 진입 시 한 번 보여주고, 적용/건너뛰기 후엔 숨긴다.
  const [galleryHandledId, setGalleryHandledId] = useState<number | null>(null);
  const isProgress = blogClip.status === "pending" || blogClip.status === "processing";
  const isFinalRender = isPhase2Render(blogClip);
  const isAwaitingImages = blogClip.status === "awaiting_images";
  const isAwaitingScript = blogClip.status === "awaiting_script";
  const isAwaitingBoards = blogClip.status === "awaiting_boards";
  const showTemplateGallery = isAwaitingBoards && galleryHandledId !== blogClip.id;
  const isCompleted = blogClip.status === "completed";
  const isFailed = blogClip.status === "failed";
  const stageLabel = userFacingProgressLabel(blogClip.progress_stage);
  const availableTones = SCRIPT_TONES.filter((tone) => Boolean(blogClip.script_candidates[tone]));

  const crumbSource = detectSource(blogClip.source_url) === "product" ? "product" : "blog";
  const crumbStep: FlowStepKey = isCompleted
    ? "done"
    : isFinalRender || (isAwaitingBoards && !showTemplateGallery)
      ? "editor"
      : isAwaitingBoards
        ? "template"
        : isAwaitingScript
          ? "script"
          : isAwaitingImages
            ? "photos"
            : "wait";

  useEffect(() => {
    onCrumbChange?.({ source: crumbSource, step: crumbStep });
    return () => onCrumbChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crumbSource, crumbStep]);

  // NOTE(Phase 2): 예전엔 여기서 템플릿 갤러리 이후 자동으로 onRender(blogClip)를 호출했다.
  // 그런데 그 즉시 실행되는 바람에 "장면 직접 편집"/"이대로 영상 만들기" 두 버튼이 화면에 뜨는
  // 순간 이미 렌더가 시작되어 있어 사실상 눌릴 기회가 없었다(BoardEditor 진입 불가 버그).
  // 자동 시작을 없애고, 아래 두 버튼 중 사용자가 실제로 고르게 한다.

  return (
    <div className="flow-shell">
      <main className="flow-main">
        {flowMessage ? <p className="error-text flow-inline-error">{flowMessage}</p> : null}

        {isProgress ? (
          <ProgressLog blogClip={blogClip} isFinalRender={isFinalRender} stageLabel={stageLabel} onLeave={onBackToStudio} />
        ) : null}

        {isAwaitingImages ? (
          <ImageSelectStep
            blogClip={blogClip}
            confirming={confirmingImageSelection}
            isProduct={detectSource(blogClip.source_url) === "product"}
            onBack={onBackToStudio}
            onConfirm={(imageIds, visualStyle) => onConfirmImages(blogClip, imageIds, visualStyle)}
            onMessage={onMessage}
          />
        ) : null}

        {isAwaitingScript ? (
          <ScriptToneStep
            blogClip={blogClip}
            tones={availableTones}
            busy={selectingBlogScriptId === blogClip.id}
            onSelect={(tone) => onSelectScript(blogClip, tone)}
            onEdit={(tone) => onSelectScript(blogClip, tone, { openEditor: true })}
          />
        ) : null}

        {isAwaitingBoards && showTemplateGallery ? (
          <TemplateGalleryStep
            blogClip={blogClip}
            onContinue={(updated) => {
              onBlogClipUpdated(updated as BlogClip);
              setGalleryHandledId(blogClip.id);
            }}
            onSkip={() => setGalleryHandledId(blogClip.id)}
            onMessage={onMessage}
            optionsPanel={
              <GenerationOptionsPanel clipKind="blog" blogClip={blogClip} onBlogClipUpdated={onBlogClipUpdated} onMessage={onMessage} />
            }
          />
        ) : null}

        {isAwaitingBoards && !showTemplateGallery ? (
          <section className="flow-card">
            <p className="create-kicker">렌더</p>
            <h1>기본 설정으로 영상을 만들고 있어요</h1>
            <p className="flow-lead">템플릿과 보이스는 완료 화면에서 바꿀 수 있습니다.</p>
            <div className="flow-step-actions">
              <button className="ghost-button" type="button" onClick={() => onOpenBoardEditor(blogClip)}>
                장면 직접 편집
              </button>
              <button className="btn-primary btn-lg flow-primary-cta" type="button" disabled={renderingFromFlow} onClick={() => onRender(blogClip)}>
                {renderingFromFlow ? "시작 중…" : "이대로 영상 만들기"}
              </button>
            </div>
          </section>
        ) : null}

        {isFailed ? (
          <section className="flow-card">
            <p className="create-kicker">실패</p>
            <h1>생성에 실패했습니다</h1>
            <p className="error-text">{blogClip.error_message ?? "알 수 없는 오류가 발생했습니다."}</p>
            <button className="btn-primary" type="button" onClick={onBackToStudio}>
              내 쇼츠로 돌아가기
            </button>
          </section>
        ) : null}

        {isCompleted ? (
          <section className="flow-result">
            <div className="flow-card flow-result-hero">
              <p className="create-kicker">결과</p>
              <h1>{blogClip.blog_title ?? "쇼츠가 완성되었습니다"}</h1>
              {blogClip.render_spec?.fallback_used || blogClip.render_spec?.engine === "ffmpeg" ? (
                <div className="flow-notice flow-notice-warning" role="status">
                  <p className="flow-notice-title">간단 버전으로 만들어졌어요</p>
                  <p className="flow-notice-body">
                    템플릿·폰트가 빠진 기본 화면으로 렌더됐습니다. 다시 만들면 선택한 스타일이 적용됩니다.
                  </p>
                  <button className="btn-outline" type="button" onClick={() => onRender(blogClip)}>
                    스타일 적용해서 다시 만들기
                  </button>
                </div>
              ) : null}
              <CompletedShortPlayer
                blogClipId={blogClip.id}
                versionId={blogClip.active_version_id}
                label="완성 쇼츠 미리보기"
              />
              <div className="flow-result-actions">
                <button
                  className="btn-primary btn-lg"
                  type="button"
                  disabled={!blogClip.subtitled_video_path && !blogClip.video_path}
                  onClick={() => onDownloadBlogClip(blogClip)}
                >
                  {downloadingBlogClipId === blogClip.id ? "다운로드 중…" : "MP4 다운로드"}
                </button>
                <button
                  className="btn-outline metadata-button"
                  type="button"
                  disabled={generatingBlogMetadataId === blogClip.id || (blogClip.title_candidates?.length ?? 0) > 0}
                  onClick={() => onGenerateMetadata(blogClip)}
                >
                  {generatingBlogMetadataId === blogClip.id
                    ? "작성 중…"
                    : (blogClip.title_candidates?.length ?? 0) > 0
                      ? "문구 준비됨"
                      : "업로드용 문구 만들기"}
                </button>
                <button className="btn-ghost" type="button" onClick={onBackToStudio}>
                  내 쇼츠로
                </button>
              </div>
              <p className="create-note">스타일만 바꾸는 재생성은 크레딧이 들지 않습니다.</p>
              {(blogClip.title_candidates?.length ?? 0) > 0 || blogClip.description || (blogClip.hashtags?.length ?? 0) > 0 ? (
                <MetadataBox
                  copiedKey={copiedKey}
                  idPrefix={`blog-flow-${blogClip.id}`}
                  titleCandidates={blogClip.title_candidates}
                  description={blogClip.description ?? ""}
                  hashtags={blogClip.hashtags}
                  onCopyText={onCopyText}
                />
              ) : null}
            </div>
            <BlogClipRestylePanel
              blogClip={blogClip}
              busy={false}
              onApplied={(updated) => {
                onBlogClipUpdated(updated);
                setVersionRefresh((token) => token + 1);
              }}
              onMessage={onMessage}
            />
            <BlogClipVersionsPanel
              blogClip={blogClip}
              copiedKey={copiedKey}
              onCopyText={onCopyText}
              onBlogClipUpdated={onBlogClipUpdated}
              onMessage={onMessage}
              refreshKey={versionRefresh}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}

const PREPARE_TASKS_BLOG = [
  { key: "read", label: "글 읽는 중", done: "글 본문 읽음", at: 18 },
  { key: "images", label: "쓸 만한 사진 찾는 중", done: "사진 찾음", at: 34 },
  { key: "script", label: "대본 3안 쓰는 중", done: "대본 3안 완성", at: 42 },
];
const PREPARE_TASKS_PRODUCT = [
  { key: "read", label: "상품 정보 읽는 중", done: "상품 정보 읽음", at: 18 },
  { key: "images", label: "상품 사진 모으는 중", done: "사진 모음", at: 34 },
  { key: "script", label: "매력 포인트 찾는 중", done: "대본 3안 완성", at: 42 },
];
const RENDER_TASKS = [
  { key: "voice", label: "음성 만드는 중", done: "음성 합성 완료", at: 72 },
  { key: "video", label: "영상 합치는 중", done: "영상 합성 완료", at: 88 },
  { key: "subs", label: "자막 넣는 중", done: "자막 입힘", at: 99 },
];

function ProgressLog({
  blogClip,
  isFinalRender,
  stageLabel,
  onLeave,
}: {
  blogClip: BlogClip;
  isFinalRender: boolean;
  stageLabel: string;
  onLeave: () => void;
}) {
  const percent = blogClip.progress_percent ?? 0;
  const isProductSource = detectSource(blogClip.source_url) === "product";
  const tasks = isFinalRender ? RENDER_TASKS : isProductSource ? PREPARE_TASKS_PRODUCT : PREPARE_TASKS_BLOG;
  const currentIndex = tasks.findIndex((task) => percent < task.at);

  // 프론트 경과 타이머로 대략적인 ETA (정확하지 않음)
  const etaRef = useRef<{ id: number; startMs: number; startPct: number } | null>(null);
  if (!etaRef.current || etaRef.current.id !== blogClip.id) {
    etaRef.current = { id: blogClip.id, startMs: Date.now(), startPct: percent };
  }
  const elapsedSec = (Date.now() - etaRef.current.startMs) / 1000;
  const gained = percent - etaRef.current.startPct;
  let eta: string | null = null;
  if (percent >= 96) {
    eta = "곧 끝나요";
  } else if (gained > 1 && elapsedSec > 2) {
    const rate = gained / elapsedSec;
    const remain = Math.round((100 - percent) / rate);
    if (remain >= 3 && remain <= 1800) {
      eta = remain >= 60 ? `약 ${Math.round(remain / 60)}분 남음` : `약 ${remain}초 남음`;
    }
  }

  const notifyAvailable = typeof Notification !== "undefined";
  const [notify, setNotify] = useState(() => {
    try {
      return localStorage.getItem("nc_notify_on_done") === "1";
    } catch {
      return false;
    }
  });
  function toggleNotify() {
    const next = !notify;
    setNotify(next);
    try {
      localStorage.setItem("nc_notify_on_done", next ? "1" : "0");
    } catch {
      /* private mode */
    }
    if (next && notifyAvailable && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }

  const activeIndex = currentIndex === -1 ? tasks.length : currentIndex;
  const sourceLabel = isFinalRender ? "영상 합치기" : isProductSource ? "상품 페이지" : "블로그 글";
  const title = isFinalRender
    ? "영상을 합치고 있어요"
    : isProductSource
      ? "상품을 읽고 매력 포인트를 찾고 있어요"
      : "글을 읽고 대본 3안을 쓰고 있어요";

  return (
    <WaitScreen
      sourceLabel={sourceLabel}
      title={title}
      steps={tasks.map((task) => task.label)}
      activeIndex={activeIndex}
      percent={percent}
      caption={eta ? `${stageLabel} · ${eta}` : stageLabel}
      note="창을 닫아도 서버에서 계속 만들어요."
      onLeave={onLeave}
      aside={
        notifyAvailable ? (
          <label className="wait-notify">
            <input type="checkbox" checked={notify} onChange={toggleNotify} />
            <span>다 되면 알림 드릴게요</span>
          </label>
        ) : null
      }
    />
  );
}

function ScriptToneStep({
  blogClip,
  tones,
  busy,
  onSelect,
  onEdit,
}: {
  blogClip: BlogClip;
  tones: ScriptTone[];
  busy: boolean;
  onSelect: (tone: ScriptTone) => void;
  onEdit: (tone: ScriptTone) => void;
}) {
  const [active, setActive] = useState<ScriptTone>(tones[0]);

  return (
    <section className="flow-card">
      <div>
        <p className="create-kicker">대본</p>
        <h1>AI가 쓴 대본 3안 중 하나를 골라주세요</h1>
        <p className="flow-lead tone-lead">
          마음에 드는 안을 직접 골라주세요. 문장은 편집기에서 장면별로 고칠 수 있습니다.
        </p>
      </div>

      <div className="tone-card-grid" role="radiogroup" aria-label="말투">
        {tones.map((tone) => {
          const script = blogClip.script_candidates[tone] ?? "";
          const chars = script.replace(/\s/g, "").length;
          const seconds = Math.max(1, Math.round(chars / 4.5)); // 한국어 TTS 대략 4.5자/초
          const selected = active === tone;
          return (
            <button
              key={tone}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`tone-card ${selected ? "is-selected" : ""}`}
              onClick={() => setActive(tone)}
            >
              <span className="tone-card-head">
                <span className="tone-card-radio" aria-hidden="true" />
                <strong>{SCRIPT_TONE_LABELS[tone]}</strong>
                {tone === "hook" ? <span className="tone-card-badge">추천</span> : null}
                <span className="tone-card-meta">
                  약 {seconds}초 · {chars}자
                </span>
              </span>
              <span className="tone-card-hint">{SCRIPT_TONE_HINTS[tone]}</span>
              <p className="tone-card-script">{script}</p>
            </button>
          );
        })}
      </div>

      <div className="tone-actions">
        <button className="btn-outline" type="button" disabled={busy} onClick={() => onEdit(active)}>
          장면 다듬기
        </button>
        <button className="btn-primary btn-lg" type="button" disabled={busy} onClick={() => onSelect(active)}>
          {busy ? "준비 중…" : "이 대본으로 계속"}
        </button>
      </div>
    </section>
  );
}
