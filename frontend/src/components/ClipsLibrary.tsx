import { useEffect, useState } from "react";
import { authorizedBlob, authorizedRequest } from "../api/client";
import type { Clip } from "../types";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function ClipsLibrary({
  onDownload,
  downloadingClipId,
}: {
  onDownload: (clip: Clip) => void;
  downloadingClipId: number | null;
}) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authorizedRequest<Clip[]>("/clips")
      .then((loaded) => {
        if (!cancelled) setClips(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "클립 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function openPreview(clip: Clip) {
    if (previewLoading) return;
    setPreviewLoading(true);
    setError("");
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const blob = await authorizedBlob(`/clips/${clip.id}/preview`);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewId(clip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "미리보기를 불러오지 못했습니다.");
      setPreviewId(null);
      setPreviewUrl(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) return <p className="muted">클립 불러오는 중…</p>;

  return (
    <div className="clips-library">
      {error ? <p className="projects-error">{error}</p> : null}
      {clips.length === 0 ? (
        <div className="projects-empty">
          <p>아직 만든 영상 클립이 없습니다. 영상 프로젝트에서 하이라이트로 클립을 만들면 여기에 모입니다.</p>
        </div>
      ) : (
        <ul className="clips-library-list">
          {clips.map((clip) => (
            <li key={clip.id} className="clips-library-item">
              <div>
                <strong>클립 #{clip.id}</strong>
                <span className="muted">
                  영상 #{clip.video_id} · {clip.status} · {formatDate(clip.created_at)}
                </span>
              </div>
              <div className="clips-library-actions">
                <button
                  type="button"
                  className="btn-outline"
                  disabled={previewLoading || clip.status !== "completed"}
                  onClick={() => void openPreview(clip)}
                >
                  {previewLoading && previewId === clip.id ? "로딩…" : "미리보기"}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={downloadingClipId === clip.id || clip.status !== "completed"}
                  onClick={() => onDownload(clip)}
                >
                  {downloadingClipId === clip.id ? "다운로드 중…" : "다운로드"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {previewUrl ? (
        <div className="clips-preview">
          <p className="muted">미리보기 · 클립 #{previewId}</p>
          <video key={previewUrl} src={previewUrl} controls playsInline />
        </div>
      ) : null}
    </div>
  );
}
