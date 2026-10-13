import type { Usage } from "../types";

/** 상단 바의 크레딧 미터 — 남은 양 / 한도 + 얇은 막대. 디자인 시스템. */
export function CreditMeter({ usage }: { usage?: Usage | null }) {
  if (!usage) return null;
  const limit = usage.shorts_limit ?? usage.usage_limit ?? 0;
  if (limit <= 0) return null;
  const used = usage.shorts_used ?? usage.monthly_usage ?? 0;
  const remaining = Math.max(0, limit - used);
  const pct = Math.min(100, Math.round((remaining / limit) * 100));
  return (
    <span className="ncut-credit-meter" role="img" aria-label={`남은 크레딧 ${remaining} / ${limit}`}>
      <span className="ncut-credit-meter-row ncut-num">
        <span className="ncut-credit-meter-now">{remaining}</span>
        <span className="ncut-credit-meter-max">/{limit}</span>
      </span>
      <span className="ncut-credit-meter-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
