/** 외부 보기 전용 라우트 — Firestore 동기화 없이 Storage 미러만 사용 */
export function isRemoteViewRoute(): boolean {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash || '';
    return hash.includes('/remote');
}
