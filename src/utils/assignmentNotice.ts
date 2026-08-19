import { AppUser, AssignmentNotice, Job, Staff } from '../types';
import {
  findStaffByAnyId,
  findStaffForUser,
  getJobAssigneeIds,
  getStaffIdForUser,
  isJobAssignedToUser,
  isSameLoggedInUser,
  staffIdsEqual,
} from './staffMatch';

function userAckKeys(user: AppUser, staffList: Staff[]): string[] {
  const myStaff = findStaffForUser(staffList, user);
  return [getStaffIdForUser(staffList, user), user.uid, user.id, myStaff?.id, myStaff?.uid].filter(
    (v): v is string => !!v
  );
}

function hasUserAcked(notice: AssignmentNotice, user: AppUser, staffList: Staff[]): boolean {
  const viewed = notice.viewedBy || {};
  return userAckKeys(user, staffList).some((key) => !!viewed[key]);
}

export function applyAssignmentNoticePatch(
  prev: Job,
  nextIds: string[],
  actorStaffId?: string | null,
  staffList: Staff[] = []
): { assignmentNotice: AssignmentNotice | null } {
  if (nextIds.length === 0) {
    return { assignmentNotice: null };
  }

  const prevIds = getJobAssigneeIds(prev);
  const added = nextIds.filter((id) => !idsAlreadyPresent(prevIds, id, staffList));
  const prevNotice = prev.assignmentNotice || null;
  const viewedBy: Record<string, string> = { ...(prevNotice?.viewedBy || {}) };

  for (const key of Object.keys(viewedBy)) {
    if (!idsAlreadyPresent(nextIds, key, staffList)) delete viewedBy[key];
  }

  const now = new Date().toISOString();
  if (added.length > 0) {
    if (actorStaffId && idsAlreadyPresent(added, actorStaffId, staffList)) {
      viewedBy[actorStaffId] = now;
    }
    return {
      assignmentNotice: {
        assignedAt: now,
        staffIds: nextIds,
        viewedBy,
      },
    };
  }

  if (!prevNotice) return { assignmentNotice: null };
  return {
    assignmentNotice: {
      ...prevNotice,
      staffIds: nextIds,
      viewedBy,
    },
  };
}

const RECENT_ASSIGNMENT_NOTICE_MS = 15 * 60 * 1000;

