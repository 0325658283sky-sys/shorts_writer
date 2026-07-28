import { MEMBERSHIP_PLANS, formatKrw } from "../lib/membershipPlans";
import type { Usage } from "../types";

export function MembershipPage({ usage }: { usage: Usage | null }) {
  const remaining = usage?.remaining ?? null;
  const low = remaining != null && remaining <= 1;
  const currentPlan = (usage?.plan ?? "").toLowerCase();

  return (
    <section className="membership-page" aria-label="멤버십 요금제 안내">
      <header className="membership-hero">
        <p className="membership-kicker">Membership</p>
        <h1 className="membership-title">요금제</h1>
        <p className="membership-lead">
          월간 한도는 <strong>영상 Analyze(오디오 추출) 성공</strong> 시에만 1회 차감됩니다. 블로그 쇼츠 렌더·보드
          편집·프리뷰·이미 분석된 영상의 전사/하이라이트는 차감되지 않습니다. (서버 정책: Free 3 / Lite 30 / Pro 150)
        </p>
      </header>

      {usage ? (
        <div className="membership-usage" aria-label="현재 사용량">
          <div>
            <span>현재 요금제</span>
            <strong>{usage.plan_name}</strong>
          </div>
          <div>
            <span>이번 달 사용</span>
            <strong>
              {usage.monthly_usage}/{usage.usage_limit}
            </strong>
          </div>
          <div>
            <span>남은 횟수</span>
            <strong className={low ? "usage-remaining-low" : undefined}>
              {remaining != null ? `${remaining}회` : "-"}
            </strong>
          </div>
          <div>
            <span>최대 영상 길이</span>
            <strong>{usage.max_video_minutes}분</strong>
          </div>
        </div>
      ) : null}

      <div className="membership-grid">
        {MEMBERSHIP_PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          return (
            <article
              key={plan.id}
              className={[
                "membership-card",
                plan.highlighted ? "is-featured" : "",
                isCurrent ? "is-current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="membership-card-head">
                <div className="membership-card-labels">
                  <h2>{plan.name}</h2>
                  {plan.highlighted ? <span className="membership-badge">추천</span> : null}
                  {isCurrent ? <span className="membership-badge is-current-badge">이용 중</span> : null}
                </div>
                <p className="membership-tagline">{plan.tagline}</p>
                <p className="membership-price">
                  <strong>{formatKrw(plan.priceMonthKrw)}</strong>
                  {plan.priceMonthKrw > 0 ? <span>/월</span> : null}
                </p>
                {plan.priceYearKrw != null ? (
                  <p className="membership-price-year">연 {formatKrw(plan.priceYearKrw)} · 2개월분 할인</p>
                ) : (
                  <p className="membership-price-year">카드 등록 없이 바로 시작</p>
                )}
                <p className="membership-quota">
                  월 {plan.monthlyCredits}회 · 소스 최대 {plan.maxSourceMinutes}분
                </p>
              </div>
              <ul className="membership-features">
                {plan.features.map((feature) => (
                  <li key={feature.label} className={feature.included ? "is-on" : "is-off"}>
                    <span className="membership-check" aria-hidden="true">
                      {feature.included ? "✓" : "–"}
                    </span>
                    <span>
                      {feature.label}
                      {feature.detail ? <em> · {feature.detail}</em> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <section className="membership-rules" aria-label="크레딧 안내">
        <h3>크레딧이 차감되는 작업</h3>
        <ul>
          <li>
            <strong>영상 Analyze</strong> — 분석(오디오 추출) 성공 시 1회. 업로드·유튜브 가져오기만으로는 차감되지
            않습니다.
          </li>
        </ul>
        <h3>차감되지 않는 작업</h3>
        <ul>
          <li>블로그 스크랩, 이미지·대본 선택, 보드 편집, 프리뷰, 최종 렌더</li>
          <li>이미 분석된 영상의 전사·하이라이트·클립 자르기·자막</li>
        </ul>
        <p className="membership-footnote">
          표시 가격은 부가세 별도 안내 기준이며, 결제 연동 전까지 요금제 변경은 관리자(DB)에서 적용됩니다. 월간
          크레딧은 이월되지 않습니다.
        </p>
      </section>
    </section>
  );
}
