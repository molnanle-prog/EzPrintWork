import { AppUser, Job, JobItem, Staff } from '../types';
import { getJobAssigneeIds, isJobAssignedToUser, findStaffByAnyId } from './staffMatch';

export type ExternalOrderAlertStage = 'week' | 'soon' | 'due';

export interface ExternalOrderAlert {
  jobId: string;
  itemId: string;
  itemIndex: number;
  stage: ExternalOrderAlertStage;
  jobTitle: string;
  clientName: string;
  dueDate: string;
  daysUntil: number;
  itemType: string;
  detail: string;
  progress?: 'before' | 'ordered';
  assigneeIds: string[];
  assigneeNames: string[];
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function daysUntilDueDate(dueDate: string | undefined, now = new Date()): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((startOfLocalDay(due) - startOfLocalDay(now)) / 86_400_000);
}

export function externalOrderTargetsUser(
  job: Job,
  user: AppUser | null | undefined,
  staffList: Staff[]
): boolean {
  if (!user) return false;
  const assignees = getJobAssigneeIds(job);
  if (assignees.length === 0) return true;
  return isJobAssignedToUser(job, user, staffList);
}

function itemDetail(item: JobItem): string {
  const specs = item.specs;
  const parts = [specs?.size, specs?.quantity, specs?.paperType, specs?.paperWeight, specs?.printColor]
    .map((value) => (value || '').trim())
    .filter(Boolean);
  const memo = (specs?.memo || '').trim();
  if (memo) parts.push(memo);
  return parts.join(' · ');
}

export function externalOrderAlertStage(
  job: Job,
  item: JobItem,
  now = new Date()
): ExternalOrderAlertStage | null {
  if (!item.externalOrder || item.externalOrderArrivedAt) return null;
  if (job.status === 'CANCELED') return null;
  const days = daysUntilDueDate(job.dueDate, now);
  const stage: ExternalOrderAlertStage | null =
    days === 7 ? 'week' : days === 3 ? 'soon' : days === 0 ? 'due' : null;
  if (!stage || item.externalOrderAckStage === stage) return null;
  return stage;
}

export function listExternalOrderAlerts(
  jobs: Job[],
  user: AppUser | null | undefined,
  staffList: Staff[],
  now = new Date()
): ExternalOrderAlert[] {
  if (!user) return [];
  const alerts: ExternalOrderAlert[] = [];
  for (const job of jobs) {
    if (!externalOrderTargetsUser(job, user, staffList)) continue;
    (job.subJobs || []).forEach((item, itemIndex) => {
      const stage = externalOrderAlertStage(job, item, now);
      if (!stage) return;
      const daysUntil = daysUntilDueDate(job.dueDate, now);
      if (daysUntil === null) return;
      const assigneeIds = getJobAssigneeIds(job).map(
        (id) => findStaffByAnyId(staffList, id)?.id || id
      );
      const assigneeNames = assigneeIds
        .map((id) => findStaffByAnyId(staffList, id)?.name || '')
        .filter(Boolean);
      alerts.push({
        jobId: job.id,
        itemId: item.id || String(itemIndex),
        itemIndex,
        stage,
        jobTitle: job.title || '작업',
        clientName: job.clientName || '',
        dueDate: job.dueDate,
        daysUntil,
        itemType: item.type || '품목',
        detail: itemDetail(item),
        progress: item.externalOrderProgress,
        assigneeIds,
        assigneeNames: [...new Set(assigneeNames)],
      });
    });
  }
  alerts.sort((a, b) => a.daysUntil - b.daysUntil || a.jobTitle.localeCompare(b.jobTitle, 'ko'));
  return alerts;
}

export function formatDueLabel(dueDate: string): string {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return dueDate;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

export function formatExternalOrderStage(alert: ExternalOrderAlert): string {
  if (alert.stage === 'week') return '납기 일주일 전';
  if (alert.stage === 'soon') return '납기 3일 전';
  return '납품일';
}

export function applyExternalOrderAction(
  job: Job,
  itemIndex: number,
  action: 'before' | 'ordered' | 'arrive',
  stage: ExternalOrderAlertStage,
  now = new Date()
): Job | null {
  const list = job.subJobs || [];
  const item = list[itemIndex];
  if (!item?.externalOrder) return null;
  const at = now.toISOString();
  const nextItem: JobItem = { ...item };
  if (action === 'arrive') {
    nextItem.externalOrderArrivedAt = at;
  } else {
    nextItem.externalOrderAckStage = stage;
    nextItem.externalOrderProgress = action === 'ordered' ? 'ordered' : 'before';
  }
  const subJobs = list.map((row, index) => (index === itemIndex ? nextItem : row));
  const label = action === 'arrive' ? '도착완료' : action === 'ordered' ? '주문완료' : '주문전';
  return {
    ...job,
    subJobs,
    history: [
      ...(job.history || []),
      {
        timestamp: at,
        staffId: 'system',
        action: '외부업체주문',
        details: `[${item.type || '품목'}] ${label}`,
      },
    ],
  };
}

export function applyExternalOrderAssignee(job: Job, staffId: string, staffName: string, now = new Date()): Job {
  const at = now.toISOString();
  const assignedStaffIds = staffId ? [staffId] : [];
  return {
    ...job,
    assignedStaffIds,
    assignedStaffId: staffId || undefined,
    history: [
      ...(job.history || []),
      {
        timestamp: at,
        staffId: 'system',
        action: '외부업체주문 담당',
        details: staffId ? `담당자 ${staffName}` : '담당자 미선택 · 모두에게',
      },
    ],
  };
}
