import { useEffect, useState } from "react";
import { API_BASE_URL, authorizedRequest } from "../api/client";
import {
  BLOG_CLIP_POLL_INTERVAL_MS,
  BLOG_CLIP_STATUS_LABELS,
  BLOG_PROGRESS_STAGE_LABELS,
  TOKEN_KEY,
} from "../constants";
import type { BlogClip, BlogClipVersion } from "../types";
import { MetadataBox } from "./MetadataBox";

export function BlogClipVersionsPanel({
  blogClip,
  copiedKey,
  onCopyText,
  onBlogClipUpdated,
  onMessage,
}: {
  blogClip: BlogClip;
  copiedKey: string | null;
  onCopyText: (key: string, text: string) => void;
  onBlogClipUpdated?: (blogClip: BlogClip) => void;
  onMessage?: (message: string) => void;
}) {
  const [versions, setVersions] = useState<BlogClipVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [creatingVersions, setCreatingVersions] = useState(false);
  const [downloadingVersionId, setDownloadingVersionId] = useState<number | null>(null);
  const [generatingVersionMetadataId, setGeneratingVersionMetadataId] = useState<number | null>(null);
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);
  const [versionPollToken, setVersionPollToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function loadVersions() {
      try {
        const loaded = await authorizedRequest<BlogClipVersion[]>(`/blog-clips/${blogClip.id}/versions`);
        if (cancelled) return;
        setVersions(loaded);
        const busy = loaded.some((version) => version.status === "pending" || version.status === "processing");
        if (busy) {
          timer = window.setTimeout(() => {
            void loadVersions();
          }, BLOG_CLIP_POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) setVersions([]);
      }
    }

    setVersionsLoading(true);
    void loadVersions().finally(() => {
      if (!cancelled) setVersionsLoading(false);
    });

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [blogClip.id, blogClip.active_version_id, blogClip.updated_at, versionPollToken]);

  async function handleCreateVersions(mode: "all_tones" | "boards") {
    setCreatingVersions(true);
    try {
      const created = await authorizedRequest<BlogClipVersion[]>(`/blog-clips/${blogClip.id}/versions`, {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
      setVersions((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of created) byId.set(item.id, item);
        return Array.from(byId.values()).sort((a, b) => a.id - b.id);
      });
      setVersionPollToken((token) => token + 1);
      onMessage?.(mode === "all_tones" ? "다른 톤 버전 생성을 시작했습니다." : "보드 재생성 버전을 시작했습니다.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "버전 생성에 실패했습니다.");
    } finally {
      setCreatingVersions(false);
    }
  }

  async function handleDownloadVersion(version: BlogClipVersion) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      onMessage?.("로그인이 필요합니다.");
      return;
    }
    setDownloadingVersionId(version.id);
    try {
      const response = await fetch(`${API_BASE_URL}/blog-clips/${blogClip.id}/versions/${version.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = typeof data.detail === "string" ? data.detail : "다운로드에 실패했습니다.";
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `new-cut-blog-${blogClip.id}-v${version.id}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "다운로드에 실패했습니다.");
    } finally {
      setDownloadingVersionId(null);
    }
  }

  async function handleSetActive(version: BlogClipVersion) {
    try {
      await authorizedRequest<BlogClipVersion>(`/blog-clips/${blogClip.id}/versions/${version.id}/set-active`, {
        method: "POST",
      });
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}`);
      onBlogClipUpdated?.(updated);
      setVersions((current) =>
        current.map((item) => ({
          ...item,
          is_active: item.id === version.id,
        })),
      );
      onMessage?.(`활성 버전을 ${version.label}(으)로 바꿨습니다.`);
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "활성 버전 변경에 실패했습니다.");
    }
  }

  async function handleGenerateVersionMetadata(version: BlogClipVersion) {
    setGeneratingVersionMetadataId(version.id);
    try {
      const updated = await authorizedRequest<BlogClipVersion>(
        `/blog-clips/${blogClip.id}/versions/${version.id}/metadata`,
        { method: "POST" },
      );
      setVersions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setExpandedVersionId(updated.id);
      if (updated.is_active) {
        const parent = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}`);
        onBlogClipUpdated?.(parent);
      }
      onMessage?.("버전 메타데이터가 생성되었습니다.");
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : "버전 메타데이터 생성에 실패했습니다.");
    } finally {
      setGeneratingVersionMetadataId(null);
    }
  }

  return (
    <details className="blog-version-panel flow-versions">
      <summary>다른 톤·버전</summary>
      <div className="blog-version-header">
        <strong>버전</strong>
        <div className="blog-version-actions">
          <button
            className="small-button ghost-small"
            type="button"
            onClick={() => void handleCreateVersions("all_tones")}
            disabled={creatingVersions}
          >
            {creatingVersions ? "생성 중" : "다른 톤 만들기"}
          </button>
          <button
            className="small-button ghost-small"
            type="button"
            onClick={() => void handleCreateVersions("boards")}
            disabled={creatingVersions}
          >
            보드 재생성
          </button>
        </div>
      </div>
      {versionsLoading && versions.length === 0 ? <p className="muted">버전 불러오는 중…</p> : null}
      {versions.length === 0 && !versionsLoading ? <p className="muted">아직 버전이 없습니다.</p> : null}
      <ul className="blog-version-list">
        {versions.map((version) => {
          const versionCanDownload = Boolean(version.subtitled_video_path || version.video_path);
          const versionBusy = version.status === "pending" || version.status === "processing";
          const versionHasMetadata = version.title_candidates.length > 0;
          const versionStage = BLOG_PROGRESS_STAGE_LABELS[version.progress_stage] ?? version.progress_stage;
          return (
            <li className="blog-version-item" key={version.id}>
              <div className="blog-version-row">
                <div>
                  <span className="blog-version-label">
                    {version.label}
                    {version.is_active ? " · 활성" : ""}
                  </span>
                  <span className="muted">
                    {" "}
                    · {BLOG_CLIP_STATUS_LABELS[version.status] ?? version.status}
                    {versionBusy ? ` (${versionStage} ${version.progress_percent}%)` : ""}
                  </span>
                </div>
                <div className="blog-version-row-actions">
                  {versionCanDownload ? (
                    <button
                      className="small-button ghost-small"
                      type="button"
                      onClick={() => void handleDownloadVersion(version)}
                      disabled={downloadingVersionId === version.id}
                    >
                      {downloadingVersionId === version.id ? "다운로드 중" : "다운로드"}
                    </button>
                  ) : null}
                  {version.status === "completed" && !version.is_active ? (
                    <button className="small-button ghost-small" type="button" onClick={() => void handleSetActive(version)}>
                      활성으로
                    </button>
                  ) : null}
                  {version.status === "completed" ? (
                    <button
                      className="small-button metadata-button"
                      type="button"
                      onClick={() => void handleGenerateVersionMetadata(version)}
                      disabled={generatingVersionMetadataId === version.id || versionHasMetadata}
                    >
                      {generatingVersionMetadataId === version.id
                        ? "작성 중"
                        : versionHasMetadata
                          ? "메타 준비됨"
                          : "메타데이터"}
                    </button>
                  ) : null}
                  {versionHasMetadata ? (
                    <button
                      className="small-button ghost-small"
                      type="button"
                      onClick={() => setExpandedVersionId((current) => (current === version.id ? null : version.id))}
                    >
                      {expandedVersionId === version.id ? "메타 접기" : "메타 보기"}
                    </button>
                  ) : null}
                </div>
              </div>
              {version.error_message ? <p className="error-text">{version.error_message}</p> : null}
              {version.metadata_error ? <p className="error-text">{version.metadata_error}</p> : null}
              {expandedVersionId === version.id && versionHasMetadata ? (
                <MetadataBox
                  copiedKey={copiedKey}
                  idPrefix={`blog-${blogClip.id}-v${version.id}`}
                  titleCandidates={version.title_candidates}
                  description={version.description ?? ""}
                  hashtags={version.hashtags}
                  onCopyText={onCopyText}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
