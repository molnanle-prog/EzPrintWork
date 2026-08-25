import { AppUser, Job, JobStatusDefinition, Staff } from '../types';
import { isLegacyCompletedDelivery } from './kanbanLayout';
import { findStaffForUser } from './staffMatch';

export const BOARD_STATUS_FILTER_EXCLUDED = new Set(['QUOTE', 'CANCELED']);
const LEGACY_HIDDEN_STATUS_KEYS = 'ez_calendar_hidden_status_keys';
const HIDDEN_STATUS_KEY_PREFIX = 'ez_board_hidden_status_keys:';

export function getBoardPrefUserKey(user: AppUser | null | undefined, staffList: Staff[] = []): string {
  if (!user) return '';
  const fromUser = String(user.loginId || '').trim().toLowerCase();
  if (fromUser) return fromUser;
  const matched = findStaffForUser(staffList, user);
  const fromStaff = String(matched?.loginId || '').trim().toLowerCase();
  if (fromStaff) return fromStaff;
  const uid = String(user.uid || user.id || '').trim();
  if (uid) return uid.toLowerCase();
  return String(user.email || matched?.email || '').trim().toLowerCase();
}

function storageKey(tenantId?: string | null, userKey?: string | null): string {
  const tenant = String(tenantId || 'default').trim() || 'default';
  const id = String(userKey || 'anon').trim().toLowerCase() || 'anon';
  return `${HIDDEN_STATUS_KEY_PREFIX}${tenant}:${id}`;
}

function parseHiddenKeys(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return null;
  }
}

export function loadHiddenBoardStatusKeys(tenantId?: string | null, userKey?: string | null): string[] {
  const keyed = parseHiddenKeys(localStorage.getItem(storageKey(tenantId, userKey)));
  if (keyed) return keyed;
  const id = String(userKey || '').trim();
  if (!id) return [];
  const legacy = parseHiddenKeys(localStorage.getItem(LEGACY_HIDDEN_STATUS_KEYS));
  if (!legacy) return [];
  try {
    localStorage.setItem(storageKey(tenantId, userKey), JSON.stringify(legacy));
    localStorage.removeItem(LEGACY_HIDDEN_STATUS_KEYS);
  } catch {
    /* ignore quota */
  }
  return legacy;
}

export function saveHiddenBoardStatusKeys(
  tenantId: string | null | undefined,
  userKey: string | null | undefined,
  keys: string[]
): void {
  try {
    localStorage.setItem(storageKey(tenantId, userKey), JSON.stringify(keys));
  } catch {
    /* ignore quota */
  }
}

export function getFilterableBoardStatuses(definitions: JobStatusDefinition[]): JobStatusDefinition[] {
  return definitions.filter((s) => !BOARD_STATUS_FILTER_EXCLUDED.has(s.key) && s.isVisible !== false);
}

export function pruneHiddenBoardStatusKeys(
  hiddenKeys: string[],
  definitions: JobStatusDefinition[]
): string[] {
  const valid = new Set(getFilterableBoardStatuses(definitions).map((s) => s.key));
  return hiddenKeys.filter((key) => valid.has(key));
}

/** 칸 필터용 상태 — 예전 납품완료(DELIVERY+완료시각)는 완료 칸으로 취급 */
export function getJobBoardFilterStatus(job: Job): string {
  if (isLegacyCompletedDelivery(job)) return 'COMPLETED';
  return job.status;
}

export function isBoardStatusHidden(job: Job, hiddenKeys: string[]): boolean {
  return hiddenKeys.includes(getJobBoardFilterStatus(job));
}
