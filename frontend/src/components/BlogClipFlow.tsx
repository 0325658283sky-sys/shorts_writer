import { useEffect, useState } from "react";
import {
  BLOG_CLIP_STATUS_LABELS,
  SCRIPT_TONE_HINTS,
  SCRIPT_TONE_LABELS,
  SCRIPT_TONES,
  SUBTITLE_STYLE_LABELS,
  userFacingProgressLabel,
} from "../constants";
import type { BlogClip, ScriptTone, SubtitleStyle, VisualStyleSlug, WizardBoardsStep } from "../types";
import { parseWizardBoardsStep } from "../types";
import { AliveProgressBar } from "./AliveProgressBar";
import { BlogClipVersionsPanel } from "./BlogClipVersionsPanel";
import { CompletedShortPlayer } from "./CompletedShortPlayer";
import { ImageSelectStep } from "./ImageSelectStep";
import { MetadataBox } from "./MetadataBox";
import { QuickSettingsStep } from "./QuickSettingsStep";
import { VideoStyleStep } from "./VideoStyleStep";

const FLOW_STEPS = [
  { id: "progress", label: "준비" },
  { id: "images", label: "이미지" },
  { id: "script", label: "대본" },
  { id: "style", label: "스타일" },
  { id: "audio", label: "오디오" },
  { id: "done", label: "완료" },
] as const;

const PHASE2_STAGES = new Set([
  "synthesizing_audio",
  "rendering_video",
  "burning_subtitles",
]);

function isPhase2Render(blogClip: BlogClip): boolean {
  if (blogClip.status !== "pending" && blogClip.status !== "processing") return false;
  if (blogClip.progress_percent >= 55) return true;
  return PHASE2_STAGES.has(blogClip.progress_stage);
}

function bgmSummary(blogClip: BlogClip): string {
  if (blogClip.bgm_asset_id != null) return `BGM #${blogClip.bgm_asset_id}`;
  if (blogClip.auto_bgm) return "자동 BGM";
  return "BGM 없음";
}

function boardsStepIndex(step: WizardBoardsStep): number {
  if (step === "quick" || step === "ready") return 4;
  return 3;
}