function jobActivityAtMs(job: Job): number {
  const row = job as Job & { updatedAt?: string };
  const raw = row.updatedAt || job.createdAt;
  const ms = raw ? Date.parse(raw) : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function isCoveringAssignmentNotice(notice: AssignmentNotice | null | undefined): boolean {
  return !!(notice?.assignedAt && notice.staffIds?.length);
}

function idsAlreadyPresent(ids: string[], candidate: string, staffList: Staff[]): boolean {
  return ids.some((id) => id === candidate || staffIdsEqual(id, candidate, staffList));
}

/** 작업 rev가 낮아도, 더 최근 지정 알림은 유지 (다른 PC가 칸반만 옮겨 rev가 높아진 경우) */
export function mergeAssignmentNoticeFields(
  prev: Job,
  incoming: Job,
  merged: Job,
  staffList: Staff[] = []
): Job {
  const incomingNotice = incoming.assignmentNotice;
  const prevNotice = prev.assignmentNotice;
  const inAt = Date.parse(incomingNotice?.assignedAt || '') || 0;
  const prevAt = Date.parse(prevNotice?.assignedAt || '') || 0;

  if (isCoveringAssignmentNotice(incomingNotice) && inAt > prevAt) {
    return { ...merged, assignmentNotice: incomingNotice };
  }

  return reconcileAssignmentNoticeOnMerge(prev, incoming, merged, staffList);
}

/** 옛 앱이 assignmentNotice 없이 담당만 바꾼 경우 — 기존 작업 머지 때 알림 복원 */
export function reconcileAssignmentNoticeOnMerge(
  prev: Job,
  incoming: Job,
  merged: Job,
  staffList: Staff[] = []
): Job {
  const incomingNotice = incoming.assignmentNotice;
  if (isCoveringAssignmentNotice(incomingNotice)) {
    return { ...merged, assignmentNotice: incomingNotice };
  }

  const nextIds = getJobAssigneeIds(incoming);
  const prevIds = getJobAssigneeIds(prev);
  const added = nextIds.filter((id) => !idsAlreadyPresent(prevIds, id, staffList));

  if (added.length === 0) {
    const keep = prev.assignmentNotice || merged.assignmentNotice;
    if (keep) return { ...merged, assignmentNotice: keep };
    return merged;
  }

  const viewedBy: Record<string, string> = { ...(prev.assignmentNotice?.viewedBy || {}) };
  for (const key of Object.keys(viewedBy)) {
    if (!idsAlreadyPresent(nextIds, key, staffList)) delete viewedBy[key];
  }

  const row = incoming as Job & { updatedAt?: string };
  return {
    ...merged,
    assignmentNotice: {
      assignedAt: row.updatedAt || incoming.createdAt || new Date().toISOString(),
      staffIds: nextIds,
      viewedBy,
    },
  };
}

/** 방금 NAS에 새로 나타난 작업(옛 앱 신규 접수) — 최근이면 담당 알림 생성 */
export function ensureAssignmentNoticeForNewlySeenJob(
  job: Job,
  maxAgeMs = RECENT_ASSIGNMENT_NOTICE_MS
): Job {
  if (isCoveringAssignmentNotice(job.assignmentNotice)) return job;
  const ids = getJobAssigneeIds(job);
  if (ids.length === 0) return job;
  const at = jobActivityAtMs(job);
  if (!at || Date.now() - at > maxAgeMs) return job;
  const row = job as Job & { updatedAt?: string };
  return {
    ...job,
    assignmentNotice: {
      assignedAt: row.updatedAt || job.createdAt,
      staffIds: ids,
      viewedBy: {},
    },
  };
}

export function getEffectiveAssignmentNotice(
  job: Job,
  user: AppUser | null | undefined,
  staffList: Staff[],
  maxAgeMs = 2 * 60 * 60 * 1000
): AssignmentNotice | null {
  if (isCoveringAssignmentNotice(job.assignmentNotice)) {
    return job.assignmentNotice || null;
  }
  if (!user) return null;
  const hist = [...(job.history || [])].reverse().find((h) => h.action === '담당자 변경');
  if (!hist?.timestamp) return null;
  const at = Date.parse(hist.timestamp);
  if (!Number.isFinite(at) || Date.now() - at > maxAgeMs) return null;
  if (hist.staffId && hist.staffId !== 'system' && isSameLoggedInUser(user, hist.staffId, staffList)) {
    return null;
  }
  const ids = getJobAssigneeIds(job);
  if (ids.length === 0) return null;
  return {
    assignedAt: hist.timestamp,
    staffIds: ids,
    viewedBy: hist.staffId && hist.staffId !== 'system' ? { [hist.staffId]: hist.timestamp } : {},
  };
}

export function ackAssignmentNoticeIfNeeded(
  job: Job,
  user: AppUser | null | undefined,
  staffList: Staff[]
): Job | null {
  if (!user || !job?.id) return null;
  const notice = getEffectiveAssignmentNotice(job, user, staffList);
  if (!notice?.staffIds?.length) return null;
  if (!isJobAssignedToUser(job, user, staffList) && !notice.staffIds.some((id) => isSameLoggedInUser(user, id, staffList))) {
    return null;
  }
  if (hasUserAcked(notice, user, staffList)) return null;

  const staffId = getStaffIdForUser(staffList, user);
  if (!staffId) return null;

  return {
    ...job,
    assignmentNotice: {
      ...notice,
      viewedBy: {
        ...(notice.viewedBy || {}),
        [staffId]: new Date().toISOString(),
      },
    },
  };
}

export function listUnackedAssignmentJobs(
  jobs: Job[],
  user: AppUser | null | undefined,
  staffList: Staff[]
): Job[] {
  if (!user) return [];
  return jobs
    .map((job) => {
      const notice = getEffectiveAssignmentNotice(job, user, staffList);
      return notice ? { ...job, assignmentNotice: notice } : job;
    })
    .filter((job) => {
      if (job.status === 'CANCELED') return false;
      const notice = job.assignmentNotice;
      if (!notice?.staffIds?.length || !notice.assignedAt) return false;
      const assigned = isJobAssignedToUser(job, user, staffList);
      const noticeTargetsMe = notice.staffIds.some((id) => isSameLoggedInUser(user, id, staffList));
      if (!assigned && !noticeTargetsMe) return false;
      return !hasUserAcked(notice, user, staffList);
    })
    .sort((a, b) => {
      const aAt = a.assignmentNotice?.assignedAt || '';
      const bAt = b.assignmentNotice?.assignedAt || '';
      return bAt.localeCompare(aAt);
    });
}

export function formatAssignmentNoticeTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatAssigneeNames(ids: string[] | undefined, staffList: Staff[]): string {
  const names = (ids || [])
    .map((id) => findStaffByAnyId(staffList, id)?.name || '')
    .filter(Boolean);
  return [...new Set(names)].join(', ');
}

export function formatOtherAckNames(
  job: Job,
  user: AppUser | null | undefined,
  staffList: Staff[]
): string {
  if (!user) return '';
  const viewed = job.assignmentNotice?.viewedBy || {};
  const myKeys = new Set(userAckKeys(user, staffList));
  const names = Object.keys(viewed)
    .filter((id) => !myKeys.has(id))
    .map((id) => findStaffByAnyId(staffList, id)?.name || '')
    .filter(Boolean);
  return [...new Set(names)].join(', ');
}
