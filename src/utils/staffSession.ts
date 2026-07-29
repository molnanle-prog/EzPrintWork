/** 직원 계정 단일 접속 — NAS presence-sessions.json 기준 (Firestore 폴백 없음) */

import type { StoreGatewayInput } from './storeGatewayUrls';

export const STAFF_SESSION_STORAGE_KEY = 'ezprint_staff_session_id';
export const STAFF_SESSION_CLAIMED_AT_KEY = 'ezprint_staff_session_claimed_at';
export const STAFF_SESSION_PERSIST_KEY = 'ezprint_staff_session_id_persist';
export const STAFF_SESSION_CLAIMED_AT_PERSIST_KEY = 'ezprint_staff_session_claimed_at_persist';
export const MACHINE_ID_KEY = 'ezpw_machine_id';

/** heartbeat 2분 + 여유 — NAS lastActive 기준 */
export const SESSION_STALE_MS = 5 * 60 * 1000;

/** 이 PC 고유 ID — 같은 기기 재실행 유령 세션과 다른 PC 로그인 구분 */
export function getOrCreateMachineId(): string {
  try {
    let id = localStorage.getItem(MACHINE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `machine-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(MACHINE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'unknown-machine';
  }
}

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
  /** electron만 단일접속 킥 대상. 웹/미기록은 킥하지 않음 */
  clientType?: 'electron' | 'web';
  /** 같은 PC 재로그인 시 유령 세션 오탐 방지 */
  machineId?: string | null;
};

/** 결제창 진행 중 — 중복로그인 킥 일시 중지 (localStorage: 새로고침·HMR에도 유지) */
export const PAYMENT_IN_PROGRESS_KEY = 'ezpw_payment_in_progress';
export const PAYMENT_IN_PROGRESS_UNTIL_KEY = 'ezpw_payment_in_progress_until';

/** 로그인 중 세션 인수 확인 대기 — 백그라운드 claim/킥 중지 */
export const SESSION_CLAIM_PENDING_KEY = 'ezpw_session_claim_pending';

/** force claim 직후 킥 유예 (ms) — 반대편 하트비트/레이스로 승자가 쫓겨나는 것 방지 */
export const SESSION_CLAIM_GRACE_UNTIL_KEY = 'ezpw_session_claim_grace_until';
const DEFAULT_CLAIM_GRACE_MS = 3 * 60 * 1000;
const DEFAULT_PAYMENT_GUARD_MS = 15 * 60 * 1000;

export function setPaymentInProgress(active: boolean, guardMs = DEFAULT_PAYMENT_GUARD_MS): void {
  try {
    if (active) {
      const until = String(Date.now() + guardMs);
      sessionStorage.setItem(PAYMENT_IN_PROGRESS_KEY, '1');
      localStorage.setItem(PAYMENT_IN_PROGRESS_KEY, '1');
      localStorage.setItem(PAYMENT_IN_PROGRESS_UNTIL_KEY, until);
    } else {
      sessionStorage.removeItem(PAYMENT_IN_PROGRESS_KEY);
      localStorage.removeItem(PAYMENT_IN_PROGRESS_KEY);
      localStorage.removeItem(PAYMENT_IN_PROGRESS_UNTIL_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function isPaymentInProgress(): boolean {
  try {
    if (sessionStorage.getItem(PAYMENT_IN_PROGRESS_KEY) === '1') return true;
    if (localStorage.getItem(PAYMENT_IN_PROGRESS_KEY) !== '1') return false;
    const until = Number(localStorage.getItem(PAYMENT_IN_PROGRESS_UNTIL_KEY) || 0);
    if (Number.isFinite(until) && until > 0 && Date.now() > until) {
      setPaymentInProgress(false);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function touchSessionClaimGrace(graceMs = DEFAULT_CLAIM_GRACE_MS): void {
  try {
    localStorage.setItem(SESSION_CLAIM_GRACE_UNTIL_KEY, String(Date.now() + graceMs));
  } catch {
    /* ignore */
  }
}

export function isWithinSessionClaimGrace(): boolean {
  try {
    const until = Number(localStorage.getItem(SESSION_CLAIM_GRACE_UNTIL_KEY) || 0);
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

/** 결제·로그인 인수·claim 직후 — 중복로그인 킥/강제로그아웃 금지 */
export function shouldSuppressSessionKick(): boolean {
  return isPaymentInProgress() || isSessionClaimPending() || isWithinSessionClaimGrace();
}

export function setSessionClaimPending(active: boolean): void {
  try {
    if (active) sessionStorage.setItem(SESSION_CLAIM_PENDING_KEY, '1');
    else sessionStorage.removeItem(SESSION_CLAIM_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function isSessionClaimPending(): boolean {
  try {
    return sessionStorage.getItem(SESSION_CLAIM_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

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

/** 다른 기기에서 같은 계정으로 활성 접속 중인지 (본인 세션·같은 PC 유령 제외) */
export function isRemoteStaffSessionActive(
  record: StaffSessionRecord | null | undefined,
  localSessionId?: string | null
): boolean {
  if (!record?.activeSessionId) return false;
  if (localSessionId && record.activeSessionId === localSessionId) return false;
  // 같은 PC에서 Electron을 재실행한 유령 세션 — 다른 곳 로그인으로 보지 않음
  if (record.machineId && record.machineId === getOrCreateMachineId()) return false;
  if (record.clientType && record.clientType !== 'electron') return false;
  // machineId 없는 구형 기록: 2분 지나면 유령으로 보고 확인창 생략
  if (!record.machineId) {
    return resolveStaffOnline(record, 2 * 60 * 1000);
  }
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
  // 예전 브라우저 claim·웹 세션은 Electron을 쫓아내지 않음
  if (record.clientType !== 'electron') return false;
  // 같은 PC 유령/재시작 — 자기 자신을 킥하지 않음
  if (record.machineId && record.machineId === getOrCreateMachineId()) return false;

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

/** NAS/게이트웨이에 세션 claim — Firestore 미사용 */
export async function claimStaffSessionOnNas(opts: {
  uid: string;
  tenantId: string;
  staffDocId: string;
  sessionId: string;
  loginId?: string | null;
  name?: string | null;
  email?: string | null;
  gatewayBaseUrl?: StoreGatewayInput;
  /** true: 로그인 시 기존 접속을 이 기기로 가져옴. false: 이미 다른 Electron이 있으면 덮어쓰지 않음 */
  force?: boolean;
}): Promise<boolean> {
  const { presenceSessionService } = await import('../services/presenceSessionService');
  return presenceSessionService.claimSession({
    tenantId: opts.tenantId,
    uid: opts.uid,
    sessionId: opts.sessionId,
    staffDocId: opts.staffDocId,
    loginId: opts.loginId,
    name: opts.name,
    email: opts.email,
    gatewayBaseUrl: opts.gatewayBaseUrl,
    force: opts.force,
  });
}

/** @deprecated claimStaffSessionOnNas 사용 */
export async function claimStaffSessionOnFirestore(
  _db: import('firebase/firestore').Firestore,
  opts: { uid: string; tenantId: string; staffDocId: string; sessionId: string; loginId?: string | null }
): Promise<void> {
  const ok = await claimStaffSessionOnNas(opts);
  if (!ok) {
    console.warn('[StaffSession] NAS claim skipped — archive path/gateway unavailable');
  }
}

/** NAS/게이트웨이 오프라인 표시 — onlyIfSessionId면 내 세션일 때만 */
export async function releaseStaffSessionOnNas(opts: {
  uid: string;
  tenantId: string;
  email?: string | null;
  loginId?: string | null;
  onlyIfSessionId?: string | null;
  gatewayBaseUrl?: StoreGatewayInput;
}): Promise<boolean> {
  const { presenceSessionService } = await import('../services/presenceSessionService');
  return presenceSessionService.releaseSession(opts);
}

/** @deprecated releaseStaffSessionOnNas 사용 */
export async function releaseStaffSessionOnFirestore(
  _db: import('firebase/firestore').Firestore,
  opts: { uid: string; tenantId: string; email?: string | null; name?: string | null; loginId?: string | null }
): Promise<void> {
  const ok = await releaseStaffSessionOnNas(opts);
  if (!ok) {
    console.warn('[StaffSession] NAS release skipped — archive path/gateway unavailable');
  }
}
