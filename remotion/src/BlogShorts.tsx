import React, { useEffect, useMemo } from "react";
import {
  AbsoluteFill,
  AnimatedImage,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ensureShortsFontsLoaded, normalizeShortsFontId, shortsFontCss } from "./fonts";
import type {
  BlogBoardProps,
  BlogShortsProps,
  BlogShortsStyleProps,
  CaptionAnimation,
  CaptionTemplateBoxStyle,
  CaptionTemplateProps,
  CaptionWordTiming,
  StyleOverlayLayer,
  StyleOverlayProps,
  TransitionType,
} from "./types";

const FPS = 30;
export const BLOG_SHORTS_WIDTH = 1080;
export const BLOG_SHORTS_HEIGHT = 1920;

const LEGACY_STYLE_SLUGS: Record<string, string> = {
  fullscreen: "impact_full",
  card_news: "card_white",
  info_dark: "info_navy",
  bold_hook: "viral_cyan",
};

const DEFAULT_OVERLAYS: Record<string, Record<"title" | "subtitle" | "caption", StyleOverlayLayer>> = {
  // Calibrated to reference Shorts samples (1080×1920).
  impact_full: {
    title: { x: 0.5, y: 0.08, fontSize: 72, color: "#ffffff", align: "center", maxWidth: 0.86, visible: false },
    subtitle: { x: 0.5, y: 0.14, fontSize: 56, color: "#ffffff", align: "center", maxWidth: 0.86, visible: false },
    caption: { x: 0.5, y: 0.42, fontSize: 92, color: "#ffffff", align: "center", maxWidth: 0.82, visible: true },
  },
  // Two-line header: title/subtitle 110px, tight stack (ref sample).
  info_black: {
    title: { x: 0.5, y: 0.055, fontSize: 110, color: "#ffffff", align: "center", maxWidth: 0.92, visible: true },
    subtitle: { x: 0.5, y: 0.118, fontSize: 110, color: "#FFE566", align: "center", maxWidth: 0.92, visible: true },
    caption: { x: 0.5, y: 0.70, fontSize: 48, color: "#ffffff", align: "center", maxWidth: 0.88, visible: true },
  },
  info_navy: {
    title: { x: 0.5, y: 0.055, fontSize: 110, color: "#ffffff", align: "center", maxWidth: 0.92, visible: true },
    subtitle: { x: 0.5, y: 0.118, fontSize: 110, color: "#7CFFB2", align: "center", maxWidth: 0.92, visible: true },
    caption: { x: 0.5, y: 0.685, fontSize: 46, color: "#ffffff", align: "center", maxWidth: 0.86, visible: true },
  },
  viral_cyan: {
    title: { x: 0.5, y: 0.05, fontSize: 110, color: "#5EF2D0", align: "center", maxWidth: 0.92, visible: true },
    subtitle: { x: 0.5, y: 0.113, fontSize: 110, color: "#ffffff", align: "center", maxWidth: 0.92, visible: true },
    caption: { x: 0.5, y: 0.64, fontSize: 46, color: "#ffffff", align: "center", maxWidth: 0.84, visible: true },
  },
  card_white: {
    title: { x: 0.5, y: 0.05, fontSize: 110, color: "#151515", align: "center", maxWidth: 0.9, visible: true },
    subtitle: { x: 0.5, y: 0.113, fontSize: 110, color: "#151515", align: "center", maxWidth: 0.9, visible: false },
    caption: { x: 0.5, y: 0.72, fontSize: 44, color: "#151515", align: "center", maxWidth: 0.84, visible: true },
  },
  yt_profile: {
    title: { x: 0.5, y: 0.06, fontSize: 92, color: "#ffffff", align: "center", maxWidth: 0.9, visible: true },
    subtitle: { x: 0.5, y: 0.125, fontSize: 92, color: "#FFE566", align: "center", maxWidth: 0.9, visible: true },
    caption: { x: 0.5, y: 0.58, fontSize: 40, color: "#ffffff", align: "center", maxWidth: 0.86, visible: true },
  },
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
    captionAnimation: "highlight",
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
    captionAnimation: "highlight",
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
    captionAnimation: "highlight",
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
    captionAnimation: "highlight",
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
    captionAnimation: "highlight",
  },
  yt_profile: {
    layout: "letterbox",
    mediaFit: "contain",
    canvasBg: "#1B2838",
    caption: "black_box",
    header: "yt_profile",
    titleColor: "#ffffff",
    accent: "#FFE566",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: false,
    captionAnimation: "highlight",
  },
};

