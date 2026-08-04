/** Display catalog aligned with Ditodio unified plans (posts + shorts). */

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
    tagline: "Ditodio 통합 체험",
    priceMonthKrw: 0,
    priceYearKrw: null,
    monthlyCredits: 3,
    maxSourceMinutes: 10,
    features: [
      { label: "쇼츠 3개/월", included: true, detail: "렌더 완료 시 1회 차감 (Ditodio)" },
      { label: "블로그 포스트 15개/월", included: true, detail: "허브(app)에서 공유" },
      { label: "소스 영상 최대 10분", included: true },
      { label: "블로그 → 쇼츠", included: true },
      { label: "워터마크", included: true },
      { label: "프리미엄 스타일", included: false },
    ],
  },
  {
    id: "lite",
    name: "Lite",
    tagline: "개인·소상공인 통합 플랜",
    priceMonthKrw: 29_000,
    priceYearKrw: 290_000,
    monthlyCredits: 20,
    maxSourceMinutes: 30,
    highlighted: true,
    features: [
      { label: "쇼츠 20개/월", included: true },
      { label: "블로그 포스트 60개/월", included: true },
      { label: "소스 영상 최대 30분", included: true },
      { label: "워터마크 없음", included: true },
      { label: "프리미엄 스타일·BGM", included: true },
      { label: "테마 5개", included: true },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "대행·헤비 워크플로",
    priceMonthKrw: 79_000,
    priceYearKrw: 790_000,
    monthlyCredits: 80,
    maxSourceMinutes: 120,
    features: [
      { label: "쇼츠 80개/월", included: true },
      { label: "블로그 포스트 200개/월", included: true },
      { label: "소스 영상 최대 120분", included: true },
      { label: "워터마크 없음", included: true },
      { label: "프리미엄 스타일·BGM", included: true },
      { label: "테마 30개", included: true },
    ],
  },
];

export function formatKrw(amount: number): string {
  if (amount <= 0) return "무료";
  return `${amount.toLocaleString("ko-KR")}원`;
}
