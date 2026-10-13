/**
 * Smoke-render one clip per caption motion, so the 12 presets can be judged
 * side by side before any of them is wired into a template.
 *
 * Usage (from remotion/):  node scripts/smoke-motions.mjs
 *                          node scripts/smoke-motions.mjs pop karaoke neon
 *
 * Output: out/motions/<motion>.mp4
 *
 * Every clip uses the same words, the same timings and the same visual style,
 * so the only thing that differs between files is the motion itself.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "out", "motions");

/** Keep in sync with src/captionMotion.ts CAPTION_MOTIONS. */
const MOTIONS = [
  "none",
  "pop",
  "box_highlight",
  "fade_in",
  "elevate",
  "karaoke",
  "neon",
  "typewriter",
];

// One line of speech, timed. Short words so the effect fires often enough to
// see within a few seconds.
const SENTENCE = [
  "40대",
  "이전",
  "사망원인",
  "1위를",
  "차지합니다",
];
const WORD_SEC = 0.52;
const LEAD_IN_SEC = 0.35;

const words = SENTENCE.map((text, index) => ({
  text,
  startSec: LEAD_IN_SEC + index * WORD_SEC,
  endSec: LEAD_IN_SEC + (index + 1) * WORD_SEC,
}));
const boardSec = LEAD_IN_SEC + SENTENCE.length * WORD_SEC + 0.9;

const STYLE = {
  layout: "letterbox",
  mediaFit: "contain",
  canvasBg: "#000000",
  caption: "bottom_outline",
  header: "info_black",
  titleColor: "#ffffff",
  accent: "#f2a33c",
  transitionSec: 0,
  transitionType: "none",
  kenBurns: false,
};

function buildProps(motion) {
  return {
    blogClipId: null,
    title: `motion ${motion}`,
    styleTitle: `자막 모션`,
    styleSubtitle: motion,
    transitionSec: 0,
    transitionType: "none",
    source: "dummy",
    visualStyle: "info_black",
    style: { ...STYLE, captionAnimation: motion },
    boards: [
      {
        text: SENTENCE.join(" "),
        words,
        durationSec: boardSec,
        backgroundColor: "#16202e",
        // Highest-priority slot in the caption chain, so this is the motion
        // that actually renders regardless of style/overlay defaults.
        textStyle: { animation: motion, accentColor: "#f2a33c" },
      },
    ],
  };
}

function renderMotion(motion) {
  const propsPath = join(outDir, `${motion}.props`);
  const outPath = join(outDir, `${motion}.mp4`);
  writeFileSync(propsPath, JSON.stringify(buildProps(motion), null, 2));

  const result = spawnSync(
    "npx",
    [
      "remotion",
      "render",
      "src/index.ts",
      "BlogShorts",
      outPath,
      "--props",
      propsPath,
      "--log",
      "error",
    ],
    { cwd: root, encoding: "utf8", shell: true },
  );

  if (result.status !== 0) {
    console.error(`FAIL  ${motion}`);
    if (result.stderr) console.error(result.stderr.trim().split("\n").slice(-8).join("\n"));
    return false;
  }
  if (!existsSync(outPath) || statSync(outPath).size < 10_000) {
    console.error(`FAIL  ${motion} — output missing or suspiciously small`);
    return false;
  }
  const kb = Math.round(statSync(outPath).size / 1024);
  console.log(`OK    ${motion}  (${kb} KB)`);
  return true;
}

const requested = process.argv.slice(2);
const unknown = requested.filter((name) => !MOTIONS.includes(name));
if (unknown.length) {
  console.error(`unknown motion(s): ${unknown.join(", ")}`);
  console.error(`available: ${MOTIONS.join(", ")}`);
  process.exit(1);
}
const todo = requested.length ? requested : MOTIONS;

mkdirSync(outDir, { recursive: true });
console.log(`rendering ${todo.length} motion(s) to out/motions/\n`);

let failed = 0;
for (const motion of todo) {
  if (!renderMotion(motion)) failed += 1;
}

console.log(`\ndone — ${todo.length - failed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
