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

export function useElectronUpdater() {
    const { setDesktopNotice } = useUpdateNotice();
    const isDownloadingRef = useRef(false);
    const announcedVersionRef = useRef<string | null>(null);
    const hasAvailableNoticeRef = useRef(false);

    const installDesktopUpdate = useCallback(async () => {
        if (!window.electron?.updaterInstall) return;
        setDesktopNotice({
            kind: 'desktop',
            phase: 'installing',
            message: '설치 프로그램을 실행합니다. 앱 창이 곧 닫힙니다.',
        });
        await window.electron.updaterInstall();
    }, [setDesktopNotice]);

    const announceAvailable = useCallback(
        (version?: string, currentVersion?: string) => {
            if (!version) return;
            hasAvailableNoticeRef.current = true;
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

    /** electron-updater 피드 실패 시 download-manifest로 보조 감지 */
    const checkManifestFallback = useCallback(async () => {
        if (isDownloadingRef.current) return;
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
                announceAvailable(String(manifest.version), installed);
            }
        } catch {
            /* ignore */
        }
    }, [announceAvailable]);

    useEffect(() => {
        if (!hasElectronUpdater() || !window.electron?.onUpdaterStatus) return;

        const unsubscribe = window.electron.onUpdaterStatus((status: ElectronUpdaterStatus) => {
            switch (status.phase) {
                case 'available':
                    isDownloadingRef.current = false;
                    announceAvailable(status.version, status.currentVersion);
                    break;

                case 'downloading':
                    isDownloadingRef.current = true;
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'downloading',
                        version: status.version,
                        currentVersion: status.currentVersion,
                        percent: status.percent,
                    });
                    break;

                case 'downloaded':
                    isDownloadingRef.current = false;
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'installing',
                        version: status.version,
                        currentVersion: status.currentVersion,
                        message: '다운로드 완료 — 설치 프로그램을 실행합니다.',
                    });
                    void installDesktopUpdate();
                    break;

                case 'installing':
                    isDownloadingRef.current = false;
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'installing',
                        version: status.version,
                        currentVersion: status.currentVersion,
                        message: status.message,
                    });
                    break;

                case 'error':
                    isDownloadingRef.current = false;
                    if (status.silent) {
                        // 백그라운드 실패 시에도 manifest 폴백으로 알림 시도
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
                    // 이미 표시 중인 업데이트 알림을 폴백/레이스로 지우지 않음
                    if (!hasAvailableNoticeRef.current) {
                        setDesktopNotice(null);
                    }
                    break;

                default:
                    break;
            }
        });

        return () => unsubscribe();
    }, [setDesktopNotice, installDesktopUpdate, announceAvailable, checkManifestFallback]);

    // 앱 사용 중 주기 확인 + 포커스 복귀 시 확인 + 시작 직후 재시도
    useEffect(() => {
        if (!hasElectronUpdater() || import.meta.env.DEV) return;

        const poll = () => {
            void window.electron?.updaterCheck?.().then((result) => {
                if (result?.ok && result.updateInfo?.version) {
                    announceAvailable(result.updateInfo.version, result.currentVersion);
                } else if (!result?.ok || !result.updateInfo?.version) {
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
    }, [announceAvailable, checkManifestFallback]);

    return { installDesktopUpdate };
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
