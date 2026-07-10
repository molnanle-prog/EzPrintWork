/**
 * 회사(테넌트) 권한 모델
 *
 * - 메인 관리자 (Tenant Owner): tenants.ownerId — 요금제·백업 포함 전체 회사 관리
 * - 사내 관리자 (Company Admin): staff.isCompanyAdmin + users.role admin — 직원 관리·마스터 데이터·삭제·정리
 * - 일반 직원 (Staff): users.role === 'staff' — 일상 작업·상품/후가공·거래처 등록·수정
 */

import type { Staff } from '../types';

/** 설정 > 직원도 접근 가능한 운영 메뉴 */
export const STAFF_OPERATIONS_SETTINGS_TAB_IDS = ['product', 'processing', 'client'] as const;

export type StaffOperationsSettingsTabId = (typeof STAFF_OPERATIONS_SETTINGS_TAB_IDS)[number];

/** 직책 목록에 넣으면 안 되는 시스템 권한 문자열 */
export const RESERVED_STAFF_AUTH_ROLES = ['admin', 'staff'] as const;

export function isReservedStaffAuthRole(role?: string | null): boolean {
    return !!role && (RESERVED_STAFF_AUTH_ROLES as readonly string[]).includes(role);
}

export function filterJobTitleOptions(roles: string[]): string[] {
    return roles.filter((r) => r && !isReservedStaffAuthRole(r));
}

export function isStaffOperationsSettingsTab(tabId: string): tabId is StaffOperationsSettingsTabId {
    return (STAFF_OPERATIONS_SETTINGS_TAB_IDS as readonly string[]).includes(tabId);
}

/** 상품·후가공·거래처 등록/수정 — 로그인한 회사 구성원 */
export function canAccessStaffOperationsSettings(ctx: CompanyPermissionContext): boolean {
    return !!ctx.userUid;
}

/** @deprecated 문자열만으로 권한 판별 — staff 문서는 isCompanyAdminStaff 사용 */
export function isStaffAdminRole(role?: string | null): boolean {
    if (!role) return false;
    return role === 'admin';
}

/** 사내 관리자 권한 (직책과 분리) */
export function isCompanyAdminStaff(staff: Pick<Staff, 'role' | 'isCompanyAdmin'>): boolean {
    if (staff.isCompanyAdmin === true) return true;
    // 레거시: 권한 토글 시 직책이 'admin'으로 덮어씌워진 경우
    return staff.role === 'admin';
}

/** 직책 표시용 — 시스템 권한 문자열은 직책으로 노출하지 않음 */
export function getStaffJobTitle(role?: string | null): string {
    if (!role || isReservedStaffAuthRole(role)) return '사원';
    return role;
}

/** staff 문서 정규화 — 권한 플래그와 직책 분리 */
export function normalizeStaffRecord(staff: Staff): Staff {
    const companyAdmin = isCompanyAdminStaff(staff);
    const jobTitle = getStaffJobTitle(staff.role);
    return {
        ...staff,
        isCompanyAdmin: staff.isCompanyAdmin ?? companyAdmin,
        role: jobTitle,
    };
}

/** tenants.ownerId 와 일치하는 메인(구글) 관리자 */
export function isTenantOwnerUser(userUid?: string | null, ownerId?: string | null): boolean {
    return !!userUid && !!ownerId && userUid === ownerId;
}

/** staff → users 컬렉션 app role */
export function resolveAppRoleFromStaff(
    staffOrRole?: string | Pick<Staff, 'role' | 'isCompanyAdmin'> | null
): 'admin' | 'staff' {
    if (!staffOrRole) return 'staff';
    if (typeof staffOrRole === 'string') {
        return staffOrRole === 'admin' ? 'admin' : 'staff';
    }
    return isCompanyAdminStaff(staffOrRole) ? 'admin' : 'staff';
}

/** 메인 관리자 전용 설정 (요금제·아카이브·백업) */
export const ROOT_SETTINGS_TAB_IDS = ['plan', 'archive', 'backup'] as const;

export type RootSettingsTabId = (typeof ROOT_SETTINGS_TAB_IDS)[number];

export function isRootSettingsTab(tabId: string): tabId is RootSettingsTabId {
    return (ROOT_SETTINGS_TAB_IDS as readonly string[]).includes(tabId);
}

export type CompanyPermissionContext = {
    userUid?: string | null;
    userRole?: string | null;
    tenantOwnerId?: string | null;
    userEmail?: string | null;
    /** tenants/{id}/staff 에 기록된 본인 직책 */
    staffRecordRole?: string | null;
    /** tenants/{id}/staff.isCompanyAdmin */
    staffIsCompanyAdmin?: boolean | null;
};

/** users.role 또는 staff.isCompanyAdmin 기준 사내/메인 관리자 여부 */
export function hasCompanyAdminAccess(ctx: CompanyPermissionContext): boolean {
    if (!ctx.userUid) return false;
    if (isTenantOwnerUser(ctx.userUid, ctx.tenantOwnerId)) return true;
    if (ctx.userRole === 'admin') return true;
    if (ctx.staffIsCompanyAdmin === true && !isTenantOwnerUser(ctx.userUid, ctx.tenantOwnerId)) {
        return true;
    }
    // 레거시: staff.role 이 'admin' 으로만 기록된 경우
    if (isStaffAdminRole(ctx.staffRecordRole) && !isTenantOwnerUser(ctx.userUid, ctx.tenantOwnerId)) {
        return true;
    }
    return false;
}

/** 메인 + 사내 관리자 — 설정·직원·마스터 데이터·영구 삭제 */
export function canManageCompany(ctx: CompanyPermissionContext): boolean {
    return hasCompanyAdminAccess(ctx);
}

/** 메인 관리자 전용 — 요금제·아카이브·백업 */
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
