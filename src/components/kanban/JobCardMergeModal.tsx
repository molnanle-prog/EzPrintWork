import React, { useMemo, useState } from 'react';
import { GitMerge, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { db, getErrorMessage } from '../../services/dataService';
import { Job, JobStatusDefinition, Staff } from '../../types';
import { useDialog } from '../../contexts/DialogContext';
import { buildMergedJobCard, jobClientKey, jobItemsForMerge, sameJobClient } from '../../utils/jobCardMerge';

function dueLabel(value?: string): string {
  if (!value) return '납품일 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function staffLabel(job: Job, staff: Staff[]): string {
  const ids = job.assignedStaffIds?.length
    ? job.assignedStaffIds
    : job.assignedStaffId
      ? [job.assignedStaffId]
      : [];
  const names = ids
    .map((id) => staff.find((person) => person.id === id)?.name)
    .filter((name): name is string => !!name);
  return names.length ? names.join(', ') : '담당 없음';
}

export const JobCardMergeModal: React.FC<{
  jobs: Job[];
  staff: Staff[];
  statuses: JobStatusDefinition[];
  onClose: () => void;
  previewMode?: boolean;
}> = ({ jobs, staff, statuses, onClose, previewMode = false }) => {
  const { showConfirm, showAlert } = useDialog();
  const [query, setQuery] = useState('');
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  const statusLabel = (key: string) => statuses.find((status) => status.key === key)?.label || key;

  const visibleJobs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of jobs) {
      const key = jobClientKey(job.clientName);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const mergeable = jobs.filter((job) => (counts.get(jobClientKey(job.clientName)) || 0) >= 2);
    const q = query.trim().toLowerCase();
    const matchedClients = new Set<string>();
    if (q) {
      for (const job of mergeable) {
        const products = jobItemsForMerge(job).map((item) => item.type).join(' ');
        const hit = [job.clientName, job.title, job.contactPerson, job.clientPhone, products]
          .some((part) => (part || '').toLowerCase().includes(q));
        if (hit) matchedClients.add(jobClientKey(job.clientName));
      }
    }
    return mergeable
      .filter((job) => !q || matchedClients.has(jobClientKey(job.clientName)))
      .sort((a, b) => jobClientKey(a.clientName).localeCompare(jobClientKey(b.clientName), 'ko')
        || (a.createdAt || '').localeCompare(b.createdAt || ''));
  }, [jobs, query]);

  const picked = pickedIds
    .map((id) => jobs.find((job) => job.id === id))
    .filter((job): job is Job => !!job);
  const lockedClient = picked[0]?.clientName;
  const activePrimaryId = primaryId && pickedIds.includes(primaryId) ? primaryId : picked[0]?.id || null;

  const toggle = (job: Job) => {
    if (lockedClient && !sameJobClient(job.clientName, lockedClient) && !pickedIds.includes(job.id)) {
      toast.error('같은 업체 카드만 합칠 수 있습니다.');
      return;
    }
    setPickedIds((prev) => {
      if (prev.includes(job.id)) return prev.filter((id) => id !== job.id);
      return [...prev, job.id];
    });
  };

  const handleMerge = async () => {
    if (picked.length < 2 || !activePrimaryId) {
      await showAlert('같은 업체의 카드를 2개 이상 선택해 주세요.');
      return;
    }
    const primary = picked.find((job) => job.id === activePrimaryId);
    const others = picked.filter((job) => job.id !== activePrimaryId);
    if (!primary || others.some((job) => !sameJobClient(job.clientName, primary.clientName))) {
      await showAlert('같은 업체 카드만 합칠 수 있습니다.');
      return;
    }
    const products = [...picked.flatMap((job) => jobItemsForMerge(job).map((item) => item.type))].join(', ');
    const confirmed = await showConfirm(
      `[카드 합치기]\n\n` +
        `업체: ${jobClientKey(primary.clientName)}\n` +
        `남기는 카드: ${primary.title || primary.type}\n` +
        `납품일 ${dueLabel(primary.dueDate)} · ${statusLabel(primary.status)}\n\n` +
        `품목: ${products}\n\n` +
        `나머지 ${others.length}개 카드는 삭제되고, 품목·금액·담당자가 남기는 카드로 옮겨집니다.`
    );
    if (!confirmed) return;
    setIsMerging(true);
    try {
      if (previewMode) {
        toast.message('미리보기입니다. 카드는 합치지 않습니다.');
        onClose();
        return;
      }
      const merged = buildMergedJobCard(primary, others);
      await db.applyJobCardMerge(merged, others.map((job) => job.id));
      toast.success('카드를 하나로 합쳤습니다.');
      onClose();
    } catch (error) {
      await showAlert(getErrorMessage(error));
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <GitMerge size={18} className="text-blue-600" />
            카드 합치기
          </h3>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-700 space-y-1">
          <p>카드가 두 장 이상인 업체만 나옵니다. 담당자와 연락처가 달라도 같은 업체면 합칠 수 있습니다.</p>
          <p>남기는 카드의 제목, 납품일, 작업 단계가 유지되고 다른 카드의 품목이 그 안으로 들어갑니다.</p>
        </div>
        <div className="px-5 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="업체명, 작업명, 품목 검색"
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-2">
          {visibleJobs.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">카드가 두 장 이상인 업체가 없습니다.</p>
          ) : visibleJobs.map((job) => {
            const checked = pickedIds.includes(job.id);
            const blocked = !!lockedClient && !checked && !sameJobClient(job.clientName, lockedClient);
            const products = jobItemsForMerge(job).map((item) => item.type).join(', ');
            return (
              <div
                key={job.id}
                className={`rounded-lg border px-3 py-2 ${
                  blocked
                    ? 'border-slate-200 dark:border-slate-700 opacity-45'
                    : checked
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <label className={`flex items-start gap-2 ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    disabled={blocked}
                    onChange={() => toggle(job)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{job.clientName || '업체 없음'}</span>
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{job.title || job.type}</span>
                    </span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">
                      {products} · {dueLabel(job.dueDate)} · {statusLabel(job.status)} · {staffLabel(job, staff)}
                      {job.contactPerson || job.clientPhone ? ` · ${[job.contactPerson, job.clientPhone].filter(Boolean).join(' ')}` : ''}
                    </span>
                  </span>
                </label>
                {checked && picked.length >= 2 && (
                  <label className="mt-1 ml-6 flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 cursor-pointer">
                    <input
                      type="radio"
                      name="keep-job-card"
                      checked={activePrimaryId === job.id}
                      onChange={() => setPrimaryId(job.id)}
                    />
                    이 카드를 남김
                  </label>
                )}
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            {picked.length > 0 ? `${jobClientKey(lockedClient)} · ${picked.length}개 선택` : '카드를 선택해 주세요.'}
          </span>
          <button
            type="button"
            disabled={isMerging || picked.length < 2}
            onClick={() => { void handleMerge(); }}
            className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-40"
          >
            {isMerging ? '합치는 중...' : '카드 합치기'}
          </button>
        </div>
      </div>
    </div>
  );
};
