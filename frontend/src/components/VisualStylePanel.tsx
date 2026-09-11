import { useEffect, useState } from "react";
import { authorizedRequest } from "../api/client";
import { FontRolePicker } from "./FontRolePicker";
import { normalizeVisualStyleSlug } from "../lib/blogShortsProps";
import { DEFAULT_SHORTS_FONT_ID, normalizeShortsFontId } from "../lib/shortsFonts";
import type { BlogClip, TransitionType, VisualStyle, VisualStyleSlug } from "../types";

const TRANSITION_OPTIONS: { value: TransitionType; label: string }[] = [
  { value: "fade", label: "페이드" },
  { value: "slide", label: "슬라이드" },
  { value: "none", label: "없음" },
];

/** Compact visual-style picker + editable top title/subtitle for BoardEditor. */
export function VisualStylePanel({
  blogClipId,
  appliedStyle,
  styleTitle,
  styleSubtitle,
  styleOverlay,
  transitionSec,
  transitionType,
  onApply,
  onStyleCopyChange,
  onMotionChange,
  onTitlesGenerated,
  onOverlayUpdated,
  applying,
  savingCopy,
  savingMotion,
  onMessage,
  variant = "all",
}: {
  blogClipId: number;
  appliedStyle?: string | null;
  styleTitle?: string | null;
  styleSubtitle?: string | null;
  styleOverlay?: BlogClip["style_overlay"];
  transitionSec?: number | null;
  transitionType?: string | null;
  onApply: (style: VisualStyleSlug | string) => Promise<void>;
  onStyleCopyChange: (body: { style_title?: string; style_subtitle?: string }) => Promise<void>;
  onMotionChange: (body: {
    transition_sec?: number;
    transition_type?: TransitionType;
  }) => Promise<void>;
  onTitlesGenerated?: (clip: BlogClip) => void;
  onOverlayUpdated?: (clip: BlogClip) => void;
  applying: boolean;
  savingCopy: boolean;
  savingMotion: boolean;
  onMessage: (message: string) => void;
  variant?: "all" | "screen" | "motion";
}) {
  const [styles, setStyles] = useState<VisualStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState(styleTitle ?? "");
  const [subtitleDraft, setSubtitleDraft] = useState(styleSubtitle ?? "");
  const [secDraft, setSecDraft] = useState(String(transitionSec ?? 0.35));
  const [typeDraft, setTypeDraft] = useState<TransitionType>(
    (transitionType as TransitionType) || "fade",
  );
  const [generatingTitles, setGeneratingTitles] = useState(false);
  const [savingFonts, setSavingFonts] = useState(false);
  const [titleFont, setTitleFont] = useState(
    normalizeShortsFontId(styleOverlay?.titleFont ?? DEFAULT_SHORTS_FONT_ID),
  );
  const [captionFont, setCaptionFont] = useState(
    normalizeShortsFontId(styleOverlay?.captionFont ?? DEFAULT_SHORTS_FONT_ID),
  );

  const activeSlug = normalizeVisualStyleSlug(appliedStyle);

  useEffect(() => {
    setTitleDraft(styleTitle ?? "");
    setSubtitleDraft(styleSubtitle ?? "");
  }, [styleTitle, styleSubtitle]);

  useEffect(() => {
    setTitleFont(normalizeShortsFontId(styleOverlay?.titleFont ?? DEFAULT_SHORTS_FONT_ID));
    setCaptionFont(normalizeShortsFontId(styleOverlay?.captionFont ?? DEFAULT_SHORTS_FONT_ID));
  }, [styleOverlay?.titleFont, styleOverlay?.captionFont]);

  useEffect(() => {
    setSecDraft(String(transitionSec ?? 0.35));
    setTypeDraft(((transitionType as TransitionType) || "fade") as TransitionType);
  }, [transitionSec, transitionType]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authorizedRequest<VisualStyle[]>("/visual-styles")
      .then((loaded) => {
        if (!cancelled) setStyles(loaded);
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
  }, []);

  async function saveCopy() {
    try {
      await onStyleCopyChange({
        style_title: titleDraft,
        style_subtitle: subtitleDraft,
      });
    } catch {
      /* parent surfaces */
    }
  }

  async function regenerateTitles() {
    setGeneratingTitles(true);
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClipId}/style-titles/generate`, {
        method: "POST",
      });
      setTitleDraft(updated.style_title || "");
      setSubtitleDraft(updated.style_subtitle || "");
      onTitlesGenerated?.(updated);
      onMessage("스타일에 맞는 훅 타이틀을 다시 만들었습니다.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "타이틀 생성에 실패했습니다.");
    } finally {
      setGeneratingTitles(false);
    }
  }

  async function saveFonts(next: { titleFont: string; captionFont: string }) {
    setTitleFont(normalizeShortsFontId(next.titleFont));
    setCaptionFont(normalizeShortsFontId(next.captionFont));
    setSavingFonts(true);
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClipId}/style-overlay`, {
        method: "PATCH",
        body: JSON.stringify({
          overlay: {
            titleFont: next.titleFont,
            captionFont: next.captionFont,
          },
        }),
      });
      onOverlayUpdated?.(updated);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "폰트 저장에 실패했습니다.");
    } finally {
      setSavingFonts(false);
    }
  }

  async function saveMotion(next?: { sec?: number; type?: TransitionType }) {
    const sec = next?.sec ?? Number(secDraft);
    const type = next?.type ?? typeDraft;
    if (!Number.isFinite(sec) || sec < 0 || sec > 2) {
      onMessage("전환 길이는 0~2초 사이여야 합니다.");
      return;
    }
    try {
      await onMotionChange({ transition_sec: sec, transition_type: type });
    } catch {
      /* parent surfaces */
    }
  }

  return (
    <div className="media-tab-body">
      {variant !== "motion" ? (
        <>
      <p className="muted">
        썸네일을 클릭하면 템플릿·훅 타이틀이 함께 적용됩니다. 강조 단어는 <code>*이렇게*</code> 감싸세요.
      </p>

      <label className="style-copy-field">
        상단 타이틀
        <textarea
          rows={2}
          value={titleDraft}
          disabled={savingCopy || generatingTitles}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => void saveCopy()}
          placeholder="예: 밀양 *숨겨진* 숙소 추천"
        />
      </label>
      <label className="style-copy-field">
        보조 설명
        <input
          type="text"
          value={subtitleDraft}
          disabled={savingCopy || generatingTitles}
          onChange={(event) => setSubtitleDraft(event.target.value)}
          onBlur={() => void saveCopy()}
          placeholder="예: 깔끔한 정보 전달"
        />
      </label>
      <button
        type="button"
        className="ghost-small"
        disabled={generatingTitles || applying}
        onClick={() => void regenerateTitles()}
      >
        {generatingTitles ? "타이틀 생성 중…" : "훅 타이틀 다시 만들기"}
      </button>

      <FontRolePicker
        titleFont={titleFont}
        captionFont={captionFont}
        disabled={savingFonts || applying}
        onChange={(next) => void saveFonts(next)}
      />
        </>
      ) : null}

      {variant !== "screen" ? (
      <div className="motion-settings">
        <p className="muted">장면 전환</p>
        <div className="motion-settings-row">
          {TRANSITION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`motion-chip ${typeDraft === option.value ? "is-selected" : ""}`}
              disabled={savingMotion}
              onClick={() => {
                setTypeDraft(option.value);
                void saveMotion({ type: option.value });
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="style-copy-field">
          전환 길이 {Number(secDraft).toFixed(2)}초
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={Number(secDraft) || 0}
            disabled={savingMotion || typeDraft === "none"}
            onChange={(event) => setSecDraft(event.target.value)}
            onMouseUp={() => void saveMotion()}
            onTouchEnd={() => void saveMotion()}
            onBlur={() => void saveMotion()}
          />
        </label>
      </div>
      ) : null}

      {variant !== "motion" ? (
        <>
      {loading ? <p className="muted">템플릿 불러오는 중…</p> : null}
      <p className="style-gallery-label">템플릿</p>
      <div className="style-gallery style-gallery-compact">
        {styles.map((style) => {
          const active = activeSlug === style.slug;
          return (
            <button
              key={style.slug}
              type="button"
              className={`style-card ${active ? "is-selected" : ""}`}
              disabled={applying || active}
              onClick={() => void onApply(style.slug)}
            >
              {style.badge ? <span className="style-card-badge">{style.badge}</span> : null}
              {active ? (
                <span className="style-card-check" aria-hidden="true">
                  ✓
                </span>
              ) : null}
              <div className="style-card-preview">
                {style.previewImage ? <img src={style.previewImage} alt="" /> : null}
              </div>
              <strong>{style.label}</strong>
              <span className="muted">{style.description}</span>
            </button>
          );
        })}
      </div>
      {applying ? <p className="muted">스타일 적용 중…</p> : null}
        </>
      ) : null}
    </div>
  );
}
