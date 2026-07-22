/** Shared Shorts on-screen font catalog (keep in sync with remotion/src/fonts.ts). */

export type ShortsFontId =
  | "pretendard"
  | "paperlogy"
  | "gmarket_sans"
  | "suit"
  | "jalnan";

export type ShortsFontRole = "title" | "caption";

export type ShortsFontDef = {
  id: ShortsFontId;
  label: string;
  hint: string;
  /** CSS font-family name registered via @font-face */
  family: string;
  titleWeight: number;
  captionWeight: number;
};

export const DEFAULT_SHORTS_FONT_ID: ShortsFontId = "gmarket_sans";

export const SHORTS_FONTS: ShortsFontDef[] = [
  {
    id: "pretendard",
    label: "Pretendard",
    hint: "일반 자막 · 정보형",
    family: "Pretendard",
    titleWeight: 600,
    captionWeight: 600,
  },
  {
    id: "paperlogy",
    label: "Paperlogy",
    hint: "메인 타이틀 · 쇼츠 제목",
    family: "Paperlogy",
    titleWeight: 800,
    captionWeight: 700,
  },
  {
    id: "gmarket_sans",
    label: "지마켓 산스",
    hint: "예능형 · 리뷰 · 친근 (기본)",
    family: "Gmarket Sans",
    titleWeight: 800,
    captionWeight: 700,
  },
  {
    id: "suit",
    label: "SUIT",
    hint: "감성 · 인터뷰 · 브랜딩",
    family: "SUIT",
    titleWeight: 600,
    captionWeight: 500,
  },
  {
    id: "jalnan",
    label: "여기어때 잘난체",
    hint: "강조 · 반전 · 강한 타이틀",
    family: "Jalnan",
    titleWeight: 400,
    captionWeight: 400,
  },
];

const FONT_BY_ID: Record<ShortsFontId, ShortsFontDef> = Object.fromEntries(
  SHORTS_FONTS.map((font) => [font.id, font]),
) as Record<ShortsFontId, ShortsFontDef>;

export function normalizeShortsFontId(value?: string | null): ShortsFontId {
  const key = (value || "").trim().toLowerCase();
  if (key in FONT_BY_ID) return key as ShortsFontId;
  return DEFAULT_SHORTS_FONT_ID;
}

export function resolveShortsFont(id?: string | null): ShortsFontDef {
  return FONT_BY_ID[normalizeShortsFontId(id)];
}

export function shortsFontCss(
  id: string | null | undefined,
  role: ShortsFontRole,
): { fontFamily: string; fontWeight: number } {
  const font = resolveShortsFont(id);
  return {
    fontFamily: `"${font.family}", "Noto Sans KR", sans-serif`,
    fontWeight: role === "title" ? font.titleWeight : font.captionWeight,
  };
}
