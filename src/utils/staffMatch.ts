import { AppUser, Job, Staff } from '../types';

/** 로그인 사용자와 staff 명단 매칭 (프로필·휴가 등록 공통) */
export function findStaffForUser(staffList: Staff[], user: AppUser | null | undefined): Staff | undefined {
    if (!user) return undefined;

    const userEmail = user.email?.toLowerCase() || '';
    const userLoginId = ((user as AppUser & { loginId?: string }).loginId || '').toLowerCase();

    return staffList.find((s) => {
        if (s.isDeleted) return false;
        if (s.uid && s.uid === user.uid) return true;
        if (s.id === user.uid) return true;
        if (s.id === user.id) return true;
        if (userEmail && s.email?.toLowerCase() === userEmail) return true;
        if (userLoginId && s.loginId?.toLowerCase() === userLoginId) return true;
        return false;
    });
}

/** staff.id 또는 staff.uid 로 직원 찾기 (채팅 senderId 등) */
export function findStaffByAnyId(staffList: Staff[], id?: string | null): Staff | undefined {
    if (!id) return undefined;
    const direct = staffList.find((s) => !s.isDeleted && (s.id === id || s.uid === id));
    if (direct) return direct;
    const lower = id.toLowerCase();
    return staffList.find(
        (s) =>
            !s.isDeleted &&
            ((s.loginId && s.loginId.toLowerCase() === lower) ||
                (s.email && s.email.toLowerCase() === lower))
    );
}

/** 작업 이력 staffId → 표시 이름 (uid / staff.id 혼용·시스템 로그 대응) */
export function resolveHistoryActorName(
    staffList: Staff[],
    staffId?: string | null,
    fallback = '알 수 없음'
): string {
    if (!staffId || staffId === 'system') return '시스템';
    const found = findStaffByAnyId(staffList, staffId);
    if (!found) return fallback;

    const name = found.name?.trim() || '';
    const loginId = found.loginId?.trim() || '';
    // Auth 기본값(사용자/사원)만 있고 로그인 ID가 있으면 로그인 ID를 우선 표시
    if (name && name !== '사용자' && name !== '사원') return name;
    if (loginId) return loginId;
    if (name) return name;
    return fallback;
}

/** staff.id / Firebase uid 가 같은 사람을 가리키는지 */
export function staffIdsEqual(a?: string | null, b?: string | null, staffList: Staff[] = []): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    const sa = findStaffByAnyId(staffList, a);
    const sb = findStaffByAnyId(staffList, b);
    if (sa && sb) return sa.id === sb.id;
    if (sa && (sa.id === b || sa.uid === b)) return true;
    if (sb && (sb.id === a || sb.uid === a)) return true;
    return false;
}

/** 로그인 사용자와 id(staff.id 또는 uid)가 본인인지 */
export function isSameLoggedInUser(
    user: AppUser | null | undefined,
    id?: string | null,
    staffList: Staff[] = []
): boolean {
    if (!user || !id) return false;
    if (user.uid === id || user.id === id) return true;
    const myStaff = findStaffForUser(staffList, user);
    if (myStaff && (myStaff.id === id || myStaff.uid === id)) return true;
    return staffIdsEqual(user.uid || user.id, id, staffList);
}

/** 작업에 배정된 staff id 목록 (레거시 assignedStaffId 포함) */
export function getJobAssigneeIds(job: Job): string[] {
    const fromArray = job.assignedStaffIds || [];
    const legacy = job.assignedStaffId;
    if (legacy && !fromArray.includes(legacy)) {
        return [...fromArray, legacy];
    }
    return fromArray;
}

/** 담당자 배정 시 사용할 staff 문서 id (없으면 로그인 uid) */
export function getStaffIdForUser(
    staffList: Staff[],
    user: AppUser | null | undefined
): string | undefined {
    const matched = findStaffForUser(staffList, user);
    return matched?.id ?? user?.uid ?? user?.id;
}

/**
 * 메인·서브 담당자 포함 — staff.id / staff.uid / Firebase uid 혼용 데이터 모두 매칭
 * (관리자가 등록한 직원은 staff.id ≠ Firebase uid 인 경우가 많음)
 */
export function isJobAssignedToUser(
    job: Job,
    user: AppUser | null | undefined,
    staffList: Staff[] = []
): boolean {
    if (!user) return false;

    const assigneeIds = getJobAssigneeIds(job);
    if (assigneeIds.length === 0) return false;

    const userKeys = new Set<string>();
    if (user.uid) userKeys.add(user.uid);
    if (user.id) userKeys.add(user.id);

    for (const id of assigneeIds) {
        if (userKeys.has(id)) return true;
    }

    const myStaff = findStaffForUser(staffList, user);
    if (myStaff) {
        if (myStaff.id && assigneeIds.includes(myStaff.id)) return true;
        if (myStaff.uid && assigneeIds.includes(myStaff.uid)) return true;
    }

    for (const assigneeId of assigneeIds) {
        const matchedStaff = staffList.find(
            (s) => !s.isDeleted && (s.id === assigneeId || s.uid === assigneeId)
        );
        if (!matchedStaff) continue;
        if (userKeys.has(matchedStaff.id) || (matchedStaff.uid && userKeys.has(matchedStaff.uid))) {
            return true;
        }
        if (
            myStaff &&
            (matchedStaff.id === myStaff.id ||
                (myStaff.uid && matchedStaff.uid === myStaff.uid))
        ) {
            return true;
        }
    }

    return false;
}

/** 담당자 지정 해제 시 본인과 연결된 모든 id 제거 */
export function removeUserFromJobAssignees(
    job: Job,
    user: AppUser,
    staffList: Staff[]
): string[] {
    const myStaff = findStaffForUser(staffList, user);
    const removeSet = new Set(
        [user.uid, user.id, myStaff?.id, myStaff?.uid].filter(Boolean) as string[]
    );
    return getJobAssigneeIds(job).filter((id) => !removeSet.has(id));
}

/** 담당자 지정 — staff 문서 id로 통일 */
export function addUserToJobAssignees(
    job: Job,
    user: AppUser,
    staffList: Staff[]
): string[] {
    if (isJobAssignedToUser(job, user, staffList)) {
        return getJobAssigneeIds(job);
    }
    const assignId = getStaffIdForUser(staffList, user);
    if (!assignId) return getJobAssigneeIds(job);
    const ids = getJobAssigneeIds(job);
    if (ids.includes(assignId)) return ids;
    return [...ids, assignId];
}

/** 특정 staff 필터 (드롭다운 staff.id 기준) */
export function isJobAssignedToStaffId(
    job: Job,
    staffId: string,
    staffList: Staff[] = []
): boolean {
    const member = staffList.find((s) => s.id === staffId);
    const keys = [staffId, member?.uid].filter(Boolean) as string[];
    const assigneeIds = getJobAssigneeIds(job);
    return assigneeIds.some((id) => keys.includes(id));
}
