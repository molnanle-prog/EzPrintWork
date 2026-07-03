import { Job } from '../types';
import { isLegacyCompletedDelivery } from './kanbanLayout';

function shouldShowArchivedCompletedJob(job: Job, selectedDate: string): boolean {
  if (job.paymentStatus !== '결제완료') return true;

  const completedAt = job.completedAt ? new Date(job.completedAt) : new Date(job.createdAt);
  const diffDays = (Date.now() - completedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 3) return true;

  const completedDateStr = completedAt.toISOString().split('T')[0];
  return completedDateStr === selectedDate;
}

/** 칸반·상황판 공통 — 완료·보관 건 표시 규칙 */
export function filterJobsForOperationalBoard(
  jobs: Job[],
  options?: {
    selectedDate?: string;
    includeCanceled?: boolean;
    /** split column 하단 트레이 등 보드에 표시할 예외 status (예: QUOTE) */
    includeStatusKeys?: string[];
  }
): Job[] {
  const selectedDate = options?.selectedDate ?? new Date().toISOString().split('T')[0];
  const includeCanceled = options?.includeCanceled ?? false;
  const includeStatus = new Set(options?.includeStatusKeys ?? []);

  return jobs.filter((job) => {
    if (job.status === 'CANCELED') return includeCanceled;
    if (job.status === 'QUOTE') return includeStatus.has('QUOTE');

    if (job.status === 'COMPLETED') {
      return shouldShowArchivedCompletedJob(job, selectedDate);
    }

    // 레거시: 예전 DELIVERY=완료 데이터
    if (isLegacyCompletedDelivery(job)) {
      return shouldShowArchivedCompletedJob(job, selectedDate);
    }

    return true;
  });
}
