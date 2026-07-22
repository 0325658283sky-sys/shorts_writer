import type { BlogShortsProps, BlogShortsStyleProps, TransitionType } from "@new-cut/remotion/types";
import type { BlogClip, Board } from "../types";
import { mergeStyleOverlay } from "./styleOverlay";

const DEFAULT_BOARD_DURATION_SEC = 2.5;
const DEFAULT_TRANSITION_SEC = 0.35;

/** True when board media should use Remotion AnimatedImage (path ends with .gif). */
export function boardIsAnimatedPath(imagePath: string | null | undefined): boolean {
  return /\.gif$/i.test(imagePath ?? "");
}

const LEGACY_STYLE_SLUGS: Record<string, string> = {
  fullscreen: "impact_full",
  card_news: "card_white",
  info_dark: "info_navy",
  bold_hook: "viral_cyan",
};

const STYLE_BY_VISUAL: Record<string, BlogShortsStyleProps> = {
  impact_full: {
    layout: "fullscreen",
    mediaFit: "cover",
    canvasBg: "#000000",
    caption: "center_stroke",
    header: "none",
    titleColor: "#ffffff",
    accent: "#ffffff",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: true,
  },
  info_black: {
    layout: "letterbox",
    mediaFit: "cover",
    canvasBg: "#000000",
    caption: "bottom_outline",
    header: "info_black",
    titleColor: "#ffffff",
    accent: "#FFE566",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: false,
  },
  info_navy: {
    layout: "letterbox",
    mediaFit: "cover",
    canvasBg: "#0B1F3A",
    caption: "black_box",
    header: "info_navy",
    titleColor: "#ffffff",
    accent: "#7CFFB2",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: false,
  },
  viral_cyan: {
    layout: "header_stack",
    mediaFit: "cover",
    canvasBg: "#000000",
    caption: "black_box",
    header: "viral_cyan",
    titleColor: "#5EF2D0",
    accent: "#ffffff",
    transitionSec: 0.25,
    transitionType: "slide",
    kenBurns: true,
  },
  card_white: {
    layout: "card",
    mediaFit: "cover",
    canvasBg: "#ffffff",
    caption: "white_pill",
    header: "card_white",
    titleColor: "#151515",
    accent: "#151515",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: true,
  },
};

export function normalizeVisualStyleSlug(slug?: string | null): string {
  const key = (slug || "impact_full").trim().toLowerCase();
  return LEGACY_STYLE_SLUGS[key] ?? key;
}

export function buildBlogShortsProps(options: {
  blogClip: BlogClip;
  boards: Board[];
  imageUrls: Record<number, string>;
  selectedBoardId: number | null;
  draftText: string;
  narrationUrl?: string | null;
  styleTitle?: string | null;
  styleSubtitle?: string | null;
  suppressText?: boolean;
}): BlogShortsProps {
  const {
    blogClip,
    boards,
    imageUrls,
    selectedBoardId,
    draftText,
    narrationUrl,
    styleTitle,
    styleSubtitle,
    suppressText,
  } = options;
  const visualStyle = normalizeVisualStyleSlug(blogClip.visual_style);
  const baseStyle = STYLE_BY_VISUAL[visualStyle] ?? STYLE_BY_VISUAL.impact_full;
  const transitionType = (blogClip.transition_type || baseStyle.transitionType || "fade") as TransitionType;
  const transitionSec =
    blogClip.transition_sec != null
      ? blogClip.transition_sec
      : (baseStyle.transitionSec ?? DEFAULT_TRANSITION_SEC);
  const style: BlogShortsStyleProps = {
    ...baseStyle,
    transitionSec,
    transitionType,
  };
  const resolvedTitle =
    (styleTitle !== undefined ? styleTitle : blogClip.style_title) || blogClip.blog_title || null;
  const resolvedSubtitle =
    styleSubtitle !== undefined ? styleSubtitle : blogClip.style_subtitle ?? null;
  const overlay = mergeStyleOverlay(visualStyle, blogClip.style_overlay);
  return {
    blogClipId: blogClip.id,
    title: blogClip.blog_title,
    styleTitle: resolvedTitle,
    styleSubtitle: resolvedSubtitle,
    transitionSec,
    transitionType,
    source: "blog_clip",
    narrationUrl: narrationUrl ?? null,
    visualStyle,
    style,
    overlay,
    suppressText: Boolean(suppressText),
    boards: boards.map((board) => ({
      boardId: board.id,
      imageUrl: imageUrls[board.id] ?? null,
      // Blob preview URLs lack .gif — Remotion MediaLayer needs this flag.
      animated: boardIsAnimatedPath(board.image_path),
      text: board.id === selectedBoardId ? draftText : board.text,
      durationSec:
        board.duration_seconds != null && board.duration_seconds > 0
          ? board.duration_seconds
          : DEFAULT_BOARD_DURATION_SEC,
      backgroundColor: null,
      speaker: board.speaker,
    })),
  };
}
