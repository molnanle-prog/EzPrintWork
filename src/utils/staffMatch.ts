import { AppUser, Job, Staff } from '../types';

/** Auth/가입 기본값 — 실명으로 취급하지 않음 */
const PLACEHOLDER_STAFF_NAMES = new Set([
    '',
    '사용자',
    '사원',
    '대표자',
    '웹 가입자',
    '사원명',
    '이름',
]);

export function isPlaceholderStaffName(name?: string | null): boolean {
    const t = (name || '').trim();
    if (!t) return true;
    return PLACEHOLDER_STAFF_NAMES.has(t);
}

/** 같은 사람 후보 중 정보·실명이 가장 풍부한 staff 문서 선택 (작업 이력 staffId 안정화) */
export function scoreStaffRecord(s: Staff): number {
    let n = 0;
    if (s.active !== false) n += 10;
    if (!s.isDeleted) n += 10;
    if (s.loginId?.trim()) n += 8;
    if (s.uid?.trim()) n += 5;
    if (s.extensionNumber?.trim()) n += 4;
    if (s.phone?.trim() || s.phoneCompany?.trim() || s.phoneOffice?.trim()) n += 6;
    const email = s.email?.trim() || '';
    if (email && !email.endsWith('@ez-hub.jp')) n += 4;
    if (s.name?.trim() && !isPlaceholderStaffName(s.name)) n += 100;
    const role = s.role?.trim() || '';
    if (role && role !== 'admin' && role !== 'staff' && !isPlaceholderStaffName(role)) n += 10;
    if (s.isCompanyAdmin) n += 3;
    if (s.joinDate) n += 1;
    return n;
}

export function pickBestStaff(candidates: Staff[]): Staff | undefined {
    const alive = candidates.filter((s) => !s.isDeleted);
    if (alive.length === 0) return undefined;
    return [...alive].sort(
        (a, b) => scoreStaffRecord(b) - scoreStaffRecord(a) || String(a.id).localeCompare(String(b.id))
    )[0];
}

function staffMatchesUser(s: Staff, user: AppUser): boolean {
    if (s.isDeleted) return false;
    const userEmail = user.email?.toLowerCase() || '';
    const userLoginId = ((user as AppUser & { loginId?: string }).loginId || '').toLowerCase();
    if (s.uid && s.uid === user.uid) return true;
    if (s.id === user.uid) return true;
    if (s.id === user.id) return true;
    if (userEmail && s.email?.toLowerCase() === userEmail) return true;
    if (userLoginId && s.loginId?.toLowerCase() === userLoginId) return true;
    return false;
}

/** 로그인 사용자와 staff 명단 매칭 (프로필·휴가·작업 이력 공통) — 중복 시 가장 완전한 문서 */
export function findStaffForUser(staffList: Staff[], user: AppUser | null | undefined): Staff | undefined {
    if (!user) return undefined;
    return pickBestStaff(staffList.filter((s) => staffMatchesUser(s, user)));
}

/** staff.id 또는 staff.uid 로 직원 찾기 (채팅 senderId·이력 등) — 중복 시 최선 문서 */
export function findStaffByAnyId(staffList: Staff[], id?: string | null): Staff | undefined {
    if (!id) return undefined;
    const lower = id.toLowerCase();
    const matches = staffList.filter((s) => {
        if (s.isDeleted) return false;
        if (s.id === id || s.uid === id) return true;
        if (s.loginId && s.loginId.toLowerCase() === lower) return true;
        if (s.email && s.email.toLowerCase() === lower) return true;
        return false;
    });
    return pickBestStaff(matches);
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
    if (name && !isPlaceholderStaffName(name)) return name;
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
