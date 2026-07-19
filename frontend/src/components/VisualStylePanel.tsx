import { useEffect, useState } from "react";
import { authorizedRequest } from "../api/client";
import type { TransitionType, VisualStyle, VisualStyleSlug } from "../types";

const TRANSITION_OPTIONS: { value: TransitionType; label: string }[] = [
  { value: "fade", label: "페이드" },
  { value: "slide", label: "슬라이드" },
  { value: "none", label: "없음" },
];

/** Compact visual-style picker + editable top title/subtitle for BoardEditor. */
export function VisualStylePanel({
  appliedStyle,
  styleTitle,
  styleSubtitle,
  transitionSec,
  transitionType,
  onApply,
  onStyleCopyChange,
  onMotionChange,
  applying,
  savingCopy,
  savingMotion,
  onMessage,
}: {
  appliedStyle?: string | null;
  styleTitle?: string | null;
  styleSubtitle?: string | null;
  transitionSec?: number | null;
  transitionType?: string | null;
  onApply: (style: VisualStyleSlug | string) => Promise<void>;
  onStyleCopyChange: (body: { style_title?: string; style_subtitle?: string }) => Promise<void>;
  onMotionChange: (body: {
    transition_sec?: number;
    transition_type?: TransitionType;
  }) => Promise<void>;
  applying: boolean;
  savingCopy: boolean;
  savingMotion: boolean;
  onMessage: (message: string) => void;
}) {
  const [styles, setStyles] = useState<VisualStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState(styleTitle ?? "");
  const [subtitleDraft, setSubtitleDraft] = useState(styleSubtitle ?? "");
  const [secDraft, setSecDraft] = useState(String(transitionSec ?? 0.35));
  const [typeDraft, setTypeDraft] = useState<TransitionType>(
    (transitionType as TransitionType) || "fade",
  );

  useEffect(() => {
    setTitleDraft(styleTitle ?? "");
    setSubtitleDraft(styleSubtitle ?? "");
  }, [styleTitle, styleSubtitle]);

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
      <p className="muted">
        상단 타이틀·보조설명은 템플릿 헤더에 표시됩니다. 강조할 단어는 <code>*이렇게*</code> 감싸세요.
      </p>

      <label className="style-copy-field">
        상단 타이틀
        <textarea
          rows={2}
          value={titleDraft}
          disabled={savingCopy}
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
          disabled={savingCopy}
          onChange={(event) => setSubtitleDraft(event.target.value)}
          onBlur={() => void saveCopy()}
          placeholder="예: 깔끔한 정보 전달"
        />
      </label>

      <div className="motion-settings">
        <p className="muted">보드 전환</p>
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

      {loading ? <p className="muted">스타일 불러오는 중…</p> : null}
      <div className="visual-style-list">
        {styles.map((style) => {
          const active = (appliedStyle || "fullscreen") === style.slug;
          return (
            <button
              key={style.slug}
              type="button"
              className={`visual-style-row ${active ? "is-selected" : ""}`}
              disabled={applying || active}
              onClick={() => void onApply(style.slug)}
            >
              <div className="visual-style-row-preview">
                {style.previewImage ? <img src={style.previewImage} alt="" /> : null}
              </div>
              <div className="visual-style-row-copy">
                <strong>
                  {style.label}
                  {style.badge ? <span className="visual-style-row-badge">{style.badge}</span> : null}
                </strong>
                <span className="muted">{style.description}</span>
                {style.packHint ? <span className="style-pack-hint">팩: {style.packHint}</span> : null}
              </div>
              <span className="muted">{active ? "적용됨" : applying ? "저장 중…" : "적용"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
