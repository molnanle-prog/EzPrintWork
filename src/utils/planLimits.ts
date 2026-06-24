const STATIC_PLAN_MAX: Record<string, number> = {
  free: 3,
  ad: 3,
  lite: 3,
  pro: 10,
  pro_plus: 999,
  service: 999,
};

/** 앱 요금제 3종: gift=무료(선물·광고없음), ad=광고형, paid=PRO(유료·광고없음) */
export type PlanTier = 'gift' | 'ad' | 'paid';

const AD_TIER_MAX = 3;

import { Staff } from '../types';
import { isHiddenStaffId, isTenantOwnerUser } from './adminAccess';

/** staff에서 tenants.ownerId 추정 (createTenant: id === uid 인 대표) */
export function inferTenantOwnerIdFromStaff(staffList: Staff[]): string | null {
  const ownerLike = staffList.find(
    (s) => !s.isDeleted && s.uid && s.id === s.uid
  );
  return ownerLike?.uid ?? ownerLike?.id ?? null;
}

/** 대표 1석 포함 활성 인원 (대표가 staff 목록에 있어도 중복 집계하지 않음) */
export function countActiveStaffSeats(
  staffList: Staff[],
  ownerId?: string | null
): number {
  const resolvedOwner = ownerId ?? inferTenantOwnerIdFromStaff(staffList);
  const active = staffList.filter(
    (s) => !s.isDeleted && s.active !== false && !isHiddenStaffId(s.id)
  );
  const nonOwner = active.filter(
    (s) => !isTenantOwnerUser(s.uid || s.id, resolvedOwner)
  );
  return 1 + nonOwner.length;
}

export const paymentStatusToTier = (paymentStatus?: string | null): PlanTier => {
  const pay = String(paymentStatus || 'AD').toUpperCase();
  if (pay === 'FREE') return 'gift';
  if (pay === 'PAID') return 'paid';
  return 'ad'; // AD, UNPAID 등
};

export const tierToPaymentStatus = (tier: PlanTier): string => {
  if (tier === 'gift') return 'FREE';
  if (tier === 'paid') return 'PAID';
  return 'AD';
};

export const getTierLabel = (tier: PlanTier): string => {
  if (tier === 'gift') return '무료(선물)';
  if (tier === 'paid') return 'PRO(유료)';
  return '광고형';
};

/** 앱 설정 화면용 — gift(무료 선물)는 개발자 전용이라 사용자에게 노출하지 않음 */
export const getTenantFacingTierLabel = (tier: PlanTier): string => {
  if (tier === 'gift') return '특별 혜택';
  return getTierLabel(tier);
};

/** 테넌트 관리자가 앱에서 선택 가능한 플랜 (gift 제외) */
export const TENANT_SELECTABLE_PLAN_TIERS: Exclude<PlanTier, 'gift'>[] = ['ad', 'paid'];

/** 광고 표시 여부 — gift(FREE)·paid(PAID)는 광고 없음, ad(AD/UNPAID)만 광고 표시 */
export const isProPlan = (
  rawPlan?: string | null,
  paymentStatus?: string | null,
  licenseExpiresAt?: string | null
): boolean => {
  const pay = String(paymentStatus || 'AD').toUpperCase();

  if (pay === 'AD' || pay === 'UNPAID') return false;

  if (pay === 'FREE') return true;

  if (pay === 'PAID') {
    if (licenseExpiresAt) {
      const expireDate = new Date(licenseExpiresAt);
      if (!isNaN(expireDate.getTime()) && expireDate < new Date()) {
        return false;
      }
    }
    return true;
  }

  return false;
};

/** 광고형(AD/UNPAID)에서만 true — EzImpo 자체 광고·추후 AdSense 슬롯 표시 */
export const shouldShowTenantAds = (
  rawPlan?: string | null,
  paymentStatus?: string | null,
  licenseExpiresAt?: string | null
): boolean => !isProPlan(rawPlan, paymentStatus, licenseExpiresAt);

export const getMaxStaffForPlan = (
  rawPlan?: string | null,
  paymentStatus?: string | null,
  storedMaxStaff?: number | null
): number => {
  const plan = String(rawPlan || 'free').toLowerCase();
  const pay = String(paymentStatus || 'AD').toUpperCase();

  if (pay === 'AD' || pay === 'UNPAID') {
    if (typeof storedMaxStaff === 'number' && Number.isFinite(storedMaxStaff) && storedMaxStaff >= 1) {
      return Math.min(Math.floor(storedMaxStaff), AD_TIER_MAX);
    }
    return AD_TIER_MAX;
  }

  const teamMatch = plan.match(/^u(\d+)$/);
  if (teamMatch) {
    const n = parseInt(teamMatch[1], 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }

  return STATIC_PLAN_MAX[plan] ?? STATIC_PLAN_MAX.lite;
};

export const getMaxStaffForTier = (tier: PlanTier, staffCount: number): number => {
  if (tier === 'ad') return Math.min(staffCount, AD_TIER_MAX);
  return staffCount;
};

/** 인원 수 + tier → Firestore plan 코드 */
export const staffCountToPlanCode = (staffCount: number, tier: PlanTier): string => {
  const n = Math.max(1, Math.min(999, staffCount));
  if (tier === 'ad') return 'lite';
  if (tier === 'gift' && n <= 3) return 'lite';
  if (tier === 'paid' && n <= 3) return `u${n}`;
  return `u${n}`;
};

/** Firestore plan 코드 → 표시용 최대 인원 (tier 없을 때 plan만으로 추정) */
export const planCodeToStaffCount = (rawPlan?: string | null): number => {
  const plan = String(rawPlan || 'free').toLowerCase();
  const teamMatch = plan.match(/^u(\d+)$/);
  if (teamMatch) {
    const n = parseInt(teamMatch[1], 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return STATIC_PLAN_MAX[plan] ?? STATIC_PLAN_MAX.lite;
};

export const mapWebPlanToFirestore = (plan: string): string => {
  if (plan === 'service') return 'pro_plus';
  if (plan === 'ad') return 'lite';
  return plan || 'lite';
};

export { AD_TIER_MAX };

/** PRO(유료) 모드 월 정액 — 인원 수와 무관 */
export const PRO_MONTHLY_PRICE = 1000;
