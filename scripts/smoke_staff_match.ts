/**
 * staff.id ≠ Firebase uid 혼용 시 담당자 매칭 검증
 */
import {
  isJobAssignedToUser,
  isJobAssignedToStaffId,
  getJobAssigneeIds,
  addUserToJobAssignees,
  removeUserFromJobAssignees,
} from '../src/utils/staffMatch';
import type { AppUser, Job, Staff } from '../src/types';

const staffList: Staff[] = [
  {
    id: 'staff-doc-abc',
    uid: 'firebase-uid-xyz',
    name: '김직원',
    role: '디자이너',
    phone: '',
    avatarUrl: '',
    active: true,
    email: 'kim@ez-hub.kr',
    loginId: 'kim',
    joinDate: '2026-01-01',
  },
  {
    id: 'owner-uid',
    uid: 'owner-uid',
    name: '대표',
    role: '관리자',
    phone: '',
    avatarUrl: '',
    active: true,
    email: 'owner@ez-hub.kr',
    joinDate: '2026-01-01',
  },
];

const kimUser: AppUser = {
  uid: 'firebase-uid-xyz',
  id: 'firebase-uid-xyz',
  email: 'kim@ez-hub.kr',
  displayName: '김직원',
  name: '김직원',
  photoURL: '',
  avatarUrl: '',
  tenantId: 't1',
  role: 'staff',
};

const jobAssignedByStaffDocId: Job = {
  id: 'j1',
  title: '테스트',
  clientName: '거래처',
  description: '',
  specs: {
    paperType: '',
    paperWeight: '',
    size: '',
    quantity: '',
    processing: [],
    printColor: '',
    memo: '',
  },
  status: 'DESIGN',
  priority: '일반' as Job['priority'],
  paymentStatus: '결제대기',
  assignedStaffIds: ['staff-doc-abc'],
  assignedStaffId: 'staff-doc-abc',
  createdAt: '2026-06-01',
  dueDate: '2026-06-10',
  progress: 0,
  type: '명함',
  price: 0,
  order: 0,
};

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

console.log('staffMatch smoke tests\n');

assert(
  '김직원: staff.id로 배정된 작업 → 내 작업',
  isJobAssignedToUser(jobAssignedByStaffDocId, kimUser, staffList)
);
assert(
  '김직원: uid만 배정된 작업도 매칭',
  isJobAssignedToUser(
    { ...jobAssignedByStaffDocId, assignedStaffIds: ['firebase-uid-xyz'], assignedStaffId: 'firebase-uid-xyz' },
    kimUser,
    staffList
  )
);
assert(
  '다른 사람 작업은 제외',
  !isJobAssignedToUser(
    jobAssignedByStaffDocId,
    { ...kimUser, uid: 'other', id: 'other', email: 'other@ez-hub.kr' },
    staffList
  )
);
assert(
  '서브 담당자(2번째)도 매칭',
  isJobAssignedToUser(
    {
      ...jobAssignedByStaffDocId,
      assignedStaffIds: ['owner-uid', 'staff-doc-abc'],
      assignedStaffId: 'owner-uid',
    },
    kimUser,
    staffList
  )
);
assert(
  '담당자 필터: staff.id로 조회',
  isJobAssignedToStaffId(jobAssignedByStaffDocId, 'staff-doc-abc', staffList)
);
assert(
  'getJobAssigneeIds 레거시 id 포함',
  getJobAssigneeIds({ ...jobAssignedByStaffDocId, assignedStaffIds: [], assignedStaffId: 'staff-doc-abc' }).includes(
    'staff-doc-abc'
  )
);

const added = addUserToJobAssignees(
  { ...jobAssignedByStaffDocId, assignedStaffIds: [], assignedStaffId: undefined },
  kimUser,
  staffList
);
assert('담당 추가 → staff 문서 id', added.includes('staff-doc-abc'));

const removed = removeUserFromJobAssignees(jobAssignedByStaffDocId, kimUser, staffList);
assert('담당 해제 → staff.id 제거', removed.length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