export function BlogClipFlow({
  blogClip,
  boardCount,
  copiedKey,
  downloadingBlogClipId,
  generatingBlogMetadataId,
  selectingBlogScriptId,
  confirmingImageSelection,
  savingVoice,
  savingStyle,
  savingVisualStyle,
  renderingFromFlow,
  onBackToStudio,
  onCopyText,
  onDownloadBlogClip,
  onGenerateMetadata,
  onSelectScript,
  onConfirmImages,
  onSaveDefaultVoice,
  onApplyVisualStyle,
  onAudioSettings,
  onWizardStepChange,
  onRender,
  onOpenBoardEditor,
  onBlogClipUpdated,
  onMessage,
  flowMessage,
}: {
  blogClip: BlogClip;
  boardCount?: number;
  copiedKey: string | null;
  downloadingBlogClipId: number | null;
  generatingBlogMetadataId: number | null;
  selectingBlogScriptId: number | null;
  confirmingImageSelection: boolean;
  savingVoice: boolean;
  savingStyle: boolean;
  savingVisualStyle: boolean;
  renderingFromFlow: boolean;
  onBackToStudio: () => void;
  onCopyText: (key: string, text: string) => void;
  onDownloadBlogClip: (blogClip: BlogClip) => void;
  onGenerateMetadata: (blogClip: BlogClip) => void;
  onSelectScript: (blogClip: BlogClip, tone: ScriptTone) => void;
  onConfirmImages: (blogClip: BlogClip, imageIds: number[], visualStyle: VisualStyleSlug | string) => void;
  onSaveDefaultVoice: (blogClip: BlogClip, voiceId: string, ttsSpeed: number) => Promise<void>;
  onApplyVisualStyle: (
    blogClip: BlogClip,
    style: VisualStyleSlug | string,
    copy?: { style_title?: string; style_subtitle?: string },
  ) => Promise<void>;
  onAudioSettings: (
    blogClip: BlogClip,
    body: { auto_bgm?: boolean; auto_sfx?: boolean; bgm_asset_id?: number | null },
  ) => Promise<void>;
  onWizardStepChange: (blogClip: BlogClip, step: WizardBoardsStep) => void;
  onRender: (blogClip: BlogClip) => void;
  onOpenBoardEditor: (blogClip: BlogClip) => void;
  onBlogClipUpdated: (blogClip: BlogClip) => void;
  onMessage: (message: string) => void;
  flowMessage?: string;
}) {
  const [boardsStep, setBoardsStep] = useState<WizardBoardsStep>(() => parseWizardBoardsStep(blogClip.wizard_step));

  useEffect(() => {
    if (blogClip.status !== "awaiting_boards") return;
    const parsed = parseWizardBoardsStep(blogClip.wizard_step);
    setBoardsStep(parsed);
    if (blogClip.wizard_step !== parsed) {
      onWizardStepChange(blogClip, parsed);
    }
  }, [blogClip.id, blogClip.status, blogClip.wizard_step]);

  const isProgress = blogClip.status === "pending" || blogClip.status === "processing";
  const isFinalRender = isPhase2Render(blogClip);
  const isAwaitingImages = blogClip.status === "awaiting_images";
  const isAwaitingScript = blogClip.status === "awaiting_script";
  const isAwaitingBoards = blogClip.status === "awaiting_boards";
  const isCompleted = blogClip.status === "completed";
  const isFailed = blogClip.status === "failed";
  const stageLabel = userFacingProgressLabel(blogClip.progress_stage);
  const availableTones = SCRIPT_TONES.filter((tone) => Boolean(blogClip.script_candidates[tone]));

  const stepIndex = isFinalRender
    ? 5
    : isProgress
      ? 0
      : isAwaitingImages
        ? 1
        : isAwaitingScript
          ? 2
          : isAwaitingBoards
            ? boardsStepIndex(boardsStep)
            : isCompleted || isFailed
              ? 5
              : 0;

  const stepperSteps = FLOW_STEPS.map((step, index) => {
    if (index === 5 && isFinalRender) return { ...step, label: "렌더 중" };
    return step;
  });

  function goToBoardsStep(step: WizardBoardsStep) {
    if (!isAwaitingBoards || boardsStep === step) return;
    setBoardsStep(step);
    onWizardStepChange(blogClip, step);
  }

  function handleStepperClick(index: number) {
    if (!isAwaitingBoards) return;
    if (index === 3) goToBoardsStep("video_style");
    if (index === 4) goToBoardsStep(boardsStep === "ready" ? "ready" : "quick");
  }

  async function handleQuickVisualStyleSelect(
    style: VisualStyleSlug | string,
    copy: { style_title: string; style_subtitle: string },
  ) {
    await onApplyVisualStyle(blogClip, style, copy);
    setBoardsStep("quick");
    onWizardStepChange(blogClip, "quick");
  }

  const detailEditLink = isAwaitingBoards ? (
    <button className="ghost-button" type="button" onClick={() => onOpenBoardEditor(blogClip)}>
      보드 직접 편집
    </button>
  ) : null;

  return (
    <div className="flow-shell">
      <nav className="flow-progress-bar" aria-label="제작 단계">
        <ol className="flow-stepper-list">
          {stepperSteps.map((step, index) => {
            const isCurrent = index === stepIndex;
            const isDone = index < stepIndex;
            const canJump = isAwaitingBoards && (index === 3 || index === 4);
            const className = `flow-stepper-item ${isCurrent ? "is-current" : ""} ${isDone ? "is-done" : ""} ${canJump ? "is-clickable" : ""}`;
            if (canJump) {
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    className={className}
                    aria-current={isCurrent ? "step" : undefined}
                    onClick={() => handleStepperClick(index)}
                  >
                    <span className="flow-step-dot">{index + 1}</span>
                    <span>{step.label}</span>
                  </button>
                </li>
              );
            }
            return (
              <li key={step.id}>
                <div className={className} aria-current={isCurrent ? "step" : undefined}>
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
                : "글을 읽고 이미지 후보와 대본을 준비하는 중입니다."}
            </p>
            <div className="flow-progress">
              <AliveProgressBar
                className="blog-progress"
                percent={blogClip.progress_percent}
                active={isProgress}
                label={stageLabel}
              />
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
          <section className="flow-card">
            <p className="create-kicker">대본 선택</p>
            <h1>{blogClip.blog_title ?? "나레이션 톤을 고르세요"}</h1>
            <p className="flow-lead">세 가지 톤 중 하나로 보드를 만듭니다. 나중에 다른 톤 버전도 만들 수 있어요.</p>
            <div className="script-tone-list">
              {availableTones.map((tone) => (
                <div className="script-tone-option" key={tone}>
                  <div className="script-tone-header">
                    <strong>{SCRIPT_TONE_LABELS[tone]}</strong>
                    <span className="muted">{SCRIPT_TONE_HINTS[tone]}</span>
                  </div>
                  <p className="narration-script">{blogClip.script_candidates[tone]}</p>
                  <button
                    className="cta-button"
                    type="button"
                    onClick={() => onSelectScript(blogClip, tone)}
                    disabled={selectingBlogScriptId === blogClip.id}
                  >
                    {selectingBlogScriptId === blogClip.id ? "선택 중…" : "이 대본으로 계속"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {isAwaitingBoards && boardsStep === "video_style" ? (
          <VideoStyleStep
            blogClip={blogClip}
            saving={savingVisualStyle}
            onSelect={handleQuickVisualStyleSelect}
            onOpenBoardEditor={() => onOpenBoardEditor(blogClip)}
            onMessage={onMessage}
            onClipUpdated={onBlogClipUpdated}
          />
        ) : null}

        {isAwaitingBoards && boardsStep === "quick" ? (
          <QuickSettingsStep
            blogClip={blogClip}
            savingVoice={savingVoice}
            busy={savingStyle || renderingFromFlow}
            onSaveDefaultVoice={(voiceId, ttsSpeed) => onSaveDefaultVoice(blogClip, voiceId, ttsSpeed)}
            onAudioSettings={(body) => onAudioSettings(blogClip, body)}
            onBack={() => goToBoardsStep("video_style")}
            onOpenBoardEditor={() => onOpenBoardEditor(blogClip)}
            onRender={() => onRender(blogClip)}
            onMessage={onMessage}
          />
        ) : null}

        {isAwaitingBoards && boardsStep === "ready" ? (
          <section className="flow-card flow-boards-card">
            <p className="create-kicker">렌더 확인</p>
            <h1>이 설정으로 만들까요?</h1>
            <p className="flow-lead">세부 편집이 반영되었습니다. 확인 후 렌더링을 시작하세요.</p>
            <div className="highlight-meta">
              <span>{boardCount ? `보드 ${boardCount}개` : "보드"}</span>
              <span>보이스: {blogClip.default_voice ?? "기본"}</span>
              <span>{bgmSummary(blogClip)}</span>
              {blogClip.visual_style ? <span>스타일: {blogClip.visual_style}</span> : null}
              {blogClip.auto_sfx ? <span>자동 SFX</span> : null}
              <span>자막: {SUBTITLE_STYLE_LABELS[blogClip.subtitle_style as SubtitleStyle] ?? blogClip.subtitle_style}</span>
            </div>
            <div className="flow-step-actions">
              {detailEditLink}
              <button
                className="cta-button flow-primary-cta"
                type="button"
                disabled={renderingFromFlow}
                onClick={() => onRender(blogClip)}
              >
                {renderingFromFlow ? "시작 중…" : "렌더링"}
              </button>
            </div>
          </section>
        ) : null}

        {isFailed ? (
          <section className="flow-card">
            <p className="create-kicker">실패</p>
            <h1>생성에 실패했습니다</h1>
            <p className="error-text">{blogClip.error_message ?? "알 수 없는 오류가 발생했습니다."}</p>
            <button className="cta-button" type="button" onClick={onBackToStudio}>
              작업실로 돌아가기
            </button>
          </section>
        ) : null}

        {isCompleted ? (
          <section className="flow-result">
            <div className="flow-card flow-result-hero">
              <p className="create-kicker">결과</p>
              <h1>{blogClip.blog_title ?? "쇼츠가 완성되었습니다"}</h1>
              {blogClip.render_spec?.fallback_used || blogClip.render_spec?.engine === "ffmpeg" ? (
                <p className="error-text flow-inline-error">
                  템플릿이 적용되지 않은 FFmpeg 결과입니다
                  {blogClip.render_spec?.fallback_used ? " (Remotion 서버 연결 실패 → 폴백)." : "."}{" "}
                  Remotion(3100)을 켠 뒤 보드 편집에서 다시 렌더하세요.
                  {blogClip.render_spec?.fallback_reason ? ` 사유: ${blogClip.render_spec.fallback_reason}` : ""}
                </p>
              ) : null}
              <CompletedShortPlayer
                blogClipId={blogClip.id}
                versionId={blogClip.active_version_id}
                label="완성 쇼츠 미리보기"
              />
              <div className="flow-result-actions">
                <button
                  className="cta-button"
                  type="button"
                  disabled={!blogClip.subtitled_video_path && !blogClip.video_path}
                  onClick={() => onDownloadBlogClip(blogClip)}
                >
                  {downloadingBlogClipId === blogClip.id ? "다운로드 중…" : "다운로드"}
                </button>
                <button
                  className="small-button metadata-button"
                  type="button"
                  disabled={
                    generatingBlogMetadataId === blogClip.id ||
                    (blogClip.title_candidates?.length ?? 0) > 0
                  }
                  onClick={() => onGenerateMetadata(blogClip)}
                >
                  {generatingBlogMetadataId === blogClip.id
                    ? "작성 중…"
                    : (blogClip.title_candidates?.length ?? 0) > 0
                      ? "메타데이터 준비됨"
                      : "메타데이터"}
                </button>
                <button className="ghost-button" type="button" onClick={onBackToStudio}>
                  작업실로
                </button>
              </div>
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
            <BlogClipVersionsPanel
              blogClip={blogClip}
              copiedKey={copiedKey}
              onCopyText={onCopyText}
              onBlogClipUpdated={onBlogClipUpdated}
              onMessage={onMessage}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}
