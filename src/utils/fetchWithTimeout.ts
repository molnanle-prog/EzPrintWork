/** LAN 게이트웨이 fetch — 도달 불가 IP에서 수 분 대기 방지 */
export const DEFAULT_LAN_FETCH_TIMEOUT_MS = 5000;

export async function fetchWithTimeout(
    input: RequestInfo | URL,
    init?: RequestInit,
    timeoutMs = DEFAULT_LAN_FETCH_TIMEOUT_MS
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}
