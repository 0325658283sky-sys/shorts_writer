import { useEffect, useState } from "react";
import { authorizedRequest } from "../api/client";
import { BLOG_IMAGE_MAX_COUNT, BLOG_IMAGE_MIN_COUNT } from "../constants";
import type { BlogClip, BlogClipImageCandidate, VisualStyleSlug } from "../types";
import { useCandidateImageUrl } from "./useCandidateImageUrl";

function CandidateThumb({
  blogClipId,
  candidate,
  order,
  onToggle,
}: {
  blogClipId: number;
  candidate: BlogClipImageCandidate;
  order: number | null;
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
  const canContinue = count >= BLOG_IMAGE_MIN_COUNT && count <= BLOG_IMAGE_MAX_COUNT && !confirming;

  return (
    <section className="flow-card flow-images-card">
      <div className="image-step-head">
        <div>
          <h1>쇼츠에 넣을 사진 고르기</h1>
          <p className="flow-lead">고른 순서대로 장면이 됩니다. 최소 {BLOG_IMAGE_MIN_COUNT}장.</p>
        </div>
        <div className="image-step-counter">
          <strong>{count}</strong>
          <span> / 최대 {BLOG_IMAGE_MAX_COUNT}</span>
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
                onToggle={() => toggle(candidate.id)}
              />
            );
          })}
        </div>
      ) : null}

      <div className="image-step-foot">
        <span className="create-note">사진이 {BLOG_IMAGE_MIN_COUNT}장보다 적으면 다음으로 넘어갈 수 없어요.</span>
        <button
          className="btn-primary btn-lg"
          type="button"
          disabled={!canContinue}
          onClick={() => onConfirm(selectedIds, blogClip.visual_style || "impact_full")}
        >
          {confirming ? "확인 중…" : "다음 · 말투 고르기"}
        </button>
      </div>
    </section>
  );
}
