export const PENDING_STAFF_PROFILE_KEY = 'pendingStaffTenantProfile';

export interface PendingStaffProfile {
  tenantId: string;
  loginId: string;
  name: string;
  role: 'admin' | 'staff' | 'superadmin';
  staffDocId: string;
  email: string;
}

export function setPendingStaffProfile(profile: PendingStaffProfile): void {
  sessionStorage.setItem(PENDING_STAFF_PROFILE_KEY, JSON.stringify(profile));
}

export function readPendingStaffProfile(email?: string | null, loginId?: string | null): PendingStaffProfile | null {
  try {
    const raw = sessionStorage.getItem(PENDING_STAFF_PROFILE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw) as PendingStaffProfile;
    const emailNorm = email?.trim().toLowerCase();
    const loginNorm = loginId?.trim().toLowerCase();
    if (emailNorm && profile.email !== emailNorm) {
      if (!loginNorm || profile.loginId !== loginNorm) return null;
    }
    return profile;
  } catch {
    return null;
  }
}

export function clearPendingStaffProfile(): void {
  sessionStorage.removeItem(PENDING_STAFF_PROFILE_KEY);
}
