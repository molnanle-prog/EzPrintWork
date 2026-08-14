import type { Job } from '../types';

/** 완료 안내 문자를 보낸 적 있는지 (카드 표시용) */
export function hasCompleteSmsSent(job: Pick<Job, 'completeSmsSentAt' | 'history'>): boolean {
  if (job.completeSmsSentAt) return true;
  return (job.history || []).some(
    (h) =>
      h.action === '문자 발송' &&
      typeof h.details === 'string' &&
      (h.details.includes('완료 문자') || h.details.includes('완료 안내'))
  );
}
