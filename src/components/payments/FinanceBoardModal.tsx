import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Search, ArrowBigUp, LayoutGrid, Building2 } from 'lucide-react';
import { db } from '../../services/dataService';
import { Job, JobHistoryLog, Staff } from '../../types';
import { getJobOutstandingAmount, findClientByName, normalizePrepaidBalance, buildPrepaidBoardRunByClient, summarizePrepaidBoardRun, getClientPrepaidFormula, buildPrepaidFlowLabel, getManagementPrepaidBadge } from '../../utils/prepaidBalance';
import { JobDetailModal } from '../common/JobDetailModal';
import { KanbanCard } from '../kanban/KanbanCard';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { isJobAssignedToUser, getStaffIdForUser } from '../../utils/staffMatch';
import {
  loadManagementCardViewMode,
  ManagementCardViewMode,
  saveManagementCardViewMode,
} from '../../utils/managementCardPreferences';

type FilterKey = 'all' | 'receivable' | 'prepaid';

function getClientLabel(job: Job): string {
  return (job.clientName || '').trim() || '미지정';
}

function getStatusPipeline() {
  return db.getStatusDefinitions().filter((s) => s.key !== 'CANCELED');
}

function getProgressForStatus(statusKey: string): number {
  const pipeline = getStatusPipeline();
  const idx = pipeline.findIndex((s) => s.key === statusKey);
  if (idx === -1) return 0;
  return pipeline.length <= 1 ? 0 : Math.round((idx / (pipeline.length - 1)) * 100);
}

function getStaffName(job: Job, staff: Staff[]): string {
  const staffIds = job.assignedStaffIds || (job.assignedStaffId ? [job.assignedStaffId] : []);
  if (staffIds.length === 0) return '미배정';

  const uniqueValidStaff = Array.from(new Set(staffIds))
    .map((id) => staff.find((s) => s.id === id))
    .filter((s): s is Staff => !!s && !s.isDeleted);

  if (uniqueValidStaff.length === 0) return '미배정';
  return uniqueValidStaff.map((s) => `${s.name}(${s.role})`).join(', ');
}

