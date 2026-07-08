/** PC/NAS 이력 보관 폴더 — 일일 백업(ezpw_local_backup_path)과 분리 */
export const ARCHIVE_ROOT_PATH_KEY = 'ezpw_archive_root_path';
export const ARCHIVE_SETUP_DONE_KEY = 'ezpw_archive_setup_done';
export const ARCHIVE_USE_DEFAULT_KEY = 'ezpw_archive_use_default';
export const ARCHIVE_FILE_NAME = 'jobs-archive.json';
export const ARCHIVE_README_NAME = 'readme.txt';
export const DEFAULT_ARCHIVE_FOLDER_NAME = 'EzPrintWork_Archive';

/** Firestore settings.main — 회사 공통 NAS 경로 (관리자 1회 설정 → 전 PC 강제) */
export const TENANT_ARCHIVE_ROOT_SETTINGS_KEY = 'archiveRootPath';

/** 로그인 세션 동안 Firestore 회사 경로 (localStorage보다 우선) */
let companyArchiveRootOverride: string | null = null;

export function isNasOrNetworkPath(folderPath: string): boolean {
    const p = folderPath.trim();
    if (!p) return false;
    if (p.startsWith('\\\\')) return true;
    if (/^[a-zA-Z]:\\/.test(p)) {
        const drive = p[0].toUpperCase();
        return drive > 'C';
    }
    return false;
}

export function getArchiveRootPath(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ARCHIVE_ROOT_PATH_KEY);
}

export function setArchiveRootPath(path: string | null, useDefault = false) {
    if (typeof window === 'undefined') return;
    if (path) {
        localStorage.setItem(ARCHIVE_ROOT_PATH_KEY, path);
        localStorage.removeItem(ARCHIVE_USE_DEFAULT_KEY);
    } else if (useDefault) {
        localStorage.removeItem(ARCHIVE_ROOT_PATH_KEY);
        localStorage.setItem(ARCHIVE_USE_DEFAULT_KEY, 'true');
    } else {
        localStorage.removeItem(ARCHIVE_ROOT_PATH_KEY);
        localStorage.removeItem(ARCHIVE_USE_DEFAULT_KEY);
    }
}

export function getTenantArchiveRootFromSettings(
    settings: Record<string, unknown> | null | undefined
): string | null {
    const raw = settings?.[TENANT_ARCHIVE_ROOT_SETTINGS_KEY];
    if (typeof raw !== 'string' || !raw.trim()) return null;
    return raw.trim();
}

export function hasCompanyArchiveRootConfigured(): boolean {
    return !!companyArchiveRootOverride;
}

/** NAS 읽기/쓰기 — 회사 경로가 있으면 무조건 그 경로만 사용 */
export function getEffectiveArchiveRootPath(): string | null {
    if (companyArchiveRootOverride) return companyArchiveRootOverride;
    return getArchiveRootPath();
}

export function setCompanyArchiveRootOverride(path: string | null): boolean {
    const next = path?.trim() || null;
    if (next === companyArchiveRootOverride) return false;
    companyArchiveRootOverride = next;
    if (next) {
        setArchiveRootPath(next);
    }
    return true;
}

export function clearCompanyArchiveRootOverride(): void {
    companyArchiveRootOverride = null;
}

export function applyArchiveRootFromSettings(settings: Record<string, unknown> | null | undefined): boolean {
    if (typeof window === 'undefined') return false;
    const tenantPath = getTenantArchiveRootFromSettings(settings);
    if (!tenantPath) return false;
    return setCompanyArchiveRootOverride(tenantPath);
}

export function markArchiveSetupDone() {
    if (typeof window !== 'undefined') {
        localStorage.setItem(ARCHIVE_SETUP_DONE_KEY, 'true');
    }
}

export function isArchiveSetupDone(): boolean {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(ARCHIVE_SETUP_DONE_KEY) === 'true';
}

export function pendingArchiveKey(tenantId: string) {
    return `ezpw_archive_pending_${tenantId}`;
}

export async function sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
