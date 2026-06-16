/** staff 컬렉션 role — 관리 권한 여부 */
export function isStaffAdminRole(role?: string | null): boolean {
    if (!role) return false;
    return role === 'admin' || role === '관리자' || role === '대표자';
}

/** tenants.ownerId 와 일치하는 메인(구글) 관리자 */
export function isTenantOwnerUser(userUid?: string | null, ownerId?: string | null): boolean {
    return !!userUid && !!ownerId && userUid === ownerId;
}

/** staff role → users 컬렉션 app role */
export function resolveAppRoleFromStaff(staffRole?: string | null): 'admin' | 'staff' {
    return isStaffAdminRole(staffRole) ? 'admin' : 'staff';
}

/** 메인 관리자 전용 설정 (요금제·백업) */
export const ROOT_SETTINGS_TAB_IDS = ['plan', 'backup'] as const;

export type RootSettingsTabId = (typeof ROOT_SETTINGS_TAB_IDS)[number];

export function isRootSettingsTab(tabId: string): tabId is RootSettingsTabId {
    return (ROOT_SETTINGS_TAB_IDS as readonly string[]).includes(tabId);
}
