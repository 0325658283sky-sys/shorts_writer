import { useEffect, useState } from "react";
import { authorizedRequest } from "../api/client";
import { FontRolePicker } from "./FontRolePicker";
import { normalizeVisualStyleSlug } from "../lib/blogShortsProps";
import { DEFAULT_SHORTS_FONT_ID, normalizeShortsFontId } from "../lib/shortsFonts";
import type { BlogClip, VisualStyle, VisualStyleSlug } from "../types";

export function VideoStyleStep({
  blogClip,
  saving,
  onSelect,
  onOpenBoardEditor,
  onMessage,
  onClipUpdated,
}: {
  blogClip: BlogClip;
  saving: boolean;
  onSelect: (
    style: VisualStyleSlug | string,
    copy: { style_title: string; style_subtitle: string },
  ) => Promise<void>;
  onOpenBoardEditor?: () => void;
  onMessage: (message: string) => void;
  onClipUpdated?: (clip: BlogClip) => void;
}) {
  const [styles, setStyles] = useState<VisualStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(normalizeVisualStyleSlug(blogClip.visual_style));
  const [titleDraft, setTitleDraft] = useState(blogClip.style_title || blogClip.blog_title || "");
  const [subtitleDraft, setSubtitleDraft] = useState(blogClip.style_subtitle || "");
  const [titleFont, setTitleFont] = useState(
    normalizeShortsFontId(blogClip.style_overlay?.titleFont ?? DEFAULT_SHORTS_FONT_ID),
  );
  const [captionFont, setCaptionFont] = useState(
    normalizeShortsFontId(blogClip.style_overlay?.captionFont ?? DEFAULT_SHORTS_FONT_ID),
  );
  useEffect(() => {
    setSelected(normalizeVisualStyleSlug(blogClip.visual_style));
    setTitleDraft(blogClip.style_title || blogClip.blog_title || "");
    setSubtitleDraft(blogClip.style_subtitle || "");
    setTitleFont(normalizeShortsFontId(blogClip.style_overlay?.titleFont ?? DEFAULT_SHORTS_FONT_ID));
    setCaptionFont(normalizeShortsFontId(blogClip.style_overlay?.captionFont ?? DEFAULT_SHORTS_FONT_ID));
  }, [
    blogClip.visual_style,
    blogClip.style_title,
    blogClip.style_subtitle,
    blogClip.blog_title,
    blogClip.style_overlay?.titleFont,
    blogClip.style_overlay?.captionFont,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authorizedRequest<VisualStyle[]>("/visual-styles")
      .then((loaded) => {
        if (cancelled) return;
        setStyles(loaded);
        setSelected((current) => {
          const normalized = normalizeVisualStyleSlug(current);
          if (normalized && loaded.some((item) => item.slug === normalized)) return normalized;
          return loaded[0]?.slug ?? "impact_full";
        });
      })
      .catch((error) => {
        if (!cancelled) onMessage(error instanceof Error ? error.message : "스타일 목록을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blogClip.id]);

  async function handleContinue() {
    try {
      await onSelect(selected, {
        style_title: titleDraft,
        style_subtitle: subtitleDraft,
      });
      const withFonts = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/style-overlay`, {
        method: "PATCH",
        body: JSON.stringify({
          overlay: {
            titleFont,
            captionFont,
          },
        }),
      });
      onClipUpdated?.(withFonts);
    } catch {
      /* parent surfaces error */
    }
  }

  return (
    <section className="flow-card">
      <p className="create-kicker">스타일</p>
      <h1>영상 스타일을 선택해 주세요</h1>
      <p className="flow-lead">
        템플릿 썸네일을 고르면 타이틀·자막·미디어 비율이 맞춰집니다. 추천 보이스·BGM도 함께 적용됩니다.
        강조 단어는 <code>*이렇게*</code> 감싸세요.
      </p>

      <label className="style-copy-field">
        상단 타이틀
        <textarea
          rows={2}
          value={titleDraft}
          disabled={saving}
          onChange={(event) => setTitleDraft(event.target.value)}
          placeholder="예: 밀양 *숨겨진* 숙소 추천"
        />
      </label>
      <label className="style-copy-field">
        보조 설명
        <input
          type="text"
          value={subtitleDraft}
          disabled={saving}
          onChange={(event) => setSubtitleDraft(event.target.value)}
          placeholder="예: 깔끔한 정보 전달"
        />
      </label>

      <FontRolePicker
        titleFont={titleFont}
        captionFont={captionFont}
        disabled={saving}
        onChange={(next) => {
          setTitleFont(next.titleFont);
          setCaptionFont(next.captionFont);
        }}
      />

      {loading ? <p className="create-note">스타일 불러오는 중…</p> : null}

      <p className="style-gallery-label">템플릿</p>
      <div className="style-gallery">
        {styles.map((style) => (
          <button
            key={style.slug}
            type="button"
            className={`style-card ${selected === style.slug ? "is-selected" : ""}`}
            disabled={saving}
            onClick={() => setSelected(style.slug)}
          >
            {style.badge ? <span className="style-card-badge">{style.badge}</span> : null}
            {selected === style.slug ? <span className="style-card-check" aria-hidden="true">✓</span> : null}
            <div className="style-card-preview">
              {style.previewImage ? (
                <img src={style.previewImage} alt="" />
              ) : (
                <div className={`style-card-fallback style-fallback-${style.slug}`} />
              )}
            </div>
            <strong>{style.label}</strong>
            <span className="muted">{style.description}</span>
            {style.packHint ? <span className="style-pack-hint">팩: {style.packHint}</span> : null}
          </button>
        ))}
      </div>

      <div className="flow-step-actions">
        {onOpenBoardEditor ? (
          <button className="ghost-button" type="button" disabled={saving} onClick={onOpenBoardEditor}>
            보드 직접 편집
          </button>
        ) : null}
        <button className="cta-button flow-primary-cta" type="button" disabled={saving || loading} onClick={() => void handleContinue()}>
          {saving ? "저장 중…" : "다음 · 오디오"}
        </button>
      </div>
    </section>
  );
}
