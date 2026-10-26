/** 모니터링 모드 전체화면. PC 앱은 그 모니터의 창을 쓰고, 웹만 브라우저 전체화면을 쓴다. */
export function applyMonitoringFullscreen(enabled: boolean) {
    const electronApi = window.electron?.setMonitoringFullscreen;
    if (electronApi) {
        if (enabled && document.fullscreenElement && document.exitFullscreen) {
            void document.exitFullscreen().catch(() => {});
        }
        void electronApi(enabled);
        return;
    }
    if (enabled) {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
            void document.documentElement.requestFullscreen().catch(() => {});
        }
        return;
    }
    if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
    }
}
