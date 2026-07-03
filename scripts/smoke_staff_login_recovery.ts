/**
 * 직원 로그인 복구·자동 로그인 차단 로직 스모크 테스트 (Firebase 불필요)
 */
import { isStaffInternalEmail } from '../src/utils/staffLoginRecovery';
import { buildStaffAuthEmails } from '../src/utils/staffFirebaseSignIn';
import {
  STAFF_LOGIN_PREFS,
  disableStaffAutoLoginPrefs,
  isStaffKeepLoggedIn,
  loadStaffLoginPreferences,
  saveStaffLoginPreferences,
} from '../src/utils/staffLoginPreferences';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

const memory = new MemoryStorage();
(globalThis as any).localStorage = memory;

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log('staffLoginRecovery smoke tests\n');

assert(
  'uid 연결 시 레거시 이메일 우선',
  buildStaffAuthEmails(
    { loginId: 'sr203', email: 'asmail77@naver.com', uid: 'abc123' },
    'sr203'
  )[0] === 'asmail77@naver.com'
);
assert(
  'uid 없으면 @ez-hub.kr 우선',
  buildStaffAuthEmails({ loginId: 'kim', email: 'kim@gmail.com' }, 'kim')[0] === 'kim@ez-hub.kr'
);

assert('@ez-hub.kr 직원 이메일 인식', isStaffInternalEmail('sr203@ez-hub.kr'));
assert('대소문자 무시', isStaffInternalEmail('SR203@EZ-HUB.KR'));
assert('구글 이메일은 직원 아님', !isStaffInternalEmail('molnanle@gmail.com'));
assert('빈 값은 직원 아님', !isStaffInternalEmail(''));

memory.clear();
saveStaffLoginPreferences({
  rememberCompany: true,
  keepLoggedIn: true,
  companyName: '상록인쇄기획',
  tenantId: 'LXn4O7u7yOUreqzZTtwC',
  loginId: 'sr203',
  loginPassword: 'secret',
});
assert('아이디·비밀번호 저장됨', isStaffKeepLoggedIn());
assert('아이디 저장됨', loadStaffLoginPreferences().loginId === 'sr203');

disableStaffAutoLoginPrefs();
assert('아이디·비밀번호 저장 해제됨', !isStaffKeepLoggedIn());
assert('저장 아이디 삭제됨', loadStaffLoginPreferences().loginId === '');
assert('저장 비밀번호 삭제됨', loadStaffLoginPreferences().loginPassword === '');
assert(
  '회사 선택은 유지 가능',
  memory.getItem(STAFF_LOGIN_PREFS.savedTenantId) === 'LXn4O7u7yOUreqzZTtwC'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
