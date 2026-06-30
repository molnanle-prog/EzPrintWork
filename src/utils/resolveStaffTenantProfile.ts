import { User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { db } from '../services/firebase';
import { resolveAppRoleFromStaff } from './adminAccess';
import { readPendingStaffProfile } from './staffLoginSession';

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
}

export function readStaffLoginTenant(): string | null {
  return sessionStorage.getItem(STAFF_LOGIN_TENANT_KEY);
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
    localStorage.getItem('savedTenantId'),
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
          role: resolveAppRoleFromStaff(data.role || data.position),
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
            role: resolveAppRoleFromStaff(data.role || data.position),
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

  const payload = {
    uid: user.uid,
    id: user.uid,
    email: user.email || `${profile.loginId}@ez-hub.kr`,
    displayName: profile.name,
    name: profile.name,
    tenantId: profile.tenantId,
    role: profile.role,
    loginId: profile.loginId,
  };

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
