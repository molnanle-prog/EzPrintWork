/**
 * 브라우저 캐시/서비스워커를 최대한 정리한 뒤 재로딩한다.
 * Ctrl+Shift+R을 완전히 대체할 수는 없지만, 웹앱 내부 버튼 기준으로는 가장 강한 방식이다.
 */
export async function hardReloadApp(): Promise<void> {
  try {
    if (typeof window === 'undefined') return;

    // 1) Service Worker 등록 해제
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((reg) => reg.unregister()));
    }

    // 2) Cache Storage 비우기
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn('[hardReloadApp] cache cleanup skipped:', error);
  } finally {
    // 3) 캐시 우회를 유도하는 URL로 교체
    const now = Date.now();
    const current = new URL(window.location.href);
    current.searchParams.set('_hr', String(now));
    window.location.replace(current.toString());
  }
}

