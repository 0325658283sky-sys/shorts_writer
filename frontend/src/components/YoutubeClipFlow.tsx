import { useEffect, useMemo, useRef, useState } from "react";
import { authorizedBlob, authorizedRequest } from "../api/client";
import { friendlyProgressFromVideoStatus } from "../constants";
import type { YoutubeLengthBand } from "../constants";
import type { Clip, ClipMetadata, Highlight, SubtitleStyle, Transcript, TtsMode, Usage, Video, VideoStatusResponse } from "../types";
import { AliveProgressBar } from "./AliveProgressBar";
import { GenerationOptionsPanel } from "./GenerationOptionsPanel";
import type { FlowCrumbState, FlowStepKey } from "./FlowCrumbs";
import { TemplateGalleryStep } from "./TemplateGalleryStep";
import { WaitScreen } from "./WaitScreen";

const FLOW_STEP_IDS = ["progress", "candidates", "generating", "template", "hub"] as const;

type FlowStep = (typeof FLOW_STEP_IDS)[number];

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

function waitCaption(elapsedSec: number, percent: number): string {
  const fmt = (sec: number) => {
    const total = Math.max(0, Math.round(sec));
    const m = Math.floor(total / 60);
    return m ? `${m}분 ${total % 60}초` : `${total}초`;
  };
  if (percent >= 100 || percent <= 12 || elapsedSec < 5) return `${fmt(elapsedSec)} 지남`;
  const remain = (elapsedSec / percent) * (100 - percent);
  return `${fmt(elapsedSec)} 지남 · 약 ${fmt(remain)} 남음`;
}

