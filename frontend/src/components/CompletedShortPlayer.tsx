import { useEffect, useState } from "react";
import { authorizedBlob } from "../api/client";

/**
 * Final MP4 player for completed blog shorts.
 * Hub-ready primitive: AlphaCut center slot can mount this without Remotion.
 */
export function CompletedShortPlayer({
  blogClipId,
  versionId,
  className,
  label = "완성본 미리보기",
}: {
  blogClipId: number;
  versionId?: number | null;
  className?: string;
  label?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError("");
    setSrc(null);

    const path =
      versionId != null
        ? `/blog-clips/${blogClipId}/versions/${versionId}/stream`
        : `/blog-clips/${blogClipId}/stream`;

    void (async () => {
      try {
        const blob = await authorizedBlob(path);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "영상을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blogClipId, versionId]);

  return (
    <div className={`completed-short-player ${className ?? ""}`.trim()} aria-label={label}>
      {loading ? <p className="muted completed-short-player-status">영상 불러오는 중…</p> : null}
      {error ? (
        <p className="form-message completed-short-player-status" role="alert">
          {error}
        </p>
      ) : null}
      {src ? (
        <video className="completed-short-player-video" controls playsInline preload="metadata" src={src} />
      ) : null}
    </div>
  );
}
