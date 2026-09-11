import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StudioTab } from "../lib/appRoute";
import type { Usage } from "../types";

const HUB_URL = (import.meta.env.VITE_DITODIO_HUB_URL as string | undefined)?.replace(/\/$/, "") || "";

type BodyMode = "page" | "flow" | "editor";

type Props = {
  title: string;
  activeTab: StudioTab;
  projectCount: number;
  inProgressCount?: number;
  doneCount?: number;
  usage?: Usage | null;
  email: string;
  planLabel?: string | null;
  bodyMode?: BodyMode;
  titleAside?: ReactNode;
  children: ReactNode;
  onNavChange: (tab: StudioTab) => void;
  onProjectsBucket?: (bucket: "in_progress" | "done") => void;
  onLogout: () => void;
};

function initialsFromEmail(email?: string) {
  if (!email) return "U";
  const local = email.split("@")[0] || email;
  return local.slice(0, 2).toUpperCase();
}

function IconPlus() {
  return (
    <svg className="studio-rail-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg className="studio-rail-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2c.3 0 .58.12.79.34L11 8h8.5A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg className="studio-rail-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.36.6.94.98 1.51 1H21a2 2 0 1 1 0 4h-.09c-.57.02-1.15.4-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccountMenu({
  email,
  planLabel,
  onLogout,
}: {
  email: string;
  planLabel?: string | null;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="studio-account">
      <button
        type="button"
        className="studio-account-avatar"
        title={email}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {initialsFromEmail(email)}
      </button>
      <div className="studio-account-copy">
        <span className="studio-account-email-inline">{email}</span>
        {planLabel ? <span className="studio-account-plan">{planLabel}</span> : null}
      </div>
      {open ? (
        <div className="studio-account-menu" role="menu">
          <p className="studio-account-email">{email}</p>
          <button type="button" className="studio-account-logout" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 이번 달 사용량 — Ditodio 허브 연동 시 블로그 글·쇼츠 각자의 실제 쿼터를 보여준다.
 * 두 자원은 서로 다른 한도라 하나의 게이지로 합치지 않고 항목별로 표시한다. */
function UsageMeter({ usage }: { usage?: Usage | null }) {
  if (!usage) return null;
  const shortsUsed = usage.shorts_used ?? usage.monthly_usage ?? 0;
  const shortsLimit = usage.shorts_limit ?? usage.usage_limit ?? 0;
  const rows: { key: string; label: string; used: number; limit: number; tone: "accent" | "accent-2" }[] = [
    { key: "shorts", label: "쇼츠", used: shortsUsed, limit: shortsLimit, tone: "accent" },
  ];
  if (usage.ditodio_linked && usage.posts_limit != null && usage.posts_limit > 0) {
    rows.push({ key: "posts", label: "블로그 글", used: usage.posts_used ?? 0, limit: usage.posts_limit, tone: "accent-2" });
  }
  return (
    <div className="studio-usage-meter">
      {rows.map((row) => {
        const pct = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : 0;
        return (
          <div className="studio-usage-row" key={row.key}>
            <span className="studio-usage-label">{row.label}</span>
            <span className={`studio-usage-gauge tone-${row.tone}`}>
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="studio-usage-count">
              {Math.max(row.limit - row.used, 0)}/{row.limit}
            </span>
          </div>
        );
      })}
      {usage.usage_month ? <span className="studio-usage-reset">{usage.usage_month} 기준 · 매월 초기화</span> : null}
    </div>
  );
}

export function StudioShell({
  title,
  activeTab,
  projectCount,
  inProgressCount = 0,
  doneCount = 0,
  usage = null,
  email,
  planLabel,
  bodyMode = "page",
  titleAside,
  children,
  onNavChange,
  onProjectsBucket,
  onLogout,
}: Props) {
  const projectsActive = bodyMode === "page" && activeTab === "projects";
  const usageActive = bodyMode === "page" && activeTab === "usage";

  return (
    <div className="studio-shell">
      <aside className="studio-rail">
        <div className="studio-rail-brand">
          <span className="studio-rail-mark">NC</span>
          <span className="studio-rail-wordmark">New Cut</span>
        </div>

        {HUB_URL ? (
          <div className="studio-switcher" role="tablist" aria-label="제품 전환">
            <a className="studio-switcher-item" href={`${HUB_URL}/dashboard`} target="_blank" rel="noreferrer">
              블로그 글
            </a>
            <span className="studio-switcher-item is-active" aria-current="page">
              쇼츠
            </span>
          </div>
        ) : null}

        <nav className="studio-rail-nav" aria-label="스튜디오 메뉴">
          <button type="button" className="studio-rail-cta" onClick={() => onNavChange("create")}>
            <IconPlus />＋ 새로 만들기
          </button>
          <button
            type="button"
            className={`studio-rail-link${projectsActive ? " is-active" : ""}`}
            aria-current={projectsActive ? "page" : undefined}
            onClick={() => onNavChange("projects")}
          >
            <IconFolder />
            <span>프로젝트</span>
            {projectCount > 0 ? <span className="studio-rail-count">{projectCount}</span> : null}
          </button>
          <button
            type="button"
            className="studio-rail-subitem"
            onClick={() => (onProjectsBucket ? onProjectsBucket("in_progress") : onNavChange("projects"))}
          >
            진행 중 <strong>{inProgressCount}</strong>
          </button>
          <button
            type="button"
            className="studio-rail-subitem"
            onClick={() => (onProjectsBucket ? onProjectsBucket("done") : onNavChange("projects"))}
          >
            완성된 쇼츠 <strong>{doneCount}</strong>
          </button>
        </nav>

        <div className="studio-rail-foot">
          <UsageMeter usage={usage} />
          <button
            type="button"
            className={`studio-rail-link${usageActive ? " is-active" : ""}`}
            aria-current={usageActive ? "page" : undefined}
            onClick={() => onNavChange("usage")}
          >
            <IconSettings />
            <span>요금제 · 사용량</span>
          </button>
          <AccountMenu email={email} planLabel={planLabel} onLogout={onLogout} />
        </div>
      </aside>
      <div className="studio-shell-main">
        <header className="studio-shell-title">
          <span>{title}</span>
          {titleAside ? <div className="studio-shell-title-aside">{titleAside}</div> : null}
        </header>
        <div className={`studio-shell-body is-${bodyMode}`}>{children}</div>
      </div>
    </div>
  );
}