function mmss(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
  onCrumbChange,
}: {
  video: Video;
  usage?: Usage | null;
  onCrumbChange?: (crumb: FlowCrumbState | null) => void;
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
  onCreateClip: (highlightId: number, removeSilence?: boolean) => Promise<Clip | null>;
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
  const [elapsedSec, setElapsedSec] = useState(0);
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

  const [removeSilence, setRemoveSilence] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"original_audio" | "ai_narration">("original_audio");

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
            : await onCreateClip(highlight.id, removeSilence);
        if (!clip) throw new Error(`쇼츠 생성에 실패했습니다: ${highlight.title}`);
        onStyleChange(clip.id, subtitleStyle);
        let burned = (await onBurnSubtitles(clip, subtitleStyle)) ?? clip;
        if (voiceMode === "ai_narration") {
          try {
            burned = await authorizedRequest<Clip>(`/clips/${burned.id}/narration`, {
              method: "POST",
              body: JSON.stringify({ mode: "ai_narration" }),
            });
          } catch (narrationError) {
            onMessage(narrationError instanceof Error ? narrationError.message : "AI 나레이션 적용에 실패했습니다. 원본 음성으로 두었어요.");
          }
        }
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
  // 후보별 자막 붙이기(generating)는 ①-b 분석 대기의 4번째 단계라 "분석"으로 묶는다.
  const crumbStep: FlowStepKey =
    step === "candidates" ? "candidates" : step === "hub" ? (isTemplateStep ? "template" : "done") : "wait";
  const crumbSource = isYoutubeSource ? "youtube" : "mp4";

  useEffect(() => {
    if (step !== "progress" && step !== "generating") return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSec((Date.now() - startedAt) / 1000), 1000);
    return () => window.clearInterval(timer);
  }, [step]);

  const topHighlight = [...(candidateHighlights.length > 0 ? candidateHighlights : highlights)].sort(
    (a, b) => b.score - a.score,
  )[0];
  const firstFound = topHighlight
    ? {
        text: `"${topHighlight.title}" — ${mmss(topHighlight.start_time)}부터 ${Math.round(topHighlight.end_time - topHighlight.start_time)}초`,
        badge: `${Math.round(topHighlight.score)}점`,
        title: topHighlight.title,
      }
    : null;

  useEffect(() => {
    onCrumbChange?.({ source: crumbSource, step: crumbStep });
    return () => onCrumbChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crumbSource, crumbStep]);

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
      <main className="flow-main">
          {step === "progress" || step === "generating" ? (
            <WaitScreen
              sourceLabel={isYoutubeSource ? "유튜브" : "MP4 파일"}
              title={
                isYoutubeSource
                  ? "영상을 보고 하이라이트를 찾고 있습니다"
                  : "파일을 올리고 하이라이트를 찾고 있습니다"
              }
              steps={
                isYoutubeSource
                  ? ["원본 영상 가져오기", "말소리 받아쓰기", "볼 만한 구간 고르기", "후보별 자막 붙이기"]
                  : ["파일 올리는 중", "말소리 받아쓰기", "볼 만한 구간 고르기", "후보별 자막 붙이기"]
              }
              activeIndex={step === "generating" ? 3 : progress < 40 ? 0 : progress < 68 ? 1 : 2}
              percent={progress}
              caption={waitCaption(elapsedSec, progress)}
              found={firstFound ? { label: "먼저 찾은 구간", text: firstFound.text } : null}
              thumb={firstFound ? { badge: firstFound.badge, title: firstFound.title } : null}
              note={
                isYoutubeSource
                  ? "다 되면 알림 보낼게요"
                  : "페이지를 떠나도 서버 작업은 계속돼요. 업로드가 끊기면 이어서 올립니다."
              }
              onLeave={onBackToStudio}
              footer={
                pipelineError ? (
                  <>
                    <p className="wait-error">{pipelineError}</p>
                    <button
                      className="wait-leave"
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
                ) : null
              }
            />
          ) : null}

          {step === "candidates" ? (
            <section className="flow-card candidates-step">
              <div className="candidates-head">
                <div>
                  <p className="create-kicker">구간 후보</p>
                  <h1>하이라이트 후보 {candidateHighlights.length}개를 찾았어요</h1>
                  <p className="flow-lead">
                    점수와 이유를 보고 쓸 구간을 여러 개 고르세요. 고른 구간마다 쇼츠가 한 편씩 만들어집니다.
                  </p>
                </div>
                <span className="candidates-origin">원본 · {displayTitle}</span>
              </div>
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
                        <span className="candidate-thumb">
                          <span className={`candidate-score ${index === 0 ? "is-top" : ""}`}>
                            {Math.round(highlight.score)}점{index === 0 ? " · 최고" : ""}
                          </span>
                          {selected ? <span className="candidate-check" aria-hidden="true">✓</span> : null}
                          <span className="candidate-at">{mmss(highlight.start_time)}~</span>
                          <span className="candidate-duration">
                            {Math.max(0, Math.round(highlight.end_time - highlight.start_time))}초
                          </span>
                        </span>
                        <strong className="candidate-title">{highlight.title}</strong>
                        <span className="candidate-reason">{highlight.reason}</span>
                      </button>
                    );
                  })}
              </div>
              <div className="candidates-options">
                <span className="candidates-options-label">
                  {isYoutubeSource ? "유튜브" : "MP4"} 옵션 · 고른 구간 전체에 적용
                </span>
                <div className="candidates-option-row">
                  <div>
                    <div className="candidates-option-title">무음 구간 제거</div>
                    <div className="candidates-option-desc">0.6초 넘는 공백을 잘라 템포를 올립니다</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={removeSilence}
                    className={`ncf-switch ${removeSilence ? "is-on" : ""}`}
                    onClick={() => setRemoveSilence((value) => !value)}
                  >
                    <span />
                  </button>
                </div>
                <div className="candidates-option-row">
                  <div>
                    <div className="candidates-option-title">음성</div>
                    <div className="candidates-option-desc">원본 목소리를 쓸지, AI 나레이션으로 덮을지</div>
                  </div>
                  <div className="tone-switch" role="radiogroup" aria-label="음성">
                    {(
                      [
                        ["original_audio", "원본 음성"],
                        ["ai_narration", "AI 나레이션"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={voiceMode === value}
                        className={voiceMode === value ? "is-active" : ""}
                        onClick={() => setVoiceMode(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="image-step-foot candidates-foot">
                <button className="ghost-button" type="button" onClick={onBackToStudio}>
                  ← 다른 링크
                </button>
                <span>
                  <strong>{selectedHighlightIds.length}개</strong> 선택됨 — 선택한 후보마다 쇼츠가 하나씩 만들어집니다
                </span>
                {creditRemaining != null ? (
                  <span className={`candidates-credit ${overBudget ? "is-over" : ""}`}>
                    예상 차감 <strong>{estimatedCost}</strong> / {creditRemaining}회 남음
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
