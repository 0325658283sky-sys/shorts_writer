import type { Plan, Usage } from "../types";

export function UsagePanel({ usage, plans }: { usage: Usage | null; plans: Plan[] }) {
  const remaining = usage?.remaining ?? null;
  const low = remaining != null && remaining <= 1;

  return (
    <section className="usage-panel" aria-label="사용량 및 요금제">
      <div className="usage-summary">
        <div>
          <span>현재 요금제</span>
          <strong>{usage ? usage.plan_name : "불러오는 중"}</strong>
        </div>
        <div>
          <span>이번 달 분석</span>
          <strong>{usage ? `${usage.monthly_usage}/${usage.usage_limit}` : "-"}</strong>
        </div>
        <div>
          <span>남은 횟수</span>
          <strong className={low ? "usage-remaining-low" : undefined}>
            {remaining != null ? `${remaining}회` : "-"}
          </strong>
        </div>
        <div>
          <span>최대 영상 길이</span>
          <strong>{usage ? `${usage.max_video_minutes}분` : "-"}</strong>
        </div>
      </div>
      {low ? (
        <p className="usage-note">
          영상 분석 크레딧이 거의 소진되었습니다. Analyze 시 차감되며, 요금제는 DB에서 변경할 수 있습니다.
        </p>
      ) : (
        <p className="usage-note">영상 업로드/가져오기는 무료이고, Analyze를 누를 때 1회 차감됩니다.</p>
      )}
      <div className="plans-grid">
        {plans.map((plan) => (
          <article className={`plan-tile ${usage?.plan === plan.id ? "active-plan" : ""}`} key={plan.id}>
            <div>
              <strong>{plan.name}</strong>
              <span>월 {plan.monthly_video_limit}회</span>
            </div>
            <p>영상당 최대 {plan.max_video_minutes}분</p>
          </article>
        ))}
      </div>
    </section>
  );
}
