import { User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { resolveAppRoleFromStaff, normalizeStaffRecord } from './adminAccess';
import { readPendingStaffProfile } from './staffLoginSession';
import { STAFF_LOGIN_PREFS, loadStaffLoginPreferences } from './staffLoginPreferences';

export const STAFF_LOGIN_TENANT_KEY = 'staffLoginTenantId';

export type ResolvedStaffProfile = {
  tenantId: string;
  role: 'admin' | 'staff';
  name: string;
  loginId: string;
  staffDocId?: string;
};

export function rememberStaffLoginTenant(tenantId: string): void {
  sessionStorage.setItem(STAFF_LOGIN_TENANT_KEY, tenantId);
  const prefs = loadStaffLoginPreferences();
  if (prefs.rememberCompany || prefs.keepLoggedIn) {
    localStorage.setItem(STAFF_LOGIN_PREFS.savedTenantId, tenantId);
  }
}

export function readStaffLoginTenant(): string | null {
  return sessionStorage.getItem(STAFF_LOGIN_TENANT_KEY);
}

export type StaffAuthSnapshot = {
  jobTitle: string;
  isCompanyAdmin: boolean;
};

/** 로그인 사용자의 staff 문서 직책·사내관리자 여부 조회 — 중복 시 정보·권한 많은 문서 우선 */
export async function lookupStaffAuthSnapshot(
  tenantId: string,
  uid: string,
  loginId?: string | null
): Promise<StaffAuthSnapshot | null> {
  const staffCol = collection(db, `tenants/${tenantId}/staff`);
  const { scoreStaffRecord, isPlaceholderStaffName } = await import('./staffMatch');

  type Cand = { id: string; data: Record<string, unknown> };
  const candidates: Cand[] = [];
  const seen = new Set<string>();

  const pushCand = (id: string, data: Record<string, unknown>) => {
    if (seen.has(id)) return;
    if (data.isDeleted === true) return;
    seen.add(id);
    candidates.push({ id, data });
  };

  const toSnapshot = (id: string, data: Record<string, unknown>): StaffAuthSnapshot => {
    const normalized = normalizeStaffRecord({
      id: String(data.id || id),
      name: String(data.name || ''),
      role: String(data.role || data.position || ''),
      isCompanyAdmin: data.isCompanyAdmin === true,
      phone: String(data.phone || ''),
      avatarUrl: String(data.avatarUrl || ''),
      active: data.active !== false,
      email: String(data.email || ''),
      joinDate: String(data.joinDate || ''),
    });
    return {
      jobTitle: normalized.role,
      isCompanyAdmin: normalized.isCompanyAdmin === true,
    };
  };

  const scoreCand = (c: Cand) => {
    const s = {
      id: c.id,
      name: String(c.data.name || ''),
      role: String(c.data.role || c.data.position || ''),
      isCompanyAdmin: c.data.isCompanyAdmin === true,
      phone: String(c.data.phone || ''),
      phoneCompany: String(c.data.phoneCompany || ''),
      phoneOffice: String(c.data.phoneOffice || ''),
      avatarUrl: String(c.data.avatarUrl || ''),
      active: c.data.active !== false,
      email: String(c.data.email || ''),
      loginId: String(c.data.loginId || ''),
      uid: String(c.data.uid || ''),
      joinDate: String(c.data.joinDate || ''),
      extensionNumber: String(c.data.extensionNumber || ''),
      isDeleted: false,
    };
    let n = scoreStaffRecord(s as import('../types').Staff);
    if (c.data.isCompanyAdmin === true || c.data.role === 'admin') n += 80;
    if (c.id === uid && isPlaceholderStaffName(String(c.data.name || ''))) n -= 50;
    return n;
  };

  try {
    const uidDoc = await getDoc(doc(staffCol, uid));
    if (uidDoc.exists()) pushCand(uidDoc.id, uidDoc.data() as Record<string, unknown>);
  } catch (err) {
    console.warn('[StaffRole] uid lookup failed:', err);
  }

  try {
    const byUid = await getDocs(query(staffCol, where('uid', '==', uid), limit(5)));
    byUid.docs.forEach((d) => pushCand(d.id, d.data() as Record<string, unknown>));
  } catch (err) {
    console.warn('[StaffRole] uid field lookup failed:', err);
  }

  const normalizedLogin = loginId?.trim().toLowerCase();
  if (normalizedLogin) {
    try {
      const snap = await getDocs(query(staffCol, where('loginId', '==', normalizedLogin), limit(5)));
      snap.docs.forEach((d) => pushCand(d.id, d.data() as Record<string, unknown>));
    } catch (err) {
      console.warn('[StaffRole] loginId lookup failed:', err);
    }
  }

  if (candidates.length === 0) return null;

  const best = [...candidates].sort((a, b) => scoreCand(b) - scoreCand(a) || a.id.localeCompare(b.id))[0];
  return toSnapshot(best.id, best.data);
}

/** @deprecated lookupStaffAuthSnapshot 사용 */
export async function lookupStaffRecordRole(
  tenantId: string,
  uid: string,
  loginId?: string | null
): Promise<string | null> {
  const snapshot = await lookupStaffAuthSnapshot(tenantId, uid, loginId);
  return snapshot?.jobTitle ?? null;
}

export async function resolveStaffTenantProfile(user: User): Promise<ResolvedStaffProfile | null> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  let loginId = '';
  if (email.endsWith('@ez-hub.kr')) {
    loginId = email.split('@')[0].trim().toLowerCase();
  }

  const loginIdFromEmail = email.endsWith('@ez-hub.kr') ? email.split('@')[0].trim().toLowerCase() : '';
  const pending = readPendingStaffProfile(user.email, loginIdFromEmail || undefined);
  if (pending?.tenantId) {
    return {
      tenantId: pending.tenantId,
      role: pending.role === 'admin' ? 'admin' : 'staff',
      name: pending.name,
      loginId: pending.loginId,
      staffDocId: pending.staffDocId,
    };
  }

  if (!loginId && user.uid) {
    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.loginId) loginId = String(data.loginId).trim().toLowerCase();
        if (data.tenantId && loginId) {
          return {
            tenantId: data.tenantId,
            role: data.role === 'admin' ? 'admin' : 'staff',
            name: data.name || data.displayName || '사원',
            loginId,
            staffDocId: loginId,
          };
        }
      }
    } catch (err) {
      console.warn('[StaffHeal] users profile lookup failed:', err);
    }
  }

  if (!loginId) return null;

  const tenantHints = [
    readStaffLoginTenant(),
    localStorage.getItem(STAFF_LOGIN_PREFS.savedTenantId),
  ].filter((value, index, arr): value is string => !!value && arr.indexOf(value) === index);

  for (const tenantId of tenantHints) {
    try {
      const staffCol = collection(db, `tenants/${tenantId}/staff`);
      const snap = await getDocs(query(staffCol, where('loginId', '==', loginId), limit(10)));
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (data.isDeleted === true || data.active === false) continue;
        return {
          tenantId,
          role: resolveAppRoleFromStaff({
            role: String(data.role || data.position || ''),
            isCompanyAdmin: data.isCompanyAdmin === true,
          }),
          name: data.userName || data.name || '사원',
          loginId,
          staffDocId: docSnap.id,
        };
      }

      const byId = await getDoc(doc(db, `tenants/${tenantId}/staff`, loginId));
      if (byId.exists()) {
        const data = byId.data();
        if (data.isDeleted !== true && data.active !== false) {
          return {
            tenantId,
            role: resolveAppRoleFromStaff({
            role: String(data.role || data.position || ''),
            isCompanyAdmin: data.isCompanyAdmin === true,
          }),
            name: data.userName || data.name || '사원',
            loginId,
            staffDocId: byId.id,
          };
        }
      }
    } catch (err) {
      console.warn('[StaffHeal] tenant lookup failed:', tenantId, err);
    }
  }

  try {
    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('email', '==', email), limit(10))
    );
    for (const docSnap of usersSnap.docs) {
      const data = docSnap.data();
      if (!data.tenantId) continue;
      return {
        tenantId: data.tenantId,
        role: data.role === 'admin' ? 'admin' : 'staff',
        name: data.name || data.displayName || '사원',
        loginId: data.loginId || loginId,
        staffDocId: data.loginId || loginId,
      };
    }
  } catch (err) {
    console.warn('[StaffHeal] users email lookup failed:', err);
  }

  return null;
}

