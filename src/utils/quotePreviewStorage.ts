import { Quote, CompanyInfo } from '../types';
import { db } from '../services/dataService';

const PREFIX = 'quote-preview:';

type CachedQuotePayload = {
  quote: Quote;
  companyInfo?: CompanyInfo;
};

function parseCachedPayload(raw: string): CachedQuotePayload | null {
  try {
    const parsed = JSON.parse(raw) as CachedQuotePayload | Quote;
    if (parsed && typeof parsed === 'object' && 'quote' in parsed && parsed.quote?.id) {
      return parsed as CachedQuotePayload;
    }
    if (parsed && typeof parsed === 'object' && 'id' in parsed) {
      return { quote: parsed as Quote };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 미리보기 창(window.open)은 sessionStorage를 부모와 공유하지 않음 → localStorage 사용 */
export function cacheQuoteForPreview(quote: Quote, companyInfo?: CompanyInfo): void {
  try {
    const payload: CachedQuotePayload = {
      quote,
      companyInfo: companyInfo ?? db.getCompanyInfo(),
    };
    const serialized = JSON.stringify(payload);
    localStorage.setItem(`${PREFIX}${quote.id}`, serialized);
    sessionStorage.setItem(`${PREFIX}${quote.id}`, serialized);
  } catch {
    /* quota exceeded 등 — 미리보기만 영향 */
  }
}

export function readCachedQuoteForPreview(quoteId: string): Quote | null {
  try {
    const raw =
      localStorage.getItem(`${PREFIX}${quoteId}`) ??
      sessionStorage.getItem(`${PREFIX}${quoteId}`);
    if (!raw) return null;
    return parseCachedPayload(raw)?.quote ?? null;
  } catch {
    return null;
  }
}

export function readCachedCompanyInfoForPreview(quoteId: string): CompanyInfo | null {
  try {
    const raw =
      localStorage.getItem(`${PREFIX}${quoteId}`) ??
      sessionStorage.getItem(`${PREFIX}${quoteId}`);
    if (!raw) return null;
    return parseCachedPayload(raw)?.companyInfo ?? null;
  } catch {
    return null;
  }
}

export function isQuotePreviewRoute(): boolean {
  return typeof window !== 'undefined' && window.location.hash.includes('/quote-preview/');
}

export function openQuotePreviewWindow(quote: Quote): boolean {
  cacheQuoteForPreview(quote, db.getCompanyInfo());
  const base = window.location.href.split('#')[0];
  const url = `${base}#/quote-preview/${encodeURIComponent(quote.id)}`;
  const opened = window.open(url, '_blank', 'width=1280,height=900');
  return !!opened;
}
