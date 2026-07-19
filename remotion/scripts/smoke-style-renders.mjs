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
  fullscreen: {
    layout: "fullscreen",
    caption: "bottom_box",
    header: "overlay",
    accent: "#FFE566",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: true,
  },
  card_news: {
    layout: "card",
    caption: "card_bottom",
    header: "card_white",
    accent: "#1f6b4a",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: true,
  },
  info_dark: {
    layout: "fullscreen",
    caption: "dark_bar",
    header: "info_navy",
    accent: "#7CFFB2",
    transitionSec: 0.35,
    transitionType: "fade",
    kenBurns: true,
  },
  bold_hook: {
    layout: "fullscreen",
    caption: "bold_center",
    header: "viral_black",
    accent: "#5EF2D0",
    transitionSec: 0.25,
    transitionType: "slide",
    kenBurns: true,
  },
};

const CASES = [
  { name: "fullscreen-fade", visualStyle: "fullscreen" },
  { name: "card_news-fade", visualStyle: "card_news" },
  { name: "info_dark-fade", visualStyle: "info_dark" },
  { name: "bold_hook-slide", visualStyle: "bold_hook" },
  {
    name: "fullscreen-none",
    visualStyle: "fullscreen",
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
        text: "첫 보드 — 스타일·전환 스모크",
        durationSec: 1.4,
        backgroundColor: "#1a3a4a",
      },
      {
        text: "둘째 보드 — 크로스페이드/슬라이드",
        durationSec: 1.4,
        backgroundColor: "#2d4a3e",
      },
    ],
  };
}

mkdirSync(outDir, { recursive: true });

const results = [];
for (const caseDef of CASES) {
  const props = buildProps(caseDef);
  const propsPath = join(outDir, `${caseDef.name}.json`);
  const mp4Path = join(outDir, `${caseDef.name}.mp4`);
  writeFileSync(propsPath, JSON.stringify(props, null, 2), "utf8");

  console.log(`\n=== render ${caseDef.name} ===`);
  const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
  const rendered = spawnSync(
    npxBin,
    ["remotion", "render", "BlogShorts", mp4Path, `--props=${propsPath}`],
    { cwd: root, encoding: "utf8", shell: false },
  );
  if (rendered.stdout) process.stdout.write(rendered.stdout);
  if (rendered.stderr) process.stderr.write(rendered.stderr);

  const ok =
    rendered.status === 0 && existsSync(mp4Path) && statSync(mp4Path).size > 10_000;
  results.push({
    name: caseDef.name,
    status: rendered.status,
    bytes: existsSync(mp4Path) ? statSync(mp4Path).size : 0,
    ok,
  });
  if (!ok) {
    console.error(`FAIL ${caseDef.name}`);
    process.exitCode = 1;
    break;
  }
  console.log(`OK ${caseDef.name} (${results.at(-1).bytes} bytes)`);
}

console.log("\n--- smoke summary ---");
for (const row of results) {
  console.log(`${row.ok ? "PASS" : "FAIL"} ${row.name} bytes=${row.bytes}`);
}
if (results.every((row) => row.ok)) {
  console.log(`All ${results.length} smoke renders OK → ${outDir}`);
}
