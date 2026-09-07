import { AppUser, Job, Staff, StaffLeave } from '../types';
import { findStaffByAnyId, isJobAssignedToStaffId, isSameLoggedInUser, staffIdsEqual } from './staffMatch';

export function toLocalDateKey(value: Date | string | undefined | null): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalDateKey(dt);
}

export function formatDateKeyKo(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  if (!m || !d) return dateKey;
  return `${m}/${d}`;
}

export interface DateRange {
  start: string;
  end: string;
}

function normalizeRange(startKey: string, endKey: string): DateRange {
  if (!startKey || !endKey) return { start: startKey || endKey, end: endKey || startKey };
  return startKey <= endKey ? { start: startKey, end: endKey } : { start: endKey, end: startKey };
}

export function leavesOverlapJob(
  leave: StaffLeave,
  jobStartKey: string,
  jobEndKey: string
): boolean {
  const leaveRange = normalizeRange(toLocalDateKey(leave.startDate), toLocalDateKey(leave.endDate));
  const jobRange = normalizeRange(jobStartKey, jobEndKey);
  if (!leaveRange.start || !leaveRange.end || !jobRange.start || !jobRange.end) return false;
  return leaveRange.start <= jobRange.end && leaveRange.end >= jobRange.start;
}

export function canManageLeave(
  leave: StaffLeave,
  user: AppUser | null | undefined,
  staffList: Staff[],
  isAdmin: boolean
): boolean {
  if (!user) return false;
  if (isAdmin) return true;
  return isSameLoggedInUser(user, leave.staffId, staffList);
}

function eachDateKey(start: string, end: string): string[] {
  if (!start || !end) return [];
  const range = normalizeRange(start, end);
  const keys: string[] = [];
  let cur = range.start;
  while (cur && cur <= range.end) {
    keys.push(cur);
    const next = addDaysToDateKey(cur, 1);
    if (next === cur) break;
    cur = next;
  }
  return keys;
}

