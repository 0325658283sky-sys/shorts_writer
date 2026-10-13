import type { ReactNode } from "react";

/** 변환 중 — 목업 Progress.dc.html. 어두운 화면, 560px 한 줄. */
export type WaitScreenProps = {
  /** "쇼츠 만드는 중 · {sourceLabel}" (영상 카드가 없을 때의 머리글) */
  sourceLabel: string;
  title: string;
  steps: string[];
  /** 진행 중인 단계 index. */
  activeIndex: number;
  allDone?: boolean;
  percent: number;
  /** "14초 지남" 같은 보조 문구. */
  caption?: string;
  /** 남은 시간(초). 아직 가늠할 수 없으면 null. */
  remainSec?: number | null;
  /** 맨 위 영상 카드. */
  source?: { thumbnail?: string | null; title: string; meta: string } | null;
  /** "먼저 찾은 구간" 카드. */
  found?: { label: string; text: string } | null;
  note: string;
  onLeave: () => void;
  /** 에러 메시지·재시도 등. */
  footer?: ReactNode;
  /** 알림 토글 등. */
  aside?: ReactNode;
};

/** 진행 중인 줄은 "…하기" → "…하는 중"으로 바꿔 지금 하는 일처럼 읽히게 한다(첫 줄 제외). */
function activeLabel(label: string, index: number): string {
  return index > 0 ? label.replace(/기$/, "는 중") : label;
}

function clock(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function WaitScreen({
  sourceLabel,
  title,
  steps,
  activeIndex,
  allDone = false,
  percent,
  caption,
  remainSec,
  source,
  found,
  note,
  onLeave,
  footer,
  aside,
}: WaitScreenProps) {
  return (
    <section className="wait-screen" data-surface="dark" aria-live="polite">
      {source ? (
        <div className="wait-source">
          <span
            className="wait-source-thumb"
            style={source.thumbnail ? { backgroundImage: `url(${source.thumbnail})` } : undefined}
            aria-hidden="true"
          />
          <span className="wait-source-copy">
            <span className="wait-source-title">{source.title}</span>
            <span className="wait-source-meta ncut-num">{source.meta}</span>
          </span>
        </div>
      ) : (
        <div className="wait-head">
          <p className="wait-kicker">쇼츠 만드는 중 · {sourceLabel}</p>
          <h3 className="wait-title">{title}</h3>
        </div>
      )}

      <div className="wait-remain">
        <p className="wait-remain-label">남은 시간</p>
        <p className={`wait-remain-value ncut-num${remainSec == null ? " is-calculating" : ""}`}>{remainSec != null ? clock(remainSec) : "계산 중"}</p>
        <div className="wait-track">
          <span className="wait-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
        </div>
        {caption ? <p className="wait-caption">{caption}</p> : null}
      </div>

      <div className="wait-steps">
        {steps.map((label, index) => {
          const done = allDone || index < activeIndex;
          const on = !done && index === activeIndex;
          const state = done ? "is-done" : on ? "is-on" : "is-pending";
          return (
            <div className={`wait-step ${state}`} key={label}>
              <span className="wait-dot" aria-hidden="true">
                {done ? "\u2713" : on ? "\u25cf" : "\u00b7"}
              </span>
              <span className="wait-step-label">{on ? activeLabel(label, index) : label}</span>
            </div>
          );
        })}
      </div>

      {found ? (
        <div className="wait-found">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.2 13.2 3.3 3.3" />
          </svg>
          <p className="wait-found-text">
            <b>{found.label}</b> {found.text}
          </p>
        </div>
      ) : null}

      <div className="wait-notice">
        <span className="wait-notice-copy">{note}</span>
        {aside}
      </div>

      {footer}

      <div className="wait-actions">
        <button type="button" className="wait-leave" onClick={onLeave}>
          다른 영상 올리기
        </button>
      </div>
    </section>
  );
}
