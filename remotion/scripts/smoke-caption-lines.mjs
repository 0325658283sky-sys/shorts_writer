/**
 * Smoke-render a clip whose captions follow the speech across several lines.
 *
 * Usage (from remotion/):  node scripts/smoke-caption-lines.mjs
 * Output: out/caption-lines/lines.mp4 (+ .frames/ for a quick eyeball)
 *
 * This exists because of a bug that only a render could show. Each caption
 * line is drawn inside its own Sequence, which makes frame 0 the line's own
 * start — so board-relative word timings pointed past the end of every line
 * after the first, and lines 2..n highlighted nothing while line 1 looked
 * perfect. Four lines is the smallest fixture that catches it.
 *
 * What to look for: in each extracted frame exactly one word is accented,
 * and the accented word moves forward through the line as time passes.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "out", "caption-lines");

/** Four lines of speech, the way a transcript hands them over. */
const PHRASES = [
  ["이게", "바로", "핵심입니다"],
  ["숫자로", "보면", "세", "배죠"],
  ["그래서", "순서가", "중요합니다"],
  ["마지막으로", "하나만", "더"],
];

const GAP_SEC = 0.4;
const TAIL_SEC = 0.25;

function buildCaptionLines() {
  const lines = [];
  let cursor = 0.3;
  for (const phrase of PHRASES) {
    const words = [];
    for (const text of phrase) {
      const duration = 0.32 + text.length * 0.07;
      words.push({
        text,
        startSec: Number(cursor.toFixed(3)),
        endSec: Number((cursor + duration).toFixed(3)),
      });
      cursor += duration;
    }
    lines.push({
      text: phrase.join(" "),
      words,
      startSec: words[0].startSec,
      endSec: Number((words[words.length - 1].endSec + TAIL_SEC).toFixed(3)),
    });
    cursor += GAP_SEC;
  }
  return { lines, totalSec: Number((cursor + 0.5).toFixed(3)) };
}

const { lines, totalSec } = buildCaptionLines();

const props = {
  blogClipId: null,
  title: "caption lines",
  styleTitle: "자막이 말을 따라갑니다",
  styleSubtitle: null,
  transitionSec: 0,
  transitionType: "none",
  source: "youtube_clip",
  visualStyle: "info_black",
  style: {
    layout: "letterbox",
    mediaFit: "contain",
    canvasBg: "#16202e",
    caption: "bottom_outline",
    header: "info_black",
    titleColor: "#ffffff",
    accent: "#f2a33c",
    captionAnimation: "karaoke",
    transitionSec: 0,
    transitionType: "none",
    kenBurns: false,
  },
  boards: [
    {
      boardId: 1,
      text: "",
      captionLines: lines,
      durationSec: totalSec,
      backgroundColor: "#16202e",
      textStyle: { animation: "karaoke", accentColor: "#f2a33c" },
    },
  ],
};

mkdirSync(outDir, { recursive: true });
const propsPath = join(outDir, "lines.props");
const outPath = join(outDir, "lines.mp4");
writeFileSync(propsPath, JSON.stringify(props, null, 2));

console.log(`${lines.length} lines, ${totalSec}s`);
for (const line of lines) {
  console.log(`  ${line.startSec.toFixed(2)}–${line.endSec.toFixed(2)}  ${line.text}`);
}

// Remotion downloads its own Chrome unless told otherwise. On a machine with
// no route to storage.googleapis.com, point REMOTION_BROWSER_EXECUTABLE at an
// existing Chromium instead of letting the render fail on a DNS lookup.
const browser = process.env.REMOTION_BROWSER_EXECUTABLE;

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
    ...(browser ? ["--browser-executable", browser] : []),
  ],
  { cwd: root, encoding: "utf8", shell: true, stdio: ["ignore", "inherit", "pipe"] },
);

if (result.status !== 0) {
  console.error("FAIL  render");
  if (result.stderr) console.error(result.stderr.trim().split("\n").slice(-8).join("\n"));
  process.exit(1);
}
if (!existsSync(outPath) || statSync(outPath).size < 10_000) {
  console.error("FAIL  output missing or suspiciously small");
  process.exit(1);
}

console.log(`OK    ${outPath}  (${Math.round(statSync(outPath).size / 1024)} KB)`);
console.log("눈으로 확인: 각 줄에서 강조 단어가 앞으로 이동해야 합니다.");
console.log(
  `  ffmpeg -ss <초> -i ${outPath} -frames:v 1 frame.png   (줄마다 두세 지점을 뽑아 보세요)`,
);
