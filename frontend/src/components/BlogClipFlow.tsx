import { useEffect, useRef, useState } from "react";
import { SCRIPT_TONE_HINTS, SCRIPT_TONE_LABELS, SCRIPT_TONES, userFacingProgressLabel } from "../constants";
import type { BlogClip, ScriptTone, VisualStyleSlug } from "../types";
import { AliveProgressBar } from "./AliveProgressBar";
import { BlogClipRestylePanel } from "./BlogClipRestylePanel";
import { BlogClipVersionsPanel } from "./BlogClipVersionsPanel";
import { CompletedShortPlayer } from "./CompletedShortPlayer";
import { ImageSelectStep } from "./ImageSelectStep";
import { MetadataBox } from "./MetadataBox";

const FLOW_STEPS = [
  { id: "progress", label: "준비" },
  { id: "images", label: "이미지" },
  { id: "script", label: "대본" },
  { id: "done", label: "완료" },
] as const;

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
}) {
  const autoRenderKey = useRef<number | null>(null);
  const [versionRefresh, setVersionRefresh] = useState(0);
  const isProgress = blogClip.status === "pending" || blogClip.status === "processing";
  const isFinalRender = isPhase2Render(blogClip);
  const isAwaitingImages = blogClip.status === "awaiting_images";
  const isAwaitingScript = blogClip.status === "awaiting_script";
  const isAwaitingBoards = blogClip.status === "awaiting_boards";
  const isCompleted = blogClip.status === "completed";
  const isFailed = blogClip.status === "failed";
  const stageLabel = userFacingProgressLabel(blogClip.progress_stage);
  const availableTones = SCRIPT_TONES.filter((tone) => Boolean(blogClip.script_candidates[tone]));

  const stepIndex = isFinalRender || isAwaitingBoards
    ? 3
    : isProgress
      ? 0
      : isAwaitingImages
        ? 1
        : isAwaitingScript
          ? 2
          : isCompleted || isFailed
            ? 3
            : 0;

  const stepperSteps = FLOW_STEPS.map((step, index) => {
    if (index === 3 && (isFinalRender || isAwaitingBoards)) return { ...step, label: "렌더 중" };
    return step;
  });

  useEffect(() => {
    if (!isAwaitingBoards || renderingFromFlow) return;
    if (autoRenderKey.current === blogClip.id) return;
    autoRenderKey.current = blogClip.id;
    onRender(blogClip);
  }, [isAwaitingBoards, blogClip.id, renderingFromFlow, onRender]);

  return (
    <div className="flow-shell">
      <nav className="flow-progress-bar" aria-label="제작 단계">
        <ol className="flow-stepper-list">
          {stepperSteps.map((step, index) => {
            const isCurrent = index === stepIndex;
            const isDone = index < stepIndex;
            return (
              <li key={step.id}>
                <div className={`flow-stepper-item ${isCurrent ? "is-current" : ""} ${isDone ? "is-done" : ""}`} aria-current={isCurrent ? "step" : undefined}>
                  <span className="flow-step-dot">{index + 1}</span>
                  <span>{step.label}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="flow-main">
        {flowMessage ? <p className="error-text flow-inline-error">{flowMessage}</p> : null}

        {isProgress ? (
          <section className="flow-card flow-progress-card" aria-live="polite">
            <p className="create-kicker">{isFinalRender ? "렌더 중" : "준비 중"}</p>
            <h1>{isFinalRender ? "영상을 만들고 있어요" : "쇼츠를 준비하고 있어요"}</h1>
            <p className="flow-lead">
              {isFinalRender
                ? "음성·BGM을 섞은 뒤 세로 영상을 합성하는 중입니다."
                : "글을 읽고 이미지 후보와 대본을 준비하는 중입니다. 프로젝트 탭으로 나가도 생성이 이어집니다."}
            </p>
            <div className="flow-progress">
              <AliveProgressBar className="blog-progress" percent={blogClip.progress_percent} active={isProgress} label={stageLabel} />
            </div>
            <p className="create-note flow-url">{blogClip.source_url}</p>
          </section>
        ) : null}

        {isAwaitingImages ? (
          <ImageSelectStep
            blogClip={blogClip}
            confirming={confirmingImageSelection}
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

        {isAwaitingBoards ? (
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
  const script = blogClip.script_candidates[active] ?? "";
  const chars = script.replace(/\s/g, "").length;
  const seconds = Math.max(1, Math.round(chars / 4.5)); // 한국어 TTS 대략 4.5자/초

  return (
    <section className="flow-card">
      <h1>어떤 말투로 읽어줄까요?</h1>
      <p className="flow-lead">말투만 고르면 나머지는 자동입니다. 나중에 바꿀 수 있어요.</p>

      <div className="tone-switch" role="tablist" aria-label="말투">
        {tones.map((tone) => (
          <button
            key={tone}
            type="button"
            role="tab"
            aria-selected={active === tone}
            className={`tone-switch-item ${active === tone ? "is-active" : ""}`}
            onClick={() => setActive(tone)}
          >
            {SCRIPT_TONE_LABELS[tone]}
          </button>
        ))}
      </div>

      <div className="tone-preview">
        <div className="tone-preview-meta">
          <span>
            읽는 시간 <strong>{seconds}초</strong>
          </span>
          <span>·</span>
          <span>
            글자 <strong>{chars}자</strong>
          </span>
          <span className="tone-preview-hint">{SCRIPT_TONE_HINTS[active]}</span>
        </div>
        <p className="narration-script">{script}</p>
      </div>

      <div className="tone-actions">
        <button className="btn-outline" type="button" disabled={busy} onClick={() => onEdit(active)}>
          장면 다듬기
        </button>
        <button className="btn-primary btn-lg" type="button" disabled={busy} onClick={() => onSelect(active)}>
          {busy ? "준비 중…" : "이 말투로 영상 만들기"}
        </button>
      </div>
    </section>
  );
}
