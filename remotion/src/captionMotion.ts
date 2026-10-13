/**
 * Caption motion presets.
 *
 * Keep in sync with backend/app/services/template_schema.py (CAPTION_MOTIONS).
 *
 * These are pure functions: they take the state of a word and return plain
 * style values. No React, no Remotion imports — the caller computes `enter`
 * (a 0..1 spring or eased value) and applies the result. That keeps the
 * motion table testable without a renderer.
 *
 * Eight presets, down from twelve. Dropped after watching them render
 * (remotion/out/motions):
 *   - bounce, slide_up — indistinguishable from pop and fade_in respectively;
 *     their transform settles in ~0.2s and only the colour change reads.
 *   - pop_group, box_line — animated the whole line once on entry, then sat
 *     still for the rest of the board. A caption that moves once while
 *     someone talks for four seconds is a static caption.
 * A line-level motion worth having would follow the spoken word across the
 * line; that is a different design, not a tweak to these two.
 */

export type CaptionMotion =
  | "none"
  | "pop"
  | "box_highlight"
  | "fade_in"
  | "elevate"
  | "karaoke"
  | "neon"
  | "typewriter";

export type CaptionScope = "word" | "line" | "segment";

export const CAPTION_MOTIONS: readonly CaptionMotion[] = [
  "none",
  "pop",
  "box_highlight",
  "fade_in",
  "elevate",
  "karaoke",
  "neon",
  "typewriter",
] as const;

export const MOTION_LABELS_KO: Record<CaptionMotion, string> = {
  none: "효과 없음",
  pop: "팝",
  box_highlight: "박스 하이라이팅",
  fade_in: "페이드 인",
  elevate: "엘리베이트",
  karaoke: "카라오케",
  neon: "네온사인",
  typewriter: "타자기",
};

/** Where a word sits relative to the playhead. */
export type WordState = "past" | "active" | "future";

export type MotionStyle = {
  color?: string;
  backgroundColor?: string;
  opacity?: number;
  transform?: string;
  textShadow?: string;
  padding?: string;
  borderRadius?: string;
  /** Hide the word entirely (typewriter before reveal). */
  visibility?: "hidden";
};

export type WordMotionInput = {
  motion: CaptionMotion;
  state: WordState;
  /**
   * 0..1 entry progress for this word — a spring or eased ramp the caller
   * computes from the frame. 0 = just started, 1 = settled.
   */
  enter: number;
  /** The caption block's own text color. */
  baseColor: string;
  /** Accent used to mark the spoken word. */
  highlightColor: string;
  /** Text color on top of a highlight fill. */
  highlightTextColor: string;
};

/** `none` renders statically, so word timings are not needed for it. */
export function motionNeedsWordTimings(motion: CaptionMotion): boolean {
  return motion !== "none";
}

export function isCaptionMotion(value: unknown): value is CaptionMotion {
  return typeof value === "string" && (CAPTION_MOTIONS as readonly string[]).includes(value);
}

export function normalizeMotion(value: unknown, fallback: CaptionMotion = "pop"): CaptionMotion {
  return isCaptionMotion(value) ? value : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * clamp01(t);
}

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Style for one word. */
export function wordMotionStyle(input: WordMotionInput): MotionStyle {
  const { motion, state, baseColor, highlightColor, highlightTextColor } = input;
  const enter = clamp01(input.enter);
  const active = state === "active";
  const past = state === "past";
  const future = state === "future";

  switch (motion) {
    case "none":
      return {};

    case "pop":
      return {
        color: active ? highlightColor : baseColor,
        transform: active ? `scale(${round(mix(1, 1.1, enter))})` : "scale(1)",
      };

    case "box_highlight":
      return active
        ? {
            color: highlightTextColor,
            backgroundColor: highlightColor,
            padding: "0 0.18em",
            borderRadius: "0.12em",
          }
        : { color: baseColor };

    case "fade_in":
      // Spoken words stay; upcoming words are not shown yet.
      return {
        color: baseColor,
        opacity: future ? 0 : active ? round(mix(0, 1, enter), 2) : 1,
      };

    case "elevate":
      // The spoken word lifts; what came before recedes rather than vanishing.
      return {
        color: active ? highlightColor : baseColor,
        opacity: past ? 0.55 : future ? 0.35 : 1,
        transform: active
          ? `translateY(${round(mix(0, -10, enter), 2)}px) scale(${round(mix(1, 1.04, enter))})`
          : "translateY(0px) scale(1)",
      };

    case "karaoke":
      // Classic fill: everything spoken so far is colored, the rest is not.
      return { color: past || active ? highlightColor : baseColor };

    case "neon":
      return {
        color: active ? highlightColor : baseColor,
        textShadow: active
          ? `0 0 ${round(mix(0, 10, enter), 1)}px ${highlightColor}, 0 0 ${round(
              mix(0, 24, enter),
              1,
            )}px ${highlightColor}`
          : undefined,
      };

    case "typewriter":
      // Words appear one at a time and then stay put.
      return future ? { visibility: "hidden" } : { color: baseColor };

    default:
      return {};
  }
}

/** Motion presets for the template editor, in display order. */
export function listCaptionMotions(): Array<{ id: CaptionMotion; label: string }> {
  return CAPTION_MOTIONS.map((id) => ({ id, label: MOTION_LABELS_KO[id] }));
}

/** Where the playhead sits relative to a word, given its timing. */
export function wordStateAt(
  timeSec: number,
  startSec: number,
  endSec: number,
): WordState {
  if (timeSec < startSec) return "future";
  if (timeSec >= endSec) return "past";
  return "active";
}
