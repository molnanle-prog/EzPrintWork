const BUILD_ID_KEY = 'ezpw_build_id';
const DISMISS_BUILD_KEY = 'ezpw_update_dismissed_build';

/** Firebase Hosting 배포 경로 */
export const PRODUCTION_MANIFEST_URL = 'https://ez-hub.kr/ezpw/version.json';
export const PRODUCTION_DOWNLOAD_MANIFEST_URL = 'https://ez-hub.kr/downloads/download-manifest.json';

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

export type UpdateManifest = {
    version?: string;
    buildId?: string;
    builtAt?: string;
};

export type DownloadManifest = {
    version?: string;
    setupFile?: string;
    downloadUrl?: string;
    installHint?: string;
    updatedAt?: string;
};

export type UpdateCheckResult = {
    available: boolean;
    manifest: UpdateManifest | null;
    currentBuildId: string;
    currentVersion: string;
};

export type InstallerUpdateResult = {
    available: boolean;
    manifest: DownloadManifest | null;
    currentVersion: string;
};

export function isAutoUpdateEnabled(): boolean {
    return !import.meta.env.DEV;
}

export function getUpdateManifestUrl(): string {
    if (import.meta.env.DEV) {
        return new URL('/version.json', window.location.origin).href;
    }
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return new URL('version.json', window.location.href).href;
    }
    if (host.includes('ez-hub.kr')) {
        return new URL('version.json', window.location.href).href;
    }
    return PRODUCTION_MANIFEST_URL;
}

async function fetchJson<T>(url: string): Promise<T | null> {
    try {
        const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export async function fetchServerManifest(): Promise<UpdateManifest | null> {
    return fetchJson<UpdateManifest>(getUpdateManifestUrl());
}

export async function fetchDownloadManifest(): Promise<DownloadManifest | null> {
    return fetchJson<DownloadManifest>(PRODUCTION_DOWNLOAD_MANIFEST_URL);
}

function parseBuildTimestamp(buildId: string): number {
    const tail = buildId.split('-').pop() || '';
    const ts = parseInt(tail, 10);
    return Number.isFinite(ts) ? ts : 0;
}

/** semver 간단 비교 — a > b 이면 true */
export function isNewerVersion(a: string, b: string): boolean {
    const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] ?? 0;
        const db = pb[i] ?? 0;
        if (da > db) return true;
        if (da < db) return false;
    }
    return false;
}

export function isNewerBuild(serverBuildId: string, currentBuildId: string): boolean {
    if (!serverBuildId || !currentBuildId) return false;
    if (serverBuildId === currentBuildId) return false;

    const serverTs = parseBuildTimestamp(serverBuildId);
    const currentTs = parseBuildTimestamp(currentBuildId);
    if (serverTs > 0 && currentTs > 0) {
        return serverTs > currentTs;
    }

    return serverBuildId !== currentBuildId;
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
    const manifest = await fetchServerManifest();
    const currentBuildId = APP_BUILD_ID;
    const currentVersion = APP_VERSION;

    const newerByVersion =
        !!manifest?.version && isNewerVersion(String(manifest.version), currentVersion);
    const newerByBuild =
        !!manifest?.buildId && isNewerBuild(String(manifest.buildId), currentBuildId);
    const available = newerByVersion || newerByBuild;

    if (manifest?.buildId) {
        localStorage.setItem(BUILD_ID_KEY, manifest.buildId);
    }

    return {
        available,
        manifest,
        currentBuildId,
        currentVersion,
    };
}

export async function checkForInstallerUpdate(): Promise<InstallerUpdateResult> {
    const manifest = await fetchDownloadManifest();
    const currentVersion = APP_VERSION;
    const available = !!manifest?.version && isNewerVersion(manifest.version, currentVersion);

    return { available, manifest, currentVersion };
}

export function isUpdateDismissed(buildId?: string): boolean {
    if (!buildId) return false;
    return sessionStorage.getItem(DISMISS_BUILD_KEY) === buildId;
}

export function dismissUpdate(buildId?: string): void {
    if (!buildId) return;
    sessionStorage.setItem(DISMISS_BUILD_KEY, buildId);
}

export function applyWebUpdate(): void {
    const manifestBuildId = localStorage.getItem(BUILD_ID_KEY);
    if (manifestBuildId) {
        sessionStorage.removeItem(DISMISS_BUILD_KEY);
    }
    window.location.reload();
}

/** @deprecated checkForUpdate + applyWebUpdate 사용 권장 */
export async function checkAndReloadIfStale(): Promise<boolean> {
    const result = await checkForUpdate();
    if (result.available && !isUpdateDismissed(result.manifest?.buildId)) {
        applyWebUpdate();
        return true;
    }
    return false;
}

export function startAutoUpdatePolling(
    onUpdate?: (result: UpdateCheckResult) => void,
    intervalMs = 5 * 60 * 1000
): () => void {
    if (!isAutoUpdateEnabled()) {
        return () => {};
    }

    const run = () => {
        void checkForUpdate().then((result) => {
            if (result.available && onUpdate) {
                onUpdate(result);
            }
        });
    };

    // 포커스/탭 복귀 시에도 즉시 확인 (백그라운드에서 놓친 배포 감지)
    const onVisible = () => {
        if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisible);

    const timer = window.setInterval(run, intervalMs);
    return () => {
        window.clearInterval(timer);
        window.removeEventListener('focus', run);
        document.removeEventListener('visibilitychange', onVisible);
    };
}
