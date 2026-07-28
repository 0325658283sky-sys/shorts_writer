import { VIDEO_STATUS_LABELS } from "../constants";
import type { Clip, ClipMetadata, Highlight, SubtitleStyle, Transcript, TtsMode, Video } from "../types";
import { formatBytes } from "../utils/format";
import { HighlightList } from "./HighlightList";

export function VideoList({
  videos,
  transcripts,
  highlights,
  clips,
  clipMetadata,
  copiedKey,
  creatingClipId,
  downloadingClipId,
  generatingMetadataId,
  narratingClipId,
  subtitleStyles,
  ttsModes,
  subtitlingClipId,
  analyzingId,
  transcribingId,
  highlightingId,
  focusVideoId,
  onAnalyze,
  onTranscript,
  onHighlights,
  onRefreshStatus,
  onApplyNarration,
  onBurnSubtitles,
  onCreateClip,
  onCopyText,
  onDownloadClip,
  onGenerateMetadata,
  onStyleChange,
  onTtsModeChange,
}: {
  videos: Video[];
  transcripts: Record<number, Transcript>;
  highlights: Record<number, Highlight[]>;
  clips: Record<number, Clip>;
  clipMetadata: Record<number, ClipMetadata>;
  copiedKey: string | null;
  creatingClipId: number | null;
  downloadingClipId: number | null;
  generatingMetadataId: number | null;
  narratingClipId: number | null;
  subtitleStyles: Record<number, SubtitleStyle>;
  ttsModes: Record<number, TtsMode>;
  subtitlingClipId: number | null;
  analyzingId: number | null;
  transcribingId: number | null;
  highlightingId: number | null;
  focusVideoId?: number | null;
  onAnalyze: (videoId: number) => void;
  onTranscript: (videoId: number) => void;
  onHighlights: (videoId: number) => void;
  onRefreshStatus: (videoId: number) => void;
  onApplyNarration: (clip: Clip) => void;
  onBurnSubtitles: (clip: Clip) => void;
  onCreateClip: (highlightId: number) => void;
  onCopyText: (key: string, text: string) => void;
  onDownloadClip: (clip: Clip) => void;
  onGenerateMetadata: (clip: Clip) => void;
  onStyleChange: (clipId: number, style: SubtitleStyle) => void;
  onTtsModeChange: (clipId: number, mode: TtsMode) => void;
}) {
  return (
    <div className="video-list" aria-label="업로드된 영상">
      {videos.length === 0 ? (
        <p className="muted">아직 업로드된 영상이 없습니다.</p>
      ) : (
        videos.map((video) => (
          <article
            className={`video-item ${focusVideoId === video.id ? "is-focused" : ""}`}
            key={video.id}
            id={focusVideoId === video.id ? `video-focus-${video.id}` : undefined}
          >
            <div className="video-copy">
              <h3>{video.original_filename}</h3>
              <p>
                {formatBytes(video.file_size)} · {video.created_at}
              </p>
              {focusVideoId === video.id ? (
                <p className="create-note">
                  {video.status === "transcribed" || transcripts[video.id]?.status === "transcribed"
                    ? "다음: 하이라이트 추천 → 클립 만들기"
                    : video.audio_path || video.status === "audio_extracted"
                      ? "다음: 음성 인식 → 하이라이트 (하이라이트 버튼이 인식까지 자동 진행)"
                      : "다음: 분석 → 음성 인식 → 하이라이트 (하이라이트 버튼이 앞 단계까지 자동 진행)"}
                </p>
              ) : null}
              {video.audio_path ? <p>오디오 추출 완료</p> : null}
              {video.error_message ? <p className="error-text">{video.error_message}</p> : null}
              {transcripts[video.id]?.text ? <p className="transcript-preview">{transcripts[video.id].text}</p> : null}
              {highlights[video.id]?.length ? (
                <HighlightList
                  clips={clips}
                  clipMetadata={clipMetadata}
                  copiedKey={copiedKey}
                  creatingClipId={creatingClipId}
                  downloadingClipId={downloadingClipId}
                  generatingMetadataId={generatingMetadataId}
                  highlights={highlights[video.id]}
                  narratingClipId={narratingClipId}
                  subtitleStyles={subtitleStyles}
                  ttsModes={ttsModes}
                  subtitlingClipId={subtitlingClipId}
                  onApplyNarration={onApplyNarration}
                  onBurnSubtitles={onBurnSubtitles}
                  onCreateClip={onCreateClip}
                  onCopyText={onCopyText}
                  onDownloadClip={onDownloadClip}
                  onGenerateMetadata={onGenerateMetadata}
                  onStyleChange={onStyleChange}
                  onTtsModeChange={onTtsModeChange}
                />
              ) : null}
            </div>
            <div className="video-actions">
              <span className={`status-badge status-${video.status}`}>{VIDEO_STATUS_LABELS[video.status]}</span>
              <button
                className={`small-button ${focusVideoId === video.id ? "cta-button" : ""}`}
                type="button"
                onClick={() => onAnalyze(video.id)}
                disabled={analyzingId === video.id || video.status === "extracting_audio"}
              >
                {analyzingId === video.id ? "분석 중" : focusVideoId === video.id ? "분석하기" : "분석"}
              </button>
              <button
                className="small-button"
                type="button"
                onClick={() => onTranscript(video.id)}
                disabled={transcribingId === video.id || video.status === "transcribing"}
              >
                {transcribingId === video.id ? "인식 중" : "음성 인식"}
              </button>
              <button
                className="small-button"
                type="button"
                onClick={() => onHighlights(video.id)}
                disabled={
                  highlightingId === video.id ||
                  analyzingId === video.id ||
                  transcribingId === video.id ||
                  video.status === "extracting_audio" ||
                  video.status === "transcribing"
                }
                title="전사 전이면 분석·음성 인식을 먼저 자동 실행합니다"
              >
                {highlightingId === video.id
                  ? transcribingId === video.id
                    ? "인식 후 추천 중"
                    : "추천 중"
                  : "하이라이트 추천"}
              </button>
              <button className="small-button ghost-small" type="button" onClick={() => onRefreshStatus(video.id)}>
                새로고침
              </button>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
