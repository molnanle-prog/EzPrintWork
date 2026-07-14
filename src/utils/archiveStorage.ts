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

export function isUncPath(folderPath: string | null | undefined): boolean {
    const p = String(folderPath || '').trim().replace(/\//g, '\\');
    return p.startsWith('\\\\');
}

export function isDriveLetterPath(folderPath: string | null | undefined): boolean {
    const p = String(folderPath || '').trim().replace(/\//g, '\\');
    return /^[A-Za-z]:\\/.test(p);
}

export function isNasOrNetworkPath(folderPath: string): boolean {
    const p = folderPath.trim();
    if (!p) return false;
    if (isUncPath(p)) return true;
    if (isDriveLetterPath(p)) {
        const drive = p[0].toUpperCase();
        return drive > 'C';
    }
    return false;
}

export function normalizeArchivePathCompareKey(folderPath: string | null | undefined): string {
    return String(folderPath || '')
        .trim()
        .replace(/\//g, '\\')
        .replace(/[\\/]+$/, '')
        .toLowerCase();
}

/**
 * Electron에서 양쪽을 UNC로 풀어 같은 NAS 위치인지 판별.
 * Z:\foo 와 \\nas2dual\share\foo 가 동일 공유면 true → 복사 없이 경로 문자열만 교정.
 */
export async function archivePathsSamePhysicalLocation(
    a: string | null | undefined,
    b: string | null | undefined
): Promise<boolean> {
    const ka = normalizeArchivePathCompareKey(a);
    const kb = normalizeArchivePathCompareKey(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;

    const ra = await resolveArchivePathToUnc(String(a).trim());
    const rb = await resolveArchivePathToUnc(String(b).trim());
    const ua = normalizeArchivePathCompareKey(ra.path);
    const ub = normalizeArchivePathCompareKey(rb.path);
    return !!ua && !!ub && ua === ub;
}

/**
 * Electron에서 드라이브 문자를 UNC로 변환.
 * NAS(D~Z 또는 이미 네트워크)인데 UNC가 아니면 ok:false — 회사 경로 저장 거부용.
 */
export async function resolveArchivePathToUnc(
    folderPath: string
): Promise<{
    ok: boolean;
    path: string;
    unc: boolean;
    changed: boolean;
    error?: string;
}> {
    const raw = folderPath.trim();
    if (!raw) {
        return { ok: false, path: '', unc: false, changed: false, error: '경로가 비어 있습니다.' };
    }
    if (isUncPath(raw)) {
        const normalized = raw.replace(/\//g, '\\');
        return { ok: true, path: normalized, unc: true, changed: normalized !== raw };
    }

    const electronApi = typeof window !== 'undefined' ? window.electron : undefined;
    if (electronApi?.resolveUncPath) {
        try {
            const result = await electronApi.resolveUncPath(raw);
            if (result?.ok && result.path) {
                const path = result.path;
                if (isUncPath(path)) {
                    return {
                        ok: true,
                        path,
                        unc: true,
                        changed: true,
                    };
                }
                if (isNasOrNetworkPath(raw) || isDriveLetterPath(path)) {
                    return {
                        ok: false,
                        path,
                        unc: false,
                        changed: false,
                        error:
                            '네트워크 절대경로(UNC)로 변환하지 못했습니다.\n' +
                            '탐색기 주소창에 \\\\서버\\공유 형태로 연 뒤 다시 선택하거나,\n' +
                            '드라이브 문자(Z:) 대신 \\\\nas2dual\\... 경로로 연결해 주세요.',
                    };
                }
                // C: 등 로컬 기본 폴더는 허용
                return { ok: true, path, unc: false, changed: path !== raw };
            }
        } catch (e) {
            console.warn('[archiveStorage] resolveUncPath failed:', e);
        }
    }

    if (isNasOrNetworkPath(raw) && isDriveLetterPath(raw)) {
        return {
            ok: false,
            path: raw,
            unc: false,
            changed: false,
            error:
                '네트워크 절대경로(UNC)로 변환할 수 없습니다.\n' +
                'PC 앱에서 \\\\서버\\공유 경로로 NAS를 선택한 뒤 저장해 주세요.',
        };
    }

    return { ok: true, path: raw.replace(/\//g, '\\'), unc: isUncPath(raw), changed: false };
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
