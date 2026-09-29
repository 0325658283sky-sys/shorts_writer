/**
 * BlogShorts props — keep in sync with:
 * - remotion/schemas/blog-shorts-props.schema.json
 * - backend BlogShortsPropsResponse / remotion_props_service.py
 */
export type CaptionWordTiming = {
  text: string;
  startSec: number;
  endSec: number;
};

/** 장면별 텍스트 스타일 오버라이드(편집기 "텍스트" 탭). 없는 키는 템플릿/전체 스타일 값을 그대로 쓴다. */
export type BoardTextStyle = {
  fontFamily?: ShortsFontId | string | null;
  fontSize?: number | null;
  accentColor?: string | null;
  animation?: CaptionAnimation | null;
};

export type BlogBoardProps = {
  textStyle?: BoardTextStyle | null;
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
  /** Estimated or precise per-word timings for kinetic captions. */
  words?: CaptionWordTiming[];
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

export type CaptionAnimation = "none" | "highlight";

/** ④ 템플릿 갤러리 (design_handoff_newcut_v2) — subtitle_templates의 새 필드.
 * 있으면 캡션 위치/모양/강조색/폰트를 이 값으로 덮어쓰고, 없으면 기존
 * visualStyle의 caption 변형(center_stroke 등)을 그대로 쓴다. */
export type CaptionTemplatePosition = "top" | "bottom";
export type CaptionTemplateBoxStyle =
  | "none"
  | "box"
  | "pill"
  | "side_bar"
  | "gradient"
  | "outline";

export type CaptionTemplateProps = {
  position: CaptionTemplatePosition;
  boxStyle: CaptionTemplateBoxStyle;
  accentColor?: string | null;
  fontFamily?: ShortsFontId | string | null;
};

export type StyleOverlayProps = {
  titleFont?: ShortsFontId | string | null;
  captionFont?: ShortsFontId | string | null;
  captionAnimation?: CaptionAnimation | null;
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
  captionAnimation?: CaptionAnimation;
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
  /** ④ 템플릿 갤러리에서 고른 subtitle_template의 캡션 표현. 없으면 style.caption 그대로 사용. */
  captionTemplate?: CaptionTemplateProps | null;
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
