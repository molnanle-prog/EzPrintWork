import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../services/dataService';
import { Job, Staff } from '../../types';
import { Search, History, EyeOff, RotateCcw, ArrowUpDown } from 'lucide-react';
import { JobDetailModal } from '../common/JobDetailModal';
import { isJobHiddenForManagementCard } from '../../utils/jobBoardVisibility';

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  RECEIVED: '접수',
  IN_PROGRESS: '진행중',
  COMPLETED: '완료',
  DELIVERY: '출고',
  CANCELED: '취소',
};

type VisibilityFilter = 'all' | 'hidden' | 'visible';
type SortKey = 'createdAt' | 'updatedAt' | 'boardHiddenAt' | 'title' | 'clientName' | 'status';
type SortDir = 'asc' | 'desc';

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

function formatBoardHiddenAt(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getHiddenReasonLabel(job: Job): string {
  if (!job.boardHiddenAt) return '';
  if (isJobHiddenForManagementCard(job) || job.managementCardPinnedAt) return '관리카드';
  return '수동';
}

function compareJobs(a: Job, b: Job, sortKey: SortKey, sortDir: SortDir): number {
  const dir = sortDir === 'asc' ? 1 : -1;

  if (sortKey === 'title' || sortKey === 'clientName' || sortKey === 'status') {
    const av = (a[sortKey] || '').toString();
    const bv = (b[sortKey] || '').toString();
    return av.localeCompare(bv, 'ko') * dir;
  }

  const av = new Date(getJobDateValue(a, sortKey)).getTime();
  const bv = new Date(getJobDateValue(b, sortKey)).getTime();
  return (av - bv) * dir;
}

function getJobDateValue(job: Job, sortKey: SortKey): string {
  if (sortKey === 'updatedAt') return job.createdAt;
  if (sortKey === 'createdAt') return job.createdAt;
  if (sortKey === 'boardHiddenAt') return job.boardHiddenAt || '';
  return '';
}

export const WorkHistoryBoard: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [query, setQuery] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
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

  const statusLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    db.getStatusDefinitions().forEach((s) => {
      if (s.key && s.label) map.set(s.key, s.label);
    });
    return map;
  }, [jobs]);

  const statusOptions = useMemo(() => {
    const keys = new Set(jobs.map((job) => job.status).filter(Boolean));
    return Array.from(keys).sort((a, b) => {
      const al = statusLabelMap.get(a) || DEFAULT_STATUS_LABELS[a] || a;
      const bl = statusLabelMap.get(b) || DEFAULT_STATUS_LABELS[b] || b;
      return al.localeCompare(bl, 'ko');
    });
  }, [jobs, statusLabelMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...jobs]
      .filter((job) => {
        if (visibilityFilter === 'hidden' && !job.boardHiddenAt) return false;
        if (visibilityFilter === 'visible' && job.boardHiddenAt) return false;
        if (statusFilter !== 'all' && job.status !== statusFilter) return false;
        if (!q) return true;
        return (
          (job.title || '').toLowerCase().includes(q) ||
          (job.clientName || '').toLowerCase().includes(q) ||
          (job.type || '').toLowerCase().includes(q) ||
          (job.description || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => compareJobs(a, b, sortKey, sortDir));
  }, [jobs, query, visibilityFilter, statusFilter, sortKey, sortDir]);

  const hiddenCount = useMemo(() => jobs.filter((job) => job.boardHiddenAt).length, [jobs]);

  const toggleSortDir = () => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
        <div className="flex items-center gap-2 mb-3">
          <History size={18} className="text-blue-600" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100">작업 내역 게시판</h3>
          {hiddenCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              보드 숨김 {hiddenCount}건
            </span>
          )}
        </div>
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="작업명/고객사/품목 검색"
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {([
              ['all', '전체'],
              ['hidden', '숨김만'],
              ['visible', '표시중'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVisibilityFilter(id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                  visibilityFilter === id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 rounded-lg border text-xs bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
          >
            <option value="all">상태 전체</option>
            {statusOptions.map((key) => (
              <option key={key} value={key}>
                {statusLabelMap.get(key) || DEFAULT_STATUS_LABELS[key] || key}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-2 py-1 rounded-lg border text-xs bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
            >
              <option value="createdAt">등록일</option>
              <option value="updatedAt">수정일</option>
              <option value="boardHiddenAt">보드 숨김시간</option>
              <option value="title">작업명</option>
              <option value="clientName">고객사</option>
              <option value="status">상태</option>
            </select>
            <button
              type="button"
              onClick={toggleSortDir}
              className="px-2 py-1 rounded-lg border text-xs bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 flex items-center gap-1"
              title={sortDir === 'desc' ? '내림차순' : '오름차순'}
            >
              <ArrowUpDown size={12} />
              {sortDir === 'desc' ? '최신순' : '오래된순'}
            </button>
          </div>
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
              <th className="px-3 py-2">보드 숨김시간</th>
              <th className="px-3 py-2 text-right">보드</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                  조건에 맞는 작업이 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((job) => (
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
                  <td className="px-3 py-2">
                    {statusLabelMap.get(job.status) || DEFAULT_STATUS_LABELS[job.status] || job.status}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">
                    {job.boardHiddenAt ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-rose-600 dark:text-rose-400 font-medium">
                          {formatBoardHiddenAt(job.boardHiddenAt)}
                        </span>
                        <span className="text-[10px] text-slate-500">{getHiddenReasonLabel(job)}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
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
              ))
            )}
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
