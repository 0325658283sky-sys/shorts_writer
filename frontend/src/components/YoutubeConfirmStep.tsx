import type { VisualStyleSlug } from "../types";

export type YoutubePreview = {
  url: string;
  video_id: string | null;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  channel: string | null;
  channel_avatar_url?: string | null;
};

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Confirm the detected video and start the conversion.
 *
 * The template picker used to sit here and block this button. It was moved
 * out: picking a look before seeing a single clip asks the user to decide
 * with nothing to decide on, and the choice is free to change afterwards —
 * a template only affects the render, not where the clips are cut. See
 * docs/FLOW_REDESIGN.md §3.
 */
export function YoutubeConfirmStep({
  preview,
  importing,
  inline = false,
  defaultVisualStyle = "yt_profile",
  onCancel,
  onConfirm,
}: {
  preview: YoutubePreview;
  importing: boolean;
  inline?: boolean;
  /** Applied to every clip; swappable for free on the result screen. */
  defaultVisualStyle?: VisualStyleSlug | string;
  onCancel: () => void;
  onConfirm: (visualStyle: VisualStyleSlug | string) => void;
  /** @deprecated kept so callers do not need changing; nothing reports here now. */
  onMessage?: (message: string) => void;
}) {
  const durationLabel = formatDuration(preview.duration_seconds);

  return (
    <section className={`yt-confirm${inline ? " yt-confirm-inline" : ""}`} aria-label="유튜브 확인">
      {inline ? null : (
        <header className="yt-confirm-header">
          <p className="create-kicker">하이라이트 쇼츠</p>
          <h2>영상이 맞는지 확인하세요</h2>
          <p className="create-lead">
            맞으면 바로 만들기를 눌러 주세요. AI가 편집점을 잡아 쇼츠를 만듭니다.
          </p>
        </header>
      )}

      <article className="yt-confirm-video">
        <div className="yt-confirm-thumb">
          {preview.thumbnail_url ? (
            <img src={preview.thumbnail_url} alt="" />
          ) : (
            <div className="yt-confirm-thumb-fallback">미리보기 없음</div>
          )}
          {durationLabel ? <span className="yt-confirm-duration">{durationLabel}</span> : null}
        </div>
        <div className="yt-confirm-meta">
          <strong>{preview.title}</strong>
          {preview.channel ? <span className="muted">{preview.channel}</span> : null}
        </div>
      </article>

      <div className="yt-confirm-bar" role="status">
        <span className="yt-confirm-bar-hint">
          이 영상이 맞나요? 스타일은 만든 뒤에 바꿀 수 있어요.
        </span>
        <div className="yt-confirm-bar-actions">
          <button className="ghost-button" type="button" disabled={importing} onClick={onCancel}>
            취소
          </button>
          <button
            className="cta-button"
            type="button"
            disabled={importing}
            onClick={() => onConfirm(defaultVisualStyle)}
          >
            {importing ? "만드는 중…" : "쇼츠 만들기"}
          </button>
        </div>
      </div>
    </section>
  );
}
