import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromCache, getDocFromServer, setDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
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

async function resolvePresenceStaffDocIds(user: PresenceUser): Promise<string[]> {
  const ids = new Set<string>([user.uid]);
  const loginId = user.loginId?.trim().toLowerCase();
  if (loginId) ids.add(loginId);

  try {
    const byUid = await getDocs(query(collection(db, `tenants/${user.tenantId}/staff`), where('uid', '==', user.uid), limit(5)));
    byUid.docs.forEach((d) => ids.add(d.id));
  } catch (err) {
    console.warn('[Presence] staff uid lookup failed:', err);
  }

  const email = user.email?.trim().toLowerCase();
  if (email) {
    try {
      const byEmail = await getDocs(query(collection(db, `tenants/${user.tenantId}/staff`), where('email', '==', email), limit(5)));
      byEmail.docs.forEach((d) => ids.add(d.id));
    } catch (err) {
      console.warn('[Presence] staff email lookup failed:', err);
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
        { uid: user.uid, ...(user.name ? { name: user.name } : {}), ...fields },
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

const onPresenceVisibility = () => {
  if (presenceActiveUser && document.visibilityState === 'visible') {
    void setPresenceOnline(presenceActiveUser);
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
}

export function stopPresenceSession(): void {
  if (presenceHeartbeat) {
    clearInterval(presenceHeartbeat);
    presenceHeartbeat = null;
  }
  document.removeEventListener('visibilitychange', onPresenceVisibility);
  window.removeEventListener('pagehide', onPresencePageHide);
  presenceActiveUser = null;
}
