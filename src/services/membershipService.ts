import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { app, auth, db as firestore } from './firebase';

const functions = getFunctions(app, 'asia-northeast3');

type PublicTenant = { id: string; name: string };

export type ResolvedStaffLogin = {
  staffDocId: string;
  uid: string;
  loginId: string;
  authEmail: string;
  name: string;
  role: string;
  isCompanyAdmin: boolean;
  avatarUrl?: string;
};

function isCallableUnavailable(error: unknown): boolean {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    code.includes('not-found')
    || code.includes('unimplemented')
    || code.includes('unavailable')
    || code.includes('internal')
    || code.includes('deadline-exceeded')
    || message.includes('not found')
    || message.includes('not-found')
  );
}

function staffLoginEmail(loginId: string): string {
  const id = loginId.trim().toLowerCase();
  return id.includes('@') ? id : `${id}@ez-hub.kr`;
}

async function searchTenantsClient(nameQuery: string): Promise<PublicTenant[]> {
  const term = nameQuery.trim();
  if (!term) return [];
  const tenantsCol = collection(firestore, 'tenants');
  const lower = term.toLowerCase();
  const mapTenant = (row: { id: string; data: () => { name?: string } }) => ({
    id: row.id,
    name: String(row.data()?.name || ''),
  });
  const dedupe = (rows: PublicTenant[]) => {
    const seen = new Set<string>();
    return rows.filter((item) => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  const exactSnap = await getDocs(query(tenantsCol, where('name', '==', term), limit(10)));
  if (!exactSnap.empty) return dedupe(exactSnap.docs.map(mapTenant));

  const prefixSnap = await getDocs(
    query(tenantsCol, where('name', '>=', term), where('name', '<=', `${term}\uf8ff`), limit(25))
  );
  return dedupe(prefixSnap.docs.map(mapTenant)).filter((item) =>
    (item.name || '').toLowerCase().includes(lower)
  );
}

async function resolveStaffLoginClient(
  tenantId: string,
  loginId: string
): Promise<ResolvedStaffLogin> {
  const loginNorm = loginId.trim().toLowerCase();
  const snap = await getDocs(
    query(
      collection(firestore, 'tenants', tenantId, 'staff'),
      where('loginId', '==', loginNorm),
      limit(5)
    )
  );
  const row = snap.docs.find((docSnap) => {
    const value = docSnap.data() as { active?: boolean; isDeleted?: boolean };
    return value.active !== false && value.isDeleted !== true;
  });
  if (!row) throw new Error('직원 계정을 찾을 수 없습니다.');
  const staff = row.data() as Record<string, unknown>;
  return {
    staffDocId: row.id,
    uid: String(staff.uid || row.id),
    loginId: loginNorm,
    authEmail: String(staff.email || staffLoginEmail(loginNorm)).toLowerCase(),
    name: String(staff.name || staff.userName || '사원'),
    role: String(staff.role || staff.position || '사원'),
    isCompanyAdmin: staff.isCompanyAdmin === true,
    avatarUrl: String(staff.avatarUrl || ''),
  };
}

export async function searchTenantsPublic(nameQuery: string): Promise<PublicTenant[]> {
  try {
    const call = httpsCallable<{ nameQuery: string }, { tenants: PublicTenant[] }>(
      functions,
      'searchTenantsPublic'
    );
    const result = await call({ nameQuery: nameQuery.trim() });
    return Array.isArray(result.data?.tenants) ? result.data.tenants : [];
  } catch (error) {
    if (!isCallableUnavailable(error)) throw error;
    return searchTenantsClient(nameQuery);
  }
}

export async function resolveStaffLogin(
  tenantId: string,
  loginId: string
): Promise<ResolvedStaffLogin> {
  try {
    const call = httpsCallable<
      { tenantId: string; loginId: string },
      ResolvedStaffLogin
    >(functions, 'resolveStaffLogin');
    const result = await call({ tenantId, loginId: loginId.trim().toLowerCase() });
    return result.data;
  } catch (error) {
    if (!isCallableUnavailable(error)) throw error;
    return resolveStaffLoginClient(tenantId, loginId);
  }
}

export async function createTenantSecure(input: {
  name: string;
  businessNumber?: string;
  joinCode: string;
  ownerPhone: string;
}): Promise<string> {
  const call = httpsCallable<typeof input, { tenantId: string }>(
    functions,
    'secureCreateTenant'
  );
  const result = await call(input);
  if (!result.data?.tenantId) throw new Error('회사 생성 결과가 올바르지 않습니다.');
  return result.data.tenantId;
}

export async function signupStaffSecure(input: {
  companyName: string;
  joinCode: string;
  loginId: string;
  password: string;
  staffName: string;
  staffPhone: string;
  staffRole: string;
}): Promise<{ tenantId: string; uid: string; email: string }> {
  try {
    const call = httpsCallable<
      typeof input,
      { tenantId: string; uid: string; email: string }
    >(functions, 'secureStaffSignup');
    const result = await call(input);
    return result.data;
  } catch (error) {
    if (!isCallableUnavailable(error)) throw error;
    return signupStaffClientFallback(input);
  }
}

async function signupStaffClientFallback(input: {
  companyName: string;
  joinCode: string;
  loginId: string;
  password: string;
  staffName: string;
  staffPhone: string;
  staffRole: string;
}): Promise<{ tenantId: string; uid: string; email: string }> {
  const loginId = input.loginId.trim().toLowerCase();
  const email = staffLoginEmail(loginId);
  const tenantSnap = await getDocs(
    query(
      collection(firestore, 'tenants'),
      where('name', '==', input.companyName.trim()),
      where('joinCode', '==', input.joinCode.trim()),
      limit(1)
    )
  );
  if (tenantSnap.empty) {
    throw new Error('회사명 또는 입장 코드가 일치하지 않습니다.');
  }
  const tenantId = tenantSnap.docs[0].id;
  const duplicate = await getDocs(
    query(
      collection(firestore, 'tenants', tenantId, 'staff'),
      where('loginId', '==', loginId),
      limit(1)
    )
  );
  if (!duplicate.empty) throw new Error('이미 사용 중인 아이디입니다.');

  const created = await createUserWithEmailAndPassword(auth, email, input.password);
  const uid = created.user.uid;
  const now = new Date().toISOString();
  await setDoc(doc(firestore, 'users', uid), {
    uid,
    id: uid,
    email,
    tenantId,
    loginId,
    role: 'staff',
    userName: input.staffName,
    name: input.staffName,
    position: input.staffRole,
    contactInfo: input.staffPhone,
    createdAt: now,
  });
  await setDoc(doc(firestore, 'tenants', tenantId, 'staff', uid), {
    id: uid,
    uid,
    name: input.staffName,
    role: input.staffRole,
    phone: input.staffPhone,
    active: true,
    isCompanyAdmin: false,
    email,
    loginId,
    joinDate: now,
  });
  return { tenantId, uid, email };
}