const HEADER_BAND: Record<BlogShortsStyleProps["header"], { height: number; bg: string }> = {
  none: { height: 0, bg: "transparent" },
  // Tall enough for 110px title + subtitle stack + small gap before media.
  info_black: { height: 520, bg: "#000000" },
  info_navy: { height: 520, bg: "#0B1F3A" },
  viral_cyan: { height: 540, bg: "#000000" },
  card_white: { height: 520, bg: "#ffffff" },
  yt_profile: { height: 520, bg: "#1B2838" },
};

/** Parse `*accent*` markers in title text into colored spans. */
export function AccentTitle({
  text,
  accent,
  baseColor,
}: {
  text: string;
  accent: string;
  baseColor: string;
}) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) => {
        const marked = part.startsWith("*") && part.endsWith("*") && part.length > 2;
        const content = marked ? part.slice(1, -1) : part;
        return (
          <span key={`${index}-${content}`} style={{ color: marked ? accent : baseColor }}>
            {content}
          </span>
        );
      })}
    </>
  );
}

/** Resolve API/http URLs or remotion/public-relative paths for <Img>. */
export function resolveBoardImageSrc(imageUrl?: string | null): string | undefined {
  if (!imageUrl) return undefined;
  const trimmed = imageUrl.trim();
  if (!trimmed) return undefined;
  if (/^(https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }
  return staticFile(trimmed.replace(/^\//, ""));
}

function boardFrames(durationSec: number): number {
  return Math.max(1, Math.round(durationSec * FPS));
}

function normalizeStyleSlug(slug?: string | null): string {
  const key = (slug || "impact_full").trim().toLowerCase();
  return LEGACY_STYLE_SLUGS[key] ?? key;
}

function resolveStyle(props: BlogShortsProps): BlogShortsStyleProps {
  const fallbackKey = normalizeStyleSlug(props.visualStyle);
  const fallback = STYLE_BY_VISUAL[fallbackKey] ?? STYLE_BY_VISUAL.impact_full;
  if (!props.style) return fallback;

  const layout = (props.style.layout as BlogShortsStyleProps["layout"]) || fallback.layout;
  const caption = normalizeCaption(props.style.caption) || fallback.caption;
  const header = normalizeHeader(props.style.header) || fallback.header;

  return {
    layout,
    mediaFit: props.style.mediaFit ?? fallback.mediaFit,
    canvasBg: props.style.canvasBg ?? fallback.canvasBg,
    caption,
    header,
    titleColor: props.style.titleColor ?? fallback.titleColor,
    accent: props.style.accent ?? fallback.accent,
    transitionSec: props.style.transitionSec ?? props.transitionSec ?? fallback.transitionSec,
    transitionType: props.style.transitionType ?? props.transitionType ?? fallback.transitionType,
    kenBurns: props.style.kenBurns ?? fallback.kenBurns,
    captionAnimation: props.style.captionAnimation ?? fallback.captionAnimation ?? "highlight",
  };
}

function normalizeCaption(value?: string | null): BlogShortsStyleProps["caption"] | null {
  if (!value) return null;
  const map: Record<string, BlogShortsStyleProps["caption"]> = {
    center_stroke: "center_stroke",
    bottom_outline: "bottom_outline",
    black_box: "black_box",
    white_pill: "white_pill",
    bold_center: "center_stroke",
    bottom_box: "bottom_outline",
    dark_bar: "black_box",
    card_bottom: "white_pill",
    card_title: "white_pill",
  };
  return map[value] ?? null;
}

function normalizeHeader(value?: string | null): BlogShortsStyleProps["header"] | null {
  if (!value) return null;
  const map: Record<string, BlogShortsStyleProps["header"]> = {
    none: "none",
    info_black: "info_black",
    info_navy: "info_navy",
    viral_cyan: "viral_cyan",
    card_white: "card_white",
    overlay: "none",
    viral_black: "viral_cyan",
  };
  return map[value] ?? null;
}

function mergeOverlay(slug: string, custom?: StyleOverlayProps | null) {
  const base = DEFAULT_OVERLAYS[slug] ?? DEFAULT_OVERLAYS.impact_full;
  const out = {
    titleFont: normalizeShortsFontId(custom?.titleFont),
    captionFont: normalizeShortsFontId(custom?.captionFont),
    captionAnimation: (custom?.captionAnimation === "none" ? "none" : "highlight") as CaptionAnimation,
    title: { ...base.title },
    subtitle: { ...base.subtitle },
    caption: { ...base.caption },
  };
  if (!custom) return out;
  for (const key of ["title", "subtitle", "caption"] as const) {
    const layer = custom[key];
    if (!layer) continue;
    out[key] = { ...out[key], ...layer };
  }
  return out;
}

export function totalBlogShortsFrames(props: BlogShortsProps): number {
  const starts = boardStartFrames(props);
  const boards = props.boards ?? [];
  if (boards.length === 0) {
    return FPS * 3;
  }
  const last = boards[boards.length - 1];
  const lastStart = starts[starts.length - 1] ?? 0;
  return Math.max(FPS, lastStart + boardFrames(last.durationSec));
}

export function boardStartFrames(props: BlogShortsProps): number[] {
  const boards = props.boards ?? [];
  const starts: number[] = [];
  let cursor = 0;
  for (const board of boards) {
    starts.push(cursor);
    cursor += boardFrames(board.durationSec);
  }
  return starts;
}

function layerBoxStyle(layer: StyleOverlayLayer): React.CSSProperties {
  const justify =
    layer.align === "left" ? "flex-start" : layer.align === "right" ? "flex-end" : "center";
  return {
    position: "absolute",
    left: `${layer.x * 100}%`,
    top: `${layer.y * 100}%`,
    width: `${layer.maxWidth * 100}%`,
    transform: "translate(-50%, 0)",
    display: "flex",
    justifyContent: justify,
    zIndex: 6,
    pointerEvents: "none",
  };
}

function textAlign(layer: StyleOverlayLayer): React.CSSProperties["textAlign"] {
  return layer.align;
}

function StyleHeaderBand({ header }: { header: BlogShortsStyleProps["header"] }) {
  const band = HEADER_BAND[header];
  if (!band.height) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: band.height,
        backgroundColor: band.bg,
        zIndex: 3,
      }}
    />
  );
}

