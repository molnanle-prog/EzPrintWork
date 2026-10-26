import React, { useEffect, useMemo, useState } from 'react';
import { Package, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { db, getErrorMessage } from '../../services/dataService';
import { useAuth } from '../../contexts/AuthContext';
import { Job, Staff } from '../../types';
import {
  applyExternalOrderAction,
  applyExternalOrderAssignee,
  ExternalOrderAlert,
  formatDueLabel,
  formatExternalOrderStage,
  listExternalOrderAlerts,
} from '../../utils/externalOrderAlert';
import { formatDDayLabel } from '../../utils/jobUrgencyStyles';
import { getStaffIdForUser } from '../../utils/staffMatch';

export const ExternalOrderAlertModal: React.FC = () => {
  const { currentUser } = useAuth();
  const [jobs, setJobs] = useState<Job[]>(() => db.getAllJobs());
  const [staff, setStaff] = useState<Staff[]>(() => db.getStaff());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isTvMode, setIsTvMode] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('ezprint_tv_mode') === 'true'
  );

  useEffect(() => {
    const refresh = () => {
      setJobs(db.getAllJobs());
      setStaff(db.getStaff());
    };
    refresh();
    const unsubscribe = db.subscribe(refresh);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sync = () => setIsTvMode(localStorage.getItem('ezprint_tv_mode') === 'true');
    window.addEventListener('ezprint-tv-mode-change', sync);
    return () => window.removeEventListener('ezprint-tv-mode-change', sync);
  }, []);

  const alerts = useMemo(
    () => listExternalOrderAlerts(jobs, currentUser, staff),
    [jobs, currentUser, staff]
  );

  if (!currentUser || isTvMode || alerts.length === 0) return null;

  const handleAction = async (alert: ExternalOrderAlert, action: 'before' | 'ordered' | 'arrive') => {
    const key = `${alert.jobId}:${alert.itemIndex}`;
    if (busyKey) return;
    const latest = db.getAllJobs().find((job) => job.id === alert.jobId);
    if (!latest) return;
    const staffId = getStaffIdForUser(staff, currentUser);
    const next = applyExternalOrderAction(latest, alert.itemIndex, action, alert.stage);
    if (!next) return;
    if (staffId && next.history?.length) {
      const history = [...next.history];
      history[history.length - 1] = { ...history[history.length - 1], staffId };
      next.history = history;
    }
    setBusyKey(key);
    try {
      await db.updateJob(next);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  const handleAssign = async (alert: ExternalOrderAlert, staffId: string) => {
    if (busyKey) return;
    const latest = db.getAllJobs().find((job) => job.id === alert.jobId);
    if (!latest) return;
    const staffName = staff.find((row) => row.id === staffId)?.name || '';
    const next = applyExternalOrderAssignee(latest, staffId, staffName);
    const actorId = getStaffIdForUser(staff, currentUser);
    if (actorId && next.history?.length) {
      const history = [...next.history];
      history[history.length - 1] = { ...history[history.length - 1], staffId: actorId };
      next.history = history;
    }
    setBusyKey(`${alert.jobId}:assign`);
    try {
      await db.updateJob(next);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <ExternalOrderAlertDialog
      alerts={alerts}
      staffOptions={staff.map((row) => ({ id: row.id, name: row.name }))}
      busyKey={busyKey}
      onAction={(alert, action) => void handleAction(alert, action)}
      onAssign={(alert, staffId) => void handleAssign(alert, staffId)}
    />
  );
};

function ExternalOrderAlertDialog({
  alerts,
  staffOptions,
  busyKey,
  onAction,
  onAssign,
}: {
  alerts: ExternalOrderAlert[];
  staffOptions: { id: string; name: string }[];
  busyKey: string | null;
  onAction: (alert: ExternalOrderAlert, action: 'before' | 'ordered' | 'arrive') => void;
  onAssign: (alert: ExternalOrderAlert, staffId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-amber-300 dark:border-amber-700 overflow-hidden flex flex-col">
        <div className="bg-amber-500 px-5 py-4 text-slate-950 flex items-center gap-3 shrink-0">
          <Truck size={28} className="shrink-0" />
          <div>
            <h3 className="text-xl font-black tracking-tight">외부 주문 확인</h3>
            <p className="text-sm font-bold text-slate-900/80">
              {alerts.length}건 · 납품일 전에 도착해야 합니다. 상태는 건마다 누릅니다
            </p>
          </div>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          {alerts.map((alert) => {
            const key = `${alert.jobId}:${alert.itemIndex}`;
            const busy = busyKey === key;
            const dday = formatDDayLabel(alert.daysUntil);
            const assignValue =
              alert.assigneeIds.length === 1 ? alert.assigneeIds[0] : alert.assigneeIds.length > 1 ? '__multi' : '';
            return (
              <div key={key} className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{formatExternalOrderStage(alert)}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="rounded-md bg-rose-600 px-2 py-0.5 text-sm font-semibold text-white tabular-nums">
                      납품 {dday}
                    </span>
                    <select
                      value={assignValue}
                      disabled={busy}
                      onChange={(event) => {
                        if (event.target.value === '__multi') return;
                        onAssign(alert, event.target.value);
                      }}
                      className="h-7 max-w-[9.5rem] rounded-md border border-rose-200 bg-white px-1.5 text-xs font-semibold text-slate-700"
                      title="담당자를 고르면 그 사람에게만 알림이 뜨고, 담당자 미선택은 모두에게 뜹니다"
                    >
                      <option value="">담당자 미선택</option>
                      {alert.assigneeIds.length > 1 && (
                        <option value="__multi">
                          담당자 {alert.assigneeNames.join(', ')}
                        </option>
                      )}
                      {staffOptions.map((person) => (
                        <option key={person.id} value={person.id}>
                          담당자 {person.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mt-1 text-lg font-black text-slate-900 dark:text-slate-100">{alert.jobTitle}</p>
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                  {alert.clientName || '거래처 없음'} · 납품일 {formatDueLabel(alert.dueDate)}
                </p>
                <div className="mt-3 flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
                  <Package size={16} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-black">{alert.itemType}</p>
                    {alert.detail && <p className="text-slate-600 dark:text-slate-300">{alert.detail}</p>}
                    {alert.progress && (
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        지난 표시: {alert.progress === 'ordered' ? '주문완료' : '주문전'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(alert, 'before')}
                    className="h-11 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 text-sm font-semibold disabled:opacity-50"
                  >
                    주문전
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(alert, 'ordered')}
                    className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    주문완료
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(alert, 'arrive')}
                    className="h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold disabled:opacity-50"
                  >
                    도착완료
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function previewDueDate(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(15, 0, 0, 0);
  return date.toISOString();
}

const PREVIEW_ALERTS: ExternalOrderAlert[] = [
  {
    jobId: 'preview-due',
    itemId: '1',
    itemIndex: 0,
    stage: 'due',
    jobTitle: '강원도보(5190~5203) 인쇄',
    clientName: '디자인패스티벌',
    dueDate: previewDueDate(0),
    daysUntil: 0,
    itemType: '책자',
    detail: 'A4 · 500부 · 스노우지 200g',
    assigneeIds: ['s1'],
    assigneeNames: ['김민수'],
  },
  {
    jobId: 'preview-soon',
    itemId: '1',
    itemIndex: 0,
    stage: 'soon',
    jobTitle: '안흥찐빵축제 도무송스티커',
    clientName: '주식회사 컬틱스',
    dueDate: previewDueDate(3),
    daysUntil: 3,
    itemType: '스티커',
    detail: '도무송 · 1,000장',
    progress: 'ordered',
    assigneeIds: [],
    assigneeNames: [],
  },
  {
    jobId: 'preview-week',
    itemId: '1',
    itemIndex: 0,
    stage: 'week',
    jobTitle: '포럼 강청행사 현수막',
    clientName: '강원청년경제인연합회',
    dueDate: previewDueDate(7),
    daysUntil: 7,
    itemType: '현수막',
    detail: '5000x900 · 1장',
    assigneeIds: ['s2'],
    assigneeNames: ['박지연'],
  },
];

const PREVIEW_STAFF = [
  { id: 's1', name: '김민수' },
  { id: 's2', name: '박지연' },
  { id: 's3', name: '이준호' },
];

/** 개발 미리보기 전용. 저장하지 않고 알림 창만 보여 준다. */
export const ExternalOrderAlertPreview: React.FC = () => {
  const [alerts, setAlerts] = useState(PREVIEW_ALERTS);
  const dismiss = (alert: ExternalOrderAlert, action: 'before' | 'ordered' | 'arrive') => {
    const label = action === 'arrive' ? '도착완료' : action === 'ordered' ? '주문완료' : '주문전';
    toast.success(`${alert.jobTitle} · ${label} (미리보기, 저장 안 함)`);
    setAlerts((rows) => rows.filter((row) => row.jobId !== alert.jobId));
  };
  const assign = (alert: ExternalOrderAlert, staffId: string) => {
    const person = PREVIEW_STAFF.find((row) => row.id === staffId);
    toast.success(
      staffId
        ? `${alert.jobTitle} · 담당자 ${person?.name || ''} (미리보기, 저장 안 함)`
        : `${alert.jobTitle} · 담당자 미선택, 모두에게 (미리보기, 저장 안 함)`
    );
    setAlerts((rows) =>
      rows.map((row) =>
        row.jobId === alert.jobId
          ? { ...row, assigneeIds: staffId ? [staffId] : [], assigneeNames: person ? [person.name] : [] }
          : row
      )
    );
  };

  return (
    <div className="h-screen w-screen bg-slate-950">
      {alerts.length > 0 ? (
        <ExternalOrderAlertDialog
          alerts={alerts}
          staffOptions={PREVIEW_STAFF}
          busyKey={null}
          onAction={dismiss}
          onAssign={assign}
        />
      ) : (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-200">
          <p className="font-bold">미리보기 알림을 모두 넘겼습니다.</p>
          <button
            type="button"
            className="h-11 px-4 rounded-xl bg-amber-500 text-slate-950 font-black"
            onClick={() => setAlerts(PREVIEW_ALERTS)}
          >
            다시 보기
          </button>
        </div>
      )}
    </div>
  );
};
