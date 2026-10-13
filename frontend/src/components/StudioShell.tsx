import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StudioTab } from "../lib/appRoute";
import type { Usage } from "../types";
import { CreditMeter } from "./CreditMeter";

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
  /** 화면 전체를 어두운 작업면으로(변환 중). */
  dark?: boolean;
  /** 결과 화면처럼 화면이 자기 상단 바를 가질 때. */
  hideTopbar?: boolean;
  titleAside?: ReactNode;
  children: ReactNode;
  onNavChange: (tab: StudioTab) => void;
  onProjectsBucket?: (bucket: "in_progress" | "done") => void;
  onLogout: () => void;
};

function initialsFromEmail(email?: string) {
  if (!email) return "U";
  const local = email.split("@")[0] || email;
  return local.slice(0, 1).toUpperCase();
}

function AccountMenu({
  email,
  planLabel,
  usageActive,
  onUsage,
  onLogout,
}: {
  email: string;
  planLabel?: string | null;
  usageActive: boolean;
  onUsage: () => void;
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
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {initialsFromEmail(email)}
      </button>
      {open ? (
        <div className="studio-account-menu" role="menu">
          <p className="studio-account-email">{email}</p>
          {planLabel ? <p className="studio-account-plan">{planLabel}</p> : null}
          <button
            type="button"
            role="menuitem"
            className={`studio-account-item${usageActive ? " is-active" : ""}`}
            onClick={() => {
              setOpen(false);
              onUsage();
            }}
          >
            요금제 · 사용량
          </button>
          <button type="button" role="menuitem" className="studio-account-item" onClick={onLogout}>
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
  usage = null,
  email,
  planLabel,
  bodyMode = "page",
  dark = false,
  hideTopbar = false,
  titleAside,
  children,
  onNavChange,
  onLogout,
}: Props) {
  const createActive = bodyMode === "page" && activeTab === "create";
  const projectsActive = bodyMode === "page" && activeTab === "projects";
  const templatesActive = bodyMode === "page" && activeTab === "templates";
  const usageActive = bodyMode === "page" && activeTab === "usage";
  // 목업 HomeB: 만들기 화면에서는 상단 바가 어두운 작업대와 한 덩어리다.
  const darkBar = createActive || dark;
  const showSubbar = bodyMode === "flow" && Boolean(titleAside) && !dark;

  return (
    <div className="studio-shell is-topnav" data-surface={dark ? "dark" : undefined}>
      {hideTopbar ? null : (
      <header className="studio-topbar" data-surface={darkBar ? "dark" : undefined}>
        <button type="button" className="studio-topbar-brand" onClick={() => onNavChange("create")}>
          New Cut
        </button>

        <nav className="studio-topbar-nav" aria-label="스튜디오 메뉴">
          <button
            type="button"
            className={`studio-topbar-link${createActive ? " is-active" : ""}`}
            aria-current={createActive ? "page" : undefined}
            onClick={() => onNavChange("create")}
          >
            만들기
          </button>
          <button
            type="button"
            className={`studio-topbar-link${projectsActive ? " is-active" : ""}`}
            aria-current={projectsActive ? "page" : undefined}
            onClick={() => onNavChange("projects")}
          >
            내 작업
            {projectCount > 0 ? <span className="studio-topbar-count ncut-num">{projectCount}</span> : null}
          </button>
          <button
            type="button"
            className={`studio-topbar-link${templatesActive ? " is-active" : ""}`}
            aria-current={templatesActive ? "page" : undefined}
            onClick={() => onNavChange("templates")}
          >
            템플릿
          </button>
          <span className="studio-topbar-link is-soon" aria-disabled="true" title="준비 중입니다">
            에셋
          </span>
        </nav>

        {HUB_URL ? (
          <a className="studio-topbar-hub" href={`${HUB_URL}/dashboard`} target="_blank" rel="noreferrer">
            블로그 글 ↗
          </a>
        ) : null}

        <span className="studio-topbar-grow" />
        <CreditMeter usage={usage} />
        <AccountMenu
          email={email}
          planLabel={planLabel}
          usageActive={usageActive}
          onUsage={() => onNavChange("usage")}
          onLogout={onLogout}
        />
      </header>
      )}

      <div className="studio-shell-main">
        {showSubbar ? (
          <div className="studio-subbar">
            <span className="studio-subbar-title">{title}</span>
            <div className="studio-shell-title-aside">{titleAside}</div>
          </div>
        ) : null}
        <div className={`studio-shell-body is-${bodyMode}`}>{children}</div>
      </div>
    </div>
  );
}
