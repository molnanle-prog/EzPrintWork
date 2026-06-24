import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
    APP_VERSION,
    UpdateCheckResult,
    applyWebUpdate,
    checkForUpdate,
    isAutoUpdateEnabled,
    startAutoUpdatePolling,
} from '../utils/autoUpdate';
import { hasElectronUpdater, manualElectronUpdateCheck } from './useElectronUpdater';
import { useUpdateNotice } from '../contexts/UpdateNoticeContext';

const POLL_MS = 5 * 60 * 1000;
const POLL_MS_WHEN_PENDING = 60 * 1000;

function showWebUpdateNotice(
    setWebNotice: ReturnType<typeof useUpdateNotice>['setWebNotice'],
    result: UpdateCheckResult
) {
    const buildId = result.manifest?.buildId;
    const version = result.manifest?.version;
    if (!buildId || !version) return;

    setWebNotice({ kind: 'web', version, buildId });
}

export function useAutoUpdate() {
    const { notice, setWebNotice, clearWebNotice } = useUpdateNotice();
    const pendingBuildRef = useRef<string | null>(null);

    const handleUpdate = useCallback(
        (result: UpdateCheckResult) => {
            if (hasElectronUpdater()) return;

            const buildId = result.manifest?.buildId;
            if (!buildId || !result.available) {
                pendingBuildRef.current = null;
                clearWebNotice();
                return;
            }

            pendingBuildRef.current = buildId;
            showWebUpdateNotice(setWebNotice, result);
        },
        [setWebNotice, clearWebNotice]
    );

    useEffect(() => {
        if (!isAutoUpdateEnabled()) return;

        void checkForUpdate().then((result) => {
            if (result.available) handleUpdate(result);
        });

        const hasPendingNotice = notice != null;
        const intervalMs = hasPendingNotice ? POLL_MS_WHEN_PENDING : POLL_MS;

        const stop = startAutoUpdatePolling(handleUpdate, intervalMs);
        return stop;
    }, [handleUpdate, notice]);

    return {};
}

/** 설정 화면 등에서 수동 확인 */
export async function manualUpdateCheck(
    setWebNotice: ReturnType<typeof useUpdateNotice>['setWebNotice'],
    setDesktopNotice: ReturnType<typeof useUpdateNotice>['setDesktopNotice']
): Promise<void> {
    if (hasElectronUpdater()) {
        const handled = await manualElectronUpdateCheck(setDesktopNotice);
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
        showWebUpdateNotice(setWebNotice, result);
        return;
    }

    setWebNotice(null);
    toast.success(`최신 버전 v${APP_VERSION}을 사용 중입니다.`, {
        description: '새 배포가 없습니다.',
    });
}

export { applyWebUpdate };
