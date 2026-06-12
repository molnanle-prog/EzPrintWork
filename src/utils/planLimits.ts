const STATIC_PLAN_MAX: Record<string, number> = {
  free: 1,
  ad: 1,
  lite: 3,
  pro: 10,
  pro_plus: 999,
  service: 999,
};

export const getMaxStaffForPlan = (
  rawPlan?: string | null,
  paymentStatus?: string | null
): number => {
  const plan = String(rawPlan || 'free').toLowerCase();
  const pay = String(paymentStatus || 'UNPAID').toUpperCase();
  if (pay !== 'PAID' && pay !== 'FREE') {
    return STATIC_PLAN_MAX.ad;
  }

  const teamMatch = plan.match(/^u(\d+)$/);
  if (teamMatch) {
    const n = parseInt(teamMatch[1], 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }

  return STATIC_PLAN_MAX[plan] ?? STATIC_PLAN_MAX.free;
};

export const mapWebPlanToFirestore = (plan: string): string => {
  if (plan === 'service') return 'pro_plus';
  if (plan === 'ad') return 'free';
  return plan || 'free';
};