/** 직원 계정 단일 접속 — activeSessionId로 동시 로그인 방지 */

export const STAFF_SESSION_STORAGE_KEY = 'ezprint_staff_session_id';

const SESSION_STALE_MS = 2 * 60 * 1000;

export function getLocalStaffSessionId(): string | null {
  try {
    return sessionStorage.getItem(STAFF_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setLocalStaffSessionId(sessionId: string): void {
  sessionStorage.setItem(STAFF_SESSION_STORAGE_KEY, sessionId);
}

export function clearLocalStaffSessionId(): void {
  sessionStorage.removeItem(STAFF_SESSION_STORAGE_KEY);
}

export function createStaffSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type StaffSessionRecord = {
  activeSessionId?: string;
  isOnline?: boolean;
  online?: boolean;
  lastActive?: string;
};

/** 다른 기기에서 같은 계정으로 활성 접속 중인지 (본인 세션 제외) */
export function isRemoteStaffSessionActive(
  record: StaffSessionRecord | null | undefined,
  localSessionId?: string | null
): boolean {
  if (!record?.activeSessionId) return false;
  if (localSessionId && record.activeSessionId === localSessionId) return false;

  const online = record.isOnline === true || record.online === true;
  if (!online) return false;

  const last = record.lastActive;
  if (!last) return true;

  const ts = new Date(last).getTime();
  return Number.isFinite(ts) && Date.now() - ts < SESSION_STALE_MS;
}

export function staffSessionFirestoreFields(sessionId: string) {
  const now = new Date().toISOString();
  return {
    activeSessionId: sessionId,
    activeSessionAt: now,
  };
}

export async function claimStaffSessionOnFirestore(
  db: import('firebase/firestore').Firestore,
  opts: { uid: string; tenantId: string; staffDocId: string; sessionId: string }
): Promise<void> {
  const { doc, setDoc } = await import('firebase/firestore');
  const sessionFields = staffSessionFirestoreFields(opts.sessionId);
  const now = new Date().toISOString();
  const presence = { isOnline: true, online: true, lastActive: now, ...sessionFields };

  await setDoc(doc(db, 'users', opts.uid), presence, { merge: true });
  await setDoc(doc(db, `tenants/${opts.tenantId}/staff`, opts.staffDocId), {
    uid: opts.uid,
    active: true,
    ...presence,
  }, { merge: true });
}
