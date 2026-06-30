/**
 * 회사(테넌트) 권한 모델
 *
 * - 메인 관리자 (Tenant Owner): tenants.ownerId — 요금제·백업 포함 전체 회사 관리
 * - 사내 관리자 (Company Admin): users.role === 'admin' — 직원·마스터 데이터·삭제·정리
 * - 일반 직원 (Staff): users.role === 'staff' — 일상 작업·상품/후가공·거래처 등록·수정
 */

/** 설정 > 직원도 접근 가능한 운영 메뉴 */
export const STAFF_OPERATIONS_SETTINGS_TAB_IDS = ['product', 'processing', 'client'] as const;

export type StaffOperationsSettingsTabId = (typeof STAFF_OPERATIONS_SETTINGS_TAB_IDS)[number];

export function isStaffOperationsSettingsTab(tabId: string): tabId is StaffOperationsSettingsTabId {
    return (STAFF_OPERATIONS_SETTINGS_TAB_IDS as readonly string[]).includes(tabId);
}

/** 상품·후가공·거래처 등록/수정 — 로그인한 회사 구성원 */
export function canAccessStaffOperationsSettings(ctx: CompanyPermissionContext): boolean {
    return !!ctx.userUid;
}

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

export type CompanyPermissionContext = {
    userUid?: string | null;
    userRole?: string | null;
    tenantOwnerId?: string | null;
    userEmail?: string | null;
};

/** 메인 + 사내 관리자 — 설정·직원·마스터 데이터·영구 삭제 */
export function canManageCompany(ctx: CompanyPermissionContext): boolean {
    if (!ctx.userUid) return false;
    if (isTenantOwnerUser(ctx.userUid, ctx.tenantOwnerId)) return true;
    return ctx.userRole === 'admin';
}

/** 메인 관리자 전용 — 요금제·백업 */
export function canManageTenantRoot(ctx: CompanyPermissionContext): boolean {
    if (!ctx.userUid) return false;
    if (isTenantOwnerUser(ctx.userUid, ctx.tenantOwnerId)) return true;
    return ctx.userEmail === 'molnanle@gmail.com';
}

/** 작업·견적·거래처 영구 삭제·합치기 */
export function canDeletePermanently(ctx: CompanyPermissionContext): boolean {
    return canManageCompany(ctx);
}

/** 직원 등록·수정·비활성(삭제) */
export function canManageStaff(ctx: CompanyPermissionContext): boolean {
    return canManageCompany(ctx);
}

/** 거래처 삭제·합치기 — 등록·수정은 직원도 가능 */
export function canManageClientMaster(ctx: CompanyPermissionContext): boolean {
    return canManageCompany(ctx);
}

/** 관리자 지시사항 등록·삭제 */
export function canManageInstructions(ctx: CompanyPermissionContext): boolean {
    return canManageCompany(ctx);
}

/** UI에 노출하지 않는 시드/개발 계정 ID */
export const HIDDEN_STAFF_IDS = ['admin', 'dev-admin'] as const;

export function isHiddenStaffId(staffId?: string | null): boolean {
    return !!staffId && (HIDDEN_STAFF_IDS as readonly string[]).includes(staffId);
}
