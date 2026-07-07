import React, { useEffect, useState } from 'react';
import { Job } from '../../types';
import { db, formatJobNumber } from '../../services/dataService';
import { Calendar, Loader2, Search, User } from 'lucide-react';

interface PastJobSearchResultsProps {
  query: string;
  onSelectJob: (job: Job) => void;
  limit?: number;
  className?: string;
}

export const PastJobSearchResults: React.FC<PastJobSearchResultsProps> = ({
  query,
  onSelectJob,
  limit = 30,
  className = '',
}) => {
  const [hits, setHits] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void db
        .searchJobsAsync(trimmed)
        .then((results) => {
          if (!cancelled) setHits(results.slice(0, limit));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, limit]);

  if (trimmed.length < 2) return null;

  return (
    <div className={`rounded-xl border border-blue-200 bg-blue-50/90 dark:bg-blue-950/30 dark:border-blue-800 p-3 ${className}`}>
      <p className="text-xs font-bold text-blue-800 dark:text-blue-200 mb-2 flex items-center gap-1.5">
        <Search size={13} />
        「{trimmed}」 지난 작업 검색 — 항목을 누르면 상세 등록정보가 열립니다
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 py-3">
          <Loader2 size={16} className="animate-spin" />
          지난 작업을 불러오는 중...
        </div>
      ) : hits.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-2">일치하는 작업이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scrollbar">
          {hits.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelectJob(job)}
              className="w-full text-left px-3 py-2 rounded-lg border border-blue-100 dark:border-blue-900 bg-white dark:bg-slate-900 hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-100 text-sm line-clamp-1">{job.title}</span>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">{formatJobNumber(job)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <User size={11} className="text-slate-400" />
                  {job.clientName || '거래처 없음'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar size={11} className="text-slate-400" />
                  접수 {new Date(job.createdAt).toLocaleDateString('ko-KR')}
                  {job.dueDate ? ` · 납기 ${new Date(job.dueDate).toLocaleDateString('ko-KR')}` : ''}
                </span>
                {job.price ? (
                  <span className="font-bold tabular-nums">{job.price.toLocaleString()}원</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
