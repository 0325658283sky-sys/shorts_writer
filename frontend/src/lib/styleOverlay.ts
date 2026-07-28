import type { VisualStyleSlug } from "../types";
import { normalizeVisualStyleSlug } from "./blogShortsProps";
import {
  DEFAULT_SHORTS_FONT_ID,
  normalizeShortsFontId,
  type ShortsFontId,
} from "./shortsFonts";

export type OverlayAlign = "left" | "center" | "right";

export type StyleOverlayLayer = {
  x: number;
  y: number;
  fontSize: number;
  color: string;
  align: OverlayAlign;
  maxWidth: number;
  visible: boolean;
};

export type StyleOverlay = {
  titleFont: ShortsFontId;
  captionFont: ShortsFontId;
  title: StyleOverlayLayer;
  subtitle: StyleOverlayLayer;
  caption: StyleOverlayLayer;
};

export type StyleOverlayPatch = {
  titleFont?: ShortsFontId | string;
  captionFont?: ShortsFontId | string;
  title?: Partial<StyleOverlayLayer>;
  subtitle?: Partial<StyleOverlayLayer>;
  caption?: Partial<StyleOverlayLayer>;
};

const DEFAULT_OVERLAYS: Record<string, StyleOverlay> = {
  // Calibrated to reference Shorts samples (1080×1920).
  impact_full: {
    titleFont: DEFAULT_SHORTS_FONT_ID,
    captionFont: DEFAULT_SHORTS_FONT_ID,
    title: { x: 0.5, y: 0.08, fontSize: 72, color: "#ffffff", align: "center", maxWidth: 0.86, visible: false },
    subtitle: { x: 0.5, y: 0.14, fontSize: 56, color: "#ffffff", align: "center", maxWidth: 0.86, visible: false },
    caption: { x: 0.5, y: 0.42, fontSize: 92, color: "#ffffff", align: "center", maxWidth: 0.82, visible: true },
  },
  // Two-line header: title/subtitle 110px, tight stack (ref sample).
  info_black: {
    titleFont: DEFAULT_SHORTS_FONT_ID,
    captionFont: DEFAULT_SHORTS_FONT_ID,
    title: { x: 0.5, y: 0.055, fontSize: 110, color: "#ffffff", align: "center", maxWidth: 0.92, visible: true },
    subtitle: { x: 0.5, y: 0.118, fontSize: 110, color: "#FFE566", align: "center", maxWidth: 0.92, visible: true },
    caption: { x: 0.5, y: 0.70, fontSize: 48, color: "#ffffff", align: "center", maxWidth: 0.88, visible: true },
  },
  info_navy: {
    titleFont: DEFAULT_SHORTS_FONT_ID,
    captionFont: DEFAULT_SHORTS_FONT_ID,
    title: { x: 0.5, y: 0.055, fontSize: 110, color: "#ffffff", align: "center", maxWidth: 0.92, visible: true },
    subtitle: { x: 0.5, y: 0.118, fontSize: 110, color: "#7CFFB2", align: "center", maxWidth: 0.92, visible: true },
    caption: { x: 0.5, y: 0.685, fontSize: 46, color: "#ffffff", align: "center", maxWidth: 0.86, visible: true },
  },
  viral_cyan: {
    titleFont: DEFAULT_SHORTS_FONT_ID,
    captionFont: DEFAULT_SHORTS_FONT_ID,
    title: { x: 0.5, y: 0.05, fontSize: 110, color: "#5EF2D0", align: "center", maxWidth: 0.92, visible: true },
    subtitle: { x: 0.5, y: 0.113, fontSize: 110, color: "#ffffff", align: "center", maxWidth: 0.92, visible: true },
    caption: { x: 0.5, y: 0.64, fontSize: 46, color: "#ffffff", align: "center", maxWidth: 0.84, visible: true },
  },
  card_white: {
    titleFont: DEFAULT_SHORTS_FONT_ID,
    captionFont: DEFAULT_SHORTS_FONT_ID,
    title: { x: 0.5, y: 0.05, fontSize: 110, color: "#151515", align: "center", maxWidth: 0.9, visible: true },
    subtitle: { x: 0.5, y: 0.113, fontSize: 110, color: "#151515", align: "center", maxWidth: 0.9, visible: false },
    caption: { x: 0.5, y: 0.72, fontSize: 44, color: "#151515", align: "center", maxWidth: 0.84, visible: true },
  },
  yt_profile: {
    titleFont: DEFAULT_SHORTS_FONT_ID,
    captionFont: DEFAULT_SHORTS_FONT_ID,
    title: { x: 0.5, y: 0.06, fontSize: 92, color: "#ffffff", align: "center", maxWidth: 0.9, visible: true },
    subtitle: { x: 0.5, y: 0.125, fontSize: 92, color: "#FFE566", align: "center", maxWidth: 0.9, visible: true },
    caption: { x: 0.5, y: 0.58, fontSize: 40, color: "#ffffff", align: "center", maxWidth: 0.86, visible: true },
  },
};

function cloneOverlay(overlay: StyleOverlay): StyleOverlay {
  return {
    titleFont: overlay.titleFont,
    captionFont: overlay.captionFont,
    title: { ...overlay.title },
    subtitle: { ...overlay.subtitle },
    caption: { ...overlay.caption },
  };
}

export function defaultStyleOverlay(slug?: string | VisualStyleSlug | null): StyleOverlay {
  const key = normalizeVisualStyleSlug(slug);
  return cloneOverlay(DEFAULT_OVERLAYS[key] ?? DEFAULT_OVERLAYS.impact_full);
}

export function mergeStyleOverlay(
  slug?: string | null,
  custom?: StyleOverlayPatch | null,
): StyleOverlay {
  const base = defaultStyleOverlay(slug);
  if (!custom) return base;
  if (custom.titleFont != null) base.titleFont = normalizeShortsFontId(custom.titleFont);
  if (custom.captionFont != null) base.captionFont = normalizeShortsFontId(custom.captionFont);
  for (const key of ["title", "subtitle", "caption"] as const) {
    const layer = custom[key];
    if (!layer) continue;
    base[key] = { ...base[key], ...layer };
    base[key].x = Math.max(0, Math.min(1, base[key].x));
    base[key].y = Math.max(0, Math.min(1, base[key].y));
    base[key].fontSize = Math.max(16, Math.min(140, base[key].fontSize));
    base[key].maxWidth = Math.max(0.2, Math.min(1, base[key].maxWidth));
  }
  return base;
}
