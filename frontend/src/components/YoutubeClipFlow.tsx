import { useEffect, useMemo, useRef, useState } from "react";
import { authorizedBlob, authorizedRequest } from "../api/client";
import { VIDEO_STATUS_LABELS, friendlyProgressFromVideoStatus } from "../constants";
import type { Clip, ClipMetadata, Highlight, SubtitleStyle, Transcript, TtsMode, Video, VideoStatusResponse } from "../types";
import { AliveProgressBar } from "./AliveProgressBar";

const FLOW_STEPS = [
  { id: "progress", label: "분석" },
  { id: "generating", label: "생성" },
  { id: "hub", label: "완료" },
] as const;

type FlowStep = (typeof FLOW_STEPS)[number]["id"];

const AUTO_SHORTS_COUNT = 2;

function CompletedProjectCard({
  video,
  shortsCount,
  thumbnailUrl,
  channel,
  title,
  onOpen,
}: {
  video: Video;
  shortsCount: number;
  thumbnailUrl: string | null;
  channel: string | null;
  title: string;
  onOpen: () => void;
}) {
  const dateLabel = useMemo(() => {
    try {
      const d = new Date(video.updated_at || video.created_at);
      return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
    } catch {
      return "";
    }
  }, [video.updated_at, video.created_at]);

  return (
    <button type="button" className="yt-hub-card" onClick={onOpen}>
      <div className="yt-hub-thumb">
        {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <span className="muted">미리보기</span>}
        <span className="yt-hub-duration-badge">{shortsCount} Shorts</span>
      </div>
      <div className="yt-hub-copy">
        <strong>{title}</strong>
        {channel ? <span className="muted">{channel}</span> : null}
        <div className="yt-hub-status">
          <span className="yt-hub-done">✓ 완료</span>
          <span className="muted">{shortsCount} Shorts</span>
          {dateLabel ? <span className="muted">{dateLabel}</span> : null}
        </div>
      </div>
    </button>
  );
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
}: {
  video: Video;
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
}) {
  const [step, setStep] = useState<FlowStep>("progress");
  const [progress, setProgress] = useState(8);
  const [stageLabel, setStageLabel] = useState(() => friendlyProgressFromVideoStatus(video.status).label);
  const [pipelineError, setPipelineError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [hubThumb, setHubThumb] = useState<string | null>(projectThumbnailUrl ?? null);
  const [generatedCount, setGeneratedCount] = useState(0);
  const [localClips, setLocalClips] = useState<Clip[]>([]);
  const autoGenRef = useRef(false);
  const hubUrlRef = useRef<string | null>(null);

  const subtitleStyle = initialSubtitleStyle ?? "shorts";
  const displayTitle = projectTitle?.trim() || video.original_filename;

  const videoClips = useMemo(() => {
    return Object.values(clips)
      .filter((clip) => clip.video_id === video.id && clip.status === "completed")
      .sort((a, b) => a.highlight_id - b.highlight_id);
  }, [clips, video.id]);

  const pickHighlights = useMemo(
    () =>
      [...highlights]
        .sort((a, b) => b.score - a.score || a.start_time - b.start_time)
        .slice(0, AUTO_SHORTS_COUNT),
    [highlights],
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

  async function generateShorts(items: Highlight[]) {
    if (autoGenRef.current) return;
    autoGenRef.current = true;
    setStep("generating");
    setPipelineError("");
    const targets = [...items]
      .sort((a, b) => b.score - a.score || a.start_time - b.start_time)
      .slice(0, AUTO_SHORTS_COUNT);

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
        setProgress(76);
        setStageLabel("편집점 확정 · 쇼츠 생성 준비");
        if (!cancelled) await generateShorts(items);
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
      void generateShorts(highlights);
      return;
    }

    void runPipeline();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, retryNonce]);

  const stepIndex = step === "progress" ? 0 : step === "generating" ? 1 : 2;
  const workspaceClips = localClips.length > 0 ? localClips : videoClips;
  const shortsCount = Math.max(generatedCount, workspaceClips.length);

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
      <header className="flow-topbar">
        <button className="ghost-button" type="button" onClick={onBackToStudio}>
          ← 작업실로
        </button>
        <div className="flow-brand">
          <strong>New Cut</strong>
          <span>유튜브 클립</span>
        </div>
        <span className={`status-badge status-${video.status}`}>{VIDEO_STATUS_LABELS[video.status]}</span>
      </header>

      <div className="flow-body">
        <aside className="flow-stepper" aria-label="제작 단계">
          <p className="flow-stepper-title">진행 단계</p>
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
        </aside>

        <main className="flow-main">
          {step === "progress" || step === "generating" ? (
            <section className="flow-card flow-progress-card" aria-live="polite">
              <p className="create-kicker">{step === "generating" ? "쇼츠 생성" : "AI 편집점"}</p>
              <h1>
                {step === "generating"
                  ? "쇼츠를 만들고 있어요"
                  : "AI가 바이럴 구간을 찾고 있어요"}
              </h1>
              <p className="flow-lead">
                {step === "generating"
                  ? "선택한 템플릿에 맞춰 자막을 입히고 미리보기를 준비합니다."
                  : "롱폼에서 하이라이트를 잡은 뒤 쇼츠로 자동 변환합니다."}
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
            </section>
          ) : null}

          {step === "hub" ? (
            <section className="flow-card yt-hub-section">
              <p className="create-kicker">완료된 프로젝트</p>
              <h1>쇼츠가 준비되었습니다</h1>
              <p className="flow-lead">카드를 누르면 세부 편집 화면으로 이동합니다.</p>
              <div className="yt-hub-grid">
                <CompletedProjectCard
                  video={video}
                  shortsCount={shortsCount || AUTO_SHORTS_COUNT}
                  thumbnailUrl={hubThumb}
                  channel={projectChannel ?? null}
                  title={displayTitle}
                  onOpen={handleOpenWorkspace}
                />
              </div>
              <div className="flow-step-actions">
                <button className="ghost-button" type="button" onClick={onBackToStudio}>
                  작업실로
                </button>
                <button
                  className="cta-button flow-primary-cta"
                  type="button"
                  disabled={workspaceClips.length === 0}
                  onClick={handleOpenWorkspace}
                >
                  세부 편집 열기 →
                </button>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
