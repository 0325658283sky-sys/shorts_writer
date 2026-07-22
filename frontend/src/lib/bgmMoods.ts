/** Mirror of backend BGM mood catalog (KR Shorts). */

export type BgmMood = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  slugs: string[];
};

/** Fallback when API is unavailable — keep in sync with bgm_mood_catalog.py */
export const FALLBACK_BGM_MOODS: BgmMood[] = [
  {
    id: "hook_upbeat",
    label: "훅·임팩트",
    description: "오프닝, 챌린지식 첫 3초",
    keywords: ["upbeat", "energetic", "promo", "short punchy"],
    slugs: ["promo_pulse", "bright_lift"],
  },
  {
    id: "bright_vlog",
    label: "밝은 브이로그",
    description: "리뷰, 일상, 카페",
    keywords: ["warm", "feel good", "light pop", "vlog"],
    slugs: ["light_warm", "bright_lift"],
  },
  {
    id: "info_soft",
    label: "정보·설명",
    description: "설치/사용법, 레터박스 정보형",
    keywords: ["soft corporate", "calm tech", "clean pad"],
    slugs: ["soft_pad", "calm_drone"],
  },
  {
    id: "calm_mood",
    label: "감성·차분",
    description: "야경, 후기, 롱폼 설명",
    keywords: ["lofi", "chill", "ambient", "soft drone"],
    slugs: ["calm_drone", "soft_pad"],
  },
  {
    id: "promo_pulse",
    label: "프로모·세일",
    description: "할인, CTA, 바이럴 톤",
    keywords: ["marketing", "pulse", "electronic promo"],
    slugs: ["promo_pulse", "bright_lift"],
  },
  {
    id: "neutral_bed",
    label: "중립 배경",
    description: "애매할 때 기본",
    keywords: ["background", "underscore", "gentle"],
    slugs: ["soft_pad", "light_warm"],
  },
];

type AssetLike = { id: number; slug: string | null };

export function findAssetForMood<T extends AssetLike>(assets: T[], mood: BgmMood): T | null {
  for (const slug of mood.slugs) {
    const match = assets.find((asset) => asset.slug === slug);
    if (match) return match;
  }
  return null;
}

export function moodMatchesAsset(mood: BgmMood, asset: AssetLike | null | undefined): boolean {
  if (!asset?.slug) return false;
  return mood.slugs.includes(asset.slug);
}

export function findMoodForAsset(moods: BgmMood[], asset: AssetLike | null | undefined): BgmMood | null {
  if (!asset?.slug) return null;
  const primary = moods.find((mood) => mood.slugs[0] === asset.slug);
  if (primary) return primary;
  return moods.find((mood) => mood.slugs.includes(asset.slug!)) ?? null;
}
