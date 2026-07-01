import { Quote } from '../types';

const PREFIX = 'quote-preview:';

export function cacheQuoteForPreview(quote: Quote): void {
  try {
    sessionStorage.setItem(`${PREFIX}${quote.id}`, JSON.stringify(quote));
  } catch {
    /* quota exceeded 등 — 미리보기만 영향 */
  }
}

export function readCachedQuoteForPreview(quoteId: string): Quote | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${quoteId}`);
    return raw ? (JSON.parse(raw) as Quote) : null;
  } catch {
    return null;
  }
}

export function isQuotePreviewRoute(): boolean {
  return typeof window !== 'undefined' && window.location.hash.includes('/quote-preview/');
}
