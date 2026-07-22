/**
 * Static regression for PreviewSession contracts.
 * Run: node scripts/assert-preview-session.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const session = fs.readFileSync(path.join(here, "../src/lib/previewSession.ts"), "utf8");
const pane = fs.readFileSync(path.join(here, "../src/components/board/RemotionPreviewPane.tsx"), "utf8");

const audioFn = session.match(/export function buildAudioCacheKey[\s\S]*?\n}/)?.[0] ?? "";
const checks = [
  [audioFn, /duration_seconds/, false, "buildAudioCacheKey omits duration_seconds"],
  [session, /buildAudioCacheKey/, true, "buildAudioCacheKey exported"],
  [session, /shouldAttemptAutoPreview/, true, "shouldAttemptAutoPreview exported"],
  [pane, /preview-player-overlay/, true, "loading uses overlay instead of unmount"],
  [pane, /imagesLoading \|\| audioBusy/, true, "overlay shown while loading"],
  [pane, /onBoardDurationsSynced/, true, "duration soft-patch callback wired"],
  [pane, /intentional: true/, true, "manual TTS regen is intentional remount path"],
];

let failed = 0;
for (const [source, pattern, expectMatch, label] of checks) {
  const matched = pattern.test(source);
  if (matched !== expectMatch) {
    console.error(`FAIL: ${label}`);
    failed += 1;
  } else {
    console.log(`ok: ${label}`);
  }
}

if (failed > 0) process.exit(1);
console.log("preview-session assertions passed");
