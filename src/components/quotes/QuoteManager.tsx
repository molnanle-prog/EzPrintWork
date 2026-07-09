import React, { useState, useEffect } from 'react';

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

import { Plus, Printer, User, Calendar, DollarSign } from 'lucide-react';

function inferQuantityUnit(type?: string): string {
  const t = (type || '').toLowerCase();
  if (!t) return '개';
  if (t.includes('책자') || t.includes('카탈로그') || t.includes('브로슈어') || t.includes('매뉴얼')) return '권';
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

export const QuoteManager: React.FC = () => {

  const [quotes, setQuotes] = useState<Quote[]>([]);



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
  const visibleBoardJobs = filterJobsForOperationalBoard(jobs, { includeStatusKeys: ['QUOTE'] });
  const visibleBoardJobIds = new Set(visibleBoardJobs.map((job) => job.id));
  const visibleQuotes = quotes.filter((quote) => {
    const linkedJobId = resolveQuoteJobId(quote, jobs);
    return !!linkedJobId && visibleBoardJobIds.has(linkedJobId);
  });



  const sortedQuotes = [...visibleQuotes].sort(

    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()

  );



  const getStatusColor = (status: string) => {

    switch (status) {

      case '승인':

        return 'bg-emerald-100 text-emerald-700';

      case '거절':

        return 'bg-red-100 text-red-700';

      default:

        return 'bg-orange-100 text-orange-700';

    }

  };



  const openPreview = (quote: Quote) => {
    cacheQuoteForPreview(quote);
    const base = window.location.href.split('#')[0];
    const url = `${base}#/quote-preview/${encodeURIComponent(quote.id)}`;
    const opened = window.open(url, '_blank', 'width=1280,height=900');
    if (!opened) {
      window.alert('팝업이 차단되었습니다. 브라우저에서 팝업 허용 후 다시 시도해 주세요.');
    }
  };



  return (

    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">

      <div className="p-3 md:p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 flex-none">

        <div>

          <h2 className="text-lg md:text-xl font-bold text-slate-800">견적서 관리</h2>

          <p className="hidden md:block text-sm text-slate-500 mt-1">

            작업별 견적서를 확인하고 인쇄·PDF로 저장할 수 있습니다.

          </p>

        </div>

      </div>



      {/* Desktop Table View */}

      <div className="hidden md:block overflow-x-auto flex-1 custom-scrollbar">

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
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
            <tr>
              <th className="p-0" aria-hidden="true" />
              <th className="px-3 py-2 font-semibold text-slate-600 text-sm">작업번호</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-sm">제목</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-sm">업체명</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-sm">내용</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-sm">금액</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-sm">발행일</th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-sm">상태</th>
              <th className="px-2 py-2 font-semibold text-slate-600 text-sm text-right">관리</th>
              <th className="p-0" aria-hidden="true" />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">

            {sortedQuotes.length === 0 && (

              <tr>

                <td colSpan={10} className="p-8 text-center text-slate-400">

                  보드에 남아있는 작업의 견적서가 없습니다.

                </td>

              </tr>

            )}

            {sortedQuotes.map((quote) => (

              <tr

                key={quote.id}

                onClick={() => openPreview(quote)}

                className="hover:bg-blue-50/50 transition-colors group cursor-pointer"

              >
                <td className="p-0" aria-hidden="true" />
                <td

                  className="px-3 py-2 font-mono text-[11px] font-bold text-indigo-700 whitespace-nowrap"

                  title={getQuoteJobNumber(quote, jobs)}

                >

                  {getQuoteJobNumber(quote, jobs)}

                </td>

                <td

                  className="px-3 py-2 font-semibold text-slate-800 text-sm truncate"

                  title={getQuoteTitle(quote, jobs)}

                >

                  {getQuoteTitle(quote, jobs)}

                </td>

                <td className="px-3 py-2 font-medium text-slate-700 text-sm truncate" title={formatQuoteClientLabel(quote, jobs)}>
                  {formatQuoteClientLabel(quote, jobs)}
                </td>

                <td

                  className="px-3 py-2 text-slate-600 text-xs truncate"

                  title={getQuoteContentSummary(quote, jobs)}

                >

                  {getQuoteContentSummary(quote, jobs)}

                </td>

                <td className="px-3 py-2 font-bold text-slate-800 text-sm whitespace-nowrap">

                  {quote.totalAmount.toLocaleString()}원

                  {quote.vatIncluded && (

                    <span className="block text-[9px] font-normal text-slate-400">부가세 포함</span>

                  )}

                </td>

                <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">

                  {new Date(quote.date).toLocaleDateString()}

                </td>

                <td className="px-3 py-2">

                  <span

                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${getStatusColor(quote.status)}`}

                  >

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

                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"

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



      {/* Mobile Card View */}

      <div className="md:hidden flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">

        {sortedQuotes.length === 0 && (

          <div className="text-center text-slate-400 py-10">보드에 남아있는 작업의 견적서가 없습니다.</div>

        )}

        {sortedQuotes.map((quote) => (

          <div

            key={quote.id}

            onClick={() => openPreview(quote)}

            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm active:scale-[0.98] transition-transform cursor-pointer"

          >

            <div className="flex justify-between items-start mb-2 gap-2">

              <div className="min-w-0 flex-1">

                <span

                  className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded"

                  title={getQuoteJobNumber(quote, jobs)}

                >

                  {getQuoteJobNumber(quote, jobs)}

                </span>

                <h3 className="font-bold text-slate-800 text-sm mt-1 truncate" title={getQuoteTitle(quote, jobs)}>

                  {getQuoteTitle(quote, jobs)}

                </h3>

                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                  <User size={12} className="shrink-0" />
                  {formatQuoteClientLabel(quote, jobs)}
                </p>

              </div>

              <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${getStatusColor(quote.status)}`}>

                {quote.status}

              </span>

            </div>



            <div className="text-xs text-slate-600 mb-3 bg-slate-50 p-2 rounded line-clamp-2">

              {getQuoteContentSummary(quote, jobs)}

            </div>



            <div className="flex justify-between items-center border-t border-slate-100 pt-3 text-sm">

              <div className="flex items-center gap-1.5 text-slate-500 text-xs">

                <Calendar size={14} />

                <span>{new Date(quote.date).toLocaleDateString()}</span>

              </div>

              <div className="flex items-center gap-1 font-bold text-blue-600 text-sm">

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


