import { useEffect, useMemo, useRef, useState } from "react";
import { authorizedBlob, authorizedRequest } from "../api/client";
import { friendlyProgressFromVideoStatus } from "../constants";
import type { YoutubeLengthBand } from "../constants";
import type { Clip, ClipMetadata, Highlight, SubtitleStyle, Transcript, TtsMode, Usage, Video, VideoStatusResponse } from "../types";
import { AliveProgressBar } from "./AliveProgressBar";
import { GenerationOptionsPanel } from "./GenerationOptionsPanel";
import { TemplateGalleryStep } from "./TemplateGalleryStep";

const FLOW_STEPS = [
  { id: "progress", label: "분석" },
  { id: "candidates", label: "후보" },
  { id: "generating", label: "생성" },
  { id: "template", label: "템플릿" },
  { id: "hub", label: "완료" },
] as const;

type FlowStep = (typeof FLOW_STEPS)[number]["id"];

function durationMatchesBand(seconds: number, band: YoutubeLengthBand): boolean {
  if (band === "short") return seconds <= 25;
  if (band === "long") return seconds > 45;
  return seconds > 25 && seconds <= 45;
}

function pickHighlightTargets(highlights: Highlight[], count: number, band: YoutubeLengthBand): Highlight[] {
  const ranked = [...highlights].sort((a, b) => b.score - a.score || a.start_time - b.start_time);
  const inBand = ranked.filter((item) => durationMatchesBand(Math.max(0, item.end_time - item.start_time), band));
  const pool = inBand.length >= Math.min(count, ranked.length) ? inBand : ranked;
  return pool.slice(0, count);
}

