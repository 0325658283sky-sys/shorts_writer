import { Player } from "@remotion/player";
import { useEffect, useMemo, useState } from "react";
import { BlogShorts, BLOG_SHORTS_HEIGHT, BLOG_SHORTS_WIDTH, totalBlogShortsFrames } from "@new-cut/remotion/BlogShorts";
import { authorizedBlob, authorizedRequest } from "../api/client";
import { buildBlogShortsProps } from "../lib/blogShortsProps";
import type { BlogClip, Board, SubtitleTemplate } from "../types";

const FPS = 30;

/** ④ 템플릿 갤러리 — 클라이언트에서만 쓰는 표시용 그룹핑. 백엔드 category는 'gallery' 단일 값이라
 *  README가 말하는 임팩트/뉴스형/미니멀 세분류는 슬러그 기반으로 여기서만 나눈다 (스키마 변경 없음). */
const CLIENT_GROUP: Record<string, string> = {
  impact_yellow: "임팩트",
  viral_red: "임팩트",
  neon_green: "임팩트",
  gradient_bar: "임팩트",
  news_caption: "뉴스형",
  top_headline: "뉴스형",
  outline_pop: "뉴스형",
  clean_minimal: "미니멀",
  white_box: "미니멀",
  caption_pill: "미니멀",
  side_bar: "미니멀",
  commerce_price: "미니멀",
};

const CATEGORY_CHIPS = ["전체", "임팩트", "뉴스형", "미니멀", "브랜드 커스텀"] as const;
type CategoryChip = (typeof CATEGORY_CHIPS)[number];

function boxStylePreviewStyle(template: SubtitleTemplate): React.CSSProperties {
  const accent = template.accent_color || "var(--accent)";
  const base: React.CSSProperties = {
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 11,
    padding: "4px 8px",
    lineHeight: 1.3,
    maxWidth: "88%",
    textAlign: "center",
  };
  switch (template.box_style) {
    case "box":
      return { ...base, background: accent, borderRadius: 4 };
    case "pill":
      return { ...base, background: accent, borderRadius: 999 };
    case "gradient":
      return { ...base, background: `linear-gradient(90deg, ${accent}, transparent)`, borderRadius: 4 };
    case "side_bar":
      return { ...base, borderLeft: `4px solid ${accent}`, background: "rgba(0,0,0,0.55)", textAlign: "left" };
    case "outline":
      return { ...base, border: `2px solid ${accent}`, background: "transparent", color: accent };
    case "none":
    default:
      return { ...base, background: "transparent", textShadow: "0 1px 3px rgba(0,0,0,0.8)" };
  }
}

function TemplateCardVisual({ template }: { template: SubtitleTemplate }) {
  const justify = template.position === "top" ? "flex-start" : "flex-end";
  return (
    <div className="gallery-card-visual" style={{ justifyContent: justify }}>
      <span className="gallery-card-visual-caption" style={boxStylePreviewStyle(template)}>
        자막 미리보기
      </span>
    </div>
  );
}

