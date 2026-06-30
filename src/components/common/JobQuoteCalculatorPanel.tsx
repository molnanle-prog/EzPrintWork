import React, { useMemo } from 'react';
import { JobItem } from '../../types';
import { calcQuoteTotals } from '../../utils/quoteCalculator';
import { Calculator, Check, X } from 'lucide-react';

interface JobQuoteCalculatorPanelProps {
  subJobs: JobItem[];
  lineQuotes: Record<string, number>;
  vatIncluded: boolean;
  onLineQuoteChange: (subJobId: string, amount: number) => void;
  onVatIncludedChange: (included: boolean) => void;
  onApply: () => void;
  onClose: () => void;
}

export const JobQuoteCalculatorPanel: React.FC<JobQuoteCalculatorPanelProps> = ({
  subJobs,
  lineQuotes,
  vatIncluded,
  onLineQuoteChange,
  onVatIncludedChange,
  onApply,
  onClose,
}) => {
  const supplySum = useMemo(
    () =>
      subJobs.reduce((sum, sj) => {
        const n = Number(lineQuotes[sj.id] ?? sj.lineQuote ?? 0);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0),
    [subJobs, lineQuotes]
  );

  const totals = useMemo(() => calcQuoteTotals(supplySum, vatIncluded), [supplySum, vatIncluded]);

  return (
    <div className="mb-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2 animate-in fade-in zoom-in-95 duration-200 space-y-2">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-black text-slate-700 flex items-center gap-1">
          <Calculator size={11} className="text-amber-500" />
          종류별 견적 계산기
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-slate-200 text-slate-400"
          aria-label="계산기 닫기"
        >
          <X size={12} />
        </button>
      </div>

      <div className="space-y-1 max-h-32 overflow-y-auto custom-scrollbar pr-0.5">
        {subJobs.map((sj, idx) => (
          <div key={sj.id} className="flex items-center gap-1.5">
            <span
              className="shrink-0 min-w-0 max-w-[42%] truncate text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded"
              title={sj.type}
            >
              {sj.type || `품목 ${idx + 1}`}
            </span>
            <input
              type="number"
              min={0}
              value={lineQuotes[sj.id] ?? sj.lineQuote ?? ''}
              onChange={(e) => onLineQuoteChange(sj.id, Number(e.target.value) || 0)}
              placeholder="0"
              className="flex-1 min-w-0 p-0.5 bg-white border border-slate-300 rounded text-right text-[11px] font-mono font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none"
            />
            <span className="text-[9px] text-slate-500 shrink-0">원</span>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-1.5 cursor-pointer select-none py-0.5">
        <input
          type="checkbox"
          checked={vatIncluded}
          onChange={(e) => onVatIncludedChange(e.target.checked)}
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
        />
        <span className="text-[10px] font-bold text-slate-700">부가세(10%) 포함하여 합산</span>
      </label>

      <div className="bg-white rounded border border-slate-200 px-2 py-1 space-y-0.5 text-[10px]">
        <div className="flex justify-between text-slate-500">
          <span>공급가 합계</span>
          <span className="font-mono">{totals.supplyAmount.toLocaleString()}원</span>
        </div>
        {vatIncluded && (
          <div className="flex justify-between text-slate-500">
            <span>부가세 (10%)</span>
            <span className="font-mono">{totals.vatAmount.toLocaleString()}원</span>
          </div>
        )}
        <div className="flex justify-between font-black text-blue-700 border-t border-slate-100 pt-0.5">
          <span>{vatIncluded ? '최종 (부가세 포함)' : '최종 (부가세 미포함)'}</span>
          <span className="font-mono">{totals.totalAmount.toLocaleString()}원</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onApply}
        className="w-full flex items-center justify-center gap-1 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black rounded transition-colors"
      >
        <Check size={11} />
        금액란에 적용
      </button>
    </div>
  );
};
