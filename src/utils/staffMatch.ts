import { AppUser, Staff } from '../types';

/** 로그인 사용자와 staff 명단 매칭 (프로필·휴가 등록 공통) */
export function findStaffForUser(staffList: Staff[], user: AppUser | null | undefined): Staff | undefined {
    if (!user) return undefined;

    const userEmail = user.email?.toLowerCase() || '';
    const userLoginId = ((user as AppUser & { loginId?: string }).loginId || '').toLowerCase();

    return staffList.find((s) => {
        if (s.isDeleted) return false;
        if (s.uid && s.uid === user.uid) return true;
        if (s.id === user.uid) return true;
        if (userEmail && s.email?.toLowerCase() === userEmail) return true;
        if (userLoginId && s.loginId?.toLowerCase() === userLoginId) return true;
        return false;
    });
}