export const FinanceBoardModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { currentUser } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [viewMode, setViewMode] = useState<ManagementCardViewMode>(() =>
    loadManagementCardViewMode(currentUser?.id)
  );
  const [jobs, setJobs] = useState<Job[]>(() => db.getManagementCardJobs());
  const [staff, setStaff] = useState<Staff[]>(() => db.getStaff());
  const [clients, setClients] = useState(() => db.getClients());
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobModalViewMode, setJobModalViewMode] = useState<'summary' | 'edit'>('summary');
  const readOnly = db.isWebMirrorMode();

  useEffect(() => {
    const refresh = () => {
      setJobs(db.getManagementCardJobs());
      setStaff(db.getStaff());
      setClients(db.getClients());
    };
    void db.cleanupExpiredManagementCardPins().then(refresh);
    const unsub = db.subscribe(refresh);
    return () => unsub();
  }, []);

  useEffect(() => {
    setViewMode(loadManagementCardViewMode(currentUser?.id));
  }, [currentUser?.id]);

  const handleViewModeChange = useCallback(
    (mode: ManagementCardViewMode) => {
      setViewMode(mode);
      saveManagementCardViewMode(currentUser?.id, mode);
    },
    [currentUser?.id]
  );

  const prepaidBoardRun = useMemo(
    () => buildPrepaidBoardRunByClient(jobs, clients),
    [jobs, clients]
  );

  const q = query.trim().toLowerCase();
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      if (filter === 'receivable' && !(job.paymentStatus === '결제대기' || job.paymentStatus === '일부결제' || job.paymentStatus === '후불결제')) {
        return false;
      }
      if (filter === 'prepaid') {
        const slot = prepaidBoardRun.get(getClientLabel(job))?.get(job.id);
        if ((slot?.applied || 0) <= 0) return false;
      }
      if (!q) return true;
      return (
        (job.title || '').toLowerCase().includes(q) ||
        (job.clientName || '').toLowerCase().includes(q) ||
        (job.contactPerson || '').toLowerCase().includes(q)
      );
    });
  }, [jobs, filter, q, prepaidBoardRun]);

  const groupedByClient = useMemo(() => {
    const map = new Map<string, Job[]>();
    for (const job of filteredJobs) {
      const client = getClientLabel(job);
      const list = map.get(client) || [];
      list.push(job);
      map.set(client, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'ko'))
      .map(([clientName, clientJobs]) => {
        const receivable = clientJobs.filter(
          (j) => j.paymentStatus === '결제대기' || j.paymentStatus === '일부결제' || j.paymentStatus === '후불결제'
        );
        const receivableTotal = receivable.reduce((sum, job) => sum + getJobOutstandingAmount(job), 0);
        const jobMap = prepaidBoardRun.get(clientName);
        const clientRecord = findClientByName(clients, clientName);
        const ledgerBalance = normalizePrepaidBalance(clientRecord?.prepaidBalance);
        const formula = getClientPrepaidFormula(clientJobs, jobMap, ledgerBalance);
        const flowLabel = buildPrepaidFlowLabel(clientJobs, jobMap);
        return {
          clientName,
          jobs: clientJobs,
          receivableTotal,
          receivableCount: receivable.length,
          prepaidStart: formula.start,
          prepaidAppliedTotal: formula.applied,
          clientPrepaidBalance: formula.remaining,
          flowLabel,
        };
      });
  }, [filteredJobs, clients, prepaidBoardRun]);

  const summary = useMemo(() => {
    const receivable = jobs.filter((j) => j.paymentStatus === '결제대기' || j.paymentStatus === '일부결제' || j.paymentStatus === '후불결제');
    const totalReceivable = receivable.reduce((sum, job) => sum + getJobOutstandingAmount(job), 0);
    const prepaidSummary = summarizePrepaidBoardRun(jobs, clients);
    return {
      total: jobs.length,
      receivableCount: receivable.length,
      totalReceivable,
      prepaidAppliedTotal: prepaidSummary.totalApplied,
      clientPrepaidTotal: prepaidSummary.remainingBalance,
    };
  }, [jobs, clients]);

  const handleSelectJob = useCallback((job: Job) => {
    setSelectedJob(job);
    setJobModalViewMode('summary');
  }, []);

  const handleRightClickJob = useCallback((job: Job) => {
    setSelectedJob(job);
    setJobModalViewMode('edit');
  }, []);

  const handleStatusChange = useCallback(
    async (job: Job, direction: 'next' | 'prev') => {
      if (readOnly) {
        toast.error('웹(태블릿)은 조회 전용입니다.');
        return;
      }
      const pipeline = getStatusPipeline();
      const statusMap = new Map(db.getStatusDefinitions().map((s) => [s.key, s.label]));
      const currentIndex = pipeline.findIndex((s) => s.key === job.status);
      if (currentIndex === -1) return;
      const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
      if (newIndex < 0 || newIndex >= pipeline.length) return;

      const newStatusKey = pipeline[newIndex].key;
      const fromLabel = statusMap.get(job.status) || job.status;
      const toLabel = statusMap.get(newStatusKey) || newStatusKey;
      const history: JobHistoryLog[] = [
        ...(job.history || []),
        {
          timestamp: new Date().toISOString(),
          staffId: getStaffIdForUser(staff, currentUser) || currentUser?.id || 'system',
          action: '관리카드 단계 이동',
          details: `${fromLabel} → ${toLabel}`,
        },
      ];

      const updated: Job = {
        ...job,
        status: newStatusKey,
        history,
        progress: getProgressForStatus(newStatusKey),
      };
      if (newStatusKey === 'COMPLETED' && job.status !== 'COMPLETED') {
        updated.completedAt = new Date().toISOString();
        updated.progress = 100;
      } else if (newStatusKey !== 'COMPLETED' && job.status === 'COMPLETED') {
        updated.completedAt = undefined;
      }

      try {
        await db.updateJob(updated);
      } catch {
        toast.error('단계 이동에 실패했습니다.');
      }
    },
    [currentUser?.id, readOnly]
  );

  const renderJobCard = useCallback(
    (job: Job) => {
      const clientName = getClientLabel(job);
      const slot = prepaidBoardRun.get(clientName)?.get(job.id);
      const managementPrepaidBadge = getManagementPrepaidBadge(job, slot) || undefined;

      return (
        <KanbanCard
          key={job.id}
          job={job}
          status={job.status}
          staffName={getStaffName(job, staff)}
          onSelect={handleSelectJob}
          onRightClick={handleRightClickJob}
          onStatusChange={handleStatusChange}
          isMyJob={isJobAssignedToUser(job, currentUser, staff)}
          currentUserId={currentUser?.id}
          isManagementPanel
          managementPrepaidBadge={managementPrepaidBadge}
        />
      );
    },
    [staff, handleSelectJob, handleRightClickJob, handleStatusChange, currentUser, prepaidBoardRun]
  );

  const filterTabs: { id: FilterKey; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'receivable', label: '미수' },
    { id: 'prepaid', label: '선불차감' },
  ];

  const viewModeTabs: { id: ManagementCardViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'cards', label: '전체 카드', icon: <LayoutGrid size={13} /> },
    { id: 'byClient', label: '거래처별', icon: <Building2 size={13} /> },
  ];

  return (
    <div className="fixed inset-0 z-[10020] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ArrowBigUp size={18} className="text-violet-600 fill-violet-500" strokeWidth={2} />
            <h2 className="font-black text-slate-800 dark:text-slate-100">관리카드</h2>
            <span className="text-xs text-slate-500">칸반에서 올려 관리하는 작업</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg border border-violet-200 dark:border-violet-900/40 bg-violet-50/80 dark:bg-violet-950/20 px-3 py-2">
              <p className="font-bold text-violet-600">고정 작업</p>
              <p className="text-lg font-black text-violet-700 dark:text-violet-300 tabular-nums">{summary.total}건</p>
            </div>
            <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50/80 dark:bg-red-950/20 px-3 py-2">
              <p className="font-bold text-red-600">관리카드 미수</p>
              <p className="text-lg font-black text-red-700 dark:text-red-300 tabular-nums">
                {summary.totalReceivable.toLocaleString()}원
              </p>
              <p className="text-[11px] text-red-500/80">{summary.receivableCount}건</p>
            </div>
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/80 dark:bg-indigo-950/20 px-3 py-2">
              <p className="font-bold text-indigo-600">선불 차감 합계</p>
              <p className="text-lg font-black text-indigo-700 dark:text-indigo-300 tabular-nums">
                {summary.prepaidAppliedTotal.toLocaleString()}원
              </p>
              <p className="text-[11px] text-indigo-500/80">
                남은 선불 잔액 {summary.clientPrepaidTotal.toLocaleString()}원
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="작업명/고객사 검색"
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-1">
              {viewModeTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
                    viewMode === tab.id
                      ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                  }`}
                  onClick={() => handleViewModeChange(tab.id)}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                    filter === tab.id
                      ? 'bg-violet-600 text-white border-violet-600'
                      : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                  }`}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {filteredJobs.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <ArrowBigUp size={32} className="mx-auto mb-3 text-slate-300 fill-slate-200" strokeWidth={2} />
              <p className="font-bold">관리카드에 올린 작업이 없습니다.</p>
              <p className="text-sm mt-1">칸반 카드의 ↑ 버튼으로 관리카드로 올리세요.</p>
              <p className="text-xs mt-2 text-slate-400">취소·결제완료된 작업은 관리카드에서 자동 제외됩니다.</p>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {filteredJobs.map((job) => renderJobCard(job))}
            </div>
          ) : (
            <div className="space-y-5">
              {groupedByClient.map((group) => (
                <section
                  key={group.clientName}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                >
                  <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 size={15} className="text-violet-600 shrink-0" />
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate">{group.clientName}</h3>
                        <span className="text-xs text-slate-500 shrink-0">{group.jobs.length}건</span>
                      </div>
                      {(group.prepaidStart > 0 || group.prepaidAppliedTotal > 0 || group.receivableCount > 0) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold tabular-nums">
                          {(group.prepaidStart > 0 || group.prepaidAppliedTotal > 0) && (
                            <span className="text-indigo-600 dark:text-indigo-400">
                              선불 {group.prepaidStart.toLocaleString()}
                              <span className="text-slate-400 font-medium mx-1">−</span>
                              차감 {group.prepaidAppliedTotal.toLocaleString()}
                              <span className="text-slate-400 font-medium mx-1">=</span>
                              잔액 {group.clientPrepaidBalance.toLocaleString()}
                            </span>
                          )}
                          {group.receivableCount > 0 && (
                            <>
                              {(group.prepaidStart > 0 || group.prepaidAppliedTotal > 0) && (
                                <span className="text-slate-300 dark:text-slate-600 font-medium">|</span>
                              )}
                              <span className="text-red-600 dark:text-red-400">
                                미수 {group.receivableTotal.toLocaleString()}원 ({group.receivableCount}건)
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {group.flowLabel && (
                      <p
                        className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate pl-6"
                        title={group.flowLabel}
                      >
                        {group.flowLabel}
                      </p>
                    )}
                  </div>
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 items-start bg-white dark:bg-slate-900/40">
                    {group.jobs.map((job) => renderJobCard(job))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-2 border-t border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 shrink-0">
          왼쪽 클릭: 간단보기 · 우클릭: 상세보기 · ◀▶: 단계 이동 · ↓: 칸반으로 내리기
        </div>
      </div>

      {selectedJob && (
        <JobDetailModal
          key={selectedJob.id}
          job={selectedJob}
          staff={staff}
          initialViewMode={jobModalViewMode}
          onClose={() => setSelectedJob(null)}
          onUpdate={async (updated) => {
            if (readOnly) {
              toast.error('웹(태블릿)은 조회 전용입니다.');
              return;
            }
            try {
              await db.updateJob(updated);
              setSelectedJob(null);
            } catch {
              toast.error('저장에 실패했습니다.');
            }
          }}
        />
      )}
    </div>
  );
};
