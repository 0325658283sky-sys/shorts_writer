import { useEffect, useState } from "react";
import { authorizedRequest } from "../api/client";

/**
 * 템플릿 미세 조정 — docs/FLOW_REDESIGN.md §9-7.
 *
 * §9-7은 9축 편집기를 요구하지만, 렌더러는 아직 9축을 반영하지 않는다
 * (`template_bridge.DROPPED_IN_BRIDGE`). 반영되지 않는 축에 컨트롤을 붙이면
 * 사용자가 만진 설정이 결과에 나타나지 않으므로, 이 패널은 백엔드가
 * `/video-templates/editable`로 알려주는 축만 그린다. 백엔드의 렌더러가
 * 축을 더 반영하게 되면 프런트를 고치지 않아도 컨트롤이 늘어난다.
 *
 * 전부 §3의 "모양" 설정이다 — 재렌더만, 무료, 재분석 없음.
 */

export type TemplateOverrides = Record<string, string>;

type EditableInfo = {
  editable: string[];
  dropped: string[];
  motions: { id: string; label: string }[];
  ratios: string[];
};

const RATIO_LABELS: Record<string, string> = {
  "9:16": "세로 가득",
  "16:9": "위아래 여백",
  "4:3": "위아래 여백(넓게)",
  "1:1": "정사각",
  dual: "상하 분할",
};

/** 사용자가 읽을 이름. 백엔드의 점 표기 경로를 그대로 보여주지 않는다. */
const PATH_LABELS: Record<string, string> = {
  "layout.ratio": "화면 비율",
  "layout.canvasBg": "배경색",
  "layout.mediaFit": "영상 채우기",
  "title.color": "제목 색",
  "caption.motion": "자막 효과",
  "caption.color": "자막 색",
  "caption.highlightColor": "강조 색",
  "caption.background": "자막 배경",
};

/** 버려지는 축을 사용자 말로. 숨기지 않고 고지하기 위한 것이다. */
const DROPPED_LABELS: Record<string, string> = {
  "title.fontSize": "제목 크기",
  "title.strokes": "제목 외곽선",
  "title.shadow": "제목 그림자",
  "title.position": "제목 위치",
  "title.lines": "제목 줄 수",
  "caption.fontSize": "자막 크기",
  "caption.position": "자막 위치",
  "caption.scope": "자막 적용 범위",
  texts: "고정 텍스트",
  images: "고정 이미지",
  brand: "로고·CTA",
  outro: "아웃트로",
  audio: "배경 음악",
};

const COLOR_PATHS = new Set([
  "layout.canvasBg",
  "title.color",
  "caption.color",
  "caption.highlightColor",
  "caption.background",
]);

export function TemplateTuner({
  baseTemplate,
  overrides,
  busy = false,
  onChange,
  onApply,
  onReset,
}: {
  /** 지금 고른 시스템 템플릿. 컨트롤의 기본값은 여기서 온다. */
  baseTemplate: {
    canvasBg: string;
    titleColor: string;
    accent: string;
    motion: string;
    ratio?: string;
  } | null;
  overrides: TemplateOverrides;
  busy?: boolean;
  onChange: (next: TemplateOverrides) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const [info, setInfo] = useState<EditableInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authorizedRequest<EditableInfo>("/video-templates/editable")
      .then((loaded) => {
        if (!cancelled) setInfo(loaded);
      })
      .catch(() => {
        // 조정 패널만 사라진다. 템플릿 교체와 나머지 편집은 그대로 쓸 수 있다.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || !info || !baseTemplate) return null;

  // Bound after the guard: the narrowing above does not reach inside the
  // hoisted `current` below.
  const base = baseTemplate;

  const changed = Object.keys(overrides).length > 0;

  function set(path: string, value: string) {
    const next = { ...overrides };
    if (!value) delete next[path];
    else next[path] = value;
    onChange(next);
  }

  /** 컨트롤에 보여줄 현재 값 — 바꾼 값이 있으면 그것, 없으면 템플릿의 값. */
  function current(path: string): string {
    if (overrides[path]) return overrides[path];
    switch (path) {
      case "layout.canvasBg":
        return base.canvasBg;
      case "title.color":
        return base.titleColor;
      case "caption.highlightColor":
        return base.accent;
      case "caption.motion":
        return base.motion;
      case "layout.ratio":
        return base.ratio ?? "9:16";
      default:
        return "";
    }
  }

  const droppedNames = info.dropped
    .map((path) => DROPPED_LABELS[path])
    .filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index);

  return (
    <div className="ws-tuner">
      <div className="ws-template-swap-head">
        <strong>세부 조정</strong>
        <span className="ws-template-swap-free">무료 · 재렌더만</span>
      </div>

      {info.editable.map((path) => {
        const label = PATH_LABELS[path] ?? path;

        if (path === "caption.motion") {
          return (
            <label className="create-field inline-field" key={path}>
              <span>{label}</span>
              <select value={current(path)} onChange={(event) => set(path, event.target.value)}>
                {info.motions.map((motion) => (
                  <option value={motion.id} key={motion.id}>
                    {motion.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (path === "layout.ratio") {
          return (
            <label className="create-field inline-field" key={path}>
              <span>{label}</span>
              <select value={current(path)} onChange={(event) => set(path, event.target.value)}>
                {info.ratios.map((ratio) => (
                  <option value={ratio} key={ratio}>
                    {RATIO_LABELS[ratio] ?? ratio} ({ratio})
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (COLOR_PATHS.has(path)) {
          const value = current(path);
          return (
            <label className="create-field inline-field ws-tuner-color" key={path}>
              <span>{label}</span>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
                onChange={(event) => set(path, event.target.value)}
                aria-label={label}
              />
            </label>
          );
        }

        return null;
      })}

      <div className="ws-tuner-actions">
        <button className="small-button" type="button" disabled={busy || !changed} onClick={onApply}>
          {busy ? "적용 중…" : "조정 적용"}
        </button>
        <button className="ghost-button" type="button" disabled={busy || !changed} onClick={onReset}>
          템플릿 기본값으로
        </button>
      </div>

      {droppedNames.length ? (
        <p className="create-note ws-tuner-dropped">
          아직 못 바꾸는 것: {droppedNames.join(", ")}. 이 항목들은 템플릿에 값이 있어도 지금
          화면에 반영되지 않아요.
        </p>
      ) : null}
    </div>
  );
}
