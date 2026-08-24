import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../../services/dataService';
import {
  getQuoteJobNumber,
  getQuoteTitle,
  formatQuoteClientLabel,
  resolveQuoteJobId,
  resolveQuoteJob,
} from '../../utils/quoteJobSync';
import { cacheQuoteForPreview } from '../../utils/quotePreviewStorage';
import { filterJobsForOperationalBoard } from '../../utils/jobDisplayFilters';
import { Quote } from '../../types';
import { FileText, Printer, User, Calendar, DollarSign, Search, CheckCircle2, Clock, XCircle } from 'lucide-react';

type PeriodPreset = 'all' | 'month' | 'lastMonth' | 'custom';
type StatusFilter = 'all' | Quote['status'];

function inferQuantityUnit(type?: string): string {
  const t = (type || '').toLowerCase();
  if (!t) return '개';
  if (t.includes('책자') || t.includes('카탈로그') || t.includes('브로슈어') || t.includes('매뉴얼')) return '권';
  if (t.includes('복사')) return '부';
  if (t.includes('명함') || t.includes('전단') || t.includes('리플렛') || t.includes('포스터') || t.includes('스티커')) return '장';
  return '개';
}

function formatQuantityWithUnit(quantity?: string, type?: string): string {
  const raw = (quantity || '').trim();
  if (!raw) return '';
  if (/[a-zA-Z가-힣]/.test(raw)) return raw;
  const digits = raw.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(digits)) return raw;
  const num = Number(digits);
  if (!Number.isFinite(num)) return raw;
  return `${num.toLocaleString()}${inferQuantityUnit(type)}`;
}

