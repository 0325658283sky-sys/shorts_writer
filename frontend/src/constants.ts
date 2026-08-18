import type {
  BlogClipStatus,
  ClipStatus,
  NarrationLanguage,
  ScriptModel,
  ScriptTone,
  SubtitleStyle,
  TargetLength,
  TtsMode,
  VideoStatus,
} from "./types";

export const TOKEN_KEY = "new_cut_access_token";
export const SUBTITLE_STYLES: SubtitleStyle[] = ["basic", "bold", "shorts"];
export const TARGET_LENGTHS: TargetLength[] = ["short", "long"];
export const NARRATION_LANGUAGES: NarrationLanguage[] = ["original", "ko", "en", "ja"];
export const SCRIPT_MODELS: ScriptModel[] = ["gpt-4o", "gpt-4o-mini"];
export const TTS_MODES: TtsMode[] = ["original_audio", "ai_narration"];

export const VIDEO_STATUS_LABELS: Record<VideoStatus, string> = {
  uploaded: "업로드됨",
  extracting_audio: "오디오 추출 중",
  audio_extracted: "오디오 추출 완료",
  transcribing: "음성 인식 중",
  transcribed: "음성 인식 완료",
  failed: "실패",
};

export const CLIP_STATUS_LABELS: Record<ClipStatus, string> = {
  pending: "대기 중",
  processing: "처리 중",
  completed: "완료",
  failed: "실패",
};

export const BLOG_CLIP_STATUS_LABELS: Record<BlogClipStatus, string> = {
  ...CLIP_STATUS_LABELS,
  awaiting_images: "이미지 선택 대기",
  awaiting_script: "대본 선택 대기",
  awaiting_boards: "보드 편집 대기",
};

/** Mirrors backend BLOG_IMAGE_MIN/MAX_COUNT defaults. */
export const BLOG_IMAGE_MIN_COUNT = 3;
export const BLOG_IMAGE_MAX_COUNT = 8;

export const SCRIPT_TONES: ScriptTone[] = ["summary", "hook", "detailed"];
export const SCRIPT_TONE_LABELS: Record<ScriptTone, string> = {
  summary: "요약형",
  hook: "후킹형",
  detailed: "상세형",
};
export const SCRIPT_TONE_HINTS: Record<ScriptTone, string> = {
  summary: "핵심만 짧게",
  hook: "홍보형 쇼츠 · 앞 3초 훅",
  detailed: "조금 더 자세히",
};

export const SUBTITLE_STYLE_LABELS: Record<SubtitleStyle, string> = {
  basic: "기본",
  bold: "볼드",
  shorts: "쇼츠",
};

export const TARGET_LENGTH_LABELS: Record<TargetLength, string> = {
  short: "짧게 (약 10–20초)",
  long: "길게 (약 30–45초)",
};

export const NARRATION_LANGUAGE_LABELS: Record<NarrationLanguage, string> = {
  original: "원문 언어",
  ko: "한국어",
  en: "영어",
  ja: "일본어",
};

export const SCRIPT_MODEL_LABELS: Record<ScriptModel, string> = {
  "gpt-4o": "gpt-4o (훅 기본)",
  "gpt-4o-mini": "gpt-4o-mini (절약)",
};

export const TTS_MODE_LABELS: Record<TtsMode, string> = {
  original_audio: "원본 음성",
  ai_narration: "AI 나레이션",
};

export const BLOG_PROGRESS_STAGE_LABELS: Record<string, string> = {
  queued: "대기 중",
  scraping: "블로그 글 읽는 중",
  downloading_images: "이미지 다운로드 중",
  generating_script: "나레이션 대본 작성 중",
  awaiting_images: "이미지 선택 대기",
  awaiting_script: "대본 톤 선택 대기",
  awaiting_boards: "보드 편집 대기",
  synthesizing_audio: "음성 합성 중",
  rendering_video: "영상 합성 중",
  burning_subtitles: "자막 입히는 중",
  done: "완료",
};

/** User-facing 6-step progress (maps many backend stages into one vocabulary). */
export const FRIENDLY_PROGRESS_STEPS = [
  { id: "prepare", label: "준비" },
  { id: "gather", label: "자료 수집" },
  { id: "script", label: "대본·분석" },
  { id: "edit", label: "편집" },
  { id: "render", label: "렌더" },
  { id: "done", label: "완료" },
] as const;

export type FriendlyProgressStepId = (typeof FRIENDLY_PROGRESS_STEPS)[number]["id"];

const BLOG_STAGE_TO_FRIENDLY: Record<string, FriendlyProgressStepId> = {
  queued: "prepare",
  scraping: "gather",
  downloading_images: "gather",
  generating_script: "script",
  awaiting_images: "script",
  awaiting_script: "script",
  awaiting_boards: "edit",
  synthesizing_audio: "render",
  rendering_video: "render",
  burning_subtitles: "render",
  done: "done",
};

const VIDEO_STATUS_TO_FRIENDLY: Record<VideoStatus, FriendlyProgressStepId> = {
  uploaded: "prepare",
  extracting_audio: "gather",
  audio_extracted: "gather",
  transcribing: "script",
  transcribed: "script",
  failed: "prepare",
};

export function friendlyProgressStepIndex(id: FriendlyProgressStepId): number {
  return FRIENDLY_PROGRESS_STEPS.findIndex((step) => step.id === id);
}

export function friendlyProgressFromBlogStage(stage: string | null | undefined): {
  id: FriendlyProgressStepId;
  label: string;
  index: number;
} {
  const id = (stage && BLOG_STAGE_TO_FRIENDLY[stage]) || "prepare";
  const index = friendlyProgressStepIndex(id);
  return { id, label: FRIENDLY_PROGRESS_STEPS[index]?.label ?? "준비", index: Math.max(index, 0) };
}

export function friendlyProgressFromVideoStatus(status: VideoStatus): {
  id: FriendlyProgressStepId;
  label: string;
  index: number;
} {
  const id = VIDEO_STATUS_TO_FRIENDLY[status] ?? "prepare";
  const index = friendlyProgressStepIndex(id);
  return { id, label: FRIENDLY_PROGRESS_STEPS[index]?.label ?? "준비", index: Math.max(index, 0) };
}

/** Prefer friendly 6-step label; fall back to detailed blog stage copy. */
export function userFacingProgressLabel(
  stage: string | null | undefined,
  options?: { detailed?: boolean },
): string {
  if (options?.detailed && stage && BLOG_PROGRESS_STAGE_LABELS[stage]) {
    return BLOG_PROGRESS_STAGE_LABELS[stage];
  }
  if (stage && BLOG_PROGRESS_STAGE_LABELS[stage]) {
    const friendly = friendlyProgressFromBlogStage(stage);
    return `${friendly.label} · ${BLOG_PROGRESS_STAGE_LABELS[stage]}`;
  }
  return friendlyProgressFromBlogStage(stage).label;
}

export const BLOG_CLIP_POLL_INTERVAL_MS = 2000;
