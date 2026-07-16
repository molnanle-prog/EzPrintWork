/**
 * rev(리비전) 기반 병합 승패 판단 — PC 간 시스템 시계(clock skew)가 달라도
 * 정확한 선후 관계를 보장하는지 확인하는 스모크 테스트.
 * 실행: npx tsx scripts/smoke_job_revision_sync.ts
 */
import assert from 'node:assert/strict';
import { isIncomingJobNewer, nextJobRev } from '../src/utils/jobRevision';

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

console.log('[smoke] job revision sync (clock skew resilience)');

// 1) 정상 케이스 — rev가 더 큰 쪽이 최신 시각도 더 큼
{
  const prev = { rev: 3, updatedAt: '2026-07-16T01:00:00.000Z' };
  const incoming = { rev: 4, updatedAt: '2026-07-16T02:00:00.000Z' };
  assert.equal(isIncomingJobNewer(incoming, prev), true);
  ok('rev 큰 쪽 + 시각도 최신 → incoming 승리');
}

// 2) 핵심 케이스 — 직원 PC 시계가 관리자 PC보다 느려도(clock skew) rev가 크면 이겨야 함
{
  // 관리자 PC: 핀 상태, updatedAt이 실제로는 더 미래(PC 시계가 빠름)
  const adminStalePin = { rev: 5, updatedAt: '2026-07-16T10:00:00.000Z' };
  // 직원 PC: 방금 내림(unpin), rev는 더 크지만 PC 시계가 느려 updatedAt은 더 과거로 찍힘
  const staffUnpin = { rev: 6, updatedAt: '2026-07-16T09:50:00.000Z' };
  assert.ok(Date.parse(staffUnpin.updatedAt) < Date.parse(adminStalePin.updatedAt));
  assert.equal(
    isIncomingJobNewer(staffUnpin, adminStalePin),
    true,
    'rev가 더 크면 시각이 과거로 찍혀도 승리해야 함'
  );
  ok('clock skew 상황에서도 rev가 큰 쪽(직원의 내리기)이 승리');
}

// 3) rev 없는 옛 데이터끼리는 시각으로 대체 비교 (하위호환)
{
  const prev = { updatedAt: '2026-07-16T01:00:00.000Z' };
  const incoming = { updatedAt: '2026-07-16T02:00:00.000Z' };
  assert.equal(isIncomingJobNewer(incoming, prev), true);
  ok('rev 없는 레거시 데이터는 시각 비교로 폴백');
}

// 4) 한쪽만 rev가 있으면 rev 있는 쪽이 우선(신형 클라이언트가 항상 더 정확)
{
  const prevNoRev = { updatedAt: '2026-07-16T05:00:00.000Z' };
  const incomingWithRev = { rev: 1, updatedAt: '2026-07-16T01:00:00.000Z' };
  assert.equal(
    isIncomingJobNewer(incomingWithRev, prevNoRev),
    true,
    'rev(0 이상)가 있는 쪽이 rev 없는(-1) 쪽보다 우선'
  );
  ok('rev 있는 incoming이 rev 없는 prev보다 우선');
}

// 5) nextJobRev — 항상 이전 값보다 1 증가, 없으면 1부터 시작
{
  assert.equal(nextJobRev(null), 1);
  assert.equal(nextJobRev({ rev: 7 }), 8);
  assert.equal(nextJobRev({}), 1);
  ok('nextJobRev 단조 증가');
}

console.log('[smoke] job revision sync PASSED\n');
