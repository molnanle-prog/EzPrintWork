export async function getWindowsStartupEnabled(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.electron?.getOpenAtLogin) return false;
    const result = await window.electron.getOpenAtLogin();
    return result.ok && result.enabled;
}

export async function setWindowsStartupEnabled(enabled: boolean): Promise<{ ok: boolean; message?: string }> {
    if (typeof window === 'undefined' || !window.electron?.setOpenAtLogin) {
        return { ok: false, message: 'PC 앱에서만 설정할 수 있습니다.' };
    }
    const result = await window.electron.setOpenAtLogin(enabled);
    if (!result.ok) {
        return { ok: false, message: result.error || '시작 프로그램 설정에 실패했습니다.' };
    }
    return {
        ok: true,
        message: result.enabled
            ? 'Windows 시작 시 EzPrintWork가 자동 실행됩니다.'
            : 'Windows 시작 시 자동 실행이 해제되었습니다.',
    };
}
