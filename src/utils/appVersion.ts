import { APP_VERSION } from './autoUpdate';

let cachedInstalledVersion: string | null = null;

/** Vite 빌드에 포함된 웹 번들 버전 (배포 서버 기준) */
export function getBundledAppVersion(): string {
    return APP_VERSION;
}

/** Electron 설치본 버전 — 없으면 웹 번들 버전 */
export async function fetchInstalledAppVersion(): Promise<string> {
    if (typeof window !== 'undefined' && window.electron?.getAppVersion) {
        try {
            const version = await window.electron.getAppVersion();
            if (version) {
                cachedInstalledVersion = version;
                return version;
            }
        } catch {
            /* fallback below */
        }
    }
    return APP_VERSION;
}

export function getCachedInstalledAppVersion(): string {
    return cachedInstalledVersion || APP_VERSION;
}

export function isElectronRuntime(): boolean {
    return typeof window !== 'undefined' && !!window.electron;
}
