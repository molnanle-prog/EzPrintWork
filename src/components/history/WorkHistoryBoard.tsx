import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../services/dataService';
import { Job, Staff } from '../../types';
import { Search, History, EyeOff, RotateCcw } from 'lucide-react';
import { JobDetailModal } from '../common/JobDetailModal';

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  RECEIVED: '접수',
  IN_PROGRESS: '진행중',
  COMPLETED: '완료',
  DELIVERY: '출고',
  CANCELED: '취소',
};

function summarizeSubJob(job: Job): string {
  const subJobs = job.subJobs || [];
  if (subJobs.length === 0) return (job.description || '-').trim() || '-';

  if (subJobs.length === 1) {
    const item = subJobs[0];
    const specs = item.specs || {};
    const parts = [
      item.type || job.type,
      specs.size,
      specs.quantity ? `${specs.quantity}` : '',
      specs.processing?.length ? specs.processing.join(', ') : '',
    ].filter(Boolean);
    return parts.join(' / ') || (job.description || '-');
  }

  const cover = subJobs.find((s) => /표지/.test(s.type || ''));
  const inner = subJobs.find((s) => /내지/.test(s.type || ''));
  const qty = cover?.specs?.quantity || inner?.specs?.quantity || '';
  const compact = (label: string, target?: typeof subJobs[number]) => {
    if (!target) return '';
    const paper = [target.specs?.paperType, target.specs?.paperWeight].filter(Boolean).join(' ');
    const proc = target.specs?.processing?.length ? `(${target.specs.processing.join(',')})` : '';
    return `${label} ${paper}${proc}`.trim();
  };

  const picked = [compact('표지:', cover), compact('내지:', inner)].filter(Boolean);
  if (picked.length > 0) return `${picked.join(', ')}${qty ? `, ${qty}` : ''}`;

  return subJobs
    .slice(0, 2)
    .map((s) => `${s.type || '품목'} ${s.specs?.size || ''} ${s.specs?.quantity || ''}`.trim())
    .join(' · ');
}

export const WorkHistoryBoard: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [query, setQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobModalViewMode, setJobModalViewMode] = useState<'summary' | 'edit'>('summary');

  useEffect(() => {
    const load = () => {
      setJobs(db.getAllJobs());
      setStaff(db.getStaff());
    };
    load();
    return db.subscribe(load);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...jobs]
      .filter((job) => {
        if (!q) return true;
        return (
          (job.title || '').toLowerCase().includes(q) ||
          (job.clientName || '').toLowerCase().includes(q) ||
          (job.type || '').toLowerCase().includes(q) ||
          (job.description || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [jobs, query]);

  const statusLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    db.getStatusDefinitions().forEach((s) => {
      if (s.key && s.label) map.set(s.key, s.label);
    });
    return map;
  }, [jobs]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
        <div className="flex items-center gap-2 mb-3">
          <History size={18} className="text-blue-600" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100">작업 내역 게시판</h3>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="작업명/고객사/품목 검색"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-3 py-2">등록일</th>
              <th className="px-3 py-2">작업</th>
              <th className="px-3 py-2">고객사</th>
              <th className="px-3 py-2">간단 내용</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2 text-right">보드</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((job) => (
              <tr
                key={job.id}
                className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer"
                onClick={() => {
                  setSelectedJob(job);
                  setJobModalViewMode('summary');
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelectedJob(job);
                  setJobModalViewMode('edit');
                }}
              >
                <td className="px-3 py-2 whitespace-nowrap">{new Date(job.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2 font-medium">{job.title}</td>
                <td className="px-3 py-2">{job.clientName}</td>
                <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{summarizeSubJob(job)}</td>
                <td className="px-3 py-2">{statusLabelMap.get(job.status) || DEFAULT_STATUS_LABELS[job.status] || job.status}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {job.boardHiddenAt ? (
                      <>
                        <span className="text-[11px] text-rose-600 flex items-center gap-1">
                          <EyeOff size={12} />
                          숨김
                        </span>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await db.unhideJobFromBoard(job.id);
                          }}
                          className="px-2 py-1 rounded border text-xs bg-white dark:bg-slate-800"
                          title="보드 다시 표시"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await db.hideJobFromBoard(job.id);
                        }}
                        className="px-2 py-1 rounded border text-xs bg-white dark:bg-slate-800"
                        title="보드에서 내리기"
                      >
                        보드 숨김
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          staff={staff}
          initialViewMode={jobModalViewMode}
          onClose={() => setSelectedJob(null)}
          onUpdate={async (updated) => {
            await db.updateJob(updated);
            setSelectedJob(null);
          }}
        />
      )}
    </div>
  );
};
