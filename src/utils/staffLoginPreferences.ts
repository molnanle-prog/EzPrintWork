/** 직원 로그인 화면 — 회사·아이디·비밀번호 저장 (이 PC localStorage만)
 * 클라우드에는 올리지 않는다. 체크를 끄면 지운다.
 */

export const STAFF_LOGIN_PREFS = {
  rememberCompany: 'rememberCompany',
  keepLoggedIn: 'keepLoggedIn',
  savedCompanyName: 'savedCompanyName',
  savedTenantId: 'savedTenantId',
  savedLoginId: 'savedLoginId',
  /** 아이디·비밀번호 저장을 켠 경우에만 이 PC에 둔다 */
  savedLoginPassword: 'savedLoginPassword',
} as const;

export type StaffLoginPreferences = {
  rememberCompany: boolean;
  keepLoggedIn: boolean;
  companyName: string;
  tenantId: string;
  loginId: string;
  loginPassword: string;
};

export function loadStaffLoginPreferences(): StaffLoginPreferences {
  const rememberCompany = localStorage.getItem(STAFF_LOGIN_PREFS.rememberCompany) === 'true';
  const keepLoggedIn = localStorage.getItem(STAFF_LOGIN_PREFS.keepLoggedIn) === 'true';
  const companyName = localStorage.getItem(STAFF_LOGIN_PREFS.savedCompanyName) || '';
  const tenantId = localStorage.getItem(STAFF_LOGIN_PREFS.savedTenantId) || '';
  const loginId = localStorage.getItem(STAFF_LOGIN_PREFS.savedLoginId) || '';
  const loginPassword = keepLoggedIn
    ? localStorage.getItem(STAFF_LOGIN_PREFS.savedLoginPassword) || ''
    : '';

  if (!keepLoggedIn) {
    try {
      localStorage.removeItem(STAFF_LOGIN_PREFS.savedLoginPassword);
    } catch {
      /* ignore */
    }
  }

  return {
    rememberCompany,
    keepLoggedIn,
    companyName,
    tenantId,
    loginId,
    loginPassword,
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
    if (prefs.loginPassword) {
      localStorage.setItem(STAFF_LOGIN_PREFS.savedLoginPassword, prefs.loginPassword);
    }
  } else {
    localStorage.removeItem(STAFF_LOGIN_PREFS.savedLoginId);
    localStorage.removeItem(STAFF_LOGIN_PREFS.savedLoginPassword);
  }
}

export function clearSavedStaffCredentials(): void {
  localStorage.removeItem(STAFF_LOGIN_PREFS.savedLoginId);
  localStorage.removeItem(STAFF_LOGIN_PREFS.savedLoginPassword);
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
