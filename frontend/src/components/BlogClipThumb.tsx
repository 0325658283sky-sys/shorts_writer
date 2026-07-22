import { useEffect, useState } from "react";
import { authorizedBlob, authorizedRequest } from "../api/client";
import type { Board } from "../types";

/** First-board image thumb for project list rows (hub list affordance). */
export function BlogClipThumb({
  blogClipId,
  title,
}: {
  blogClipId: number;
  title?: string | null;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const boards = await authorizedRequest<Board[]>(`/blog-clips/${blogClipId}/boards`);
        const first = boards[0];
        if (!first || cancelled) return;
        const blob = await authorizedBlob(`/blog-clips/${blogClipId}/boards/${first.id}/image`);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blogClipId]);

  return (
    <div className="projects-thumb" aria-hidden={src ? undefined : true}>
      {src ? (
        <img src={src} alt="" />
      ) : (
        <span className="projects-thumb-fallback">{(title ?? "쇼츠").slice(0, 1)}</span>
      )}
    </div>
  );
}
