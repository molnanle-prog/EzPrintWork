import { Job } from '../types';

/** 칸반·상황판 공통 — 완료(DELIVERY) 건 표시 규칙 */
export function filterJobsForOperationalBoard(
  jobs: Job[],
  options?: { selectedDate?: string; includeCanceled?: boolean }
): Job[] {
  const selectedDate = options?.selectedDate ?? new Date().toISOString().split('T')[0];
  const includeCanceled = options?.includeCanceled ?? false;

  return jobs.filter((job) => {
    if (job.status === 'CANCELED') return includeCanceled;
    if (job.status === 'QUOTE') return false;
    if (job.status !== 'DELIVERY') return true;

    if (job.paymentStatus !== '결제완료') return true;

    const completedAt = job.completedAt ? new Date(job.completedAt) : new Date(job.createdAt);
    const diffDays = (Date.now() - completedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 3) return true;

    const completedDateStr = completedAt.toISOString().split('T')[0];
    if (completedDateStr === selectedDate) return true;

    return false;
  });
}