export async function upsertStaffUserProfile(
  user: User,
  profile: ResolvedStaffProfile
): Promise<boolean> {
  if (!user.uid) return false;

  const payload: Record<string, unknown> = {
    uid: user.uid,
    id: user.uid,
    email: user.email || `${profile.loginId}@ez-hub.kr`,
    displayName: profile.name,
    name: profile.name,
    tenantId: profile.tenantId,
    role: profile.role,
    loginId: profile.loginId,
    active: true,
  };
  // Firestore 규칙이 staff 문서와 대조해 role 상승을 검증할 때 사용
  if (profile.staffDocId) {
    payload.staffDocId = profile.staffDocId;
  }

  await setDoc(doc(db, 'users', user.uid), payload, { merge: true });

  if (profile.staffDocId) {
    try {
      await setDoc(
        doc(db, `tenants/${profile.tenantId}/staff`, profile.staffDocId),
        { uid: user.uid, active: true },
        { merge: true }
      );
    } catch (err) {
      console.warn('[StaffHeal] staff uid link skipped:', err);
    }
  }

  const { getDocFromServer } = await import('firebase/firestore');
  const verify = await getDocFromServer(doc(db, 'users', user.uid));
  return verify.exists() && verify.data()?.tenantId === profile.tenantId;
}
