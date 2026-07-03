/** PC/NAS 이력 보관 폴더 — 일일 백업(ezpw_local_backup_path)과 분리 */
export const ARCHIVE_ROOT_PATH_KEY = 'ezpw_archive_root_path';
export const ARCHIVE_SETUP_DONE_KEY = 'ezpw_archive_setup_done';
export const ARCHIVE_USE_DEFAULT_KEY = 'ezpw_archive_use_default';
export const ARCHIVE_FILE_NAME = 'jobs-archive.json';
export const ARCHIVE_README_NAME = 'readme.txt';
export const DEFAULT_ARCHIVE_FOLDER_NAME = 'EzPrintWork_Archive';

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
