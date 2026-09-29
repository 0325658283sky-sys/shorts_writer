import { useEffect, useState } from "react";
import { authorizedRequest } from "../api/client";
import { BLOG_IMAGE_MAX_COUNT, BLOG_IMAGE_MIN_COUNT } from "../constants";
import type { BlogClip, BlogClipImageCandidate, VisualStyleSlug } from "../types";
import { useCandidateImageUrl } from "./useCandidateImageUrl";

function CandidateThumb({
  blogClipId,
  candidate,
  order,
  isStock,
  onToggle,
}: {
  blogClipId: number;
  candidate: BlogClipImageCandidate;
  order: number | null;
  isStock: boolean;
  onToggle: () => void;
}) {
  const { url, error } = useCandidateImageUrl(blogClipId, candidate.id);
  const selected = order != null;
  return (
    <button
      type="button"
      className={`image-candidate ${selected ? "is-selected" : ""}`}
      onClick={onToggle}
      aria-pressed={selected}
    >
      {url ? <img src={url} alt="" /> : <span className="image-candidate-fallback">{error ? "!" : "…"}</span>}
      {selected ? <span className="image-candidate-order">{order}</span> : null}
      {isStock ? <span className="image-candidate-stock">스톡</span> : null}
    </button>
  );
}

export function ImageSelectStep({
  blogClip,
  confirming,
  isProduct = false,
  onConfirm,
  onMessage,
  onBack,
}: {
  blogClip: BlogClip;
  confirming: boolean;
  isProduct?: boolean;
  onConfirm: (imageIds: number[], visualStyle: VisualStyleSlug | string) => void;
  onMessage: (message: string) => void;
  onBack?: () => void;
}) {
  const [candidates, setCandidates] = useState<BlogClipImageCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authorizedRequest<BlogClipImageCandidate[]>(`/blog-clips/${blogClip.id}/images`)
      .then((loaded) => {
        if (cancelled) return;
        setCandidates(loaded);
        const preselected = loaded.filter((item) => item.selected).map((item) => item.id);
        const initial = (preselected.length > 0 ? preselected : loaded.map((i) => i.id)).slice(0, BLOG_IMAGE_MAX_COUNT);
        setSelectedIds(initial);
      })
      .catch((error) => {
        if (!cancelled) onMessage(error instanceof Error ? error.message : "이미지를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blogClip.id]);

  function toggle(imageId: number) {
    setSelectedIds((current) => {
      if (current.includes(imageId)) return current.filter((id) => id !== imageId);
      if (current.length >= BLOG_IMAGE_MAX_COUNT) {
        onMessage(`사진은 최대 ${BLOG_IMAGE_MAX_COUNT}장까지 넣을 수 있어요.`);
        return current;
      }
      return [...current, imageId];
    });
  }

  const count = selectedIds.length;
  const [stockFill, setStockFill] = useState(false);
  const [filling, setFilling] = useState(false);
  const shortage = BLOG_IMAGE_MIN_COUNT - count;
  const needsStock = shortage > 0;
  const canContinue =
    count <= BLOG_IMAGE_MAX_COUNT &&
    !confirming &&
    !filling &&
    (count >= BLOG_IMAGE_MIN_COUNT || (stockFill && !isProduct && count >= 1));

  async function handleContinue() {
    let ids = selectedIds;
    if (needsStock) {
      setFilling(true);
      try {
        const added = await authorizedRequest<BlogClipImageCandidate[]>(
          `/blog-clips/${blogClip.id}/images/stock-fill?need=${shortage}`,
          { method: "POST" },
        );
        ids = [...selectedIds, ...added.map((item) => item.id)];
      } catch (error) {
        onMessage(error instanceof Error ? error.message : "스톡 사진을 가져오지 못했습니다.");
        setFilling(false);
        return;
      }
      setFilling(false);
    }
    onConfirm(ids, blogClip.visual_style || "impact_full");
  }

  return (
    <section className="flow-card flow-images-card">
      <div className="image-step-head">
        <div>
          <p className="create-kicker">{isProduct ? "상품 사진" : "글 속 사진"}</p>
          <h1>쇼츠에 쓸 사진을 골라주세요</h1>
          <p className="flow-lead">
            고른 순서대로 장면이 됩니다. 최소 {BLOG_IMAGE_MIN_COUNT}장, 최대 {BLOG_IMAGE_MAX_COUNT}장까지 고를 수 있어요.
          </p>
        </div>
        <div className="image-step-counter">
          <strong>{count}</strong>
          <span> / {BLOG_IMAGE_MAX_COUNT}장</span>
          <span className="image-step-gauge">
            <span style={{ width: `${Math.min(100, (count / BLOG_IMAGE_MAX_COUNT) * 100)}%` }} />
          </span>
        </div>
      </div>

      {loading ? <p className="create-note">사진 불러오는 중…</p> : null}

      {!loading ? (
        <div className="image-candidate-grid">
          {candidates.map((candidate) => {
            const index = selectedIds.indexOf(candidate.id);
            return (
              <CandidateThumb
                key={candidate.id}
                blogClipId={blogClip.id}
                candidate={candidate}
                order={index === -1 ? null : index + 1}
                isStock={Boolean(candidate.source_url?.includes("images.pexels.com"))}
                onToggle={() => toggle(candidate.id)}
              />
            );
          })}
        </div>
      ) : null}

      {!isProduct ? (
        <div className="image-stock-row">
          <div>
            <div className="candidates-option-title">사진 부족 시 스톡 보충</div>
            <div className="candidates-option-desc">
              고른 사진이 {BLOG_IMAGE_MIN_COUNT}장보다 적으면 글 제목에 맞는 스톡 사진으로 부족한 만큼 채웁니다
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={stockFill}
            className={`ncf-switch ${stockFill ? "is-on" : ""}`}
            onClick={() => setStockFill((value) => !value)}
          >
            <span />
          </button>
        </div>
      ) : null}

      <div className="image-step-foot">
        {onBack ? (
          <button className="ghost-button" type="button" onClick={onBack}>
            ← 다른 링크
          </button>
        ) : null}
        <span className={`image-step-hint ${needsStock && !(stockFill && !isProduct) ? "is-warn" : ""}`}>
          {needsStock
            ? stockFill && !isProduct
              ? `부족한 ${shortage}장은 스톡 사진으로 채워요`
              : `${BLOG_IMAGE_MIN_COUNT}장 이상 골라야 다음으로 갈 수 있어요`
            : `${count}장 선택됨`}
        </span>
        <button
          className="btn-primary btn-lg"
          type="button"
          disabled={!canContinue}
          onClick={() => void handleContinue()}
        >
          {confirming || filling ? "확인 중…" : isProduct ? "셀링포인트로" : "대본 고르기"}
        </button>
      </div>
    </section>
  );
}
