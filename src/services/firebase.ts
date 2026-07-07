import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
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

const PRESENCE_STAFF_CACHE_TTL_MS = 30 * 60_000;

export type PresenceUser = {
  uid: string;
  tenantId: string;
  email?: string | null;
  loginId?: string | null;
  name?: string | null;
};

let presenceActiveUser: PresenceUser | null = null;
let presenceLastPayload: PresenceUser | null = null;
let cachedStaffDocIds: { tenantId: string; uid: string; ids: string[]; at: number } | null = null;

const presenceNow = () => new Date().toISOString();

const presenceFields = (online: boolean) => ({
  isOnline: online,
  online,
  lastActive: presenceNow(),
  ...(online ? { lastLogin: presenceNow(), lastCheckIn: presenceNow() } : { lastLogout: presenceNow() }),
});

/** 로그인 시 1회 staff 문서 ID 확인 후 캐시 — heartbeat마다 반복 조회 금지 */
async function resolvePresenceStaffDocIds(user: PresenceUser): Promise<string[]> {
  const now = Date.now();
  if (
    cachedStaffDocIds &&
    cachedStaffDocIds.tenantId === user.tenantId &&
    cachedStaffDocIds.uid === user.uid &&
    now - cachedStaffDocIds.at < PRESENCE_STAFF_CACHE_TTL_MS
  ) {
    return cachedStaffDocIds.ids;
  }

  const ids = new Set<string>();
  const staffCol = collection(db, `tenants/${user.tenantId}/staff`);

  try {
    const uidDoc = await getDocFromServer(doc(db, `tenants/${user.tenantId}/staff`, user.uid));
    if (uidDoc.exists()) ids.add(user.uid);
  } catch (err) {
    console.warn('[Presence] staff uid doc lookup failed:', err);
  }

  if (ids.size === 0) {
    try {
      const byUid = await getDocs(query(staffCol, where('uid', '==', user.uid), limit(3)));
      byUid.docs.forEach((d) => ids.add(d.id));
    } catch (err) {
      console.warn('[Presence] staff uid query failed:', err);
    }
  }

  const loginId = user.loginId?.trim().toLowerCase();
  if (ids.size === 0 && loginId) {
    try {
      const byLogin = await getDocs(query(staffCol, where('loginId', '==', loginId), limit(3)));
      byLogin.docs.forEach((d) => ids.add(d.id));
    } catch (err) {
      console.warn('[Presence] staff loginId query failed:', err);
    }
  }

  const resolved = [...ids];
  cachedStaffDocIds = { tenantId: user.tenantId, uid: user.uid, ids: resolved, at: now };
  return resolved;
}

async function writePresence(user: PresenceUser, online: boolean): Promise<void> {
  const fields = presenceFields(online);
  const tasks: Promise<void>[] = [
    setDoc(doc(db, 'users', user.uid), { uid: user.uid, email: user.email || '', ...fields }, { merge: true }).then(() => undefined),
  ];

  const staffIds = await resolvePresenceStaffDocIds(user);
  for (const staffId of staffIds) {
    tasks.push(
      setDoc(
        doc(db, `tenants/${user.tenantId}/staff`, staffId),
        { uid: user.uid, ...fields },
        { merge: true }
      ).then(() => undefined)
    );
  }

  await Promise.allSettled(tasks).then((results) => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`[Presence] write failed (task ${index}):`, result.reason);
      }
    });
  });
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
  cachedStaffDocIds = null;
  void setPresenceOnline(user);
  window.addEventListener('pagehide', onPresencePageHide);
  window.addEventListener('beforeunload', onPresenceBeforeUnload);
}

export function stopPresenceSession(): void {
  window.removeEventListener('pagehide', onPresencePageHide);
  window.removeEventListener('beforeunload', onPresenceBeforeUnload);
  presenceActiveUser = null;
  cachedStaffDocIds = null;
}
