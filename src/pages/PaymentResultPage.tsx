import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db as firestore } from '../services/firebase';

/**
 * 코페이 승인 성공 후 Functions가 리다이렉트하는 페이지.
 * tenants 문서를 다시 읽어 요금제 UI를 갱신합니다.
 */
export const PaymentSuccessPage: React.FC = () => {
  const [params] = useSearchParams();
  const orderNumber = params.get('orderNumber') || '';
  const { currentUser, updatePlan } = useAuth();
  const [loading, setLoading] = useState(true);
  const [planLabel, setPlanLabel] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tenantId = currentUser?.tenantId;
        if (!tenantId) return;
        const snap = await getDoc(doc(firestore, 'tenants', tenantId));
        if (!snap.exists() || cancelled) return;
        const data = snap.data() || {};
        const pay = String(data.paymentStatus || '').toUpperCase();
        if (pay === 'PAID') {
          updatePlan('pro');
          setPlanLabel(`PRO · 인원 ${data.maxStaff ?? '-'}명`);
        } else {
          setPlanLabel(`결제 상태: ${data.paymentStatus || '확인 중'}`);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.tenantId, updatePlan]);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="max-w-md w-full rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center shadow-2xl">
        {loading ? (
          <Loader2 className="mx-auto mb-4 animate-spin text-blue-600" size={40} />
        ) : (
          <CheckCircle2 className="mx-auto mb-4 text-emerald-500" size={48} />
        )}
        <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">결제 완료</h1>
        <p className="text-sm text-slate-500 mb-4">
          카드 결제가 승인되었습니다. PRO 요금제가 활성화됩니다.
        </p>
        {orderNumber && (
          <p className="text-xs text-slate-400 mb-2 font-mono break-all">주문번호: {orderNumber}</p>
        )}
        {planLabel && <p className="text-sm font-bold text-blue-600 mb-6">{planLabel}</p>}
        <Link
          to="/"
          className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-blue-600 text-white font-black hover:bg-blue-700"
        >
          메인으로 이동
        </Link>
      </div>
    </div>
  );
};

export const PaymentFailPage: React.FC = () => {
  const [params] = useSearchParams();
  const orderNumber = params.get('orderNumber') || '';
  const reason = params.get('reason') || '';

  const reasonText = useMemo(() => {
    if (reason === 'E111') return '사용자가 결제를 취소했습니다.';
    if (reason) return `사유 코드: ${reason}`;
    return '결제에 실패했거나 취소되었습니다.';
  }, [reason]);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="max-w-md w-full rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center shadow-2xl">
        <XCircle className="mx-auto mb-4 text-rose-500" size={48} />
        <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">결제 실패</h1>
        <p className="text-sm text-slate-500 mb-4">{reasonText}</p>
        {orderNumber && (
          <p className="text-xs text-slate-400 mb-6 font-mono break-all">주문번호: {orderNumber}</p>
        )}
        <Link
          to="/"
          className="inline-flex items-center justify-center px-6 py-3 rounded-2xl bg-slate-800 text-white font-black hover:bg-slate-700"
        >
          메인으로 이동
        </Link>
      </div>
    </div>
  );
};
