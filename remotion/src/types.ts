/**
 * BlogShorts props — keep in sync with:
 * - remotion/schemas/blog-shorts-props.schema.json
 * - backend BlogShortsPropsResponse / remotion_props_service.py
 */
export type BlogBoardProps = {
  boardId?: number | null;
  /** http(s) URL, or path under remotion/public for staticFile() */
  imageUrl?: string | null;
  /** Optional MP4 (YouTube clip burn-in). Prefer staticFile-relative under remotion/public. */
  videoUrl?: string | null;
  /**
   * True when the board media is an animated GIF.
   * Required for blob:/API URLs that do not end in `.gif` — otherwise Remotion `<Img>`
   * plays the GIF on wall-clock time even while the Player is paused.
   */
  animated?: boolean;
  text: string;
  /** Seconds this board is on screen */
  durationSec: number;
  backgroundColor?: string | null;
  speaker?: string | null;
};

export type VisualStyleSlug =
  | "impact_full"
  | "info_black"
  | "info_navy"
  | "viral_cyan"
  | "card_white"
  | "yt_profile"
  /** @deprecated legacy aliases */
  | "fullscreen"
  | "card_news"
  | "info_dark"
  | "bold_hook";

export type TransitionType = "fade" | "none" | "slide";

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

export type ShortsFontId =
  | "pretendard"
  | "paperlogy"
  | "gmarket_sans"
  | "suit"
  | "jalnan";

export type StyleOverlayProps = {
  titleFont?: ShortsFontId | string | null;
  captionFont?: ShortsFontId | string | null;
  title?: Partial<StyleOverlayLayer> | null;
  subtitle?: Partial<StyleOverlayLayer> | null;
  caption?: Partial<StyleOverlayLayer> | null;
};

export type BlogShortsStyleProps = {
  layout: "fullscreen" | "letterbox" | "header_stack" | "card";
  mediaFit: "cover" | "contain";
  canvasBg: string;
  caption: "center_stroke" | "bottom_outline" | "black_box" | "white_pill";
  header: "none" | "info_black" | "info_navy" | "viral_cyan" | "card_white" | "yt_profile";
  titleColor: string;
  accent: string;
  transitionSec: number;
  transitionType: TransitionType;
  kenBurns: boolean;
};

export type BlogShortsProps = {
  blogClipId?: number | null;
  title?: string | null;
  /** Top template title (editable). Wrap accent words in *like this*. */
  styleTitle?: string | null;
  /** Top template subtitle / accent line (editable) */
  styleSubtitle?: string | null;
  /** Fade/slide overlap between boards in seconds */
  transitionSec?: number;
  transitionType?: TransitionType;
  source?: "dummy" | "blog_clip" | "youtube_clip";
  /** staticFile-relative or absolute URL for full narration (TTS/BGM mix) */
  narrationUrl?: string | null;
  visualStyle?: VisualStyleSlug | string | null;
  style?: BlogShortsStyleProps | null;
  overlay?: StyleOverlayProps | null;
  /** Hide text layers (preview HTML editor draws them instead). */
  suppressText?: boolean;
  /** YouTube / channel branding footer (yt_profile). */
  channelName?: string | null;
  channelAvatarUrl?: string | null;
  videoTitle?: string | null;
  boards: BlogBoardProps[];
};

export const DEFAULT_BLOG_SHORTS_PROPS: BlogShortsProps = {
  blogClipId: null,
  title: "블로그 → 쇼츠 스파이크",
  styleTitle: "블로그 → *쇼츠* 스파이크",
  styleSubtitle: "핵심만 짧게",
  transitionSec: 0.35,
  transitionType: "fade",
  source: "dummy",
  visualStyle: "impact_full",
  style: {
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
  boards: [
    {
      text: "첫 3초, 훅으로 시선을 잡습니다",
      durationSec: 2.8,
      backgroundColor: "#1a3a4a",
    },
    {
      text: "본문 핵심을 짧게 보드로 나눕니다",
      durationSec: 3.2,
      backgroundColor: "#2d4a3e",
    },
    {
      text: "자막·전환은 Remotion으로 맞춥니다",
      durationSec: 3.0,
      backgroundColor: "#3d2a4a",
    },
  ],
};
