import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { ElectronUpdaterStatus } from '../types';

const DESKTOP_UPDATE_TOAST = 'ezpw-desktop-update';

export function hasElectronUpdater(): boolean {
    return (
        typeof window !== 'undefined' &&
        !!window.electron?.updaterCheck &&
        !!window.electron?.onUpdaterStatus
    );
}

export function useElectronUpdater() {
    const isDownloadingRef = useRef(false);

    const installDesktopUpdate = useCallback(async () => {
        if (!window.electron?.updaterInstall) return;
        await window.electron.updaterInstall();
    }, []);

    const startDesktopUpdate = useCallback(async () => {
        if (!window.electron?.updaterDownload || isDownloadingRef.current) return;
        isDownloadingRef.current = true;
        toast.loading('업데이트 다운로드 준비 중…', { id: DESKTOP_UPDATE_TOAST, duration: Infinity });
        const result = await window.electron.updaterDownload();
        if (!result.ok) {
            isDownloadingRef.current = false;
            toast.error('다운로드 실패', {
                id: DESKTOP_UPDATE_TOAST,
                description: result.error || '네트워크를 확인해 주세요.',
            });
        }
    }, []);

    useEffect(() => {
        if (!hasElectronUpdater() || !window.electron?.onUpdaterStatus) return;

        const unsubscribe = window.electron.onUpdaterStatus((status: ElectronUpdaterStatus) => {
            switch (status.phase) {
                case 'available':
                    toast.info(`데스크톱 앱 v${status.version} 업데이트가 있습니다`, {
                        id: DESKTOP_UPDATE_TOAST,
                        description: '앱 내부에서 자동으로 받아 설치합니다. (바탕화면에 파일이 생기지 않습니다)',
                        duration: Infinity,
                        action: {
                            label: '업데이트 시작',
                            onClick: () => void startDesktopUpdate(),
                        },
                    });
                    break;

                case 'downloading':
                    isDownloadingRef.current = true;
                    toast.loading(`업데이트 다운로드 중… ${Math.round(status.percent || 0)}%`, {
                        id: DESKTOP_UPDATE_TOAST,
                        duration: Infinity,
                    });
                    break;

                case 'downloaded':
                    isDownloadingRef.current = false;
                    toast.success(`v${status.version} 다운로드 완료`, {
                        id: DESKTOP_UPDATE_TOAST,
                        description: '지금 설치하면 앱이 자동으로 재시작됩니다.',
                        duration: Infinity,
                        action: {
                            label: '지금 설치',
                            onClick: () => void installDesktopUpdate(),
                        },
                    });
                    break;

                case 'error':
                    isDownloadingRef.current = false;
                    if (status.silent) break;
                    toast.error('데스크톱 업데이트 실패', {
                        id: DESKTOP_UPDATE_TOAST,
                        description: status.message || '잠시 후 다시 시도해 주세요.',
                    });
                    break;

                default:
                    break;
            }
        });

        return unsubscribe;
    }, [installDesktopUpdate, startDesktopUpdate]);

    return {};
}

/** 설정 화면 등 수동 확인 (Electron 전용) */
export async function manualElectronUpdateCheck(): Promise<boolean> {
    if (!hasElectronUpdater()) return false;

    toast.loading('GitHub에서 업데이트 확인 중…', { id: DESKTOP_UPDATE_TOAST, duration: 3000 });

    const result = await window.electron!.updaterCheck!();
    toast.dismiss(DESKTOP_UPDATE_TOAST);

    if (!result.ok) {
        toast.error('업데이트 확인 실패', {
            description: result.error || 'GitHub Release를 확인할 수 없습니다.',
        });
        return true;
    }

    if (result.updateInfo?.version) {
        toast.info(`데스크톱 앱 v${result.updateInfo.version} 업데이트가 있습니다`, {
            id: DESKTOP_UPDATE_TOAST,
            description: '「업데이트 시작」을 누르면 다운로드 후 자동 설치됩니다.',
            duration: Infinity,
            action: {
                label: '업데이트 시작',
                onClick: () => {
                    void window.electron!.updaterDownload!();
                },
            },
        });
        return true;
    }

    toast.success(`데스크톱 앱 v${result.currentVersion} — 최신 설치본입니다.`);
    return true;
}
