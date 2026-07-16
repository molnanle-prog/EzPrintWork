import type { Job } from '../types';

/**
 * PC 간 NAS 병합 승패 판단 — 시스템 시계(clock skew) 영향을 없애기 위해
 * rev(리비전 번호)를 우선 비교하고, rev가 없는 옛 데이터만 updatedAt/createdAt로 대체 비교한다.
 */

function timestampMs(job: Pick<Job, 'updatedAt' | 'createdAt'> | null | undefined): number {
  if (!job) return 0;
  const raw = job.updatedAt || job.createdAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function revOf(job: Pick<Job, 'rev'> | null | undefined): number {
  const rev = job?.rev;
  return typeof rev === 'number' && Number.isFinite(rev) ? rev : -1;
}

/** incoming이 prev보다 같거나 최신이면 true (incoming 승리) */
export function isIncomingJobNewer(
  incoming: Pick<Job, 'rev' | 'updatedAt' | 'createdAt'> | null | undefined,
  prev: Pick<Job, 'rev' | 'updatedAt' | 'createdAt'> | null | undefined
): boolean {
  const ri = revOf(incoming);
  const rp = revOf(prev);
  if (ri >= 0 || rp >= 0) {
    if (ri !== rp) return ri > rp;
    // rev가 같으면(동일 리비전 재전송 등) 시각으로 보조 판단
  }
  return timestampMs(incoming) >= timestampMs(prev);
}

/** 로컬에서 작업을 수정할 때 다음 rev 계산 — 항상 이전 값보다 +1 */
export function nextJobRev(existing: Pick<Job, 'rev'> | null | undefined): number {
  const cur = revOf(existing);
  return (cur < 0 ? 0 : cur) + 1;
}
