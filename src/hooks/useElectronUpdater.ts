import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { ElectronUpdaterStatus } from '../types';
import { useUpdateNotice } from '../contexts/UpdateNoticeContext';
import { fetchDownloadManifest, isNewerVersion } from '../utils/autoUpdate';

export function hasElectronUpdater(): boolean {
    return (
        typeof window !== 'undefined' &&
        !!window.electron?.updaterCheck &&
        !!window.electron?.onUpdaterStatus
    );
}

const ELECTRON_UPDATE_POLL_MS = 3 * 60 * 1000;
const ELECTRON_EARLY_RETRY_MS = [8_000, 25_000, 60_000, 180_000];
const STARTED_UPDATE_KEY = 'ezpw_desktop_update_started';

function readStartedUpdateVersion(): string | null {
    try {
        return sessionStorage.getItem(STARTED_UPDATE_KEY);
    } catch {
        return null;
    }
}

function markUpdateStarted(version?: string) {
    if (!version) return;
    try {
        sessionStorage.setItem(STARTED_UPDATE_KEY, version);
    } catch {
        /* ignore */
    }
}

function clearStartedUpdate() {
    try {
        sessionStorage.removeItem(STARTED_UPDATE_KEY);
    } catch {
        /* ignore */
    }
}

export function useElectronUpdater() {
    const { setDesktopNotice } = useUpdateNotice();
    const isDownloadingRef = useRef(false);
    const isInstallingRef = useRef(false);
    const announcedVersionRef = useRef<string | null>(null);
    const activeTargetVersionRef = useRef<string | null>(null);

    const announceAvailable = useCallback(
        (version?: string, currentVersion?: string) => {
            if (!version || isDownloadingRef.current || isInstallingRef.current) return;

            // 이미 설치본이 같거나 더 새면 알림 끔
            if (currentVersion && !isNewerVersion(version, currentVersion)) {
                activeTargetVersionRef.current = null;
                clearStartedUpdate();
                setDesktopNotice(null);
                return;
            }

            // 이전에 같은 버전 업데이트를 시작했으면 재알림 억제
            const started = readStartedUpdateVersion();
            if (started && started === version && currentVersion && !isNewerVersion(version, currentVersion)) {
                setDesktopNotice(null);
                return;
            }

            activeTargetVersionRef.current = version;
            setDesktopNotice({
                kind: 'desktop',
                phase: 'available',
                version,
                currentVersion,
            });
            if (announcedVersionRef.current !== version) {
                announcedVersionRef.current = version;
                toast.message(`PC 앱 새 버전 v${version}`, {
                    description: currentVersion
                        ? `현재 v${currentVersion} → v${version} 업데이트가 있습니다.`
                        : '화면 오른쪽 위 알림에서 업데이트를 시작하세요.',
                    duration: 10000,
                });
            }
        },
        [setDesktopNotice]
    );

    /** electron-updater 피드 실패 시 download-manifest로 보조 감지 (다운로드는 반드시 check 후) */
    const checkManifestFallback = useCallback(async () => {
        if (isDownloadingRef.current || isInstallingRef.current) return;
        try {
            const [manifest, currentVersion] = await Promise.all([
                fetchDownloadManifest(),
                window.electron?.getAppVersion?.() ?? Promise.resolve(undefined),
            ]);
            const installed = currentVersion || '';
            if (
                manifest?.version &&
                installed &&
                isNewerVersion(String(manifest.version), installed)
            ) {
                // 폴백만으로 배너는 띄우되, 실제 다운로드 전 main에서 check 재수행
                announceAvailable(String(manifest.version), installed);
            } else if (installed) {
                clearStartedUpdate();
                activeTargetVersionRef.current = null;
                setDesktopNotice(null);
            }
        } catch {
            /* ignore */
        }
    }, [announceAvailable, setDesktopNotice]);

    useEffect(() => {
        if (!hasElectronUpdater() || !window.electron?.onUpdaterStatus) return;

        const unsubscribe = window.electron.onUpdaterStatus((status: ElectronUpdaterStatus) => {
            switch (status.phase) {
                case 'available':
                    if (isDownloadingRef.current || isInstallingRef.current) break;
                    isDownloadingRef.current = false;
                    announceAvailable(status.version, status.currentVersion);
                    break;

                case 'downloading':
                    isDownloadingRef.current = true;
                    isInstallingRef.current = false;
                    if (status.version) markUpdateStarted(status.version);
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'downloading',
                        version: status.version,
                        currentVersion: status.currentVersion,
                        percent: status.percent,
                    });
                    break;

                case 'downloaded':
                case 'installing':
                    // 메인이 이미 quitAndInstall 함 — 렌더러에서 중복 설치 호출하지 않음
                    isDownloadingRef.current = false;
                    isInstallingRef.current = true;
                    if (status.version) markUpdateStarted(status.version);
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'installing',
                        version: status.version,
                        currentVersion: status.currentVersion,
                        message:
                            status.message ||
                            (status.phase === 'downloaded'
                                ? '다운로드 완료 — 설치 프로그램을 실행합니다.'
                                : '설치 프로그램을 실행합니다.'),
                    });
                    break;

                case 'error':
                    isDownloadingRef.current = false;
                    isInstallingRef.current = false;
                    if (status.silent) {
                        void checkManifestFallback();
                        break;
                    }
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'error',
                        message: status.message || '잠시 후 다시 시도해 주세요.',
                    });
                    break;

                case 'none':
                    isDownloadingRef.current = false;
                    isInstallingRef.current = false;
                    activeTargetVersionRef.current = null;
                    clearStartedUpdate();
                    setDesktopNotice(null);
                    break;

                default:
                    break;
            }
        });

        return () => unsubscribe();
    }, [setDesktopNotice, announceAvailable, checkManifestFallback]);

    // 앱 사용 중 주기 확인 + 포커스 복귀 시 확인 + 시작 직후 재시도
    useEffect(() => {
        if (!hasElectronUpdater() || import.meta.env.DEV) return;

        const poll = () => {
            if (isDownloadingRef.current || isInstallingRef.current) return;
            void window.electron?.updaterCheck?.().then((result) => {
                if (isDownloadingRef.current || isInstallingRef.current) return;
                if (result?.busy) return;

                if (result?.ok && result.updateInfo?.version) {
                    announceAvailable(result.updateInfo.version, result.currentVersion);
                } else if (result?.ok && !result.updateInfo?.version) {
                    // 최신 — 알림 제거
                    activeTargetVersionRef.current = null;
                    clearStartedUpdate();
                    setDesktopNotice(null);
                } else if (!result?.ok) {
                    void checkManifestFallback();
                }
            });
        };

        poll();
        const early = ELECTRON_EARLY_RETRY_MS.map((ms) => window.setTimeout(poll, ms));
        const timer = window.setInterval(poll, ELECTRON_UPDATE_POLL_MS);

        const onFocus = () => poll();
        const onVisible = () => {
            if (document.visibilityState === 'visible') poll();
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            window.clearInterval(timer);
            early.forEach((id) => window.clearTimeout(id));
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [announceAvailable, checkManifestFallback, setDesktopNotice]);

    return {};
}

/** 설정 화면 등 수동 확인 (Electron 전용) */
export async function manualElectronUpdateCheck(
    setDesktopNotice: (notice: import('../contexts/UpdateNoticeContext').DesktopUpdateNotice | null) => void
): Promise<boolean> {
    if (!hasElectronUpdater()) return false;

    const result = await window.electron!.updaterCheck!();

    if (!result.ok) {
        setDesktopNotice({
            kind: 'desktop',
            phase: 'error',
            message: result.error || 'GitHub Release를 확인할 수 없습니다.',
        });
        return true;
    }

    if (result.updateInfo?.version) {
        const current = result.currentVersion || '';
        if (current && !isNewerVersion(result.updateInfo.version, current)) {
            setDesktopNotice(null);
            toast.success(`데스크톱 앱 v${current} — 최신 설치본입니다.`);
            return true;
        }
        setDesktopNotice({
            kind: 'desktop',
            phase: 'available',
            version: result.updateInfo.version,
            currentVersion: result.currentVersion,
        });
        return true;
    }

    setDesktopNotice(null);
    toast.success(`데스크톱 앱 v${result.currentVersion} — 최신 설치본입니다.`);
    return true;
}
