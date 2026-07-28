import { useEffect, useMemo, useState, type MouseEvent } from "react";
import type {
  BlogClip,
  Clip,
  ClipMetadata,
  Highlight,
  SubtitleStyle,
  Transcript,
  TtsMode,
  Video,
} from "../types";
import {
  PROJECT_SOURCE_LABELS,
  buildProjectListItems,
  type ProjectBucket,
  type ProjectListItem,
  type ProjectSource,
} from "../lib/projectAdapters";
import { BlogClipThumb } from "./BlogClipThumb";
import { ClipsLibrary } from "./ClipsLibrary";
import { VideoList } from "./VideoList";

type ProjectsView = ProjectBucket | "advanced";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function canDownloadBlogClip(blogClip: BlogClip): boolean {
  return Boolean(blogClip.subtitled_video_path || blogClip.video_path);
}

function primaryActionLabel(item: ProjectListItem): string {
  if (item.bucket === "done") return "결과 보기";
  if (item.kind === "blog" && item.blogClip?.status === "awaiting_boards") return "편집 이어하기";
  return "이어하기";
}

export function ProjectsPage({
  blogClips,
  videos,
  transcripts,
  highlights,
  clips,
  clipMetadata,
  copiedKey,
  creatingClipId,
  downloadingClipId,
  downloadingBlogClipId,
  generatingMetadataId,
  narratingClipId,
  subtitleStyles,
  ttsModes,
  subtitlingClipId,
  analyzingId,
  transcribingId,
  highlightingId,
  onResumeBlogClip,
  onDownloadBlogClip,
  onResumeVideo,
  onResumeClip,
  onCreateNew,
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
  projectsTabRequest,
  focusVideoId,
  onProjectsTabRequestConsumed,
}: {
  blogClips: BlogClip[];
  videos: Video[];
  transcripts: Record<number, Transcript>;
  highlights: Record<number, Highlight[]>;
  clips: Record<number, Clip>;
  clipMetadata: Record<number, ClipMetadata>;
  copiedKey: string | null;
  creatingClipId: number | null;
  downloadingClipId: number | null;
  downloadingBlogClipId: number | null;
  generatingMetadataId: number | null;
  narratingClipId: number | null;
  subtitleStyles: Record<number, SubtitleStyle>;
  ttsModes: Record<number, TtsMode>;
  subtitlingClipId: number | null;
  analyzingId: number | null;
  transcribingId: number | null;
  highlightingId: number | null;
  onResumeBlogClip: (blogClip: BlogClip) => void;
  onDownloadBlogClip: (blogClip: BlogClip) => void;
  onResumeVideo: (video: Video) => void;
  onResumeClip: (clip: Clip) => void;
  onCreateNew: () => void;
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
  projectsTabRequest?: ProjectsView | null;
  focusVideoId?: number | null;
  onProjectsTabRequestConsumed?: () => void;
}) {
  const [view, setView] = useState<ProjectsView>("in_progress");
  const [sourceFilter, setSourceFilter] = useState<ProjectSource | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!projectsTabRequest) return;
    setView(projectsTabRequest);
    onProjectsTabRequestConsumed?.();
  }, [projectsTabRequest, onProjectsTabRequestConsumed]);

  const allItems = useMemo(
    () => buildProjectListItems({ blogClips, videos, clips }),
    [blogClips, videos, clips],
  );

  const inProgressCount = useMemo(
    () => allItems.filter((item) => item.bucket === "in_progress").length,
    [allItems],
  );
  const doneCount = useMemo(() => allItems.filter((item) => item.bucket === "done").length, [allItems]);

  const filteredItems = useMemo(() => {
    if (view === "advanced") return [];
    const q = query.trim().toLowerCase();
    return allItems.filter((item) => {
      if (item.bucket !== view) return false;
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || item.meta.toLowerCase().includes(q);
    });
  }, [allItems, view, sourceFilter, query]);

  function stopRow(event: MouseEvent) {
    event.stopPropagation();
  }

  function resumeItem(item: ProjectListItem) {
    if (item.kind === "blog" && item.blogClip) {
      onResumeBlogClip(item.blogClip);
      return;
    }
    if (item.kind === "video" && item.video) {
      onResumeVideo(item.video);
      return;
    }
    if (item.kind === "clip" && item.clip) {
      onResumeClip(item.clip);
    }
  }

  return (
    <section className="projects-page" aria-label="프로젝트">
      <div className="projects-panel">
        <header className="projects-header">
          <div>
            <h1 className="projects-title">프로젝트</h1>
            <p className="projects-lead">작업 중과 완료를 한곳에서 이어하세요. 소스만 다를 뿐 같은 목록입니다.</p>
          </div>
          <button className="btn-primary" type="button" onClick={onCreateNew}>
            새 프로젝트
          </button>
        </header>

        <div className="projects-toolbar">
          <div className="projects-tabs" role="tablist" aria-label="프로젝트 상태">
            <button
              type="button"
              role="tab"
              aria-selected={view === "in_progress"}
              className={`projects-tab ${view === "in_progress" ? "is-active" : ""}`}
              onClick={() => setView("in_progress")}
            >
              작업 중
              <span className="projects-tab-count">{inProgressCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "done"}
              className={`projects-tab ${view === "done" ? "is-active" : ""}`}
              onClick={() => setView("done")}
            >
              완료
              <span className="projects-tab-count">{doneCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "advanced"}
              className={`projects-tab ${view === "advanced" ? "is-active" : ""}`}
              onClick={() => setView("advanced")}
            >
              고급
            </button>
          </div>
          {view !== "advanced" ? (
            <label className="projects-search">
              <span className="sr-only">프로젝트 검색</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목 또는 URL 검색"
              />
            </label>
          ) : null}
        </div>

        {view !== "advanced" ? (
          <div className="projects-source-filters" role="group" aria-label="소스 필터">
            <button
              type="button"
              className={`projects-chip ${sourceFilter === "all" ? "is-active" : ""}`}
              onClick={() => setSourceFilter("all")}
            >
              전체
            </button>
            {(Object.keys(PROJECT_SOURCE_LABELS) as ProjectSource[]).map((source) => (
              <button
                key={source}
                type="button"
                className={`projects-chip ${sourceFilter === source ? "is-active" : ""}`}
                onClick={() => setSourceFilter(source)}
              >
                {PROJECT_SOURCE_LABELS[source]}
              </button>
            ))}
          </div>
        ) : null}

        {view === "advanced" ? (
          <div className="projects-advanced">
            <p className="create-note">
              고전 VideoList·클립 라이브러리입니다. 새 작업은 위 <strong>작업 중 / 완료</strong>에서 이어하세요.
            </p>
            {focusVideoId ? (
              <p className="create-note">
                방금 가져온 영상 #{focusVideoId} — 가이드 흐름이 아니라 여기서 단계별로 진행할 수 있습니다.
              </p>
            ) : null}
            <div className="projects-video-wrap">
              <VideoList
                videos={videos}
                transcripts={transcripts}
                highlights={highlights}
                clips={clips}
                clipMetadata={clipMetadata}
                copiedKey={copiedKey}
                creatingClipId={creatingClipId}
                downloadingClipId={downloadingClipId}
                generatingMetadataId={generatingMetadataId}
                narratingClipId={narratingClipId}
                subtitleStyles={subtitleStyles}
                ttsModes={ttsModes}
                subtitlingClipId={subtitlingClipId}
                analyzingId={analyzingId}
                transcribingId={transcribingId}
                highlightingId={highlightingId}
                focusVideoId={focusVideoId}
                onAnalyze={onAnalyze}
                onTranscript={onTranscript}
                onHighlights={onHighlights}
                onRefreshStatus={onRefreshStatus}
                onApplyNarration={onApplyNarration}
                onBurnSubtitles={onBurnSubtitles}
                onCreateClip={onCreateClip}
                onCopyText={onCopyText}
                onDownloadClip={onDownloadClip}
                onGenerateMetadata={onGenerateMetadata}
                onStyleChange={onStyleChange}
                onTtsModeChange={onTtsModeChange}
              />
            </div>
            <h2 className="projects-advanced-title">클립 라이브러리</h2>
            <ClipsLibrary onDownload={onDownloadClip} downloadingClipId={downloadingClipId} />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="projects-empty">
            <p>
              {allItems.length === 0
                ? "아직 만든 프로젝트가 없습니다."
                : view === "in_progress"
                  ? "진행 중인 작업이 없습니다."
                  : "완료된 결과가 없습니다."}
            </p>
            {allItems.length === 0 ? (
              <button className="btn-outline" type="button" onClick={onCreateNew}>
                새 프로젝트 만들기 →
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="projects-list">
            {filteredItems.map((item) => {
              const blogClip = item.blogClip;
              const downloadableBlog = blogClip ? canDownloadBlogClip(blogClip) : false;
              const downloadingBlog = blogClip != null && downloadingBlogClipId === blogClip.id;
              const downloadingClip = item.clip != null && downloadingClipId === item.clip.id;
              return (
                <li key={item.key}>
                  <div
                    className="projects-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => resumeItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        resumeItem(item);
                      }
                    }}
                  >
                    {item.kind === "blog" && blogClip ? (
                      <BlogClipThumb blogClipId={blogClip.id} title={blogClip.blog_title} />
                    ) : (
                      <div className="projects-thumb projects-thumb-fallback" aria-hidden>
                        {PROJECT_SOURCE_LABELS[item.source].slice(0, 1)}
                      </div>
                    )}
                    <div className="projects-row-main">
                      <strong>{item.title}</strong>
                      <span className="projects-row-meta">
                        {PROJECT_SOURCE_LABELS[item.source]} · {formatDate(item.updatedAt)}
                        {item.progressLabel ? ` · ${item.progressLabel}` : ""}
                      </span>
                      <span className={`status-badge status-${item.blogClip?.status ?? item.clip?.status ?? "uploaded"}`}>
                        {item.statusLabel}
                      </span>
                    </div>
                    <div className="projects-row-actions" onClick={stopRow}>
                      {item.kind === "blog" && blogClip && downloadableBlog ? (
                        <button
                          className="small-button ghost-small"
                          type="button"
                          disabled={downloadingBlog}
                          onClick={() => onDownloadBlogClip(blogClip)}
                        >
                          {downloadingBlog ? "다운로드 중" : "다운로드"}
                        </button>
                      ) : null}
                      {item.kind === "clip" && item.clip ? (
                        <button
                          className="small-button ghost-small"
                          type="button"
                          disabled={downloadingClip}
                          onClick={() => onDownloadClip(item.clip!)}
                        >
                          {downloadingClip ? "다운로드 중" : "다운로드"}
                        </button>
                      ) : null}
                      <button className="small-button" type="button" onClick={() => resumeItem(item)}>
                        {primaryActionLabel(item)}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
