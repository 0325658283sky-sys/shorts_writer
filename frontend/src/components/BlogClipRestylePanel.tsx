import { useEffect, useState } from "react";
import { authorizedRequest } from "../api/client";
import type { AudioAsset, BlogClip, BlogClipVersion, VisualStyle, VisualStyleSlug, Voice } from "../types";
import { normalizeVisualStyleSlug } from "../lib/blogShortsProps";

export function BlogClipRestylePanel({
  blogClip,
  busy,
  onApplied,
  onMessage,
}: {
  blogClip: BlogClip;
  busy: boolean;
  onApplied: (clip: BlogClip) => void;
  onMessage: (message: string) => void;
}) {
  const [styles, setStyles] = useState<VisualStyle[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [bgmAssets, setBgmAssets] = useState<AudioAsset[]>([]);
  const [selectedStyle, setSelectedStyle] = useState(() => normalizeVisualStyleSlug(blogClip.visual_style));
  const [selectedVoice, setSelectedVoice] = useState(blogClip.default_voice ?? "");
  const [bgmAssetId, setBgmAssetId] = useState<number | null>(blogClip.bgm_asset_id);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setSelectedStyle(normalizeVisualStyleSlug(blogClip.visual_style));
    setSelectedVoice(blogClip.default_voice ?? "");
    setBgmAssetId(blogClip.bgm_asset_id);
  }, [blogClip.id, blogClip.visual_style, blogClip.default_voice, blogClip.bgm_asset_id, blogClip.active_version_id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      authorizedRequest<VisualStyle[]>("/visual-styles"),
      authorizedRequest<Voice[]>("/voices"),
      authorizedRequest<AudioAsset[]>("/audio-assets?kind=bgm"),
    ])
      .then(([loadedStyles, loadedVoices, bgm]) => {
        if (cancelled) return;
        setStyles(loadedStyles);
        setVoices(loadedVoices);
        setBgmAssets(bgm);
      })
      .catch((error) => {
        if (!cancelled) onMessage(error instanceof Error ? error.message : "스타일 목록을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [blogClip.id, onMessage]);

  async function handleApply() {
    setSubmitting(true);
    try {
      await authorizedRequest<BlogClipVersion[]>(`/blog-clips/${blogClip.id}/versions`, {
        method: "POST",
        body: JSON.stringify({
          mode: "restyle",
          visual_style: selectedStyle,
          default_voice: selectedVoice || undefined,
          bgm_asset_id: bgmAssetId,
          set_active: true,
        }),
      });
      onMessage("새 스타일 버전을 만들고 있습니다.");
      for (let attempt = 0; attempt < 45; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const versions = await authorizedRequest<BlogClipVersion[]>(`/blog-clips/${blogClip.id}/versions`);
        const busyVersions = versions.some((item) => item.status === "pending" || item.status === "processing");
        const parent = await authorizedRequest<BlogClip>(`/blog-clips/${blogClip.id}`);
        onApplied(parent);
        if (!busyVersions) break;
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "스타일 재생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  const blocked = busy || submitting;

  return (
    <section className="flow-card">
      <p className="create-kicker">스타일 다시 입히기</p>
      <h1>템플릿 · 보이스를 바꿔 새 버전을 만듭니다</h1>
      <p className="flow-lead">완성본은 그대로 두고, 선택한 설정으로 버전을 하나 더 렌더합니다.</p>

      <p className="style-gallery-label">템플릿</p>
      <div className="style-gallery">
        {styles.map((style) => (
          <button
            key={style.slug}
            type="button"
            className={`style-card ${selectedStyle === style.slug ? "is-selected" : ""}`}
            disabled={blocked}
            onClick={() => setSelectedStyle(style.slug as VisualStyleSlug)}
          >
            <div className="style-card-preview">
              {style.previewImage ? (
                <img src={style.previewImage} alt="" />
              ) : (
                <div className={`style-card-fallback style-fallback-${style.slug}`} />
              )}
            </div>
            <strong>{style.label}</strong>
          </button>
        ))}
      </div>

      {voices.length ? (
        <label className="create-field">
          <span>보이스</span>
          <select
            value={selectedVoice}
            disabled={blocked}
            onChange={(event) => setSelectedVoice(event.target.value)}
          >
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {bgmAssets.length ? (
        <label className="create-field">
          <span>BGM</span>
          <select
            value={bgmAssetId ?? ""}
            disabled={blocked}
            onChange={(event) => setBgmAssetId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">없음</option>
            {bgmAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <button className="cta-button flow-primary-cta" type="button" disabled={blocked} onClick={() => void handleApply()}>
        {submitting ? "시작 중…" : "이 스타일로 다시 만들기"}
      </button>
    </section>
  );
}
