import type { Job } from '../types';
import { isIncomingJobNewer } from './jobRevision';

/**
 * 보드/관리카드 표시 필드 — 내리기·숨김 해제 시 JSON에서 키가 빠지면
 * NAS 머지 `{...prev, ...incoming}` 가 옛 값을 되살림.
 * null 로 명시하거나, 더 최신 스냅샷에 키가 없으면 제거해야 회사 PC·직원이 동일하게 본다.
 */
export const JOB_VISIBILITY_CLEAR_FIELDS = [
  'managementCardPinnedAt',
  'boardHiddenAt',
  'boardHiddenBy',
  'boardHiddenReason',
] as const;

export type JobVisibilityClearField = (typeof JOB_VISIBILITY_CLEAR_FIELDS)[number];

export function isJobVisibilityClearField(key: string): key is JobVisibilityClearField {
  return (JOB_VISIBILITY_CLEAR_FIELDS as readonly string[]).includes(key);
}

/** 패치에서 이 필드들을 지울 때 사용 (JSON에 null 로 남아 동기화됨) */
export function jobVisibilityClearPatch(
  fields: readonly JobVisibilityClearField[] = JOB_VISIBILITY_CLEAR_FIELDS
): Record<string, null> {
  const patch: Record<string, null> = {};
  for (const key of fields) patch[key] = null;
  return patch;
}

/**
 * 더 최신 incoming 을 prev 에 머지한 뒤, 표시 클리어 필드를 정리.
 * - incoming 에 null / 키 없음 → 필드 삭제 (롤백 방지)
 */
export function applyIncomingJobVisibilityClears<T extends Record<string, unknown>>(
  merged: T,
  incoming: Record<string, unknown>
): T {
  const out = { ...merged } as T & Record<string, unknown>;
  for (const key of JOB_VISIBILITY_CLEAR_FIELDS) {
    if (!(key in incoming) || incoming[key] == null) {
      delete out[key];
    }
  }
  return out as T;
}

/** 저장 직전 — null/undefined 클리어 필드는 객체에서 제거 (로컬 캐시 깨끗이) */
export function stripClearedJobVisibilityFields<T extends Partial<Job>>(job: T): T {
  const out = { ...job } as T & Record<string, unknown>;
  for (const key of JOB_VISIBILITY_CLEAR_FIELDS) {
    if (out[key] == null) delete out[key];
  }
  return out as T;
}

function pickJobVisibilityFields(job: Job): Partial<Job> {
  const out: Partial<Job> = {};
  if (job.managementCardPinnedAt) out.managementCardPinnedAt = job.managementCardPinnedAt;
  if (job.boardHiddenAt) out.boardHiddenAt = job.boardHiddenAt;
  if (job.boardHiddenBy) out.boardHiddenBy = job.boardHiddenBy;
  if (job.boardHiddenReason) out.boardHiddenReason = job.boardHiddenReason;
  return out;
}

/**
 * 관리카드/보드숨김 필드는 작업 전체 rev와 별도로 병합한다.
 * 직원 PC가 칸반만 옮겨 rev가 높아져도, NAS에 핀된 작업은 관리카드에 보여야 함.
 */
export function mergeJobVisibilityFields(base: Job, prev: Job, incoming: Job): Job {
  const prevPinned = !!prev.managementCardPinnedAt;
  const incomingPinned = !!incoming.managementCardPinnedAt;

  let visibility: Partial<Job>;

  if (incomingPinned && !prevPinned) {
    // 다른 PC에서 올림 — 로컬 rev가 더 높아도 핀 수용
    visibility = pickJobVisibilityFields(incoming);
  } else if (!incomingPinned && prevPinned) {
    // 다른 PC에서 내림 — incoming이 더 최신일 때만 해제
    visibility = isIncomingJobNewer(incoming, prev) ? {} : pickJobVisibilityFields(prev);
  } else if (incomingPinned && prevPinned) {
    if (isIncomingJobNewer(incoming, prev)) {
      visibility = pickJobVisibilityFields(incoming);
    } else {
      const inMs = new Date(incoming.managementCardPinnedAt || 0).getTime();
      const prMs = new Date(prev.managementCardPinnedAt || 0).getTime();
      visibility = pickJobVisibilityFields(inMs >= prMs ? incoming : prev);
    }
  } else if (isIncomingJobNewer(incoming, prev)) {
    visibility = pickJobVisibilityFields(incoming);
  } else {
    visibility = pickJobVisibilityFields(prev);
  }

  const out = { ...base } as Job & Record<string, unknown>;
  for (const key of JOB_VISIBILITY_CLEAR_FIELDS) {
    delete out[key];
  }
  Object.assign(out, visibility);
  return out as Job;
}
