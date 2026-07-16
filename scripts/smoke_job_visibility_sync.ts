/**
 * 관리카드/보드 숨김 동기화 롤백 방지 스모크
 * 실행: npx tsx scripts/smoke_job_visibility_sync.ts
 */
import assert from 'node:assert/strict';
import {
  applyIncomingJobVisibilityClears,
  jobVisibilityClearPatch,
  stripClearedJobVisibilityFields,
  mergeJobVisibilityFields,
} from '../src/utils/jobVisibilitySync';

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

console.log('[smoke] job visibility sync');

const prev = {
  id: 'j1',
  title: '명함',
  updatedAt: '2026-07-16T01:00:00.000Z',
  managementCardPinnedAt: '2026-07-16T00:00:00.000Z',
  boardHiddenAt: '2026-07-16T00:00:00.000Z',
  boardHiddenReason: 'management_card',
};

// 예전 버그: 내린 작업이 JSON에서 키 누락 → 머지 시 핀 부활
const incomingOmitKeys = {
  id: 'j1',
  title: '명함',
  updatedAt: '2026-07-16T02:00:00.000Z',
};
const rolledBack = { ...prev, ...incomingOmitKeys };
assert.equal(rolledBack.managementCardPinnedAt, prev.managementCardPinnedAt);
ok('재현: 키 누락 스프레드면 핀이 되살아남');

const fixed = applyIncomingJobVisibilityClears(rolledBack, incomingOmitKeys);
assert.equal(fixed.managementCardPinnedAt, undefined);
assert.equal(fixed.boardHiddenReason, undefined);
ok('수정: 최신 스냅샷에 키 없으면 핀/숨김 제거');

const incomingNull = {
  id: 'j1',
  title: '명함',
  updatedAt: '2026-07-16T03:00:00.000Z',
  ...jobVisibilityClearPatch(),
};
const withNull = applyIncomingJobVisibilityClears({ ...prev, ...incomingNull }, incomingNull);
assert.equal('managementCardPinnedAt' in withNull, false);
ok('null 클리어 패치도 필드 제거');

const pinnedAgain = {
  id: 'j1',
  title: '명함',
  updatedAt: '2026-07-16T04:00:00.000Z',
  managementCardPinnedAt: '2026-07-16T04:00:00.000Z',
  boardHiddenAt: '2026-07-16T04:00:00.000Z',
  boardHiddenReason: 'management_card' as const,
};
const keepPin = applyIncomingJobVisibilityClears({ ...prev, ...pinnedAgain }, pinnedAgain);
assert.equal(keepPin.managementCardPinnedAt, pinnedAgain.managementCardPinnedAt);
ok('다시 올리면 핀 유지');

const stripped = stripClearedJobVisibilityFields({
  id: 'j1',
  managementCardPinnedAt: null,
  boardHiddenAt: null,
  title: 'x',
} as any);
assert.equal('managementCardPinnedAt' in stripped, false);
ok('stripCleared 로컬 정리');

// 덮어쓰기 레이스: 옛 핀 상태가 최신 내리기를 지우면 안 됨
const nasUnpinned = {
  id: 'j1',
  title: '명함',
  updatedAt: '2026-07-16T05:00:00.000Z',
  // pin 필드 없음 = 내림
};
const staleLocalPinned = {
  id: 'j1',
  title: '명함',
  updatedAt: '2026-07-16T01:00:00.000Z',
  managementCardPinnedAt: '2026-07-16T00:00:00.000Z',
  boardHiddenReason: 'management_card',
};
const afterPushMerge = applyIncomingJobVisibilityClears(
  { ...staleLocalPinned, ...nasUnpinned },
  nasUnpinned
);
assert.equal(afterPushMerge.managementCardPinnedAt, undefined);
assert.ok(Date.parse(nasUnpinned.updatedAt) > Date.parse(staleLocalPinned.updatedAt));
ok('push 전 NAS 머지: 최신 내리기가 옛 핀을 이김');

// 직원 PC: 칸반만 옮겨 rev 높음 / NAS: 관리자가 올려 핀 있음 → 핀은 반드시 보여야 함
const staffLocal = {
  id: 'j1',
  title: '명함',
  rev: 12,
  updatedAt: '2026-07-16T12:00:00.000Z',
};
const nasPinned = {
  id: 'j1',
  title: '명함',
  rev: 4,
  updatedAt: '2026-07-16T09:00:00.000Z',
  managementCardPinnedAt: '2026-07-16T09:00:00.000Z',
  boardHiddenAt: '2026-07-16T09:00:00.000Z',
  boardHiddenReason: 'management_card' as const,
};
const staffMerged = mergeJobVisibilityFields({ ...staffLocal }, staffLocal as any, nasPinned as any);
assert.equal(staffMerged.managementCardPinnedAt, nasPinned.managementCardPinnedAt);
assert.equal(staffMerged.rev, 12, '칸반 rev는 유지');
ok('직원 rev가 높아도 NAS 핀(관리카드)은 수용');

console.log('[smoke] job visibility sync PASSED\n');
