/** 직원 로그인 화면 — 회사·아이디 저장 / 로그인 유지(Auth persistence)
 * 비밀번호는 localStorage에 저장하지 않음 (보안).
 */

export const STAFF_LOGIN_PREFS = {
  rememberCompany: 'rememberCompany',
  keepLoggedIn: 'keepLoggedIn',
  savedCompanyName: 'savedCompanyName',
  savedTenantId: 'savedTenantId',
  savedLoginId: 'savedLoginId',
  /** @deprecated 평문 저장 중단 — 읽기 시 즉시 삭제 */
  savedLoginPassword: 'savedLoginPassword',
} as const;

export type StaffLoginPreferences = {
  rememberCompany: boolean;
  keepLoggedIn: boolean;
  companyName: string;
  tenantId: string;
  loginId: string;
  /** 항상 빈 문자열 — 하위 호환용 필드 */
  loginPassword: string;
};

function purgeStoredStaffPassword(): void {
  try {
    localStorage.removeItem(STAFF_LOGIN_PREFS.savedLoginPassword);
  } catch {
    /* ignore */
  }
}

export function loadStaffLoginPreferences(): StaffLoginPreferences {
  purgeStoredStaffPassword();

  const rememberCompany = localStorage.getItem(STAFF_LOGIN_PREFS.rememberCompany) === 'true';
  const keepLoggedIn = localStorage.getItem(STAFF_LOGIN_PREFS.keepLoggedIn) === 'true';
  const companyName = localStorage.getItem(STAFF_LOGIN_PREFS.savedCompanyName) || '';
  const tenantId = localStorage.getItem(STAFF_LOGIN_PREFS.savedTenantId) || '';
  const loginId = localStorage.getItem(STAFF_LOGIN_PREFS.savedLoginId) || '';

  return {
    rememberCompany,
    keepLoggedIn,
    companyName,
    tenantId,
    loginId,
    loginPassword: '',
  };
}

export function saveStaffLoginPreferences(prefs: StaffLoginPreferences): void {
  localStorage.setItem(STAFF_LOGIN_PREFS.rememberCompany, prefs.rememberCompany ? 'true' : 'false');
  localStorage.setItem(STAFF_LOGIN_PREFS.keepLoggedIn, prefs.keepLoggedIn ? 'true' : 'false');

  if (prefs.rememberCompany || prefs.keepLoggedIn) {
    if (prefs.companyName && prefs.tenantId) {
      localStorage.setItem(STAFF_LOGIN_PREFS.savedCompanyName, prefs.companyName);
      localStorage.setItem(STAFF_LOGIN_PREFS.savedTenantId, prefs.tenantId);
    }
  } else {
    localStorage.removeItem(STAFF_LOGIN_PREFS.savedCompanyName);
    localStorage.removeItem(STAFF_LOGIN_PREFS.savedTenantId);
  }

  if (prefs.keepLoggedIn) {
    if (prefs.loginId) {
      localStorage.setItem(STAFF_LOGIN_PREFS.savedLoginId, prefs.loginId.trim().toLowerCase());
    }
  } else {
    localStorage.removeItem(STAFF_LOGIN_PREFS.savedLoginId);
  }

  // 비밀번호는 절대 저장하지 않음 + 기존 평문 키 제거
  purgeStoredStaffPassword();
}

export function clearSavedStaffCredentials(): void {
  localStorage.removeItem(STAFF_LOGIN_PREFS.savedLoginId);
  purgeStoredStaffPassword();
}

/** 아이디 저장 해제 (localStorage 키 keepLoggedIn — 하위 호환) */
export function disableStaffAutoLoginPrefs(): void {
  const prefs = loadStaffLoginPreferences();
  saveStaffLoginPreferences({
    ...prefs,
    keepLoggedIn: false,
    loginId: '',
    loginPassword: '',
  });
}

export function isStaffKeepLoggedIn(): boolean {
  return localStorage.getItem(STAFF_LOGIN_PREFS.keepLoggedIn) === 'true';
}

/** 아이디 저장 여부 (자동 로그인과 무관) */
export const isStaffCredentialsSaved = isStaffKeepLoggedIn;
