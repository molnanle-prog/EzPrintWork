import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
    APP_VERSION,
    UpdateCheckResult,
    applyWebUpdate,
    checkForUpdate,
    dismissUpdate,
    isAutoUpdateEnabled,
    isUpdateDismissed,
    startAutoUpdatePolling,
} from '../utils/autoUpdate';
import { hasElectronUpdater, manualElectronUpdateCheck } from './useElectronUpdater';

const WEB_TOAST_ID = 'ezpw-web-update';

const shownToasts = new Set<string>();

function showWebUpdateToast(result: UpdateCheckResult) {
    const buildId = result.manifest?.buildId;
    if (!buildId || isUpdateDismissed(buildId)) return;
    if (shownToasts.has(WEB_TOAST_ID)) return;
    shownToasts.add(WEB_TOAST_ID);

    const version = result.manifest?.version || '새';

    toast.info(`새 버전 v${version}이 배포되었습니다`, {
        id: WEB_TOAST_ID,
        description: '지금 업데이트하면 최신 기능이 적용됩니다. (자동 새로고침)',
        duration: Infinity,
        action: {
            label: '지금 업데이트',
            onClick: () => applyWebUpdate(),
        },
        cancel: {
            label: '나중에',
            onClick: () => dismissUpdate(buildId),
        },
    });
}

async function showInstallerUpdateToastIfNeeded() {
    // Electron + electron-updater 사용 시 GitHub Release에서 처리
    if (hasElectronUpdater()) return;
}

export function useAutoUpdate() {
    const notifiedBuildRef = useRef<string | null>(null);

    const handleUpdate = useCallback((result: UpdateCheckResult) => {
        const buildId = result.manifest?.buildId;
        if (!buildId || notifiedBuildRef.current === buildId) return;
        notifiedBuildRef.current = buildId;
        showWebUpdateToast(result);
    }, []);

    useEffect(() => {
        if (!isAutoUpdateEnabled()) return;

        void checkForUpdate().then((result) => {
            if (result.available) {
                handleUpdate(result);
            }
        });

        void showInstallerUpdateToastIfNeeded();

        const stop = startAutoUpdatePolling(handleUpdate, 5 * 60 * 1000);
        return stop;
    }, [handleUpdate]);

    return {};
}

/** 설정 화면 등에서 수동 확인 */
export async function manualUpdateCheck(): Promise<void> {
    if (hasElectronUpdater()) {
        const handled = await manualElectronUpdateCheck();
        if (handled) return;
    }

    if (!isAutoUpdateEnabled()) {
        toast.message(`현재 버전 v${APP_VERSION} (개발 모드)`, {
            description: '개발 서버에서는 자동 업데이트가 비활성화됩니다.',
        });
        return;
    }

    const result = await checkForUpdate();
    if (result.available) {
        showWebUpdateToast(result);
        return;
    }

    await showInstallerUpdateToastIfNeeded();

    toast.success(`최신 버전 v${APP_VERSION}을 사용 중입니다.`, {
        description: '새 배포가 없습니다.',
    });
}
