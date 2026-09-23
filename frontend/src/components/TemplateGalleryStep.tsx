import { Player } from "@remotion/player";
import { useEffect, useMemo, useState } from "react";
import { BlogShorts, BLOG_SHORTS_HEIGHT, BLOG_SHORTS_WIDTH, totalBlogShortsFrames } from "@new-cut/remotion/BlogShorts";
import { authorizedBlob, authorizedRequest } from "../api/client";
import { buildBlogShortsProps } from "../lib/blogShortsProps";
import { detectSource } from "./CreateStudio";
import type { BlogClip, Board, Clip, SubtitleTemplate } from "../types";

const FPS = 30;

/** ④ 템플릿 갤러리 — 백엔드 DB의 실제 category 값(impact/news/minimal/commerce/legacy) 기준으로 분류.
 *  이전에는 "?category=gallery"로 조회했는데 그 값이 실제 DB에 존재하지 않아 항상 빈 배열이 왔다
 *  (백엔드 시드는 impact/news/minimal/commerce로 저장됨). 전체 조회 후 legacy만 제외한다. */
const CATEGORY_LABEL: Record<string, (typeof CATEGORY_CHIPS)[number]> = {
  impact: "임팩트",
  news: "뉴스형",
  minimal: "미니멀",
  commerce: "미니멀", // 별도 칩 없이 미니멀에 묶임(디자인 기준)
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
  clip,
  clipKind = "blog",
  onContinue,
  onSkip,
  onMessage,
  optionsPanel,
}: {
  /** 블로그 쇼츠 모드(clipKind === "blog", 기본값)에서 필수. */
  blogClip?: BlogClip;
  /** 유튜브 쇼츠 모드(clipKind === "youtube")에서 필수. */
  clip?: Clip;
  clipKind?: "blog" | "youtube";
  onContinue: (updated: BlogClip | Clip) => void;
  onSkip: () => void;
  onMessage?: (message: string) => void;
  /** Pikaclip식 통합 화면용: 좌측에 렌더링할 옵션 패널(보이스/언어). 생략 시 기존 단독 단계 레이아웃. */
  optionsPanel?: React.ReactNode;
}) {
  const entityId = clipKind === "youtube" ? clip?.id : blogClip?.id;
  const initialTemplateId = clipKind === "youtube" ? clip?.subtitle_template_id : blogClip?.subtitle_template_id;
  const applyPath = clipKind === "youtube" ? `/clips/${entityId}/template` : `/blog-clips/${entityId}/template`;
  const isProductSource = clipKind === "blog" && detectSource(blogClip?.source_url ?? "") === "product";

  const [templates, setTemplates] = useState<SubtitleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeChip, setActiveChip] = useState<CategoryChip>("전체");
  const [selectedId, setSelectedId] = useState<number | null>(initialTemplateId ?? null);
  const [applying, setApplying] = useState(false);

  const [firstBoard, setFirstBoard] = useState<Board | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    authorizedRequest<SubtitleTemplate[]>("/subtitle-templates")
      .then((loaded) => {
        if (cancelled) return;
        const gallery = loaded.filter((t) => t.category !== "legacy");
        setTemplates(gallery);
        // 선택된 템플릿이 없거나(신규 진입) 갤러리에 없는 값(예: legacy 기본값)이면
        // 소스에 맞는 기본값을 골라준다.
        setSelectedId((current) => {
          if (current != null && gallery.some((t) => t.id === current)) return current;
          const defaultSlug = isProductSource ? "commerce_price" : "impact_yellow";
          const byDefault = gallery.find((t) => t.slug === defaultSlug);
          return byDefault?.id ?? gallery[0]?.id ?? null;
        });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // 보드 기반 실시간 미리보기는 블로그 쇼츠 전용(유튜브 클립은 보드가 없음).
    if (clipKind !== "blog" || !blogClip) return;
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
  }, [clipKind, blogClip]);

  const filtered = useMemo(() => {
    if (activeChip === "전체") return templates;
    if (activeChip === "브랜드 커스텀") return [];
    return templates.filter((t) => CATEGORY_LABEL[t.category ?? ""] === activeChip);
  }, [templates, activeChip]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const previewProps = useMemo(() => {
    if (clipKind !== "blog" || !blogClip) return null;
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
  }, [clipKind, blogClip, firstBoard, previewImageUrl, selectedTemplate]);

  const durationInFrames = useMemo(() => (previewProps ? Math.max(1, totalBlogShortsFrames(previewProps)) : 1), [previewProps]);

  async function handleContinue() {
    if (!selectedId) {
      onSkip();
      return;
    }
    setApplying(true);
    setError("");
    try {
      const updated = await authorizedRequest<BlogClip | Clip>(applyPath, {
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

  const body = (
    <>
      <p className="create-kicker">템플릿</p>
      <h1>자막 템플릿을 골라주세요</h1>
      <p className="flow-lead">
        {clipKind === "youtube"
          ? "선택한 구간에 한 번에 적용돼요. 편별로 다르게 하려면 편집기에서 바꾸세요."
          : "건너뛰어도 기존 스타일의 자막이 그대로 적용됩니다."}
      </p>
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
            <span className="gallery-sort-label">많이 쓰는 순</span>
          </div>

          {loading ? <p className="muted">템플릿 불러오는 중…</p> : null}

          <div className="gallery-grid">
            {filtered.map((template) => {
              const active = selectedId === template.id;
              const isRecommended = isProductSource && template.slug === "commerce_price";
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`gallery-card ${active ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(template.id)}
                >
                  <TemplateCardVisual template={template} />
                  <span className="gallery-card-name">{template.name}</span>
                  {isRecommended ? <span className="gallery-card-badge gallery-card-badge-accent">상품 추천</span> : null}
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
            {previewProps ? (
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
            ) : (
              <div className="gallery-card-visual" style={{ justifyContent: selectedTemplate?.position === "top" ? "flex-start" : "flex-end" }}>
                <span
                  className="gallery-card-visual-caption"
                  style={selectedTemplate ? boxStylePreviewStyle(selectedTemplate) : undefined}
                >
                  {selectedTemplate ? "자막 미리보기" : "쇼츠 렌더 후 확인할 수 있어요"}
                </span>
              </div>
            )}
          </div>
          <button className="btn-primary btn-lg gallery-cta" type="button" disabled={applying} onClick={() => void handleContinue()}>
            {applying ? "적용 중…" : selectedTemplate ? "이 템플릿으로 계속" : "건너뛰기"}
          </button>
          {selectedTemplate ? (
            <button className="ghost-button gallery-skip" type="button" disabled={applying} onClick={onSkip}>
              건너뛰기
            </button>
          ) : null}
          <p className="gallery-apply-order-hint">
            적용 순서: 템플릿 → 편집기 전체 스타일 → 장면별 값. 장면에서 바꾼 값은 언제든 되돌릴 수 있어요.
          </p>
        </div>
      </div>
    </>
  );

  if (optionsPanel) {
    return (
      <section className="flow-card gallery-step gallery-step-combined">
        <div className="gallery-shell">
          <div className="gallery-options-col">{optionsPanel}</div>
          <div className="gallery-main-col">{body}</div>
        </div>
      </section>
    );
  }

  return <section className="flow-card gallery-step">{body}</section>;
}
