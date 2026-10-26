import { Job } from '../types';
import { isSettledPaymentStatus } from './prepaidBalance';

/** 관리카드로 올린 작업인지 */
export function isJobPinnedToManagementCard(job: Job): boolean {
  return !!job.managementCardPinnedAt;
}

/** 취소·완료+완납(결제완료·카드결제) 작업 — 관리카드 목록에서만 제외 (납기 지난 미수는 유지) */
export function isManagementCardExpired(job: Job): boolean {
  if (job.status === 'CANCELED') return true;
  if (job.status === 'COMPLETED' && isSettledPaymentStatus(job.paymentStatus)) return true;
  return false;
}

/** 관리카드 팝업에 표시할 작업 */
export function shouldShowInManagementCards(job: Job): boolean {
  if (job.status === 'CANCELED') return false;
  if (!isJobPinnedToManagementCard(job)) return false;
  return !isManagementCardExpired(job);
}
