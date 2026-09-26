import type { ReactNode } from "react";

/** ①-b 분석 대기 — design_handoff_newcut_v3_source_flows 명세(다크 카드, 2단, 소스별 문구). */
export type WaitScreenProps = {
  /** "쇼츠 만드는 중 · {sourceLabel}" */
  sourceLabel: string;
  title: string;
  steps: string[];
  /** 진행 중인 단계 index. */
  activeIndex: number;
  allDone?: boolean;
  percent: number;
  caption?: string;
  /** 오른쪽 아래 "먼저 찾은 구간" 카드. */
  found?: { label: string; text: string } | null;
  /** 오른쪽 9:16 자리에 얹는 점수·제목(첫 후보가 나온 뒤). */
  thumb?: { badge: string; title: string } | null;
  note: string;
  onLeave: () => void;
  /** 왼쪽 컬럼 맨 아래(에러 메시지·재시도 등). */
  footer?: ReactNode;
  /** 오른쪽 컬럼 맨 아래(알림 토글 등). */
  aside?: ReactNode;
};

/** 진행 중인 줄은 "…하기" → "…하는 중"으로 바꿔 지금 하는 일처럼 읽히게 한다(첫 줄 제외). */
function activeLabel(label: string, index: number): string {
  return index > 0 ? label.replace(/기$/, "는 중") : label;
}

export function WaitScreen({
  sourceLabel,
  title,
  steps,
  activeIndex,
  allDone = false,
  percent,
  caption,
  found,
  thumb,
  note,
  onLeave,
  footer,
  aside,
}: WaitScreenProps) {
  return (
    <section className="wait-screen" aria-live="polite">
      <div className="wait-main">
        <div>
          <p className="wait-kicker">쇼츠 만드는 중 · {sourceLabel}</p>
          <h3 className="wait-title">{title}</h3>
        </div>

        <div className="wait-steps">
          {steps.map((label, index) => {
            const done = allDone || index < activeIndex;
            const on = !done && index === activeIndex;
            const state = done ? "is-done" : on ? "is-on" : "is-pending";
            return (
              <div className={`wait-step ${state}`} key={label}>
                <span className="wait-dot" aria-hidden="true">
                  {done ? "✓" : on ? "•" : ""}
                </span>
                <span className="wait-step-label">{on ? activeLabel(label, index) : label}</span>
              </div>
            );
          })}
        </div>

        <div>
          <div className="wait-track">
            <span className="wait-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
          </div>
          {caption ? <p className="wait-caption">{caption}</p> : null}
        </div>

        {found ? (
          <div className="wait-found">
            <p className="wait-found-label">{found.label}</p>
            <p className="wait-found-text">{found.text}</p>
          </div>
        ) : null}

        {footer}
      </div>

      <div className="wait-side">
        <div className="wait-phone">
          {thumb ? (
            <>
              <span className="wait-phone-badge">{thumb.badge}</span>
              <span className="wait-phone-title">{thumb.title}</span>
            </>
          ) : null}
        </div>
        <button type="button" className="wait-leave" onClick={onLeave}>
          닫아도 계속 만듭니다
        </button>
        <p className="wait-note">{note}</p>
        {aside}
      </div>
    </section>
  );
}
