/** Display catalog for the membership pricing page (KRW). Backend billing not wired yet. */

export type MembershipPlanId = "free" | "lite" | "pro";

export type MembershipFeature = {
  label: string;
  included: boolean;
  detail?: string;
};

export type MembershipPlanCard = {
  id: MembershipPlanId;
  name: string;
  tagline: string;
  priceMonthKrw: number;
  priceYearKrw: number | null;
  monthlyCredits: number;
  maxSourceMinutes: number;
  highlighted?: boolean;
  features: MembershipFeature[];
};

export const MEMBERSHIP_PLANS: MembershipPlanCard[] = [
  {
    id: "free",
    name: "Free",
    tagline: "체험과 가벼운 테스트용",
    priceMonthKrw: 0,
    priceYearKrw: null,
    monthlyCredits: 3,
    maxSourceMinutes: 10,
    features: [
      { label: "월 분석 3회", included: true, detail: "영상 Analyze 성공 시 1회" },
      { label: "소스 영상 최대 10분", included: true },
      { label: "블로그 → 쇼츠 / 영상 클립", included: true },
      { label: "워터마크", included: true, detail: "내보내기에 New Cut 배지" },
      { label: "기본 스타일", included: true },
      { label: "프리미엄 스타일·커스텀 폰트", included: false },
      { label: "BGM·SFX 라이브러리", included: false },
      { label: "톤 후보 3개", included: true },
    ],
  },
  {
    id: "lite",
    name: "Lite",
    tagline: "개인 크리에이터의 정기 제작",
    priceMonthKrw: 14_900,
    priceYearKrw: 149_000,
    monthlyCredits: 30,
    maxSourceMinutes: 30,
    highlighted: true,
    features: [
      { label: "월 분석 30회", included: true, detail: "영상 Analyze 성공 시 1회" },
      { label: "소스 영상 최대 30분", included: true },
      { label: "블로그 → 쇼츠 / 영상 클립", included: true },
      { label: "워터마크 없음", included: true },
      { label: "프리미엄 스타일·커스텀 폰트", included: true },
      { label: "BGM·SFX 라이브러리", included: true },
      { label: "톤 후보 3개", included: true },
      { label: "보드 최대 12장", included: true },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "채널 운영·헤비 워크플로",
    priceMonthKrw: 39_900,
    priceYearKrw: 399_000,
    monthlyCredits: 150,
    maxSourceMinutes: 120,
    features: [
      { label: "월 분석 150회", included: true, detail: "영상 Analyze 성공 시 1회" },
      { label: "소스 영상 최대 120분", included: true },
      { label: "블로그 → 쇼츠 / 영상 클립", included: true },
      { label: "워터마크 없음", included: true },
      { label: "프리미엄 스타일·커스텀 폰트", included: true },
      { label: "BGM·SFX 라이브러리", included: true },
      { label: "톤 후보 3개 · 보드 최대 20장", included: true },
      { label: "동시 렌더 2개 · 우선 큐(예정)", included: true },
    ],
  },
];

export function formatKrw(amount: number): string {
  if (amount <= 0) return "무료";
  return `${amount.toLocaleString("ko-KR")}원`;
}
