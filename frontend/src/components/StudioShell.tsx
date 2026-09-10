import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StudioTab } from "../lib/appRoute";

const HUB_URL = (import.meta.env.VITE_DITODIO_HUB_URL as string | undefined)?.replace(/\/$/, "") || "";

type BodyMode = "page" | "flow" | "editor";

type Props = {
  title: string;
  activeTab: StudioTab;
  projectCount: number;
  email: string;
  planLabel?: string | null;
  bodyMode?: BodyMode;
  titleAside?: ReactNode;
  children: ReactNode;
  onNavChange: (tab: StudioTab) => void;
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

function IconHome() {
  return (
    <svg className="studio-rail-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
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
      {planLabel ? <span className="studio-account-plan">{planLabel}</span> : null}
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

export function StudioShell({
  title,
  activeTab,
  projectCount,
  email,
  planLabel,
  bodyMode = "page",
  titleAside,
  children,
  onNavChange,
  onLogout,
}: Props) {
  const createActive = bodyMode === "page" && activeTab === "create";
  const projectsActive = bodyMode === "page" && activeTab === "projects";
  const usageActive = bodyMode === "page" && activeTab === "usage";

  return (
    <div className="studio-shell">
      <aside className="studio-rail">
        <div className="studio-rail-brand" title="New Cut">
          <span className="studio-rail-mark">NC</span>
        </div>
        <nav className="studio-rail-nav" aria-label="스튜디오 메뉴">
          {HUB_URL ? (
            <a className="studio-rail-link" href={`${HUB_URL}/dashboard`} target="_blank" rel="noreferrer">
              <IconHome />
              블로그
            </a>
          ) : null}
          <button type="button" className={`studio-rail-link${createActive ? " is-active" : ""}`} aria-current={createActive ? "page" : undefined} onClick={() => onNavChange("create")}>
            <IconPlus />
            만들기
          </button>
          <button type="button" className={`studio-rail-link${projectsActive ? " is-active" : ""}`} aria-current={projectsActive ? "page" : undefined} onClick={() => onNavChange("projects")}>
            <IconFolder />
            프로젝트
            {projectCount > 0 ? <span className="studio-rail-count">{projectCount}</span> : null}
          </button>
        </nav>
        <div className="studio-rail-foot">
          <button type="button" className={`studio-rail-link${usageActive ? " is-active" : ""}`} aria-current={usageActive ? "page" : undefined} onClick={() => onNavChange("usage")}>
            <IconSettings />
            요금
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
