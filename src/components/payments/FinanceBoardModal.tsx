import React, { useMemo, useState } from 'react';
import { X, CreditCard, Wallet, Search } from 'lucide-react';
import { db } from '../../services/dataService';
import { Job } from '../../types';
import { getJobOutstandingAmount, normalizePrepaidBalance } from '../../utils/prepaidBalance';

type TabKey = 'receivable' | 'prepaid';

export const FinanceBoardModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<TabKey>('receivable');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const receivableJobs = useMemo(
    () =>
      db
        .getAllJobs()
        .filter((j) => (j.paymentStatus === '결제대기' || j.paymentStatus === '일부결제') && j.status !== 'CANCELED')
        .filter((j) => {
          if (!q) return true;
          return (
            (j.title || '').toLowerCase().includes(q) ||
            (j.clientName || '').toLowerCase().includes(q) ||
            (j.contactPerson || '').toLowerCase().includes(q)
          );
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [q]
  );

  const prepaidCards = useMemo(
    () =>
      db
        .getClients()
        .map((client) => ({
          id: client.id,
          name: client.name,
          balance: normalizePrepaidBalance(client.prepaidBalance),
        }))
        .filter((row) => row.balance > 0)
        .filter((row) => (!q ? true : row.name.toLowerCase().includes(q)))
        .sort((a, b) => b.balance - a.balance),
    [q]
  );

  const summary = useMemo(() => {
    const totalReceivable = receivableJobs.reduce((sum, job) => sum + getJobOutstandingAmount(job), 0);
    const totalPrepaid = db.getTotalPrepaidBalance();
    return {
      receivableCount: receivableJobs.length,
      totalReceivable,
      prepaidClientCount: prepaidCards.length,
      totalPrepaid,
      netPosition: totalPrepaid - totalReceivable,
    };
  }, [receivableJobs, prepaidCards.length]);

  return (
    <div className="fixed inset-0 z-[10020] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${tab === 'receivable' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}
              onClick={() => setTab('receivable')}
            >
              미수 카드
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${tab === 'prepaid' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'}`}
              onClick={() => setTab('prepaid')}
            >
              선불 잔액 카드
            </button>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/80 dark:bg-red-950/20 px-3 py-2">
              <p className="font-bold text-red-600">미수 합계</p>
              <p className="text-lg font-black text-red-700 dark:text-red-300 tabular-nums">
                {summary.totalReceivable.toLocaleString()}원
              </p>
              <p className="text-[11px] text-red-500/80">{summary.receivableCount}건 (선불 차감 반영)</p>
            </div>
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/80 dark:bg-indigo-950/20 px-3 py-2">
              <p className="font-bold text-indigo-600">선불 잔액 합계</p>
              <p className="text-lg font-black text-indigo-700 dark:text-indigo-300 tabular-nums">
                {summary.totalPrepaid.toLocaleString()}원
              </p>
              <p className="text-[11px] text-indigo-500/80">{summary.prepaidClientCount}개 거래처</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2">
              <p className="font-bold text-slate-600 dark:text-slate-300">순 포지션</p>
              <p
                className={`text-lg font-black tabular-nums ${
                  summary.netPosition >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                {summary.netPosition >= 0 ? '+' : ''}
                {summary.netPosition.toLocaleString()}원
              </p>
              <p className="text-[11px] text-slate-500">선불 − 미수</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'receivable' ? '작업명/고객사 검색' : '고객사 검색'}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
        </div>

        <div className="p-5 overflow-auto max-h-[70vh]">
          {tab === 'receivable' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {receivableJobs.map((job: Job) => {
                const outstanding = getJobOutstandingAmount(job);
                const prepaidApplied = job.prepaidAppliedAmount || 0;
                return (
                  <div key={job.id} className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/20 p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{job.title}</p>
                      <CreditCard size={14} className="text-red-600" />
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{job.clientName}</p>
                    <p className="text-sm font-black text-red-700 dark:text-red-300 mt-2">
                      미수 {outstanding.toLocaleString()}원
                    </p>
                    {(job.price || 0) !== outstanding && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        견적 {(job.price || 0).toLocaleString()}원
                        {prepaidApplied > 0 ? ` · 선불차감 ${prepaidApplied.toLocaleString()}원` : ''}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-1">{job.paymentStatus}</p>
                  </div>
                );
              })}
              {receivableJobs.length === 0 && <div className="text-sm text-slate-500">표시할 미수 카드가 없습니다.</div>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {prepaidCards.map((row) => (
                <div key={row.id} className="rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/70 dark:bg-indigo-950/20 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800 dark:text-slate-100">{row.name}</p>
                    <Wallet size={14} className="text-indigo-600" />
                  </div>
                  <p className="text-sm font-black text-indigo-700 dark:text-indigo-300 mt-2">잔액 {row.balance.toLocaleString()}원</p>
                </div>
              ))}
              {prepaidCards.length === 0 && <div className="text-sm text-slate-500">선불 잔액이 있는 거래처가 없습니다.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
