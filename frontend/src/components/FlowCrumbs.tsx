import type { CreateSource } from "./CreateStudio";

/** 소스별 단계 알약(타이틀 바 오른쪽) — design_handoff_newcut_v3_source_flows README "셸" 절. */
export type FlowStepKey =
  | "input"
  | "wait"
  | "candidates"
  | "photos"
  | "script"
  | "selling"
  | "template"
  | "editor"
  | "done";

export type FlowCrumbState = { source: CreateSource; step: FlowStepKey };

const CRUMB_LABEL: Record<FlowStepKey, string> = {
  input: "① 입력",
  wait: "①-b 분석",
  candidates: "② 후보",
  photos: "③ 사진",
  script: "대본",
  selling: "셀링포인트",
  template: "④ 템플릿",
  editor: "⑤ 편집",
  done: "⑥ 완료",
};

const SOURCE_LABEL: Record<CreateSource, string> = {
  youtube: "유튜브",
  mp4: "MP4 파일",
  blog: "블로그 글",
  product: "상품 페이지",
};

/** 소스별 단계 순서. ⑤ 편집은 항상 ⑥ 완료 바로 앞(Phase 2 자리). 대본은 블로그·상품 모두 같은 화면을 쓴다. */
const ORDER: Record<CreateSource, FlowStepKey[]> = {
  youtube: ["input", "wait", "candidates", "template", "editor", "done"],
  mp4: ["input", "wait", "candidates", "template", "editor", "done"],
  blog: ["input", "wait", "photos", "script", "template", "editor", "done"],
  product: ["input", "wait", "photos", "script", "template", "editor", "done"],
};

export function FlowCrumbs({ source, step }: FlowCrumbState) {
  const order = ORDER[source];
  const current = order.indexOf(step);
  return (
    <div className="flow-crumbs" aria-label="제작 단계">
      <span className="flow-crumbs-label">{SOURCE_LABEL[source]} 흐름</span>
      {order.map((key, index) => {
        const state = index === current ? "is-current" : index < current ? "is-past" : "";
        return (
          <span className="flow-crumb-wrap" key={key}>
            <span
              className={`flow-crumb ${state}${key === "editor" && state === "" ? " is-later" : ""}`}
              aria-current={index === current ? "step" : undefined}
            >
              {CRUMB_LABEL[key]}
            </span>
            {index < order.length - 1 ? <span className="flow-crumb-arrow">›</span> : null}
          </span>
        );
      })}
    </div>
  );
}
