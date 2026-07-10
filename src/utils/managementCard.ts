import { Job } from '../types';

/** 관리카드에 고정(별표)된 작업인지 */
export function isJobPinnedToManagementCard(job: Job): boolean {
  return !!job.managementCardPinnedAt;
}

/** 취소·완료+결제완료 작업 — 관리카드 목록에서만 제외 (납기 지난 미수는 유지) */
export function isManagementCardExpired(job: Job): boolean {
  if (job.status === 'CANCELED') return true;
  if (job.status === 'COMPLETED' && job.paymentStatus === '결제완료') return true;
  return false;
}

/** 관리카드 팝업에 표시할 작업 */
export function shouldShowInManagementCards(job: Job): boolean {
  if (job.status === 'CANCELED') return false;
  if (!isJobPinnedToManagementCard(job)) return false;
  return !isManagementCardExpired(job);
}
