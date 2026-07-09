import {
  Auth,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { normalizeStaffLoginEmail } from './staffAuthProvision';

export type StaffAuthRow = {
  loginId?: string;
  email?: string;
  password?: string;
  uid?: string;
};

/** staff에 연결된 Firebase 계정 이메일 우선 (레거시 개인메일 → @ez-hub.kr) */
export function buildStaffAuthEmails(staff: StaffAuthRow, loginIdInput: string): string[] {
  const rawLoginId = (staff.loginId || loginIdInput).trim().toLowerCase();
  const primary = normalizeStaffLoginEmail(rawLoginId);
  const legacy =
    staff.email?.includes('@') && !staff.email.trim().toLowerCase().endsWith('@ez-hub.kr')
      ? staff.email.trim().toLowerCase()
      : null;

  if (staff.uid?.trim() && legacy) {
    return [...new Set([legacy, primary])];
  }
  return [...new Set([primary, legacy].filter(Boolean))] as string[];
}

function buildPasswords(passwordInput: string, _staff: StaffAuthRow): string[] {
  return [
    ...new Set(
      [
        passwordInput.trim(),
        passwordInput.trim().toLowerCase(),
      ].filter(Boolean)
    ),
  ] as string[];
}

/**
 * 직원 Firebase Auth 로그인 — staff.uid와 불일치하는 고아 계정(@ez-hub.kr) 자동 건너뜀
 */
export async function signInStaffWithFirebaseAuth(
  auth: Auth,
  staff: StaffAuthRow,
  loginIdInput: string,
  passwordInput: string
): Promise<{ user: User; authEmail: string } | null> {
  const authEmailsToTry = buildStaffAuthEmails(staff, loginIdInput);
  const passwordsToTry = buildPasswords(passwordInput, staff);
  const linkedUid = staff.uid?.trim() || null;
  let lastError: unknown = null;

  const attempt = async (allowCreate: boolean): Promise<{ user: User; authEmail: string } | null> => {
    for (const emailCandidate of authEmailsToTry) {
      for (const pwd of passwordsToTry) {
        try {
          if (allowCreate) {
            try {
              await createUserWithEmailAndPassword(auth, emailCandidate, pwd);
            } catch (createErr: unknown) {
              const code = (createErr as { code?: string })?.code;
              if (code !== 'auth/email-already-in-use') throw createErr;
              await signInWithEmailAndPassword(auth, emailCandidate, pwd);
            }
          } else {
            await signInWithEmailAndPassword(auth, emailCandidate, pwd);
          }

          const user = auth.currentUser;
          if (!user) continue;

          if (linkedUid && user.uid !== linkedUid) {
            console.warn(
              `[StaffAuth] uid mismatch for ${emailCandidate}: auth=${user.uid} staff=${linkedUid} — trying next email`
            );
            await signOut(auth);
            continue;
          }

          return { user, authEmail: emailCandidate };
        } catch (err) {
          lastError = err;
          if (auth.currentUser) {
            await signOut(auth).catch(() => {});
          }
        }
      }
    }
    return null;
  };

  const signedIn = (await attempt(false)) ?? (await attempt(true));
  if (!signedIn && lastError) {
    console.error('[StaffAuth] all sign-in attempts failed:', lastError);
  }
  return signedIn;
}