function mergeDateKeysToRanges(keys: string[]): DateRange[] {
  if (keys.length === 0) return [];
  const sorted = [...new Set(keys)].sort();
  const ranges: DateRange[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === addDaysToDateKey(prev, 1)) {
      prev = sorted[i];
    } else {
      ranges.push({ start, end: prev });
      start = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push({ start, end: prev });
  return ranges;
}

export function formatRangesKo(ranges: DateRange[]): string {
  return ranges
    .map((range) =>
      range.start === range.end
        ? formatDateKeyKo(range.start)
        : `${formatDateKeyKo(range.start)}~${formatDateKeyKo(range.end)}`
    )
    .join(', ');
}

export type LeaveAssignmentKind = 'none' | 'partial' | 'full';

export interface StaffLeaveNotice {
  staffId: string;
  staffName: string;
  leaveId: string;
  leaveType: StaffLeave['type'];
  leaveRangeLabel: string;
  kind: LeaveAssignmentKind;
  title: string;
  detail: string;
  workRangesLabel: string;
  leaveRangesLabel: string;
}

function leavesForStaff(leaves: StaffLeave[], staffId: string, staffList: Staff[]): StaffLeave[] {
  return leaves.filter((leave) => staffIdsEqual(leave.staffId, staffId, staffList));
}

export function getStaffLeaveAssignment(
  staffList: Staff[],
  leaves: StaffLeave[],
  staffId: string,
  jobStart: Date | string | undefined,
  jobEnd: Date | string | undefined
): StaffLeaveNotice | null {
  const jobStartKey = toLocalDateKey(jobStart);
  const jobEndKey = toLocalDateKey(jobEnd);
  if (!jobStartKey || !jobEndKey) return null;

  const person = findStaffByAnyId(staffList, staffId);
  const staffName = person?.name || '담당자';
  const matched = leavesForStaff(leaves, staffId, staffList).filter((leave) =>
    leavesOverlapJob(leave, jobStartKey, jobEndKey)
  );
  if (matched.length === 0) return null;

  const jobDays = eachDateKey(jobStartKey, jobEndKey);
  const leaveDays = new Set<string>();
  for (const leave of matched) {
    const range = normalizeRange(toLocalDateKey(leave.startDate), toLocalDateKey(leave.endDate));
    for (const day of eachDateKey(range.start, range.end)) {
      if (day >= jobStartKey && day <= jobEndKey) leaveDays.add(day);
    }
  }

  const workDays = jobDays.filter((day) => !leaveDays.has(day));
  const kind: LeaveAssignmentKind = workDays.length === 0 ? 'full' : 'partial';
  const leaveRanges = mergeDateKeysToRanges([...leaveDays]);
  const workRanges = mergeDateKeysToRanges(workDays);
  const leaveRangesLabel = formatRangesKo(leaveRanges);
  const workRangesLabel = formatRangesKo(workRanges);
  const typeLabel = [...new Set(matched.map((leave) => leave.type || '휴가'))].join('/');

  if (kind === 'full') {
    return {
      staffId,
      staffName,
      leaveId: matched.map((leave) => leave.id).join(','),
      leaveType: matched[0].type,
      leaveRangeLabel: leaveRangesLabel,
      kind,
      title: `${staffName}님 휴가 안내`,
      detail: `${leaveRangesLabel}(${typeLabel})는 휴가라 업무가 불가능합니다. 작업 기간이 휴가와 모두 겹쳐 담당자로 지정할 수 없습니다.`,
      workRangesLabel: '',
      leaveRangesLabel,
    };
  }

  return {
    staffId,
    staffName,
    leaveId: matched.map((leave) => leave.id).join(','),
    leaveType: matched[0].type,
    leaveRangeLabel: leaveRangesLabel,
    kind,
    title: `${staffName}님 휴가 안내`,
    detail: `${leaveRangesLabel}(${typeLabel})는 휴가라 업무가 불가능합니다. 휴가 기간은 담당에서 제외되고 ${workRangesLabel}만 담당으로 지정됩니다.`,
    workRangesLabel,
    leaveRangesLabel,
  };
}

export function buildStaffLeaveNotices(
  staffList: Staff[],
  leaves: StaffLeave[],
  staffIds: string[],
  jobStart: Date | string | undefined,
  jobEnd: Date | string | undefined
): StaffLeaveNotice[] {
  return staffIds
    .map((staffId) => getStaffLeaveAssignment(staffList, leaves, staffId, jobStart, jobEnd))
    .filter((notice): notice is StaffLeaveNotice => !!notice);
}

export function staffHasOverlappingLeave(
  staffList: Staff[],
  leaves: StaffLeave[],
  staffId: string,
  jobStart: Date | string | undefined,
  jobEnd: Date | string | undefined
): boolean {
  return !!getStaffLeaveAssignment(staffList, leaves, staffId, jobStart, jobEnd);
}

export function filterAssignableStaffIds(
  staffList: Staff[],
  leaves: StaffLeave[],
  staffIds: string[],
  jobStart: Date | string | undefined,
  jobEnd: Date | string | undefined
): { kept: string[]; removed: StaffLeaveNotice[] } {
  const kept: string[] = [];
  const removed: StaffLeaveNotice[] = [];
  for (const staffId of staffIds) {
    const assignment = getStaffLeaveAssignment(staffList, leaves, staffId, jobStart, jobEnd);
    if (assignment?.kind === 'full') {
      removed.push(assignment);
    } else {
      kept.push(staffId);
    }
  }
  return { kept, removed };
}

export interface LeaveHandoverJob {
  id: string;
  title: string;
  clientName: string;
  dateLabel: string;
  kind: LeaveAssignmentKind;
}

export function listAssignedJobsOverlappingLeave(
  jobs: Job[],
  staffList: Staff[],
  staffId: string,
  leaveStart: string,
  leaveEnd: string
): LeaveHandoverJob[] {
  const leaveStartKey = toLocalDateKey(leaveStart);
  const leaveEndKey = toLocalDateKey(leaveEnd);
  if (!staffId || !leaveStartKey || !leaveEndKey) return [];

  const leaveRange = normalizeRange(leaveStartKey, leaveEndKey);
  const results: LeaveHandoverJob[] = [];

  for (const job of jobs) {
    if (job.status === 'COMPLETED' || job.status === 'CANCELED' || job.status === 'QUOTE') continue;
    if (!isJobAssignedToStaffId(job, staffId, staffList)) continue;

    const jobStartKey = toLocalDateKey(job.createdAt);
    const jobEndKey = toLocalDateKey(job.dueDate);
    if (!jobStartKey || !jobEndKey) continue;
    const jobRange = normalizeRange(jobStartKey, jobEndKey);
    if (jobRange.end < leaveRange.start || jobRange.start > leaveRange.end) continue;

    const overlapStart = jobRange.start > leaveRange.start ? jobRange.start : leaveRange.start;
    const overlapEnd = jobRange.end < leaveRange.end ? jobRange.end : leaveRange.end;
    const fullyInsideLeave = jobRange.start >= leaveRange.start && jobRange.end <= leaveRange.end;
    const dateLabel = formatRangesKo([jobRange]);

    results.push({
      id: job.id,
      title: (job.title || '제목 없음').trim(),
      clientName: (job.clientName || '').trim(),
      dateLabel: fullyInsideLeave ? dateLabel : `${dateLabel} (휴가 ${formatRangesKo([{ start: overlapStart, end: overlapEnd }])} 겹침)`,
      kind: fullyInsideLeave ? 'full' : 'partial',
    });
  }

  return results.sort((a, b) => a.dateLabel.localeCompare(b.dateLabel, 'ko'));
}
