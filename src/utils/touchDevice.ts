/** 태블릿·휴대폰 등 터치 1차 입력 장치 */
export function isTouchPrimaryDevice(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(hover: none)').matches) return true;
    } catch {
        // ignore
    }
    return 'ontouchstart' in window && (navigator.maxTouchPoints ?? 0) > 0;
}

export function isMousePrimaryDevice(): boolean {
    return !isTouchPrimaryDevice();
}
