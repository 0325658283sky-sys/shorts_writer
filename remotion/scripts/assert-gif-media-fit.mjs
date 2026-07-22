/**
 * Static regression: GIF AnimatedImage must size to the media band, not full 9:16.
 * Run: node scripts/assert-gif-media-fit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const blogShorts = fs.readFileSync(path.join(here, "../src/BlogShorts.tsx"), "utf8");

const checks = [
  [/width=\{Math\.max\(1, Math\.round\(mediaWidth\)\)\}/, "AnimatedImage uses mediaWidth"],
  [/height=\{Math\.max\(1, Math\.round\(mediaHeight\)\)\}/, "AnimatedImage uses mediaHeight"],
  [/animatedGif \? 1 : kenBurns/, "GIF disables Ken Burns scale"],
  [/Boolean\(animated\) \|\| isAnimatedGifSrc\(imageSrc\)/, "prefers board.animated flag"],
  [/mediaHeight = 680/, "letterbox media band height is 680"],
];

let failed = 0;
for (const [pattern, label] of checks) {
  if (!pattern.test(blogShorts)) {
    console.error(`FAIL: ${label}`);
    failed += 1;
  } else {
    console.log(`ok: ${label}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log("gif/media-fit assertions passed");
