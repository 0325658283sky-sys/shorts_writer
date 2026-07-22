/**
 * Smoke-render BlogShorts for each visual style + transition variants.
 * Usage (from remotion/): node scripts/smoke-style-renders.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "out", "smoke");

const STYLES = {
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
  },
  info_black: {
    layout: "letterbox",
    mediaFit: "contain",
    canvasBg: "#000000",
    caption: "bottom_outline",
    header: "info_black",
    titleColor: "#ffffff",
    accent: "#FFE566",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: false,
  },
  info_navy: {
    layout: "letterbox",
    mediaFit: "contain",
    canvasBg: "#0B1F3A",
    caption: "black_box",
    header: "info_navy",
    titleColor: "#ffffff",
    accent: "#7CFFB2",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: false,
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
  },
};

const CASES = [
  { name: "impact_full-fade", visualStyle: "impact_full" },
  { name: "info_black-fade", visualStyle: "info_black" },
  { name: "info_navy-fade", visualStyle: "info_navy" },
  { name: "viral_cyan-slide", visualStyle: "viral_cyan" },
  { name: "card_white-fade", visualStyle: "card_white" },
  {
    name: "impact_full-none",
    visualStyle: "impact_full",
    transitionSec: 0,
    transitionType: "none",
  },
];

function buildProps(caseDef) {
  const style = { ...STYLES[caseDef.visualStyle] };
  if (caseDef.transitionSec != null) style.transitionSec = caseDef.transitionSec;
  if (caseDef.transitionType != null) style.transitionType = caseDef.transitionType;
  return {
    blogClipId: null,
    title: `Smoke ${caseDef.name}`,
    styleTitle: `${caseDef.visualStyle} *훅*`,
    styleSubtitle: `전환 ${style.transitionType}`,
    transitionSec: style.transitionSec,
    transitionType: style.transitionType,
    source: "dummy",
    visualStyle: caseDef.visualStyle,
    style,
    boards: [
      {
        text: "템플릿 자막 미리보기",
        durationSec: 2.2,
        backgroundColor: "#1a3a4a",
      },
      {
        text: "두 번째 보드",
        durationSec: 2.0,
        backgroundColor: "#2d4a3e",
      },
    ],
  };
}

function renderCase(caseDef) {
  const props = buildProps(caseDef);
  const propsPath = join(outDir, `${caseDef.name}.props`);
  const outPath = join(outDir, `${caseDef.name}.mp4`);
  writeFileSync(propsPath, JSON.stringify(props, null, 2));
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
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`Render failed: ${caseDef.name}`);
  }
  const size = existsSync(outPath) ? statSync(outPath).size : 0;
  console.log(`ok ${caseDef.name} (${Math.round(size / 1024)} KB)`);
}

mkdirSync(outDir, { recursive: true });
for (const caseDef of CASES) {
  renderCase(caseDef);
}
console.log(`smoke complete: ${CASES.length}/${CASES.length}`);
