/** Shorts on-screen fonts — keep catalog in sync with frontend/src/lib/shortsFonts.ts */

import { continueRender, delayRender, staticFile } from "remotion";

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
  family: string;
  titleWeight: number;
  captionWeight: number;
};

export const DEFAULT_SHORTS_FONT_ID: ShortsFontId = "gmarket_sans";

export const SHORTS_FONTS: ShortsFontDef[] = [
  {
    id: "pretendard",
    label: "Pretendard",
    family: "Pretendard",
    titleWeight: 600,
    captionWeight: 600,
  },
  {
    id: "paperlogy",
    label: "Paperlogy",
    family: "Paperlogy",
    titleWeight: 800,
    captionWeight: 700,
  },
  {
    id: "gmarket_sans",
    label: "지마켓 산스",
    family: "Gmarket Sans",
    titleWeight: 800,
    captionWeight: 700,
  },
  {
    id: "suit",
    label: "SUIT",
    family: "SUIT",
    titleWeight: 600,
    captionWeight: 500,
  },
  {
    id: "jalnan",
    label: "여기어때 잘난체",
    family: "Jalnan",
    titleWeight: 400,
    captionWeight: 400,
  },
];

const FONT_BY_ID: Record<ShortsFontId, ShortsFontDef> = Object.fromEntries(
  SHORTS_FONTS.map((font) => [font.id, font]),
) as Record<ShortsFontId, ShortsFontDef>;

/** Files under remotion/public/fonts (and mirrored to frontend/public/fonts). */
const FONT_FACE_FILES: { family: string; weight: number; file: string; format: "woff2" | "woff" }[] = [
  { family: "Pretendard", weight: 600, file: "fonts/pretendard-semibold.woff2", format: "woff2" },
  { family: "Pretendard", weight: 700, file: "fonts/pretendard-bold.woff2", format: "woff2" },
  { family: "Paperlogy", weight: 700, file: "fonts/paperlogy-bold.woff2", format: "woff2" },
  { family: "Paperlogy", weight: 800, file: "fonts/paperlogy-extrabold.woff2", format: "woff2" },
  // Gmarket ships Light/Medium/Bold — Bold is the heaviest; register as 700 + 800.
  { family: "Gmarket Sans", weight: 700, file: "fonts/gmarket-sans-bold.woff", format: "woff" },
  { family: "Gmarket Sans", weight: 800, file: "fonts/gmarket-sans-bold.woff", format: "woff" },
  { family: "SUIT", weight: 500, file: "fonts/suit-medium.woff2", format: "woff2" },
  { family: "SUIT", weight: 600, file: "fonts/suit-semibold.woff2", format: "woff2" },
  { family: "Jalnan", weight: 400, file: "fonts/jalnan.woff", format: "woff" },
];

let fontsLoadPromise: Promise<void> | null = null;

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

async function loadOneFont(
  family: string,
  weight: number,
  file: string,
  format: "woff2" | "woff",
): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const url = staticFile(file);
  const face = new FontFace(family, `url('${url}') format('${format}')`, {
    weight: String(weight),
    style: "normal",
    display: "swap",
  } as FontFaceDescriptors);
  const loaded = await face.load();
  document.fonts.add(loaded);
}

/** Wait for Shorts fonts before first paint (Remotion delayRender). */
export function ensureShortsFontsLoaded(): Promise<void> {
  if (fontsLoadPromise) return fontsLoadPromise;
  const handle = delayRender("Loading Shorts fonts");
  fontsLoadPromise = Promise.all(
    FONT_FACE_FILES.map((entry) =>
      loadOneFont(entry.family, entry.weight, entry.file, entry.format).catch(() => {
        // Missing file → fall back to Noto/system; do not block render forever.
      }),
    ),
  ).then(() => {
    continueRender(handle);
  });
  return fontsLoadPromise;
}