export function TemplateGalleryStep({
  blogClip,
  onContinue,
  onSkip,
  onMessage,
}: {
  blogClip: BlogClip;
  onContinue: (updated: BlogClip) => void;
  onSkip: () => void;
  onMessage?: (message: string) => void;
}) {
  const [templates, setTemplates] = useState<SubtitleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeChip, setActiveChip] = useState<CategoryChip>("전체");
  const [selectedId, setSelectedId] = useState<number | null>(blogClip.subtitle_template_id ?? null);
  const [applying, setApplying] = useState(false);

  const [firstBoard, setFirstBoard] = useState<Board | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    authorizedRequest<SubtitleTemplate[]>("/subtitle-templates?category=gallery")
      .then((loaded) => {
        if (!cancelled) setTemplates(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "템플릿을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    authorizedRequest<Board[]>(`/blog-clips/${blogClip.id}/boards`)
      .then(async (boards) => {
        if (cancelled) return;
        const first = boards[0] ?? null;
        setFirstBoard(first);
        if (!first) return;
        try {
          const blob = await authorizedBlob(`/blog-clips/${blogClip.id}/boards/${first.id}/image`);
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setPreviewImageUrl(objectUrl);
        } catch {
          /* 이미지 없이도 자막 미리보기는 가능 */
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blogClip.id]);

  const filtered = useMemo(() => {
    if (activeChip === "전체") return templates;
    if (activeChip === "브랜드 커스텀") return [];
    return templates.filter((t) => CLIENT_GROUP[t.slug ?? ""] === activeChip);
  }, [templates, activeChip]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const previewProps = useMemo(() => {
    const boardsForPreview: Board[] = firstBoard
      ? [firstBoard]
      : [
          {
            id: -1,
            blog_clip_id: blogClip.id,
            order_index: 0,
            image_path: "",
            text: blogClip.blog_title ?? "자막 미리보기",
            speaker: null,
            duration_seconds: 3,
            sfx_asset_id: null,
            created_at: "",
            updated_at: "",
          },
        ];
    const base = buildBlogShortsProps({
      blogClip,
      boards: boardsForPreview,
      imageUrls: firstBoard && previewImageUrl ? { [firstBoard.id]: previewImageUrl } : {},
      selectedBoardId: null,
      draftText: boardsForPreview[0]?.text ?? "",
    });
    return {
      ...base,
      captionTemplate: selectedTemplate
        ? {
            position: selectedTemplate.position ?? "bottom",
            boxStyle: selectedTemplate.box_style ?? "none",
            accentColor: selectedTemplate.accent_color ?? null,
            fontFamily: selectedTemplate.font_family ?? null,
          }
        : null,
    };
  }, [blogClip, firstBoard, previewImageUrl, selectedTemplate]);

  const durationInFrames = useMemo(() => Math.max(1, totalBlogShortsFrames(previewProps)), [previewProps]);

  async function handleContinue() {
    if (!selectedId) {
      onSkip();
      return;
    }
    setApplying(true);
    setError("");
    try {
      const updated = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}/template`, {
        method: "PATCH",
        body: JSON.stringify({ template_id: selectedId }),
      });
      onContinue(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "템플릿 적용에 실패했습니다.";
      setError(message);
      onMessage?.(message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="flow-card gallery-step">
      <p className="create-kicker">템플릿</p>
      <h1>자막 템플릿을 골라주세요</h1>
      <p className="flow-lead">건너뛰어도 기존 스타일의 자막이 그대로 적용됩니다.</p>
      {error ? <p className="form-message">{error}</p> : null}

      <div className="gallery-layout">
        <div className="gallery-left">
          <div className="gallery-chip-row" role="tablist" aria-label="템플릿 카테고리">
            {CATEGORY_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                role="tab"
                aria-selected={activeChip === chip}
                className={`gallery-chip ${activeChip === chip ? "is-active" : ""}`}
                onClick={() => setActiveChip(chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          {loading ? <p className="muted">템플릿 불러오는 중…</p> : null}

          <div className="gallery-grid">
            {filtered.map((template) => {
              const active = selectedId === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`gallery-card ${active ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(template.id)}
                >
                  <TemplateCardVisual template={template} />
                  <span className="gallery-card-name">{template.name}</span>
                  {active ? <span className="gallery-card-check" aria-hidden="true">✓</span> : null}
                </button>
              );
            })}

            {activeChip === "전체" || activeChip === "브랜드 커스텀" ? (
              <div className="gallery-card gallery-card-placeholder" aria-disabled="true">
                <div className="gallery-card-visual gallery-card-visual-placeholder">
                  <span className="muted">+ 내 브랜드</span>
                </div>
                <span className="gallery-card-name">내 브랜드 만들기</span>
                <span className="gallery-card-badge">준비 중</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="gallery-right">
          <p className="gallery-preview-label">
            미리보기 · {selectedTemplate ? selectedTemplate.name : "기본 스타일"}
          </p>
          <div className="gallery-preview-frame">
            <Player
              component={BlogShorts}
              inputProps={previewProps}
              durationInFrames={durationInFrames}
              compositionWidth={BLOG_SHORTS_WIDTH}
              compositionHeight={BLOG_SHORTS_HEIGHT}
              fps={FPS}
              style={{ width: "100%", aspectRatio: "9 / 16" }}
              controls={false}
              loop
              clickToPlay={false}
              autoPlay
              acknowledgeRemotionLicense
            />
          </div>
          <button className="btn-primary btn-lg gallery-cta" type="button" disabled={applying} onClick={() => void handleContinue()}>
            {applying ? "적용 중…" : selectedTemplate ? "이 템플릿으로 계속" : "건너뛰기"}
          </button>
          {selectedTemplate ? (
            <button className="ghost-button gallery-skip" type="button" disabled={applying} onClick={onSkip}>
              건너뛰기
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
