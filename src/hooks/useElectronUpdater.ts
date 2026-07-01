import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { ElectronUpdaterStatus } from '../types';
import { useUpdateNotice } from '../contexts/UpdateNoticeContext';

export function hasElectronUpdater(): boolean {
    return (
        typeof window !== 'undefined' &&
        !!window.electron?.updaterCheck &&
        !!window.electron?.onUpdaterStatus
    );
}

export function useElectronUpdater() {
    const { setDesktopNotice } = useUpdateNotice();
    const isDownloadingRef = useRef(false);

    const installDesktopUpdate = useCallback(async () => {
        if (!window.electron?.updaterInstall) return;
        setDesktopNotice({
            kind: 'desktop',
            phase: 'installing',
            message: '설치 프로그램을 실행합니다. 앱 창이 곧 닫힙니다.',
        });
        await window.electron.updaterInstall();
    }, [setDesktopNotice]);

    useEffect(() => {
        if (!hasElectronUpdater() || !window.electron?.onUpdaterStatus) return;

        const unsubscribe = window.electron.onUpdaterStatus((status: ElectronUpdaterStatus) => {
            switch (status.phase) {
                case 'available':
                    isDownloadingRef.current = false;
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'available',
                        version: status.version,
                    });
                    break;

                case 'downloading':
                    isDownloadingRef.current = true;
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'downloading',
                        version: status.version,
                        percent: status.percent,
                    });
                    break;

                case 'downloaded':
                    isDownloadingRef.current = false;
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'installing',
                        version: status.version,
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
                        message: status.message,
                    });
                    break;

                case 'error':
                    isDownloadingRef.current = false;
                    if (status.silent) break;
                    setDesktopNotice({
                        kind: 'desktop',
                        phase: 'error',
                        message: status.message || '잠시 후 다시 시도해 주세요.',
                    });
                    break;

                case 'none':
                    isDownloadingRef.current = false;
                    setDesktopNotice(null);
                    break;

                default:
                    break;
            }
        });

        return () => unsubscribe();
    }, [setDesktopNotice, installDesktopUpdate]);

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
        });
        return true;
    }

    setDesktopNotice(null);
    toast.success(`데스크톱 앱 v${result.currentVersion} — 최신 설치본입니다.`);
    return true;
}
