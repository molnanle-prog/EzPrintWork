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

// Connection test
async function testConnection() {
  try {
    const testDoc = doc(db, '_connection_test_', 'ping');
    await getDocFromServer(testDoc).catch(() => {});
    console.log("Firebase initialized successfully");
  } catch (error) {
    console.error("Firebase connection test failed:", error);
  }
}

// testConnection();

const PRESENCE_HEARTBEAT_MS = 45_000;

export type PresenceUser = {
  uid: string;
  tenantId: string;
  email?: string | null;
  loginId?: string | null;
  name?: string | null;
};

let presenceHeartbeat: ReturnType<typeof setInterval> | null = null;
let presenceActiveUser: PresenceUser | null = null;
let presenceLastPayload: PresenceUser | null = null;

const presenceNow = () => new Date().toISOString();

const presenceFields = (online: boolean) => ({
  isOnline: online,
  online,
  lastActive: presenceNow(),
  ...(online ? { lastLogin: presenceNow(), lastCheckIn: presenceNow() } : { lastLogout: presenceNow() }),
});

/** 실제 staff 문서 ID만 반환 — loginId/uid를 문서 ID로 착각해 유령 카드를 만들지 않음 */
async function resolvePresenceStaffDocIds(user: PresenceUser): Promise<string[]> {
  const ids = new Set<string>();
  const staffCol = collection(db, `tenants/${user.tenantId}/staff`);

  try {
    const uidDoc = await getDocFromServer(doc(db, `tenants/${user.tenantId}/staff`, user.uid));
    if (uidDoc.exists()) ids.add(user.uid);
  } catch (err) {
    console.warn('[Presence] staff uid doc lookup failed:', err);
  }

  try {
    const byUid = await getDocs(query(staffCol, where('uid', '==', user.uid), limit(10)));
    byUid.docs.forEach((d) => ids.add(d.id));
  } catch (err) {
    console.warn('[Presence] staff uid query failed:', err);
  }

  const loginId = user.loginId?.trim().toLowerCase();
  if (loginId) {
    try {
      const byLogin = await getDocs(query(staffCol, where('loginId', '==', loginId), limit(10)));
      byLogin.docs.forEach((d) => ids.add(d.id));
    } catch (err) {
      console.warn('[Presence] staff loginId query failed:', err);
    }
  }

  const email = user.email?.trim().toLowerCase();
  if (email) {
    try {
      const byEmail = await getDocs(query(staffCol, where('email', '==', email), limit(10)));
      byEmail.docs.forEach((d) => ids.add(d.id));
    } catch (err) {
      console.warn('[Presence] staff email query failed:', err);
    }
  }

  return [...ids];
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

const onPresenceVisibility = () => {
  if (!presenceActiveUser) return;
  if (document.visibilityState === 'visible') {
    void setPresenceOnline(presenceActiveUser);
  } else {
    void setPresenceOffline(presenceActiveUser);
  }
};

export function startPresenceSession(user: PresenceUser): void {
  stopPresenceSession();
  presenceActiveUser = user;
  void setPresenceOnline(user);
  presenceHeartbeat = setInterval(() => {
    if (presenceActiveUser && document.visibilityState === 'visible') {
      void setPresenceOnline(presenceActiveUser);
    }
  }, PRESENCE_HEARTBEAT_MS);
  document.addEventListener('visibilitychange', onPresenceVisibility);
  window.addEventListener('pagehide', onPresencePageHide);
  window.addEventListener('beforeunload', onPresenceBeforeUnload);
}

export function stopPresenceSession(): void {
  if (presenceHeartbeat) {
    clearInterval(presenceHeartbeat);
    presenceHeartbeat = null;
  }
  document.removeEventListener('visibilitychange', onPresenceVisibility);
  window.removeEventListener('pagehide', onPresencePageHide);
  window.removeEventListener('beforeunload', onPresenceBeforeUnload);
  presenceActiveUser = null;
}