function TitleLayers({
  title,
  subtitle,
  accent,
  overlay,
}: {
  title?: string | null;
  subtitle?: string | null;
  accent: string;
  overlay: ReturnType<typeof mergeOverlay>;
}) {
  const titleFont = shortsFontCss(overlay.titleFont, "title");
  return (
    <>
      {title?.trim() && overlay.title.visible ? (
        <div style={layerBoxStyle(overlay.title)}>
          <div
            style={{
              color: overlay.title.color,
              fontSize: overlay.title.fontSize,
              fontWeight: titleFont.fontWeight,
              fontFamily: titleFont.fontFamily,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              textAlign: textAlign(overlay.title),
              whiteSpace: "pre-wrap",
              width: "100%",
            }}
          >
            <AccentTitle text={title} accent={accent} baseColor={overlay.title.color} />
          </div>
        </div>
      ) : null}
      {subtitle?.trim() && overlay.subtitle.visible ? (
        <div style={layerBoxStyle(overlay.subtitle)}>
          <div
            style={{
              color: overlay.subtitle.color,
              fontSize: overlay.subtitle.fontSize,
              fontWeight: titleFont.fontWeight,
              fontFamily: titleFont.fontFamily,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              textAlign: textAlign(overlay.subtitle),
              whiteSpace: "pre-wrap",
              width: "100%",
            }}
          >
            {subtitle}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 밝은 배경 위에 검정, 어두운 배경 위에 흰색 — box/pill/gradient 텍스트 대비용. */
function readableTextColor(hexColor: string): string {
  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#16161A" : "#ffffff";
}

function CaptionBlock({
  children,
  caption,
  layer,
  captionFontId,
  captionY,
  captionOpacity,
  accentColor,
}: {
  children: React.ReactNode;
  caption: BlogShortsStyleProps["caption"] | CaptionTemplateBoxStyle;
  layer: StyleOverlayLayer;
  captionFontId: string;
  captionY: number;
  captionOpacity: number;
  /** ④ 템플릿 갤러리 강조색 — box/pill/gradient/outline/side_bar 렌더에 쓰인다. */
  accentColor?: string | null;
}) {
  if (!layer.visible) return null;
  const captionFont = shortsFontCss(captionFontId, "caption");

  const box: React.CSSProperties = {
    ...layerBoxStyle(layer),
    transform: `translate(-50%, ${captionY}px)`,
    opacity: captionOpacity,
    zIndex: 7,
  };

  if (caption === "center_stroke") {
    return (
      <div style={box}>
        <div
          style={{
            color: layer.color,
            fontSize: layer.fontSize,
            fontWeight: captionFont.fontWeight,
            fontFamily: captionFont.fontFamily,
            lineHeight: 1.25,
            letterSpacing: "-0.03em",
            textAlign: textAlign(layer),
            whiteSpace: "pre-wrap",
            width: "100%",
            WebkitTextStroke: "9px #000000",
            paintOrder: "stroke fill",
            textShadow:
              "0 0 0 #000, 3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (caption === "bottom_outline") {
    return (
      <div style={box}>
        <div
          style={{
            color: layer.color,
            fontSize: layer.fontSize,
            fontWeight: captionFont.fontWeight,
            fontFamily: captionFont.fontFamily,
            lineHeight: 1.35,
            letterSpacing: "-0.02em",
            textAlign: textAlign(layer),
            whiteSpace: "pre-wrap",
            width: "100%",
            textShadow:
              "0 2px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000, 0 3px 10px rgba(0,0,0,0.55)",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (caption === "black_box") {
    return (
      <div style={box}>
        <div
          style={{
            display: "inline-block",
            maxWidth: "100%",
            padding: "12px 20px",
            backgroundColor: "#000000",
            color: layer.color,
            fontSize: layer.fontSize,
            fontWeight: captionFont.fontWeight,
            fontFamily: captionFont.fontFamily,
            lineHeight: 1.35,
            letterSpacing: "-0.02em",
            textAlign: textAlign(layer),
            whiteSpace: "pre-wrap",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // ④ 템플릿 갤러리 box_style — subtitle_templates.box_style가 그대로 caption 값으로 들어온다.
  if (caption === "box" || caption === "pill") {
    const bg = accentColor || "#000000";
    return (
      <div style={box}>
        <div
          style={{
            display: "inline-block",
            maxWidth: "100%",
            padding: "12px 20px",
            borderRadius: caption === "pill" ? 999 : 8,
            backgroundColor: bg,
            color: readableTextColor(bg),
            fontSize: layer.fontSize,
            fontWeight: captionFont.fontWeight,
            fontFamily: captionFont.fontFamily,
            lineHeight: 1.35,
            letterSpacing: "-0.02em",
            textAlign: textAlign(layer),
            whiteSpace: "pre-wrap",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (caption === "side_bar") {
    return (
      <div style={box}>
        <div
          style={{
            display: "inline-block",
            maxWidth: "100%",
            padding: "4px 14px",
            borderLeft: `4px solid ${accentColor || "#FFE500"}`,
            color: "#ffffff",
            fontSize: layer.fontSize,
            fontWeight: captionFont.fontWeight,
            fontFamily: captionFont.fontFamily,
            lineHeight: 1.35,
            letterSpacing: "-0.02em",
            textAlign: "left",
            whiteSpace: "pre-wrap",
            textShadow: "0 2px 8px rgba(0,0,0,0.5)",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (caption === "gradient") {
    const from = accentColor || "#4B3BFF";
    return (
      <div style={box}>
        <div
          style={{
            display: "inline-block",
            maxWidth: "100%",
            padding: "12px 20px",
            borderRadius: 8,
            backgroundImage: `linear-gradient(90deg, ${from}, #C1338D)`,
            color: "#ffffff",
            fontSize: layer.fontSize,
            fontWeight: captionFont.fontWeight,
            fontFamily: captionFont.fontFamily,
            lineHeight: 1.35,
            letterSpacing: "-0.02em",
            textAlign: textAlign(layer),
            whiteSpace: "pre-wrap",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (caption === "outline") {
    return (
      <div style={box}>
        <div
          style={{
            color: "#ffffff",
            fontSize: layer.fontSize,
            fontWeight: captionFont.fontWeight,
            fontFamily: captionFont.fontFamily,
            lineHeight: 1.3,
            letterSpacing: "-0.02em",
            textAlign: textAlign(layer),
            whiteSpace: "pre-wrap",
            width: "100%",
            WebkitTextStroke: `3px ${accentColor || "#4B3BFF"}`,
            paintOrder: "stroke fill",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (caption === "none") {
    return (
      <div style={box}>
        <div
          style={{
            color: accentColor || "#ffffff",
            fontSize: layer.fontSize,
            fontWeight: captionFont.fontWeight,
            fontFamily: captionFont.fontFamily,
            lineHeight: 1.3,
            letterSpacing: "-0.02em",
            textAlign: textAlign(layer),
            whiteSpace: "pre-wrap",
            width: "100%",
            textShadow: "0 2px 10px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.4)",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // white_pill (기존 visualStyle 캡션 변형)
  return (
    <div style={box}>
      <div
        style={{
          display: "inline-block",
          maxWidth: "100%",
          padding: "14px 26px",
          borderRadius: 999,
          backgroundColor: "#ffffff",
          color: layer.color,
          fontSize: layer.fontSize,
          fontWeight: captionFont.fontWeight,
          fontFamily: captionFont.fontFamily,
          lineHeight: 1.35,
          letterSpacing: "-0.02em",
          textAlign: textAlign(layer),
          whiteSpace: "pre-wrap",
          boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function activeWordIndex(words: CaptionWordTiming[], timeSec: number): number {
  if (!words.length) return -1;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (timeSec >= word.startSec && timeSec < word.endSec) return index;
  }
  if (timeSec >= words[words.length - 1].endSec) return words.length - 1;
  return 0;
}

function KineticCaptionBlock({
  text,
  words,
  caption,
  layer,
  captionFontId,
  captionY,
  captionOpacity,
  captionAnimation,
  accentColor,
}: {
  text: string;
  words?: CaptionWordTiming[] | null;
  caption: BlogShortsStyleProps["caption"] | CaptionTemplateBoxStyle;
  layer: StyleOverlayLayer;
  captionFontId: string;
  captionY: number;
  captionOpacity: number;
  captionAnimation: CaptionAnimation;
  accentColor?: string | null;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const trimmed = text.trim();
  if (!layer.visible || !trimmed) return null;

  const timed = (words ?? []).filter((word) => Boolean(word?.text));
  const staticCaption = captionAnimation === "none" || timed.length === 0;

  if (staticCaption) {
    return (
      <CaptionBlock
        caption={caption}
        layer={layer}
        captionFontId={captionFontId}
        captionY={captionY}
        captionOpacity={captionOpacity}
        accentColor={accentColor}
      >
        {text}
      </CaptionBlock>
    );
  }

  const timeSec = frame / fps;
  const active = activeWordIndex(timed, timeSec);
  const highlight = caption === "white_pill" ? "#E85D04" : "#FFE566";

  return (
    <CaptionBlock
      caption={caption}
      layer={layer}
      captionFontId={captionFontId}
      captionY={captionY}
      accentColor={accentColor}
      captionOpacity={captionOpacity}
    >
      {timed.map((word, index) => {
        const isActive = index === active;
        const local = Math.max(0, frame - Math.round(word.startSec * fps));
        const pop = isActive
          ? spring({
              frame: local,
              fps,
              config: { damping: 14, stiffness: 180, mass: 0.35 },
            })
          : 0;
        const scale = interpolate(pop, [0, 1], [1, 1.08], { extrapolateRight: "clamp" });
        return (
          <span
            key={`${word.startSec}-${index}`}
            style={{
              display: "inline-block",
              color: isActive ? highlight : undefined,
              transform: `scale(${scale})`,
              transformOrigin: "center bottom",
            }}
          >
            {word.text}
            {index < timed.length - 1 ? " " : ""}
          </span>
        );
      })}
    </CaptionBlock>
  );
}

function isAnimatedGifSrc(src: string): boolean {
  const path = src.split("?")[0]?.split("#")[0] ?? src;
  return path.toLowerCase().endsWith(".gif");
}

function MediaLayer({
  imageSrc,
  videoSrc,
  muteVideo,
  animated,
  bg,
  objectFit,
  kenBurns,
  mediaWidth,
  mediaHeight,
}: {
  imageSrc?: string;
  videoSrc?: string;
  muteVideo?: boolean;
  animated?: boolean;
  bg: string;
  objectFit: "cover" | "contain";
  kenBurns: number;
  /** Actual media band size — AnimatedImage fit must use this, not full 9:16. */
  mediaWidth: number;
  mediaHeight: number;
}) {
  if (videoSrc) {
    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden", backgroundColor: "#000" }}>
        <OffthreadVideo
          src={videoSrc}
          muted={Boolean(muteVideo)}
          style={{
            width: "100%",
            height: "100%",
            objectFit,
            objectPosition: "center",
          }}
        />
      </div>
    );
  }
  if (imageSrc) {
    // Prefer explicit board.animated — preview blob: URLs never end with .gif.
    const animatedGif = Boolean(animated) || isAnimatedGifSrc(imageSrc);
    // Keep GIFs at 1x — Ken Burns scaling fights AnimatedImage frame decode.
    const scale = animatedGif ? 1 : kenBurns;
    const fit = objectFit === "contain" ? "contain" : "cover";
    return (
      <div style={{ width: "100%", height: "100%", transform: `scale(${scale})`, overflow: "hidden" }}>
        {animatedGif ? (
          <AnimatedImage
            src={imageSrc}
            fit={fit}
            width={Math.max(1, Math.round(mediaWidth))}
            height={Math.max(1, Math.round(mediaHeight))}
            loopBehavior="loop"
            style={{
              width: "100%",
              height: "100%",
            }}
          />
        ) : (
          <Img
            src={imageSrc}
            style={{
              width: "100%",
              height: "100%",
              objectFit,
              objectPosition: "center",
            }}
          />
        )}
      </div>
    );
  }
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: `radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12), transparent 50%), ${bg}`,
        transform: `scale(${kenBurns})`,
      }}
    />
  );
}

function ProfileFooter({
  channelName,
  channelAvatarUrl,
  videoTitle,
}: {
  channelName?: string | null;
  channelAvatarUrl?: string | null;
  videoTitle?: string | null;
}) {
  if (!channelName && !videoTitle) return null;
  const avatarSrc = resolveBoardImageSrc(channelAvatarUrl);
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        right: 48,
        bottom: 72,
        display: "flex",
        alignItems: "center",
        gap: 18,
        zIndex: 5,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          overflow: "hidden",
          backgroundColor: "#3a4554",
          flexShrink: 0,
          border: "2px solid rgba(255,255,255,0.35)",
        }}
      >
        {avatarSrc ? (
          <Img src={avatarSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
      </div>
      <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
        {channelName ? (
          <div
            style={{
              color: "#fff",
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.2,
              textShadow: "0 2px 8px rgba(0,0,0,0.55)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {channelName}
          </div>
        ) : null}
        {videoTitle ? (
          <div
            style={{
              color: "rgba(255,255,255,0.82)",
              fontSize: 22,
              fontWeight: 500,
              lineHeight: 1.25,
              textShadow: "0 2px 8px rgba(0,0,0,0.45)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {videoTitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function mediaBandRect(style: BlogShortsStyleProps): {
  mediaTop: number;
  mediaHeight: number;
  mediaLeft: number;
  mediaRight: number;
  mediaWidth: number;
} {
  const headerH = HEADER_BAND[style.header]?.height ?? 0;
  let mediaTop = 0;
  let mediaHeight = BLOG_SHORTS_HEIGHT;
  let mediaLeft = 0;
  let mediaRight = 0;

  if (style.layout === "letterbox") {
    mediaTop = 500;
    mediaHeight = 680;
  } else if (style.layout === "header_stack") {
    mediaTop = headerH;
    mediaHeight = BLOG_SHORTS_HEIGHT - headerH;
  } else if (style.layout === "card") {
    mediaTop = headerH + 12;
    mediaLeft = 28;
    mediaRight = 28;
    mediaHeight = 1020;
  }

  return {
    mediaTop,
    mediaHeight,
    mediaLeft,
    mediaRight,
    mediaWidth: BLOG_SHORTS_WIDTH - mediaLeft - mediaRight,
  };
}

/** Media slide only — fade/slide transitions apply here, never to titles/captions. */
function MediaSlide({
  board,
  style,
  muteVideo = false,
  opacity = 1,
  transform,
}: {
  board: BlogBoardProps;
  style: BlogShortsStyleProps;
  muteVideo?: boolean;
  opacity?: number;
  transform?: string;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const videoSrc = resolveBoardImageSrc(board.videoUrl);
  const hasVideo = Boolean(videoSrc);
  const kenBurns =
    !hasVideo && style.kenBurns
      ? interpolate(frame, [0, durationInFrames], [1, 1.05], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;
  const bg = board.backgroundColor ?? "#222222";
  const imageSrc = resolveBoardImageSrc(board.imageUrl);
  const canvasBg = style.canvasBg || "#000000";
  const { mediaTop, mediaHeight, mediaLeft, mediaRight, mediaWidth } = mediaBandRect(style);

  return (
    <AbsoluteFill style={{ opacity, transform, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: mediaTop,
          left: mediaLeft,
          right: mediaRight,
          height: mediaHeight,
          overflow: "hidden",
          borderRadius: style.layout === "card" ? 6 : 0,
          backgroundColor: style.mediaFit === "contain" ? canvasBg : "#111",
        }}
      >
        <MediaLayer
          imageSrc={imageSrc}
          videoSrc={videoSrc}
          muteVideo={muteVideo}
          animated={board.animated}
          bg={bg}
          objectFit={style.mediaFit}
          kenBurns={kenBurns}
          mediaWidth={mediaWidth}
          mediaHeight={mediaHeight}
        />
      </div>
      {style.layout === "fullscreen" ? (
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, transparent 32%, transparent 58%, rgba(0,0,0,0.28) 100%)",
            pointerEvents: "none",
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
}

function StableChrome({
  styleTitle,
  styleSubtitle,
  style,
  overlay,
  suppressText = false,
  channelName,
  channelAvatarUrl,
  videoTitle,
}: {
  styleTitle?: string | null;
  styleSubtitle?: string | null;
  style: BlogShortsStyleProps;
  overlay: ReturnType<typeof mergeOverlay>;
  suppressText?: boolean;
  channelName?: string | null;
  channelAvatarUrl?: string | null;
  videoTitle?: string | null;
}) {
  const showProfile =
    style.header === "yt_profile" || Boolean(channelName) || Boolean(videoTitle);

  // Transparent shell so media slides underneath remain visible.
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      <StyleHeaderBand header={style.header} />
      {!suppressText ? (
        <TitleLayers
          title={styleTitle}
          subtitle={styleSubtitle}
          accent={style.accent}
          overlay={overlay}
        />
      ) : null}
      {showProfile && !suppressText ? (
        <ProfileFooter
          channelName={channelName}
          channelAvatarUrl={channelAvatarUrl}
          videoTitle={videoTitle}
        />
      ) : null}
    </AbsoluteFill>
  );
}

/** captionTemplate(④ 갤러리)이 있으면 위치/모양/강조색/폰트를 덮어쓰고,
 * 없으면 overlay.caption/style.caption을 그대로 쓴다(기존 5개 비주얼 스타일 결과물 유지). */
function resolveCaptionFromTemplate(
  overlay: ReturnType<typeof mergeOverlay>,
  style: BlogShortsStyleProps,
  captionTemplate?: CaptionTemplateProps | null,
): {
  caption: BlogShortsStyleProps["caption"] | CaptionTemplateBoxStyle;
  layer: StyleOverlayLayer;
  captionFontId: string;
  accentColor?: string | null;
} {
  if (!captionTemplate) {
    return { caption: style.caption, layer: overlay.caption, captionFontId: overlay.captionFont, accentColor: null };
  }
  const y = captionTemplate.position === "top" ? 0.15 : (overlay.caption.y ?? 0.7);
  return {
    caption: captionTemplate.boxStyle,
    layer: { ...overlay.caption, y },
    captionFontId: captionTemplate.fontFamily || overlay.captionFont,
    accentColor: captionTemplate.accentColor,
  };
}

function BoardCaption({
  board,
  style,
  overlay,
  suppressText = false,
  captionTemplate,
}: {
  board: BlogBoardProps;
  style: BlogShortsStyleProps;
  overlay: ReturnType<typeof mergeOverlay>;
  suppressText?: boolean;
  captionTemplate?: CaptionTemplateProps | null;
}) {
  if (suppressText || !(board.text || "").trim()) return null;

  const resolved = resolveCaptionFromTemplate(overlay, style, captionTemplate);

  // Hard-cut captions — never share fade/slide with media transitions.
  return (
    <KineticCaptionBlock
      text={board.text}
      words={board.words}
      caption={resolved.caption}
      layer={resolved.layer}
      captionFontId={resolved.captionFontId}
      accentColor={resolved.accentColor}
      captionY={0}
      captionOpacity={1}
      captionAnimation={overlay.captionAnimation ?? style.captionAnimation ?? "highlight"}
    />
  );
}

export const BlogShorts: React.FC<BlogShortsProps> = (props) => {
  useEffect(() => {
    void ensureShortsFontsLoaded();
  }, []);

  const style = resolveStyle(props);
  const styleSlug = normalizeStyleSlug(props.visualStyle);
  const overlay = mergeOverlay(styleSlug, props.overlay);
  const transitionType: TransitionType = props.transitionType ?? style.transitionType ?? "fade";
  const transitionSec =
    transitionType === "none" ? 0 : (props.transitionSec ?? style.transitionSec ?? 0.35);
  const transitionFrames =
    transitionType === "none" || transitionSec <= 0
      ? 0
      : Math.max(1, Math.round(transitionSec * FPS));
  const boards = props.boards ?? [];
  const styleTitle = props.styleTitle ?? props.title ?? null;
  const styleSubtitle = props.styleSubtitle ?? null;

  const timeline = useMemo(() => {
    const items: {
      board: BlogBoardProps;
      from: number;
      duration: number;
      spoken: number;
      index: number;
    }[] = [];
    let cursor = 0;
    boards.forEach((board, index) => {
      const spoken = boardFrames(board.durationSec);
      const overlap =
        transitionType === "none" || transitionFrames <= 0
          ? 0
          : index < boards.length - 1
            ? Math.min(transitionFrames, Math.max(0, spoken - 1))
            : 0;
      items.push({ board, from: cursor, duration: spoken + overlap, spoken, index });
      cursor += spoken;
    });
    return items;
  }, [boards, transitionFrames, transitionType]);

  const narrationSrc = resolveBoardImageSrc(props.narrationUrl);
  const muteVideo = Boolean(narrationSrc);
  const suppressText = Boolean(props.suppressText);

  const canvasBg = style.canvasBg || "#000000";

  return (
    <AbsoluteFill style={{ backgroundColor: canvasBg }}>
      {narrationSrc ? <Audio src={narrationSrc} /> : null}

      {/* Media slides only — crossfade / slide happens here. */}
      {timeline.map(({ board, from, duration, index }) => (
        <Sequence key={`media-${index}`} from={from} durationInFrames={duration} name={`media-${index}`}>
          <FadingMediaSlide
            board={board}
            transitionFrames={transitionFrames}
            transitionType={transitionType}
            isFirst={index === 0}
            isLast={index === timeline.length - 1}
            style={style}
            muteVideo={muteVideo}
          />
        </Sequence>
      ))}

      {/* Stable chrome above media: titles / header / profile never transition. */}
      <StableChrome
        styleTitle={styleTitle}
        styleSubtitle={styleSubtitle}
        style={style}
        overlay={overlay}
        suppressText={suppressText}
        channelName={props.channelName}
        channelAvatarUrl={props.channelAvatarUrl}
        videoTitle={props.videoTitle}
      />

      {/* Captions hard-cut on spoken window (no transition overlap → no double text). */}
      {timeline.map(({ board, from, spoken, index }) => (
        <Sequence key={`caption-${index}`} from={from} durationInFrames={spoken} name={`caption-${index}`}>
          <BoardCaption
            board={board}
            style={style}
            overlay={overlay}
            suppressText={suppressText}
            captionTemplate={props.captionTemplate}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

function FadingMediaSlide({
  board,
  transitionFrames,
  transitionType,
  isFirst,
  isLast,
  style,
  muteVideo,
}: {
  board: BlogBoardProps;
  transitionFrames: number;
  transitionType: TransitionType;
  isFirst: boolean;
  isLast: boolean;
  style: BlogShortsStyleProps;
  muteVideo: boolean;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn =
    isFirst || transitionType === "none" || transitionFrames <= 0
      ? 1
      : interpolate(frame, [0, transitionFrames], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const fadeOut =
    isLast || transitionType === "none" || transitionFrames <= 0
      ? 1
      : interpolate(
          frame,
          [durationInFrames - transitionFrames, durationInFrames],
          [1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        );

  const slideIn =
    transitionType !== "slide" || isFirst || transitionFrames <= 0
      ? 0
      : interpolate(frame, [0, transitionFrames], [72, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const slideOut =
    transitionType !== "slide" || isLast || transitionFrames <= 0
      ? 0
      : interpolate(
          frame,
          [durationInFrames - transitionFrames, durationInFrames],
          [0, -72],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        );

  const opacity = transitionType === "none" ? 1 : Math.min(fadeIn, fadeOut);
  const transform =
    transitionType === "slide" ? `translateX(${slideIn + slideOut}px)` : undefined;

  return (
    <MediaSlide
      board={board}
      style={style}
      muteVideo={muteVideo}
      opacity={opacity}
      transform={transform}
    />
  );
}
