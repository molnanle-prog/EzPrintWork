
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { Quote } from '../types';
import { db } from '../services/dataService';
import { db as firestore } from '../services/firebase';
import { QuotePreviewPanel } from '../components/quotes/QuotePreviewPanel';
import { readCachedQuoteForPreview } from '../utils/quotePreviewStorage';

export const QuotePreviewPage: React.FC = () => {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [quote, setQuote] = useState<Quote | null>(() =>
    quoteId ? readCachedQuoteForPreview(quoteId) : null
  );
  const [syncStatus, setSyncStatus] = useState(db.getSyncStatus());
  const [fetchDone, setFetchDone] = useState(false);

  const loadQuote = useCallback(async () => {
    if (!quoteId) return;

    const fromCache = readCachedQuoteForPreview(quoteId);
    const fromMemory = db.getQuotes().find((q) => q.id === quoteId) ?? null;
    if (fromMemory) {
      setQuote(fromMemory);
      setFetchDone(true);
      return;
    }
    if (fromCache) {
      setQuote(fromCache);
    }

    const tenantId = db.getTenantId();
    if (tenantId && db.getSyncStatus() === 'synced') {
      try {
        const snap = await getDoc(doc(firestore, 'tenants', tenantId, 'quotes', quoteId));
        if (snap.exists()) {
          setQuote({ ...snap.data(), id: snap.id } as Quote);
        }
      } catch (e) {
        console.warn('[QuotePreviewPage] Firestore fetch failed:', e);
      }
    }
    setFetchDone(true);
  }, [quoteId]);

  useEffect(() => {
    if (!quoteId) return;

    void loadQuote();
    const unsubscribe = db.subscribe(() => {
      setSyncStatus(db.getSyncStatus());
      void loadQuote();
    });
    return unsubscribe;
  }, [quoteId, loadQuote]);

  const handleClose = () => {
    window.close();
  };

  const waitingSync = syncStatus !== 'synced' && !quote;

  if (waitingSync || (!fetchDone && !quote)) {
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
          창 닫기
        </button>
      </div>
    );
  }

  return <QuotePreviewPanel quote={quote} onClose={handleClose} />;
};
