/** 직원 계정 단일 접속 — activeSessionId로 동시 로그인 방지 */

export const STAFF_SESSION_STORAGE_KEY = 'ezprint_staff_session_id';
export const STAFF_SESSION_CLAIMED_AT_KEY = 'ezprint_staff_session_claimed_at';
export const STAFF_SESSION_PERSIST_KEY = 'ezprint_staff_session_id_persist';
export const STAFF_SESSION_CLAIMED_AT_PERSIST_KEY = 'ezprint_staff_session_claimed_at_persist';

export const SESSION_STALE_MS = 2 * 60 * 1000;

export function getLocalStaffSessionId(): string | null {
  try {
    return sessionStorage.getItem(STAFF_SESSION_STORAGE_KEY)
      || localStorage.getItem(STAFF_SESSION_PERSIST_KEY);
  } catch {
    return null;
  }
}

export function getLocalStaffSessionClaimedAt(): string | null {
  try {
    return sessionStorage.getItem(STAFF_SESSION_CLAIMED_AT_KEY)
      || localStorage.getItem(STAFF_SESSION_CLAIMED_AT_PERSIST_KEY);
  } catch {
    return null;
  }
}

export function setLocalStaffSessionId(sessionId: string, persist = false): void {
  const claimedAt = new Date().toISOString();
  sessionStorage.setItem(STAFF_SESSION_STORAGE_KEY, sessionId);
  sessionStorage.setItem(STAFF_SESSION_CLAIMED_AT_KEY, claimedAt);
  if (persist) {
    localStorage.setItem(STAFF_SESSION_PERSIST_KEY, sessionId);
    localStorage.setItem(STAFF_SESSION_CLAIMED_AT_PERSIST_KEY, claimedAt);
  }
}

export function clearLocalStaffSessionId(): void {
  sessionStorage.removeItem(STAFF_SESSION_STORAGE_KEY);
  sessionStorage.removeItem(STAFF_SESSION_CLAIMED_AT_KEY);
  localStorage.removeItem(STAFF_SESSION_PERSIST_KEY);
  localStorage.removeItem(STAFF_SESSION_CLAIMED_AT_PERSIST_KEY);
}

export function createStaffSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type StaffSessionRecord = {
  activeSessionId?: string;
  activeSessionAt?: string;
  isOnline?: boolean;
  online?: boolean;
  lastActive?: string;
};

/** heartbeat 기준 실제 접속 중 여부 (관리 프로그램·로그인 충돌 판정 공통) */
export function resolveStaffOnline(
  record: StaffSessionRecord | null | undefined,
  staleMs = SESSION_STALE_MS
): boolean {
  const online = record?.isOnline === true || record?.online === true;
  if (!online) return false;

  const last = record?.lastActive || record?.activeSessionAt;
  if (!last) return false;

  const ts = new Date(last).getTime();
  return Number.isFinite(ts) && Date.now() - ts < staleMs;
}

/** 다른 기기에서 같은 계정으로 활성 접속 중인지 (본인 세션 제외) */
export function isRemoteStaffSessionActive(
  record: StaffSessionRecord | null | undefined,
  localSessionId?: string | null
): boolean {
  if (!record?.activeSessionId) return false;
  if (localSessionId && record.activeSessionId === localSessionId) return false;
  return resolveStaffOnline(record);
}

/** 원격 세션이 로컬보다 더 최신인지 (kick 판정용) */
export function isRemoteSessionNewerThanLocal(
  record: StaffSessionRecord | null | undefined,
  localSessionId?: string | null,
  localClaimedAt?: string | null
): boolean {
  if (!record?.activeSessionId) return false;
  if (localSessionId && record.activeSessionId === localSessionId) return false;

  const remoteAt = record.activeSessionAt || record.lastActive;
  if (!localClaimedAt || !remoteAt) {
    return resolveStaffOnline(record);
  }

  const remoteTs = new Date(remoteAt).getTime();
  const localTs = new Date(localClaimedAt).getTime();
  if (!Number.isFinite(remoteTs) || !Number.isFinite(localTs)) {
    return resolveStaffOnline(record);
  }

  return remoteTs > localTs && resolveStaffOnline(record);
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

export async function releaseStaffSessionOnFirestore(
  db: import('firebase/firestore').Firestore,
  opts: { uid: string; tenantId: string; email?: string | null; name?: string | null }
): Promise<void> {
  const { doc, setDoc, collection, query, where, getDocs, limit } = await import('firebase/firestore');
  const now = new Date().toISOString();
  const offline = {
    isOnline: false,
    online: false,
    lastActive: now,
    lastLogout: now,
  };

  await setDoc(doc(db, 'users', opts.uid), {
    uid: opts.uid,
    email: opts.email || '',
    ...offline,
  }, { merge: true });

  const staffIds = new Set<string>([opts.uid]);
  try {
    const byUid = await getDocs(
      query(collection(db, `tenants/${opts.tenantId}/staff`), where('uid', '==', opts.uid), limit(5))
    );
    byUid.docs.forEach((d) => staffIds.add(d.id));
  } catch {
    /* optional */
  }

  await Promise.allSettled(
    [...staffIds].map((staffId) =>
      setDoc(
        doc(db, `tenants/${opts.tenantId}/staff`, staffId),
        { uid: opts.uid, ...(opts.name ? { name: opts.name } : {}), ...offline },
        { merge: true }
      )
    )
  );
}
