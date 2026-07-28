import { useEffect, useState } from "react";
import { authorizedRequest } from "../api/client";
import { BLOG_IMAGE_MAX_COUNT, BLOG_IMAGE_MIN_COUNT } from "../constants";
import { normalizeVisualStyleSlug } from "../lib/blogShortsProps";
import type { BlogClip, BlogClipImageCandidate, VisualStyle, VisualStyleSlug } from "../types";
import { useCandidateImageUrl } from "./useCandidateImageUrl";

function CandidateThumb({
  blogClipId,
  candidate,
  selected,
  onToggle,
}: {
  blogClipId: number;
  candidate: BlogClipImageCandidate;
  selected: boolean;
  onToggle: () => void;
}) {
  const { url, error } = useCandidateImageUrl(blogClipId, candidate.id);

  return (
    <button
      type="button"
      className={`image-candidate ${selected ? "is-selected" : ""}`}
      onClick={onToggle}
      aria-pressed={selected}
    >
      {url ? <img src={url} alt="" /> : <span className="image-candidate-fallback">{error ? "!" : "…"}</span>}
      <span className="image-candidate-check" aria-hidden="true">
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}

export function ImageSelectStep({
  blogClip,
  confirming,
  onConfirm,
  onMessage,
}: {
  blogClip: BlogClip;
  confirming: boolean;
  onConfirm: (imageIds: number[], visualStyle: VisualStyleSlug | string) => void;
  onMessage: (message: string) => void;
}) {
  const [candidates, setCandidates] = useState<BlogClipImageCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [styles, setStyles] = useState<VisualStyle[]>([]);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [selectedStyle, setSelectedStyle] = useState(() =>
    normalizeVisualStyleSlug(blogClip.visual_style || "impact_full"),
  );

  useEffect(() => {
    setSelectedStyle(normalizeVisualStyleSlug(blogClip.visual_style || "impact_full"));
  }, [blogClip.id, blogClip.visual_style]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authorizedRequest<BlogClipImageCandidate[]>(`/blog-clips/${blogClip.id}/images`)
      .then((loaded) => {
        if (cancelled) return;
        setCandidates(loaded);
        const preselected = loaded.filter((item) => item.selected).map((item) => item.id);
        const fallback = loaded.map((item) => item.id);
        const initial = (preselected.length > 0 ? preselected : fallback).slice(0, BLOG_IMAGE_MAX_COUNT);
        setSelectedIds(initial);
      })
      .catch((error) => {
        if (!cancelled) {
          onMessage(error instanceof Error ? error.message : "이미지를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blogClip.id]);

  useEffect(() => {
    let cancelled = false;
    setLoadingStyles(true);
    authorizedRequest<VisualStyle[]>("/visual-styles")
      .then((loaded) => {
        if (cancelled) return;
        setStyles(loaded);
        setSelectedStyle((current) => {
          const normalized = normalizeVisualStyleSlug(current);
          if (normalized && loaded.some((item) => item.slug === normalized)) return normalized;
          return loaded[0]?.slug ?? "impact_full";
        });
      })
      .catch((error) => {
        if (!cancelled) {
          onMessage(error instanceof Error ? error.message : "템플릿 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStyles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blogClip.id]);

  function toggle(imageId: number) {
    setSelectedIds((current) => {
      if (current.includes(imageId)) {
        return current.filter((id) => id !== imageId);
      }
      if (current.length >= BLOG_IMAGE_MAX_COUNT) {
        onMessage(`이미지는 최대 ${BLOG_IMAGE_MAX_COUNT}장까지 선택할 수 있습니다.`);
        return current;
      }
      return [...current, imageId];
    });
  }

  const selected = candidates
    .filter((item) => selectedIds.includes(item.id))
    .sort((a, b) => selectedIds.indexOf(a.id) - selectedIds.indexOf(b.id));
  const canContinue =
    selectedIds.length >= BLOG_IMAGE_MIN_COUNT &&
    selectedIds.length <= BLOG_IMAGE_MAX_COUNT &&
    !confirming &&
    !loadingStyles &&
    Boolean(selectedStyle);

  return (
    <section className="flow-card flow-images-card">
      <p className="create-kicker">이미지 · 템플릿</p>
      <h1>{blogClip.blog_title ?? "이미지와 템플릿을 고르세요"}</h1>
      <p className="flow-lead">
        {BLOG_IMAGE_MIN_COUNT}–{BLOG_IMAGE_MAX_COUNT}장을 고르고 템플릿을 선택한 뒤 다음으로 가면 대본 톤을 고릅니다.
        선택 {selectedIds.length}장.
      </p>

      {loading ? <p className="create-note">이미지 불러오는 중…</p> : null}

      {!loading && selected.length > 0 ? (
        <div className="image-selected-block">
          <h2 className="image-section-title">선택됨</h2>
          <div className="image-candidate-grid">
            {selected.map((candidate) => (
              <CandidateThumb
                key={`sel-${candidate.id}`}
                blogClipId={blogClip.id}
                candidate={candidate}
                selected
                onToggle={() => toggle(candidate.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="image-filmstrip-block">
          <h2 className="image-section-title">후보</h2>
          <div className="image-candidate-strip">
            {candidates.map((candidate) => (
              <CandidateThumb
                key={candidate.id}
                blogClipId={blogClip.id}
                candidate={candidate}
                selected={selectedIds.includes(candidate.id)}
                onToggle={() => toggle(candidate.id)}
              />
            ))}
            <div className="image-candidate-add" aria-hidden="true">
              <span>+</span>
              <span>추가 (곧)</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="image-template-block">
        <div className="yt-confirm-templates-head">
          <h2 className="image-section-title">템플릿</h2>
          <span className="muted">프리셋</span>
        </div>
        {loadingStyles ? <p className="create-note">템플릿 불러오는 중…</p> : null}
        <div className="style-gallery style-gallery-compact" role="listbox" aria-label="쇼츠 템플릿">
          {styles.map((style) => (
            <button
              key={style.slug}
              type="button"
              role="option"
              aria-selected={selectedStyle === style.slug}
              className={`style-card ${selectedStyle === style.slug ? "is-selected" : ""}`}
              disabled={confirming}
              onClick={() => setSelectedStyle(style.slug)}
            >
              {style.badge ? <span className="style-card-badge">{style.badge}</span> : null}
              {selectedStyle === style.slug ? (
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
        <p className="create-note">선택한 템플릿은 이후 보드·미리보기 레이아웃과 자막 스타일에 반영됩니다.</p>
      </div>

      <button
        className="cta-button flow-primary-cta"
        type="button"
        disabled={!canContinue}
        onClick={() => onConfirm(selectedIds, selectedStyle)}
      >
        {confirming ? "확인 중…" : "다음 · 대본 선택"}
      </button>
    </section>
  );
}
