import { signOut, User } from 'firebase/auth';
import { auth } from '../services/firebase';
import { clearPendingStaffProfile } from './staffLoginSession';
import { clearPersistedStaffSession } from './persistedStaffSession';
import { disableStaffAutoLoginPrefs } from './staffLoginPreferences';
import {
  resolveStaffTenantProfile,
  upsertStaffUserProfile,
  type ResolvedStaffProfile,
} from './resolveStaffTenantProfile';

const PROFILE_RETRY_ATTEMPTS = 4;
const PROFILE_RETRY_BASE_MS = 120;

/** Firestore users 프로필 저장 — AuthContext·LoginPage 경합 시 재시도 */
export async function retryStaffProfileUpsert(
  user: User,
  profile: ResolvedStaffProfile
): Promise<boolean> {
  for (let attempt = 0; attempt < PROFILE_RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, PROFILE_RETRY_BASE_MS * attempt));
    }
    try {
      const ok = await upsertStaffUserProfile(user, profile);
      if (ok) return true;
    } catch (err) {
      console.warn(`[StaffLoginRecovery] profile upsert attempt ${attempt + 1} failed:`, err);
    }
  }
  return false;
}

/** staff 목록·저장된 회사 정보로 tenantId 복구 시도 (모든 테넌트 공통) */
export async function healStaffProfileFromRecords(user: User): Promise<ResolvedStaffProfile | null> {
  const resolved = await resolveStaffTenantProfile(user);
  if (!resolved) return null;
  const ok = await retryStaffProfileUpsert(user, resolved);
  return ok ? resolved : null;
}

/** 자동 로그인 유지 해제 — 저장된 아이디·비밀번호 제거 */
export function disableStaffAutoLogin(): void {
  disableStaffAutoLoginPrefs();
}

/**
 * 프로필 연동 실패·불완전 세션 정리
 * - Firebase 로그아웃
 * - 자동 로그인·저장 자격증명·임시 프로필 제거
 */
export async function abortIncompleteStaffLogin(): Promise<void> {
  clearPendingStaffProfile();
  clearPersistedStaffSession();
  disableStaffAutoLogin();
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[StaffLoginRecovery] signOut failed:', err);
  }
}

export function isStaffInternalEmail(email?: string | null): boolean {
  return String(email || '').trim().toLowerCase().endsWith('@ez-hub.kr');
}
