import { AppUser } from '../types';
import { isStaffKeepLoggedIn } from './staffLoginPreferences';

export type PersistedStaffSession = {
  user: AppUser;
  plan: 'free' | 'pro';
  planCode: string;
  paymentStatus?: string;
};

export function readPersistedStaffSession(): PersistedStaffSession | null {
  if (!isStaffKeepLoggedIn()) return null;

  try {
    const raw = localStorage.getItem('customUser');
    if (!raw) return null;

    const user = JSON.parse(raw) as AppUser;
    if (!user?.tenantId || !user?.uid) return null;

    const plan = (localStorage.getItem('customTenantPlan') as 'free' | 'pro') || 'free';
    const planCode = localStorage.getItem('customTenantPlanCode') || plan;
    const paymentStatus = localStorage.getItem('customTenantPaymentStatus') || undefined;

    return { user, plan, planCode, paymentStatus };
  } catch {
    return null;
  }
}

export function writePersistedStaffSession(
  user: AppUser,
  plan: 'free' | 'pro',
  planCode?: string,
  paymentStatus?: string
): void {
  if (!isStaffKeepLoggedIn()) return;

  localStorage.setItem('customUser', JSON.stringify(user));
  localStorage.setItem('customTenantPlan', plan);
  localStorage.setItem('customTenantPlanCode', planCode || plan);
  if (paymentStatus) {
    localStorage.setItem('customTenantPaymentStatus', paymentStatus);
  }
}

export function clearPersistedStaffSession(): void {
  localStorage.removeItem('customUser');
  localStorage.removeItem('customTenantPlan');
  localStorage.removeItem('customTenantPlanCode');
  localStorage.removeItem('customTenantPaymentStatus');
  sessionStorage.removeItem('customUser');
  sessionStorage.removeItem('customTenantPlan');
  sessionStorage.removeItem('customTenantPlanCode');
}
