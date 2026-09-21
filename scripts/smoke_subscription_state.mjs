import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { transitionSubscription } = require('../functions/subscriptionCore.js');

let state = transitionSubscription({ status: 'EXPIRED' }, 'START_TRIAL', '2026-01-01T00:00:00.000Z');
if (state.status !== 'TRIAL') throw new Error('TRIAL 전환 실패');
state = transitionSubscription(state, 'ACTIVATE', '2026-01-02T00:00:00.000Z');
if (state.status !== 'ACTIVE') throw new Error('ACTIVE 전환 실패');
state = transitionSubscription(state, 'RENEW_FAILED', '2026-02-02T00:00:00.000Z');
if (state.status !== 'PAST_DUE') throw new Error('PAST_DUE 전환 실패');
state = transitionSubscription(state, 'RETRY_SUCCESS', '2026-02-03T00:00:00.000Z');
if (state.status !== 'ACTIVE') throw new Error('재시도 복구 실패');
state = transitionSubscription(state, 'CANCEL', '2026-02-04T00:00:00.000Z');
if (state.status !== 'CANCELED') throw new Error('해지 전환 실패');
state = transitionSubscription(state, 'EXPIRE', '2026-03-04T00:00:00.000Z');
if (state.status !== 'EXPIRED') throw new Error('만료 전환 실패');

let invalidRejected = false;
try {
  transitionSubscription({ status: 'EXPIRED' }, 'RENEW_SUCCESS');
} catch {
  invalidRejected = true;
}
if (!invalidRejected) throw new Error('잘못된 상태 전환이 허용되었습니다.');

console.log('✓ 정기결제 상태 전환·실패·재시도·해지·만료');
