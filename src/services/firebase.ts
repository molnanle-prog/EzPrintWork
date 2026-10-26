import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { presenceSessionService } from './presenceSessionService';

export const firebaseConfig = {
  "projectId": "gen-lang-client-0746903005",
  "appId": "1:19768956246:web:a6cc6b3ca6ffbd53e572f7",
  "apiKey": "AIzaSyB04AtEe56eeP40C4cDS7-uvvaPZHa3pkQ",
  "authDomain": "gen-lang-client-0746903005.firebaseapp.com",
  "firestoreDatabaseId": "ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755",
  "storageBucket": "gen-lang-client-0746903005.firebasestorage.app",
  "messagingSenderId": "19768956246",
  "measurementId": ""
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const storage = getStorage(app);

/** NAS 하트비트 — 사내 NAS/게이트웨이 전용이므로 Firestore 비용 0원. 30초 주기로 실시간성 강화 */
const PRESENCE_HEARTBEAT_MS = 30_000;

export type PresenceUser = {
  uid: string;
  tenantId: string;
  email?: string | null;
  loginId?: string | null;
  name?: string | null;
  staffDocId?: string | null;
};

let presenceActiveUser: PresenceUser | null = null;
let presenceLastPayload: PresenceUser | null = null;
let presenceHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let presenceWarmupTimers: Array<ReturnType<typeof setTimeout>> = [];
let presenceGatewayUrls: string[] = [];

export function setPresenceGatewayUrls(urls: string[] | string | null | undefined): void {
  if (urls == null) {
    presenceGatewayUrls = [];
    return;
  }
  if (typeof urls === 'string') {
    const base = urls.trim().replace(/\/$/, '');
    presenceGatewayUrls = base ? [base] : [];
    return;
  }
  presenceGatewayUrls = urls
    .map((url) => url?.trim().replace(/\/$/, '') || '')
    .filter(Boolean);
}

export function setPresenceGatewayUrl(url: string | null | undefined): void {
  setPresenceGatewayUrls(url);
}

async function writePresence(user: PresenceUser, online: boolean): Promise<void> {
  // 하트비트/오프라인은 내 sessionId일 때만 — 다른 PC가 인수한 뒤 예전 내용으로 덮어쓰기 방지
  let onlyIfSessionId: string | null = null;
  try {
    const { getLocalStaffSessionId } = await import('../utils/staffSession');
    onlyIfSessionId = getLocalStaffSessionId();
  } catch {
    onlyIfSessionId = null;
  }

  // 초기 구동 시점에 staffDocId나 gatewayUrls가 아직 로드 전이었을 수 있으므로 동적으로 보강
  let resolvedStaffDocId = user.staffDocId;
  let resolvedGatewayUrls = presenceGatewayUrls;
  try {
    const { db: dataService } = await import('./dataService');
    if (!resolvedGatewayUrls.length) {
      const latestGw = dataService.getStoreGatewayUrls();
      if (latestGw?.length) resolvedGatewayUrls = latestGw;
    }
    if (!resolvedStaffDocId) {
      const staffList = dataService.getStaff();
      const matched = staffList.find(
        (s) =>
          (s.uid && s.uid === user.uid) ||
          (user.loginId && String((s as any).loginId || '').toLowerCase() === user.loginId.toLowerCase()) ||
          (user.email && String(s.email || '').toLowerCase() === user.email.toLowerCase())
      );
      if (matched?.id) resolvedStaffDocId = matched.id;
    }
  } catch {
    /* ignore */
  }

  // Electron에서 세션 claim 전에 online 쓰면 다른 PC 인수 결과를 덮을 수 있음 → NAS 생략
  const isDesktop = typeof window !== 'undefined' && !!(window as { electron?: unknown }).electron;
  if (!(isDesktop && online && !onlyIfSessionId)) {
    const ok = await presenceSessionService.upsertPresence({
      tenantId: user.tenantId,
      uid: user.uid,
      online,
      loginId: user.loginId,
      staffDocId: resolvedStaffDocId,
      name: user.name,
      email: user.email,
      // heartbeat는 lastActive만 — session claim은 로그인 시에만
      sessionId: null,
      onlyIfSessionId,
      gatewayBaseUrl: resolvedGatewayUrls.length > 0 ? resolvedGatewayUrls : null,
    });
    if (!ok) {
      console.warn('[Presence] NAS/gateway write skipped (path or gateway unavailable)');
    }
  }
}

export async function setPresenceOnline(user: PresenceUser): Promise<void> {
  presenceLastPayload = user;
  try {
    await writePresence(user, true);
  } catch (err) {
    console.warn('[Presence] set online failed:', err);
  }
}

export async function setPresenceOffline(user?: PresenceUser | null): Promise<void> {
  const target = user || presenceLastPayload || presenceActiveUser;
  if (!target) return;
  try {
    await writePresence(target, false);
  } catch (err) {
    console.warn('[Presence] set offline failed:', err);
  }
}

const onPresencePageHide = () => {
  // Electron 창 전환·최소화는 종료가 아님 — 웹 탭 종료(pagehide)에만 offline
  if (typeof window !== 'undefined' && window.electron) return;
  void setPresenceOffline();
};

const onPresenceBeforeUnload = () => {
  if (typeof window !== 'undefined' && window.electron) return;
  void setPresenceOffline();
};

export function startPresenceSession(user: PresenceUser): void {
  stopPresenceSession();
  presenceActiveUser = user;
  void setPresenceOnline(user);
  // 초기 로그인 시 NAS 경로/직원 목록이 1~3초 뒤 로드되는 현상 대응: 3초, 8초 후 즉시 보강 기록
  presenceWarmupTimers = [
    setTimeout(() => {
      if (presenceActiveUser) void writePresence(presenceActiveUser, true);
    }, 3_000),
    setTimeout(() => {
      if (presenceActiveUser) void writePresence(presenceActiveUser, true);
    }, 8_000),
  ];
  presenceHeartbeatTimer = setInterval(() => {
    // 크래시/비정상 종료 대비 — NAS lastActive만 갱신
    if (presenceActiveUser) void writePresence(presenceActiveUser, true);
  }, PRESENCE_HEARTBEAT_MS);
  window.addEventListener('pagehide', onPresencePageHide);
  window.addEventListener('beforeunload', onPresenceBeforeUnload);
}

export function stopPresenceSession(): void {
  for (const t of presenceWarmupTimers) {
    clearTimeout(t);
  }
  presenceWarmupTimers = [];
  if (presenceHeartbeatTimer) {
    clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }
  window.removeEventListener('pagehide', onPresencePageHide);
  window.removeEventListener('beforeunload', onPresenceBeforeUnload);
  presenceActiveUser = null;
}
