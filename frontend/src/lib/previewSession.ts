/**
 * PreviewSession contract for the board-editor Remotion player.
 *
 * Remount Player (`key` / previewRevision) only when media identity changes:
 * - blogClip.id changes
 * - imageCacheKey (boardId + image_path) changes → image blobs reload
 * - intentional previewRevision++ (overlay save apply, or future hard reset)
 *
 * Do NOT remount for:
 * - loadBoards() / boards array identity churn
 * - duration_seconds soft-patch after TTS
 * - selectedBoardId (seek only)
 * - draftText typing (inputProps update is OK)
 * - auto preview-audio success callbacks
 *
 * Audio cache key excludes duration (TTS output must not invalidate the mix key).
 */

export type PreviewBoardIdentity = {
  id: number;
  image_path?: string | null;
  text?: string | null;
  speaker?: string | null;
  sfx_asset_id?: number | null;
};

export function buildImageCacheKey(boards: PreviewBoardIdentity[]): string {
  return boards.map((board) => `${board.id}:${board.image_path ?? ""}`).join("|");
}

export function buildAudioCacheKey(args: {
  clipId: number;
  ttsSpeed: number | null | undefined;
  bgmAssetId: number | null | undefined;
  bgmVolume: number | null | undefined;
  boards: PreviewBoardIdentity[];
}): string {
  const boardPart = args.boards
    .map((board) => `${board.id}:${board.text ?? ""}:${board.speaker ?? ""}:${board.sfx_asset_id ?? ""}`)
    .join("|");
  return [args.clipId, args.ttsSpeed, args.bgmAssetId, args.bgmVolume, boardPart].join("::");
}

/** Auto preview-audio: one in-flight/success attempt per cache key; failures cool down per key. */
export const AUTO_PREVIEW_COOLDOWN_MS = 30_000;

export function shouldAttemptAutoPreview(args: {
  audioStatus: "missing" | "ready" | "loading" | "error";
  audioBusy: boolean;
  boardCount: number;
  audioCacheKey: string;
  lastAttemptKey: string | null;
  lastFailKey: string | null;
  lastFailAtMs: number | null;
  nowMs?: number;
}): boolean {
  if (args.audioStatus !== "missing" || args.audioBusy || args.boardCount === 0) return false;
  if (args.lastAttemptKey === args.audioCacheKey) return false;
  if (
    args.lastFailKey === args.audioCacheKey &&
    args.lastFailAtMs != null &&
    (args.nowMs ?? Date.now()) - args.lastFailAtMs < AUTO_PREVIEW_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}
