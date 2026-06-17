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
