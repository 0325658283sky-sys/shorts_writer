import { useEffect, useState } from "react";
import { authorizedRequest } from "../api/client";
import { normalizeVisualStyleSlug } from "../lib/blogShortsProps";
import type { VisualStyle, VisualStyleSlug } from "../types";

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

export function YoutubeConfirmStep({
  preview,
  importing,
  inline = false,
  onCancel,
  onConfirm,
  onMessage,
}: {
  preview: YoutubePreview;
  importing: boolean;
  inline?: boolean;
  onCancel: () => void;
  onConfirm: (visualStyle: VisualStyleSlug | string) => void;
  onMessage: (message: string) => void;
}) {
  const [styles, setStyles] = useState<VisualStyle[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [selected, setSelected] = useState<string>("yt_profile");

  useEffect(() => {
    let cancelled = false;
    setLoadingStyles(true);
    authorizedRequest<VisualStyle[]>("/visual-styles")
      .then((loaded) => {
        if (cancelled) return;
        setStyles(loaded);
        setSelected((current) => {
          const normalized = normalizeVisualStyleSlug(current);
          if (normalized && loaded.some((item) => item.slug === normalized)) return normalized;
          if (loaded.some((item) => item.slug === "yt_profile")) return "yt_profile";
          return loaded[0]?.slug ?? "yt_profile";
        });
      })
      .catch((error) => {
        if (!cancelled) onMessage(error instanceof Error ? error.message : "템플릿 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoadingStyles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preview.url, onMessage]);

  const durationLabel = formatDuration(preview.duration_seconds);

  return (
    <section className={`yt-confirm${inline ? " yt-confirm-inline" : ""}`} aria-label="유튜브 확인">
      {inline ? null : (
        <header className="yt-confirm-header">
          <p className="create-kicker">하이라이트 쇼츠</p>
          <h2>영상이 맞는지 확인하세요</h2>
          <p className="create-lead">아래 영상이 맞다면 템플릿을 고른 뒤 생성하기를 눌러 주세요. AI가 편집점을 잡아 쇼츠를 만듭니다.</p>
        </header>
      )}

      <div className="yt-confirm-bar" role="status">
        <span className="yt-confirm-bar-hint">⬇️ 템플릿을 고른 뒤 생성하기를 눌러주세요.</span>
        <div className="yt-confirm-bar-actions">
          <button className="ghost-button" type="button" disabled={importing} onClick={onCancel}>
            취소
          </button>
          <button
            className="cta-button"
            type="button"
            disabled={importing || loadingStyles}
            onClick={() => onConfirm(selected)}
          >
            {importing ? "가져오는 중…" : "생성하기"}
          </button>
        </div>
      </div>

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

      <div className="yt-confirm-templates">
        <div className="yt-confirm-templates-head">
          <h3>템플릿 선택</h3>
          <span className="muted">프리셋</span>
        </div>
        {loadingStyles ? <p className="create-note">템플릿 불러오는 중…</p> : null}
        <div className="style-gallery style-gallery-compact" role="listbox" aria-label="쇼츠 템플릿">
          {styles.map((style) => (
            <button
              key={style.slug}
              type="button"
              role="option"
              aria-selected={selected === style.slug}
              className={`style-card ${selected === style.slug ? "is-selected" : ""}`}
              disabled={importing}
              onClick={() => setSelected(style.slug)}
            >
              {style.badge ? <span className="style-card-badge">{style.badge}</span> : null}
              {selected === style.slug ? (
                <span className="style-card-check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
              <div className="style-card-preview">
                {style.previewImage ? (
                  <img src={style.previewImage} alt="" />
                ) : (
                  <div className={`style-card-fallback style-fallback-${style.slug}`} />
                )}
              </div>
              <strong>{style.label}</strong>
              <span className="muted">{style.description}</span>
            </button>
          ))}
        </div>
        <p className="create-note">선택한 템플릿이 최종 영상에 그대로 적용됩니다.</p>
      </div>
    </section>
  );
}
