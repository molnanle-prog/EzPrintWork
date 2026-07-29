import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getFirestore, setDoc } from 'firebase/firestore';
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

/** NAS + Firestore 하트비트 — 라이선스 매니저가 Firestore를 읽음 */
const PRESENCE_HEARTBEAT_MS = 120_000;

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
let presenceGatewayUrls: string[] = [];
let lastFirestoreMirrorAt = 0;

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

/** 라이선스 매니저용 — Firestore users/staff에 isOnline·lastActive 미러 */
async function mirrorPresenceToFirestore(user: PresenceUser, online: boolean): Promise<void> {
  if (!user.uid || !user.tenantId) return;
  const now = Date.now();
  // online=true 하트비트는 최소 45초 간격 (쿼터 절약). offline은 즉시.
  if (online && now - lastFirestoreMirrorAt < 45_000) return;
  lastFirestoreMirrorAt = now;

  const lastActive = new Date().toISOString();
  const payload = {
    isOnline: online,
    online,
    lastActive,
  };

  try {
    await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
  } catch (err) {
    console.warn('[Presence] Firestore users mirror failed:', err);
  }

  const staffIds = Array.from(
    new Set(
      [user.staffDocId, user.uid].filter((id): id is string => !!id && id.trim().length > 0)
    )
  );
  for (const staffId of staffIds) {
    try {
      await setDoc(doc(db, 'tenants', user.tenantId, 'staff', staffId), payload, { merge: true });
    } catch (err) {
      // staff 문서 id ≠ uid 이거나 rules 거부인 경우 — users 미러만으로도 대표자 표시 가능
      console.warn(`[Presence] Firestore staff/${staffId} mirror failed:`, err);
    }
  }
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

  // Electron에서 세션 claim 전에 online 쓰면 다른 PC 인수 결과를 덮을 수 있음 → NAS 생략
  const isDesktop = typeof window !== 'undefined' && !!(window as { electron?: unknown }).electron;
  if (!(isDesktop && online && !onlyIfSessionId)) {
    const ok = await presenceSessionService.upsertPresence({
      tenantId: user.tenantId,
      uid: user.uid,
      online,
      loginId: user.loginId,
      staffDocId: user.staffDocId,
      name: user.name,
      email: user.email,
      // heartbeat는 lastActive만 — session claim은 로그인 시에만
      sessionId: null,
      onlyIfSessionId,
      gatewayBaseUrl: presenceGatewayUrls.length > 0 ? presenceGatewayUrls : null,
    });
    if (!ok) {
      console.warn('[Presence] NAS/gateway write skipped (path or gateway unavailable)');
    }
  }
  // NAS 실패와 무관하게 매니저용 Firestore 미러는 시도
  await mirrorPresenceToFirestore(user, online);
}

export async function setPresenceOnline(user: PresenceUser): Promise<void> {
  presenceLastPayload = user;
  lastFirestoreMirrorAt = 0; // 로그인 직후는 즉시 미러
  try {
    await writePresence(user, true);
  } catch (err) {
    console.warn('[Presence] set online failed:', err);
  }
}

export async function setPresenceOffline(user?: PresenceUser | null): Promise<void> {
  const target = user || presenceLastPayload || presenceActiveUser;
  if (!target) return;
  lastFirestoreMirrorAt = 0;
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
  presenceHeartbeatTimer = setInterval(() => {
    // 백그라운드 탭이어도 매니저 표시용 Firestore 미러는 유지
    if (presenceActiveUser) void writePresence(presenceActiveUser, true);
  }, PRESENCE_HEARTBEAT_MS);
  window.addEventListener('pagehide', onPresencePageHide);
  window.addEventListener('beforeunload', onPresenceBeforeUnload);
}

export function stopPresenceSession(): void {
  if (presenceHeartbeatTimer) {
    clearInterval(presenceHeartbeatTimer);
    presenceHeartbeatTimer = null;
  }
  window.removeEventListener('pagehide', onPresencePageHide);
  window.removeEventListener('beforeunload', onPresenceBeforeUnload);
  presenceActiveUser = null;
}
