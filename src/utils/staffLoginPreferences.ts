/** 직원 로그인 화면 — 선택 회사 저장 / 자동 로그인 유지 */

export const STAFF_LOGIN_PREFS = {
  rememberCompany: 'rememberCompany',
  keepLoggedIn: 'keepLoggedIn',
  savedCompanyName: 'savedCompanyName',
  savedTenantId: 'savedTenantId',
  savedLoginId: 'savedLoginId',
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
  const loginPassword = localStorage.getItem(STAFF_LOGIN_PREFS.savedLoginPassword) || '';

  return { rememberCompany, keepLoggedIn, companyName, tenantId, loginId, loginPassword };
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

export function isStaffKeepLoggedIn(): boolean {
  return localStorage.getItem(STAFF_LOGIN_PREFS.keepLoggedIn) === 'true';
}