export function YoutubeClipFlow({
  video,
  highlights,
  clips,
  projectTitle,
  projectChannel,
  projectThumbnailUrl,
  downloadingClipId,
  initialSubtitleStyle,
  onBackToStudio,
  onVideoUpdated,
  onHighlightsReady,
  onTranscriptReady,
  onCreateClip,
  onBurnSubtitles,
  onStyleChange,
  onOpenDetailedEditor,
  onMessage,
  shortsCount = 2,
  lengthBand = "medium",
  usage = null,
}: {
  video: Video;
  usage?: Usage | null;
  highlights: Highlight[];
  clips: Record<number, Clip>;
  projectTitle?: string | null;
  projectChannel?: string | null;
  projectThumbnailUrl?: string | null;
  clipMetadata?: Record<number, ClipMetadata>;
  copiedKey?: string | null;
  downloadingClipId?: number | null;
  generatingMetadataId?: number | null;
  narratingClipId?: number | null;
  subtitleStyles?: Record<number, SubtitleStyle>;
  ttsModes?: Record<number, TtsMode>;
  subtitlingClipId?: number | null;
  initialSubtitleStyle?: SubtitleStyle;
  onBackToStudio: () => void;
  onVideoUpdated: (status: VideoStatusResponse) => void;
  onHighlightsReady: (videoId: number, items: Highlight[]) => void;
  onTranscriptReady: (videoId: number, transcript: Transcript) => void;
  onCreateClip: (highlightId: number) => Promise<Clip | null>;
  onBurnSubtitles: (clip: Clip, style?: SubtitleStyle) => Promise<Clip | null>;
  onApplyNarration?: (clip: Clip) => void;
  onGenerateMetadata?: (clip: Clip) => void;
  onDownloadClip?: (clip: Clip) => void;
  onCopyText?: (key: string, text: string) => void;
  onStyleChange: (clipId: number, style: SubtitleStyle) => void;
  onTtsModeChange?: (clipId: number, mode: TtsMode) => void;
  onOpenDetailedEditor: (clip: Clip) => void;
  onMessage: (message: string) => void;
  shortsCount?: number;
  lengthBand?: YoutubeLengthBand;
}) {
  const [step, setStep] = useState<FlowStep>("progress");
  const [progress, setProgress] = useState(8);
  const [stageLabel, setStageLabel] = useState(() => friendlyProgressFromVideoStatus(video.status).label);
  const [pipelineError, setPipelineError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [hubThumb, setHubThumb] = useState<string | null>(projectThumbnailUrl ?? null);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [localClips, setLocalClips] = useState<Clip[]>([]);
  // ② 구간 후보 비교: 자동으로 상위 N개를 바로 만들지 않고, 점수·이유를 보여주고 사용자가 여러 개 고르게 한다.
  const [candidateHighlights, setCandidateHighlights] = useState<Highlight[]>([]);
  const [selectedHighlightIds, setSelectedHighlightIds] = useState<number[]>([]);
  // ④ 템플릿 갤러리: 쇼츠 생성 완료 후 한 번 보여주고, 적용/건너뛰기 후엔 숨긴다(블로그 흐름과 동일 패턴).
  const [showTemplateGallery, setShowTemplateGallery] = useState(true);
  const autoGenRef = useRef(false);
  const hubUrlRef = useRef<string | null>(null);

  const subtitleStyle = initialSubtitleStyle ?? "shorts";
  const displayTitle = projectTitle?.trim() || video.original_filename;
  // 채널 정보는 유튜브 가져오기에서만 채워진다(MP4 업로드는 없음) — ①-b 대기 문구 분기용.
  const isYoutubeSource = Boolean(projectChannel);

  const videoClips = useMemo(() => {
    return Object.values(clips)
      .filter((clip) => clip.video_id === video.id && clip.status === "completed")
      .sort((a, b) => a.highlight_id - b.highlight_id);
  }, [clips, video.id]);

  const pickHighlights = useMemo(
    () => pickHighlightTargets(highlights, shortsCount, lengthBand),
    [highlights, shortsCount, lengthBand],
  );

  useEffect(() => {
    if (projectThumbnailUrl) {
      setHubThumb(projectThumbnailUrl);
      return;
    }
    const first = pickHighlights[0] ?? highlights[0];
    if (!first) return;
    let cancelled = false;
    authorizedBlob(`/videos/${video.id}/highlights/${first.id}/thumbnail`)
      .then((blob) => {
        if (cancelled) return;
        if (hubUrlRef.current) URL.revokeObjectURL(hubUrlRef.current);
        const url = URL.createObjectURL(blob);
        hubUrlRef.current = url;
        setHubThumb(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectThumbnailUrl, pickHighlights, highlights, video.id]);

  useEffect(() => {
    return () => {
      if (hubUrlRef.current) URL.revokeObjectURL(hubUrlRef.current);
    };
  }, []);

  function enterCandidates(items: Highlight[]) {
    setCandidateHighlights(items);
    const preselected = pickHighlightTargets(items, shortsCount, lengthBand);
    setSelectedHighlightIds(preselected.map((item) => item.id));
    setStep("candidates");
  }

  async function generateShorts(targets: Highlight[]) {
    if (autoGenRef.current) return;
    autoGenRef.current = true;
    setStep("generating");
    setPipelineError("");

    if (targets.length === 0) {
      setPipelineError("생성할 하이라이트가 없습니다.");
      setStageLabel("생성 실패");
      autoGenRef.current = false;
      return;
    }

    let done = 0;
    setGeneratedCount(0);
    setProgress(78);
    setStageLabel(`쇼츠 생성 중 · 0/${targets.length}`);

    try {
      const made: Clip[] = [];
      for (const highlight of targets) {
        const existing =
          clips[highlight.id] ??
          localClips.find((item) => item.highlight_id === highlight.id) ??
          null;
        const clip =
          existing && existing.status === "completed"
            ? existing
            : await onCreateClip(highlight.id);
        if (!clip) throw new Error(`쇼츠 생성에 실패했습니다: ${highlight.title}`);
        onStyleChange(clip.id, subtitleStyle);
        const burned = (await onBurnSubtitles(clip, subtitleStyle)) ?? clip;
        made.push(burned);
        done += 1;
        setGeneratedCount(done);
        setLocalClips([...made]);
        setProgress(78 + Math.round((done / targets.length) * 22));
        setStageLabel(`쇼츠 생성 중 · ${done}/${targets.length}`);
      }
      setProgress(100);
      setStageLabel("쇼츠 생성 완료");
      setStep("hub");
      onMessage(`${done}개의 쇼츠가 준비되었습니다. 카드를 눌러 편집하세요.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "쇼츠 생성에 실패했습니다.";
      setPipelineError(message);
      onMessage(message);
      setStageLabel("생성 실패");
      if (done > 0) setStep("hub");
    } finally {
      autoGenRef.current = false;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function runPipeline() {
      setStep("progress");
      setPipelineError("");
      autoGenRef.current = false;
      try {
        let latest = video;
        setProgress(12);
        setStageLabel(`${friendlyProgressFromVideoStatus("extracting_audio").label} · 오디오 추출`);
        if (!latest.audio_path || latest.status === "uploaded" || latest.status === "failed") {
          const analyzed = await authorizedRequest<VideoStatusResponse>(`/videos/${latest.id}/analyze`, {
            method: "POST",
          });
          if (cancelled) return;
          onVideoUpdated(analyzed);
          latest = { ...latest, ...analyzed };
        }

        setProgress(40);
        setStageLabel(`${friendlyProgressFromVideoStatus("transcribing").label} · 음성 인식`);
        if (latest.status !== "transcribed") {
          const transcript = await authorizedRequest<Transcript>(`/videos/${latest.id}/transcript`);
          if (cancelled) return;
          onTranscriptReady(latest.id, transcript);
          const nextStatus: VideoStatusResponse = {
            id: latest.id,
            status: "transcribed",
            audio_path: latest.audio_path,
            error_message: null,
            updated_at: transcript.updated_at,
          };
          onVideoUpdated(nextStatus);
          latest = { ...latest, ...nextStatus };
        }

        setProgress(68);
        setStageLabel(`${friendlyProgressFromVideoStatus("transcribed").label} · 편집점 분석`);
        const items = await authorizedRequest<Highlight[]>(`/videos/${latest.id}/highlights`);
        if (cancelled) return;
        onHighlightsReady(latest.id, items);
        setProgress(100);
        setStageLabel("볼 만한 구간 후보 준비 완료");
        if (!cancelled) enterCandidates(items);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "유튜브 하이라이트 추출에 실패했습니다.";
        setPipelineError(message);
        onMessage(message);
        setStageLabel("준비 · 추출 실패");
      }
    }

    const existingCompleted = Object.values(clips).filter(
      (clip) => clip.video_id === video.id && clip.status === "completed",
    );
    if (existingCompleted.length > 0) {
      setProgress(100);
      setStageLabel("쇼츠 생성 완료");
      setGeneratedCount(existingCompleted.length);
      setLocalClips(existingCompleted);
      setStep("hub");
      return;
    }

    if (highlights.length > 0) {
      enterCandidates(highlights);
      return;
    }

    void runPipeline();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, retryNonce]);

  const workspaceClips = localClips.length > 0 ? localClips : videoClips;
  const isTemplateStep = step === "hub" && showTemplateGallery && workspaceClips.length > 0;
  const stepIndex =
    step === "progress" ? 0 : step === "candidates" ? 1 : step === "generating" ? 2 : isTemplateStep ? 3 : 4;

  const creditRemaining = usage?.remaining ?? null;
  const estimatedCost = selectedHighlightIds.length;
  const overBudget = creditRemaining != null && estimatedCost > creditRemaining;

  function toggleCandidate(highlightId: number) {
    setSelectedHighlightIds((current) => {
      if (current.includes(highlightId)) return current.filter((id) => id !== highlightId);
      if (creditRemaining != null && current.length >= creditRemaining) {
        onMessage(`남은 크레딧(${creditRemaining}개)만큼만 고를 수 있어요.`);
        return current;
      }
      return [...current, highlightId];
    });
  }

  function handleContinueFromCandidates() {
    const chosen = candidateHighlights.filter((item) => selectedHighlightIds.includes(item.id));
    if (chosen.length === 0) {
      onMessage("하이라이트를 하나 이상 골라주세요.");
      return;
    }
    void generateShorts(chosen);
  }

  async function handleTemplateApplied(updated: Clip) {
    const templateId = updated.subtitle_template_id ?? null;
    const rest = workspaceClips.filter((item) => item.id !== updated.id);
    const appliedRest: Clip[] = [];
    if (templateId) {
      for (const item of rest) {
        try {
          const applied = await authorizedRequest<Clip>(`/clips/${item.id}/template`, {
            method: "PATCH",
            body: JSON.stringify({ template_id: templateId }),
          });
          appliedRest.push(applied);
        } catch {
          appliedRest.push(item);
        }
      }
    } else {
      appliedRest.push(...rest);
    }
    const merged = [updated, ...appliedRest].sort((a, b) => a.highlight_id - b.highlight_id);
    setLocalClips(merged);
    setShowTemplateGallery(false);
  }

  function handleOpenWorkspace() {
    const first = workspaceClips[0];
    if (!first) {
      onMessage("아직 생성된 쇼츠가 없습니다.");
      return;
    }
    onOpenDetailedEditor(first);
  }

  return (
    <div className="flow-shell">
      <nav className="flow-progress-bar" aria-label="제작 단계">
        <ol className="flow-stepper-list">
          {FLOW_STEPS.map((item, index) => {
            const isCurrent = index === stepIndex;
            const isDone = index < stepIndex;
            return (
              <li key={item.id}>
                <div
                  className={`flow-stepper-item ${isCurrent ? "is-current" : ""} ${isDone ? "is-done" : ""}`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  <span className="flow-step-dot">{index + 1}</span>
                  <span>{item.label}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="flow-main">
          {step === "progress" || step === "generating" ? (
            <section className="flow-card flow-progress-card" aria-live="polite">
              <p className="create-kicker">{step === "generating" ? "쇼츠 생성" : "AI 편집점"}</p>
              <h1>
                {step === "generating"
                  ? "쇼츠를 만들고 있어요"
                  : isYoutubeSource
                    ? "원본 영상을 보고 하이라이트를 찾고 있어요"
                    : "파일을 올리고 하이라이트를 찾고 있어요"}
              </h1>
              <p className="flow-lead">
                {step === "generating"
                  ? "선택한 템플릿에 맞춰 자막을 입히고 미리보기를 준비합니다."
                  : "원본 영상 가져오기 → 말소리 받아쓰기 → 볼 만한 구간 고르기 → 후보별 자막 붙이기. 프로젝트 탭으로 나가도 됩니다."}
              </p>
              <AliveProgressBar percent={progress} active={!pipelineError && progress < 100} label={stageLabel} />
              {pipelineError ? (
                <>
                  <p className="form-message">{pipelineError}</p>
                  <button
                    className="cta-button"
                    type="button"
                    onClick={() => {
                      setPipelineError("");
                      setProgress(8);
                      autoGenRef.current = false;
                      setRetryNonce((n) => n + 1);
                    }}
                  >
                    다시 시도
                  </button>
                </>
              ) : null}
              <p className="create-note muted">{displayTitle}</p>
              <button className="ghost-button" type="button" onClick={onBackToStudio}>
                프로젝트 목록으로
              </button>
            </section>
          ) : null}

          {step === "candidates" ? (
            <section className="flow-card candidates-step">
              <p className="create-kicker">구간 후보</p>
              <h1>하이라이트 후보 {candidateHighlights.length}개를 찾았어요</h1>
              <p className="flow-lead">
                점수와 이유를 보고 쓸 구간을 여러 개 고르세요. 고른 구간마다 쇼츠가 한 편씩 만들어집니다.
              </p>
              <div className="candidates-grid">
                {[...candidateHighlights]
                  .sort((a, b) => b.score - a.score)
                  .map((highlight, index) => {
                    const selected = selectedHighlightIds.includes(highlight.id);
                    const blocked = !selected && creditRemaining != null && selectedHighlightIds.length >= creditRemaining;
                    return (
                      <button
                        key={highlight.id}
                        type="button"
                        className={`candidate-card ${selected ? "is-selected" : ""}`}
                        aria-pressed={selected}
                        disabled={blocked}
                        onClick={() => toggleCandidate(highlight.id)}
                      >
                        <span className={`candidate-score ${index === 0 ? "is-top" : ""}`}>
                          {Math.round(highlight.score)}점{index === 0 ? " · 최고" : ""}
                        </span>
                        {selected ? <span className="candidate-check" aria-hidden="true">✓</span> : null}
                        <span className="candidate-duration">
                          {Math.max(0, Math.round(highlight.end_time - highlight.start_time))}초
                        </span>
                        <strong className="candidate-title">{highlight.title}</strong>
                        <span className="candidate-reason">{highlight.reason}</span>
                      </button>
                    );
                  })}
              </div>
              <div className="image-step-foot candidates-foot">
                <span>
                  <strong>{selectedHighlightIds.length}개</strong> 선택됨 — 선택한 후보마다 쇼츠가 하나씩 만들어집니다
                </span>
                {creditRemaining != null ? (
                  <span className={`candidates-credit ${overBudget ? "is-over" : ""}`}>
                    예상 차감 {estimatedCost} / {creditRemaining}회 남음
                  </span>
                ) : null}
                <button
                  className="btn-primary btn-lg flow-primary-cta"
                  type="button"
                  disabled={selectedHighlightIds.length === 0 || overBudget}
                  onClick={handleContinueFromCandidates}
                >
                  선택한 구간으로 계속
                </button>
              </div>
            </section>
          ) : null}

          {isTemplateStep ? (
            <TemplateGalleryStep
              clip={workspaceClips[0]}
              clipKind="youtube"
              onContinue={(updated) => void handleTemplateApplied(updated as Clip)}
              onSkip={() => setShowTemplateGallery(false)}
              onMessage={onMessage}
              optionsPanel={workspaceClips[0] ? <GenerationOptionsPanel clipKind="youtube" clip={workspaceClips[0]} /> : undefined}
            />
          ) : null}

          {step === "hub" && !isTemplateStep ? (
            <section className="flow-card yt-hub-section">
              <p className="create-kicker">프로젝트</p>
              <h1>{displayTitle}</h1>
              <p className="flow-lead">쇼츠 카드를 누르면 미리보기와 자막·음성을 고칩니다.</p>
              <div className="yt-hub-grid">
                {workspaceClips.map((clip, index) => (
                  <button key={clip.id} type="button" className="yt-hub-card" onClick={() => onOpenDetailedEditor(clip)}>
                    <div className="yt-hub-thumb">
                      {hubThumb ? <img src={hubThumb} alt="" /> : <span className="muted">미리보기</span>}
                      <span className="yt-hub-duration-badge">쇼츠 {index + 1}</span>
                    </div>
                    <div className="yt-hub-copy">
                      <strong>쇼츠 {index + 1}</strong>
                      <span className="muted">{projectChannel || "하이라이트"}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flow-step-actions">
                <button className="ghost-button" type="button" onClick={onBackToStudio}>
                  프로젝트 목록
                </button>
                <button
                  className="cta-button flow-primary-cta"
                  type="button"
                  disabled={workspaceClips.length === 0}
                  onClick={handleOpenWorkspace}
                >
                  첫 쇼츠 편집 →
                </button>
              </div>
            </section>
          ) : null}
        </main>
    </div>
  );
}
