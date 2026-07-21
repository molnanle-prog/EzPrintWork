
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Quote } from '../types';
import { db } from '../services/dataService';
import { QuotePreviewPanel } from '../components/quotes/QuotePreviewPanel';
import { readCachedQuoteForPreview } from '../utils/quotePreviewStorage';
import { useAuth } from '../contexts/AuthContext';

export const QuotePreviewPage: React.FC = () => {
  const { quoteId } = useParams<{ quoteId: string }>();
  const { currentUser } = useAuth();
  const [quote, setQuote] = useState<Quote | null>(() =>
    quoteId ? readCachedQuoteForPreview(quoteId) : null
  );
  const [fetchDone, setFetchDone] = useState(!!quote);

  const loadQuote = useCallback(async () => {
    if (!quoteId) return;

    const fromCache = readCachedQuoteForPreview(quoteId);
    if (fromCache) {
      setQuote(fromCache);
      setFetchDone(true);
      return;
    }

    const fromMemory = db.getQuotes().find((q) => q.id === quoteId) ?? null;
    if (fromMemory) {
      setQuote(fromMemory);
      setFetchDone(true);
      return;
    }

    // NAS/게이트웨이에서 견적 목록 hydrate 후 재검색 (Firestore 미사용)
    try {
      db.ensureQuotesSync();
      await new Promise((r) => setTimeout(r, 400));
      const afterHydrate = db.getQuotes().find((q) => q.id === quoteId) ?? null;
      if (afterHydrate) {
        setQuote(afterHydrate);
      }
    } catch (e) {
      console.warn('[QuotePreviewPage] NAS hydrate failed:', e);
    }
    setFetchDone(true);
  }, [quoteId, currentUser?.tenantId]);

  useEffect(() => {
    if (!quoteId) return;
    void db.ensureCompanyInfoForDocuments();
    void loadQuote();
    const unsubscribe = db.subscribe(() => {
      void loadQuote();
    });
    return unsubscribe;
  }, [quoteId, loadQuote]);

  const handleClose = () => {
    window.close();
  };

  if (!fetchDone && !quote) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-200 gap-3">
        <Loader2 className="animate-spin text-blue-600" size={32} />
        <p className="text-sm text-slate-500 font-medium">견적서 불러오는 중…</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-200 gap-4">
        <p className="text-slate-600 font-bold">견적서를 찾을 수 없습니다.</p>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-bold"
        >
          닫기
        </button>
      </div>
    );
  }

  return <QuotePreviewPanel quote={quote} onClose={handleClose} />;
};
