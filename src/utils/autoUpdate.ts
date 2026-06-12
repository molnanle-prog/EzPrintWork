const BUILD_ID_KEY = 'ezpw_build_id';
const RELOAD_GUARD_KEY = 'ezpw_reload_guard';

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

type VersionManifest = { version?: string; buildId?: string };

function versionManifestUrl(): string {
    return new URL('version.json', window.location.href).href;
}

async function fetchServerManifest(): Promise<VersionManifest | null> {
    try {
        const res = await fetch(`${versionManifestUrl()}?t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/** 서버에 더 새 빌드가 있으면 1회 자동 새로고침 */
export async function checkAndReloadIfStale(): Promise<void> {
    const manifest = await fetchServerManifest();
    if (!manifest?.buildId) return;

    const storedBuildId = localStorage.getItem(BUILD_ID_KEY);
    const alreadyReloaded = sessionStorage.getItem(RELOAD_GUARD_KEY) === manifest.buildId;

    if (storedBuildId && storedBuildId !== manifest.buildId && !alreadyReloaded) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, manifest.buildId);
        localStorage.setItem(BUILD_ID_KEY, manifest.buildId);
        window.location.reload();
        return;
    }

    localStorage.setItem(BUILD_ID_KEY, manifest.buildId);
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
}

/** 앱 사용 중 주기적으로 새 배포 감지 (기본 10분) */
export function startAutoUpdatePolling(intervalMs = 10 * 60 * 1000): () => void {
    const timer = window.setInterval(() => {
        void checkAndReloadIfStale();
    }, intervalMs);
    return () => window.clearInterval(timer);
}
