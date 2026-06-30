import { initializeApp, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { firebaseConfig, db as firestore } from '../services/firebase';

export const MIN_STAFF_PASSWORD_LENGTH = 6;

export function normalizeStaffLoginEmail(loginId: string): string {
  const id = loginId.trim().toLowerCase();
  return id.includes('@') ? id : `${id}@ez-hub.kr`;
}

export function getStaffAvatarUrl(avatarUrl?: string, seed?: string): string {
  const trimmed = avatarUrl?.trim();
  if (trimmed) return trimmed;
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(seed || 'staff')}`;
}

export function getStaffAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  switch (code) {
    case 'auth/weak-password':
      return `비밀번호는 ${MIN_STAFF_PASSWORD_LENGTH}자 이상 입력해 주세요.`;
    case 'auth/invalid-email':
      return '로그인 아이디 형식이 올바르지 않습니다.';
    case 'auth/email-already-in-use':
      return '이미 Firebase에 등록된 아이디입니다.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return '아이디 또는 비밀번호가 올바르지 않습니다.';
    case 'auth/operation-not-allowed':
      return '이메일/비밀번호 로그인이 비활성화되어 있습니다. Firebase 콘솔 설정을 확인해 주세요.';
    default:
      return (error as { message?: string })?.message || '로그인 계정 처리에 실패했습니다.';
  }
}

export const ORPHAN_AUTH_RECOVERY_HINT =
  '이전 등록 시도로 Firebase에만 남아 있는 아이디일 수 있습니다.\n\n' +
  '• 처음 등록할 때 입력한 비밀번호로 다시 시도해 주세요.\n' +
  '• 비밀번호를 모르면 다른 아이디를 사용하거나, 로그인 없이 목록에만 저장하세요.';

function getSecondaryAuth() {
  try {
    return getAuth(getApp('Secondary'));
  } catch {
    return getAuth(initializeApp(firebaseConfig, 'Secondary'));
  }
}

type StaffRow = { id?: string; uid?: string; loginId?: string; isDeleted?: boolean };

export type StaffAuthProvisionResult =
  | { ok: true; uid: string; recovered?: boolean }
  | { ok: false; message: string; orphanAuth?: boolean };

function validateStaffCredentials(loginId: string, password: string): string | null {
  const loginIdNorm = loginId.trim().toLowerCase();
  const passwordNorm = password.trim().toLowerCase();

  if (loginIdNorm.length < 2) {
    return '로그인 아이디는 2자 이상 입력해 주세요.';
  }
  if (passwordNorm.length < MIN_STAFF_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_STAFF_PASSWORD_LENGTH}자 이상 입력해 주세요.`;
  }
  const email = normalizeStaffLoginEmail(loginIdNorm);
  if (!email.includes('@') || email.startsWith('@')) {
    return '로그인 아이디 형식이 올바르지 않습니다.';
  }
  return null;
}

/**
 * 직원 로그인 계정(Firebase Auth + users/{uid}) 생성·연결.
 * 1) signIn 먼저 → 목록엔 없지만 Auth만 남은 고아 계정 복구 (signUp 400 방지)
 * 2) signIn 실패 시 signUp → 신규 계정
 * 3) signUp도 email-already-in-use → 비밀번호 불일치 안내
 */
export async function provisionStaffAuthAccount(opts: {
  loginId: string;
  password: string;
  tenantId: string;
  staffName: string;
  staffRole: string;
  existingStaffInTenant: StaffRow[];
  excludeStaffId?: string;
}): Promise<StaffAuthProvisionResult> {
  const loginIdNorm = opts.loginId.trim().toLowerCase();
  const passwordNorm = opts.password.trim().toLowerCase();
  const email = normalizeStaffLoginEmail(loginIdNorm);

  const validationError = validateStaffCredentials(loginIdNorm, passwordNorm);
  if (validationError) {
    return { ok: false, message: validationError };
  }

  const dupByLoginId = opts.existingStaffInTenant.find(
    (s) =>
      s.isDeleted !== true &&
      s.id !== opts.excludeStaffId &&
      s.uid !== opts.excludeStaffId &&
      s.loginId?.trim().toLowerCase() === loginIdNorm
  );
  if (dupByLoginId) {
    return { ok: false, message: '이미 등록된 사내 아이디입니다. 목록에서 확인해 주세요.' };
  }

  const secondaryAuth = getSecondaryAuth();

  const trySignIn = async (): Promise<string | null> => {
    try {
      const cred = await signInWithEmailAndPassword(secondaryAuth, email, passwordNorm);
      const signedUid = cred.user.uid;
      await signOut(secondaryAuth);
      return signedUid;
    } catch {
      try {
        await signOut(secondaryAuth);
      } catch {
        /* ignore */
      }
      return null;
    }
  };

  const trySignUp = async (): Promise<{ uid?: string; emailInUse?: boolean; message?: string }> => {
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, passwordNorm);
      const createdUid = cred.user.uid;
      await signOut(secondaryAuth);
      return { uid: createdUid };
    } catch (e: unknown) {
      try {
        await signOut(secondaryAuth);
      } catch {
        /* ignore */
      }
      const code = (e as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        return { emailInUse: true };
      }
      return { message: getStaffAuthErrorMessage(e) };
    }
  };

  let uid: string | undefined;
  let recovered = false;

  const signedInUid = await trySignIn();
  if (signedInUid) {
    uid = signedInUid;
    recovered = true;
  } else {
    const created = await trySignUp();
    if (created.uid) {
      uid = created.uid;
    } else if (created.emailInUse) {
      return {
        ok: false,
        message: ORPHAN_AUTH_RECOVERY_HINT,
        orphanAuth: true,
      };
    } else {
      return { ok: false, message: created.message || '로그인 계정 생성에 실패했습니다.' };
    }
  }

  if (!uid) {
    return { ok: false, message: '로그인 계정 처리에 실패했습니다.' };
  }

  const dupByUid = opts.existingStaffInTenant.find(
    (s) =>
      s.isDeleted !== true &&
      s.id !== opts.excludeStaffId &&
      s.uid !== opts.excludeStaffId &&
      (s.uid === uid || s.id === uid)
  );
  if (dupByUid) {
    return { ok: false, message: '이미 등록된 직원입니다. 목록에서 확인해 주세요.' };
  }

  const userSnap = await getDoc(doc(firestore, 'users', uid));
  if (userSnap.exists()) {
    const u = userSnap.data();
    if (u.tenantId && u.tenantId !== opts.tenantId) {
      return { ok: false, message: '다른 회사에 이미 등록된 아이디입니다.' };
    }
  }

  // users/{uid} 프로필은 관리자 권한 없이 쓰기 어려움 → 직원 첫 로그인 시 본인이 생성 (LoginPage)
  // 여기서는 Firebase Auth 계정(uid)만 확보하고 staff 문서에 uid를 연결하면 됨

  return { ok: true, uid, recovered };
}
