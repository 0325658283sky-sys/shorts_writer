import { useAliveProgress } from "../hooks/useAliveProgress";

export function AliveProgressBar({
  percent,
  active,
  label,
  className = "blog-progress",
}: {
  percent: number;
  active: boolean;
  label: string;
  className?: string;
}) {
  const displayPercent = useAliveProgress(percent, active);
  const width = Math.max(0, Math.min(100, displayPercent));
  const shown = Math.round(displayPercent);

  return (
    <div className={className} aria-live="polite">
      <div className={`blog-progress-track ${active ? "is-active" : ""}`}>
        <div
          className={`blog-progress-fill ${active ? "is-alive" : ""}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="blog-progress-label">
        {label} · {shown}%
        {active ? <span className="blog-progress-hint"> 처리 중…</span> : null}
      </span>
    </div>
  );
}
