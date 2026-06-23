import { countActiveStaffSeats } from '../src/utils/planLimits';
import type { Staff } from '../src/types';

const ownerUid = 'owner-abc';

const staffOnlyOwner: Staff[] = [
  {
    id: ownerUid,
    uid: ownerUid,
    name: '대표',
    role: '관리자',
    phone: '',
    avatarUrl: '',
    active: true,
    email: 'o@test.com',
    joinDate: '2026-01-01',
  },
];

const staffOwnerPlusOne: Staff[] = [
  ...staffOnlyOwner,
  {
    id: 'staff-2',
    name: '직원',
    role: '디자이너',
    phone: '',
    avatarUrl: '',
    active: true,
    email: 's@test.com',
    joinDate: '2026-01-01',
  },
];

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log('countActiveStaffSeats\n');
assert('대표만 staff에 있으면 1명', countActiveStaffSeats(staffOnlyOwner, ownerUid) === 1);
assert('대표+직원 1명이면 2명', countActiveStaffSeats(staffOwnerPlusOne, ownerUid) === 2);
assert('ownerId 없어도 id===uid 대표 추정', countActiveStaffSeats(staffOnlyOwner) === 1);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
