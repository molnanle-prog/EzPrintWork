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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const storage = getStorage(app);

/** NAS presence 하트비트 — Firestore 쿼터와 무관 */
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
let presenceGatewayUrl: string | null = null;

export function setPresenceGatewayUrl(url: string | null | undefined): void {
  presenceGatewayUrl = url?.trim().replace(/\/$/, '') || null;
}

async function writePresence(user: PresenceUser, online: boolean): Promise<void> {
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
    gatewayBaseUrl: presenceGatewayUrl,
  });
  if (!ok) {
    console.warn('[Presence] NAS/gateway write skipped (path or gateway unavailable)');
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

const onPresencePageHide = () => { void setPresenceOffline(); };

const onPresenceBeforeUnload = () => { void setPresenceOffline(); };

export function startPresenceSession(user: PresenceUser): void {
  stopPresenceSession();
  presenceActiveUser = user;
  void setPresenceOnline(user);
  presenceHeartbeatTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
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
