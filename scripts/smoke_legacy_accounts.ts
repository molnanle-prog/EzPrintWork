import { countActiveStaffSeats } from '../src/utils/planLimits';
import { hasCompanyAdminAccess } from '../src/utils/adminAccess';
import type { Staff } from '../src/types';

const ownerUid = 'owner-legacy-uid';
const companyAdminUid = 'admin-legacy-uid';
const staffUid = 'staff-legacy-uid';
const googleOwnerUid = 'google-owner-uid';

const fixtures: Staff[] = [
  {
    id: ownerUid,
    uid: ownerUid,
    name: '대표',
    role: '관리자',
    phone: '010-0000-0001',
    avatarUrl: '',
    active: true,
    email: 'owner@ez-hub.kr',
    loginId: 'owner',
    joinDate: '2024-01-01',
  },
  {
    id: companyAdminUid,
    uid: companyAdminUid,
    name: '사내관리자',
    role: '실장',
    isCompanyAdmin: true,
    phone: '010-0000-0002',
    avatarUrl: '',
    active: true,
    email: 'manager@ez-hub.kr',
    loginId: 'manager',
    joinDate: '2024-02-01',
  },
  {
    id: staffUid,
    uid: staffUid,
    name: '일반직원',
    role: '디자이너',
    phone: '010-0000-0003',
    avatarUrl: '',
    active: true,
    email: 'staff@ez-hub.kr',
    loginId: 'staff01',
    joinDate: '2024-03-01',
  },
  {
    id: googleOwnerUid,
    uid: googleOwnerUid,
    name: '구글대표',
    role: '관리자',
    phone: '010-0000-0004',
    avatarUrl: '',
    active: true,
    email: 'legacy-owner@gmail.com',
    loginId: 'legacy-owner@gmail.com',
    joinDate: '2023-12-01',
  },
];

let failed = 0;
function assert(name: string, cond: boolean) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

console.log('legacy member/staff fixture\n');
assert('기존 직원 문서 id가 유지된다', fixtures.every((row) => !!row.id && row.id === row.uid));
assert('로그인 아이디가 그대로다', fixtures.some((row) => row.loginId === 'staff01'));
assert('레거시 구글 이메일이 유지된다', fixtures.some((row) => row.email === 'legacy-owner@gmail.com'));
assert('대표 포함 좌석이 4명', countActiveStaffSeats(fixtures, ownerUid) === 4);
assert(
  '사내관리자 권한 유지',
  hasCompanyAdminAccess({
    userUid: companyAdminUid,
    userRole: 'admin',
    tenantOwnerId: ownerUid,
    staffIsCompanyAdmin: true,
  })
);
assert(
  '일반직원은 관리자가 아니다',
  !hasCompanyAdminAccess({
    userUid: staffUid,
    userRole: 'staff',
    tenantOwnerId: ownerUid,
    staffIsCompanyAdmin: false,
    staffRecordRole: '디자이너',
  })
);
assert(
  '대표 권한 유지',
  hasCompanyAdminAccess({
    userUid: ownerUid,
    userRole: 'admin',
    tenantOwnerId: ownerUid,
  })
);

if (failed) process.exit(1);
console.log('\n✓ 기존 회원·직원 fixture 로그인 권한 유지');