function getQuoteContentSummary(quote: Quote, jobs: ReturnType<typeof db.getAllJobs>): string {
  const job = resolveQuoteJob(quote, jobs);
  if (job?.subJobs?.length) {
    return job.subJobs
      .map((item) => {
        const specs = item.specs || {};
        const qty = formatQuantityWithUnit(specs.quantity, item.type);
        const proc = specs.processing?.length ? `(${specs.processing.join(', ')})` : '';
        return [item.type, specs.size, qty, proc].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join(' · ');
  }

  const lines = quote.lines?.filter((l) => l.productType || l.quantity) ?? [];
  if (lines.length > 0) {
    return lines
      .map((line) => {
        const qty = formatQuantityWithUnit(line.quantity, line.productType);
        return [line.productType, qty].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join(' · ');
  }

  if (quote.items && quote.items !== '품목 없음') return quote.items;
  return '작업 내역 없음';
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateKey(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatYmd(date);
}

function isInDateRange(iso: string | undefined, from: string, to: string): boolean {
  const key = toDateKey(iso);
  if (!key) return !from && !to;
  const start = from && to && from > to ? to : from;
  const end = from && to && from > to ? from : to;
  if (start && key < start) return false;
  if (end && key > end) return false;
  return true;
}

function getMonthRange(monthOffset = 0): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
  return { from: formatYmd(start), to: formatYmd(end) };
}

function quoteTimeIso(quote: Quote): string {
  return quote.createdAt || quote.updatedAt || quote.date;
}

function quoteTime(quote: Quote): number {
  return new Date(quoteTimeIso(quote)).getTime();
}

function getStatusColor(status: string): string {
  switch (status) {
    case '승인':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    case '거절':
      return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
    default:
      return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800';
  }
}

export const QuoteManager: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadQuotes = () => {
    setQuotes(db.getQuotes());
  };

  useEffect(() => {
    db.ensureQuotesSync();
    loadQuotes();
    const unsubscribe = db.subscribe(loadQuotes);
    return () => unsubscribe();
  }, []);

  const jobs = db.getAllJobs();

  const visibleQuotes = useMemo(() => {
    const visibleBoardJobs = filterJobsForOperationalBoard(jobs, { includeStatusKeys: ['QUOTE'] });
    const visibleBoardJobIds = new Set(visibleBoardJobs.map((job) => job.id));
    return quotes.filter((quote) => {
      const linkedJobId = resolveQuoteJobId(quote, jobs);
      return !!linkedJobId && visibleBoardJobIds.has(linkedJobId);
    });
  }, [quotes, jobs]);

  const periodQuotes = useMemo(() => {
    const ranged =
      !dateFrom && !dateTo
        ? visibleQuotes
        : visibleQuotes.filter((quote) => isInDateRange(quoteTimeIso(quote), dateFrom, dateTo));
    return [...ranged].sort((a, b) => {
      const diff = quoteTime(b) - quoteTime(a);
      if (diff !== 0) return diff;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [visibleQuotes, dateFrom, dateTo]);

  const applyPeriodPreset = useCallback((preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    const range = getMonthRange(preset === 'lastMonth' ? -1 : 0);
    setDateFrom(range.from);
    setDateTo(range.to);
  }, []);

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    setPeriodPreset('custom');
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    setPeriodPreset('custom');
  };

  const q = search.trim().toLowerCase();
  const displayedQuotes = useMemo(() => {
    return periodQuotes.filter((quote) => {
      if (statusFilter !== 'all' && quote.status !== statusFilter) return false;
      if (!q) return true;
      const title = getQuoteTitle(quote, jobs).toLowerCase();
      const client = formatQuoteClientLabel(quote, jobs).toLowerCase();
      const jobNo = getQuoteJobNumber(quote, jobs).toLowerCase();
      return (
        title.includes(q) ||
        client.includes(q) ||
        jobNo.includes(q) ||
        (quote.clientName || '').toLowerCase().includes(q) ||
        (quote.contactPerson || '').toLowerCase().includes(q) ||
        (quote.title || '').toLowerCase().includes(q)
      );
    });
  }, [periodQuotes, statusFilter, q, jobs]);

  const stats = useMemo(() => {
    const waiting = periodQuotes.filter((qte) => qte.status === '대기');
    const approved = periodQuotes.filter((qte) => qte.status === '승인');
    const rejected = periodQuotes.filter((qte) => qte.status === '거절');
    const sum = (list: Quote[]) => list.reduce((s, item) => s + (item.totalAmount || 0), 0);
    return {
      waitingCount: waiting.length,
      waitingAmount: sum(waiting),
      approvedCount: approved.length,
      approvedAmount: sum(approved),
      rejectedCount: rejected.length,
      rejectedAmount: sum(rejected),
    };
  }, [periodQuotes]);

  const openPreview = (quote: Quote) => {
    cacheQuoteForPreview(quote, db.getCompanyInfo());
    const base = window.location.href.split('#')[0];
    const url = `${base}#/quote-preview/${encodeURIComponent(quote.id)}`;
    const opened = window.open(url, '_blank', 'width=1280,height=900');
    if (!opened) {
      window.alert('팝업이 차단되었습니다. 브라우저에서 팝업 허용 후 다시 시도해 주세요.');
    }
  };

  const filterTabs: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: '대기', label: '대기' },
    { id: '승인', label: '승인' },
    { id: '거절', label: '거절' },
  ];

  const emptyMessage = q || dateFrom || dateTo || statusFilter !== 'all'
    ? '조건에 맞는 견적서가 없습니다.'
    : '보드에 남아있는 작업의 견적서가 없습니다.';

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-full min-h-0 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex-none">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] xl:items-center gap-2">
          <div className="shrink-0">
            <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FileText size={22} className="text-blue-600" />
              견적서 관리
            </h2>
          </div>
          <div className="relative w-full xl:w-[28rem] justify-self-center">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="거래처·작업명·작업번호 검색"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-wrap items-center justify-center xl:justify-end gap-1.5 min-w-0">
            <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-600 dark:text-slate-300">
              <Calendar size={16} className="text-blue-600" />
              기간
            </span>
            {([
              { id: 'all', label: '전체' },
              { id: 'month', label: '이번 달' },
              { id: 'lastMonth', label: '지난 달' },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => applyPeriodPreset(tab.id)}
                className={`h-9 px-3 inline-flex items-center rounded-lg text-sm font-bold border transition-colors ${
                  periodPreset === tab.id
                    ? 'bg-slate-800 dark:bg-slate-100 border-slate-800 dark:border-slate-100 text-white dark:text-slate-900'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 scheme-light dark:scheme-dark"
              aria-label="시작일"
            />
            <span className="text-sm text-slate-400">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 scheme-light dark:scheme-dark"
              aria-label="종료일"
            />
            {(dateFrom || dateTo) && (
              <span className="text-sm text-slate-500 dark:text-slate-400">발행 {periodQuotes.length}건</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900/40 px-3 py-2">
            <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wide flex items-center gap-1">
              <Clock size={12} /> 대기
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-xl font-black text-orange-800 dark:text-orange-200 leading-none">{stats.waitingCount}건</p>
              <p className="text-xl font-black text-orange-600/80 tabular-nums leading-none">
                {stats.waitingAmount.toLocaleString()}원
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900/50 px-3 py-2">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide flex items-center gap-1">
              <CheckCircle2 size={12} /> 승인
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-xl font-black text-emerald-800 dark:text-emerald-200 leading-none">{stats.approvedCount}건</p>
              <p className="text-xl font-black text-emerald-600/80 tabular-nums leading-none">
                {stats.approvedAmount.toLocaleString()}원
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 px-3 py-2">
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide flex items-center gap-1">
              <XCircle size={12} /> 거절
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-xl font-black text-red-800 dark:text-red-200 leading-none">{stats.rejectedCount}건</p>
              <p className="text-xl font-black text-red-600/80 tabular-nums leading-none">
                {stats.rejectedAmount.toLocaleString()}원
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`h-9 px-3 inline-flex items-center rounded-lg text-sm font-bold border transition-colors ${
                statusFilter === tab.id
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden md:block overflow-auto flex-1 min-h-0 custom-scrollbar">
        <table className="w-full text-left border-collapse table-fixed">
          <colgroup>
            <col style={{ width: '2%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '2%' }} />
          </colgroup>
          <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
            <tr>
              <th className="p-0" aria-hidden="true" />
              <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 text-sm">작업번호</th>
              <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 text-sm">제목</th>
              <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 text-sm">업체명</th>
              <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 text-sm">내용</th>
              <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 text-sm">금액</th>
              <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 text-sm">발행일</th>
              <th className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 text-sm">상태</th>
              <th className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300 text-sm text-right">관리</th>
              <th className="p-0" aria-hidden="true" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {displayedQuotes.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-400 dark:text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {displayedQuotes.map((quote) => (
              <tr
                key={quote.id}
                onClick={() => openPreview(quote)}
                className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors group cursor-pointer"
              >
                <td className="p-0" aria-hidden="true" />
                <td
                  className="px-3 py-2 font-mono text-[11px] font-bold text-indigo-700 dark:text-indigo-300 whitespace-nowrap"
                  title={getQuoteJobNumber(quote, jobs)}
                >
                  {getQuoteJobNumber(quote, jobs)}
                </td>
                <td
                  className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100 text-sm truncate"
                  title={getQuoteTitle(quote, jobs)}
                >
                  {getQuoteTitle(quote, jobs)}
                </td>
                <td
                  className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200 text-sm truncate"
                  title={formatQuoteClientLabel(quote, jobs)}
                >
                  {formatQuoteClientLabel(quote, jobs)}
                </td>
                <td
                  className="px-3 py-2 text-slate-600 dark:text-slate-300 text-xs truncate"
                  title={getQuoteContentSummary(quote, jobs)}
                >
                  {getQuoteContentSummary(quote, jobs)}
                </td>
                <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-100 text-sm whitespace-nowrap">
                  {quote.totalAmount.toLocaleString()}원
                  {quote.vatIncluded && (
                    <span className="block text-[9px] font-normal text-slate-400">부가세 포함</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-500 dark:text-slate-400 text-xs whitespace-nowrap">
                  {new Date(quote.date).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${getStatusColor(quote.status)}`}>
                    {quote.status}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreview(quote);
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded"
                      title="견적서 미리보기"
                    >
                      <Printer size={16} />
                    </button>
                  </div>
                </td>
                <td className="p-0" aria-hidden="true" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {displayedQuotes.length === 0 && (
          <div className="text-center text-slate-400 dark:text-slate-500 py-10">{emptyMessage}</div>
        )}
        {displayedQuotes.map((quote) => (
          <div
            key={quote.id}
            onClick={() => openPreview(quote)}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className="flex justify-between items-start mb-2 gap-2">
              <div className="min-w-0 flex-1">
                <span
                  className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded"
                  title={getQuoteJobNumber(quote, jobs)}
                >
                  {getQuoteJobNumber(quote, jobs)}
                </span>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm mt-1 truncate" title={getQuoteTitle(quote, jobs)}>
                  {getQuoteTitle(quote, jobs)}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                  <User size={12} className="shrink-0" />
                  {formatQuoteClientLabel(quote, jobs)}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 ${getStatusColor(quote.status)}`}>
                {quote.status}
              </span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mb-3 bg-slate-50 dark:bg-slate-800 p-2 rounded line-clamp-2">
              {getQuoteContentSummary(quote, jobs)}
            </div>
            <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-700 pt-3 text-sm">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs">
                <Calendar size={14} />
                <span>{new Date(quote.date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400 text-sm">
                <DollarSign size={14} />
                <span>{quote.totalAmount.toLocaleString()}원</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
