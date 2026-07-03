import { Quote } from '../types';

const PREFIX = 'quote-preview:';

/** 미리보기 창(window.open)은 sessionStorage를 부모와 공유하지 않음 → localStorage 사용 */
export function cacheQuoteForPreview(quote: Quote): void {
  try {
    const payload = JSON.stringify(quote);
    localStorage.setItem(`${PREFIX}${quote.id}`, payload);
    sessionStorage.setItem(`${PREFIX}${quote.id}`, payload);
  } catch {
    /* quota exceeded 등 — 미리보기만 영향 */
  }
}

export function readCachedQuoteForPreview(quoteId: string): Quote | null {
  try {
    const raw =
      localStorage.getItem(`${PREFIX}${quoteId}`) ??
      sessionStorage.getItem(`${PREFIX}${quoteId}`);
    return raw ? (JSON.parse(raw) as Quote) : null;
  } catch {
    return null;
  }
}

export function isQuotePreviewRoute(): boolean {
  return typeof window !== 'undefined' && window.location.hash.includes('/quote-preview/');
}
