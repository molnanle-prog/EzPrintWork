export const POST_CREATE_BRIEFING_KEY = 'ezpw_post_create_briefing';

export function isPostCreateBriefingPending(): boolean {
    try {
        return sessionStorage.getItem(POST_CREATE_BRIEFING_KEY) === '1';
    } catch {
        return false;
    }
}

export function markPostCreateBriefingPending(): void {
    try {
        sessionStorage.setItem(POST_CREATE_BRIEFING_KEY, '1');
    } catch {
        /* 저장이 안 되면 이번 화면에서만 안내를 보여 준다 */
    }
}

export function clearPostCreateBriefingPending(): void {
    try {
        sessionStorage.removeItem(POST_CREATE_BRIEFING_KEY);
    } catch {
        /* ignore */
    }
}
