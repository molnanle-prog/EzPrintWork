/**
 * 결제·미수·선불 정산 규칙 검증
 */
import {
  getJobOutstandingAmount,
  getPreviousClientOutstandingAmount,
  isReceivablePaymentStatus,
  resolvePrepaidOnJobUpdate,
} from '../src/utils/prepaidBalance';
import type { Client, Job, PaymentStatus } from '../src/types';

function job(partial: Partial<Job> & { paymentStatus: PaymentStatus; price: number }): Job {
  return {
    id: partial.id || 'job-1',
    title: partial.title || '테스트',
    clientName: partial.clientName || '거래처A',
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
    status: 'RECEIVED',
    priority: '일반' as Job['priority'],
    createdAt: '2026-01-01T00:00:00.000Z',
    dueDate: '2026-01-02T00:00:00.000Z',
    progress: 0,
    type: '명함',
    order: 0,
    prepaidAppliedAmount: 0,
    paidAmount: 0,
    ...partial,
  };
}

const client: Client = {
  id: 'c1',
  name: '거래처A',
  contactPerson: '',
  phone: '',
  contacts: [],
  prepaidBalance: 50000,
  prepaidLedger: [],
};

let failed = 0;
function assert(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${name}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

assert('대기·후불·일부만 미수 상태', [
  isReceivablePaymentStatus('결제대기'),
  isReceivablePaymentStatus('후불결제'),
  isReceivablePaymentStatus('일부결제'),
  isReceivablePaymentStatus('결제완료'),
  isReceivablePaymentStatus('카드결제'),
  isReceivablePaymentStatus('취소'),
], [true, true, true, false, false, false]);

assert(
  '후불에 남은 별도수납이 있어도 본건 미수 = 작업금액',
  getJobOutstandingAmount(job({ paymentStatus: '후불결제', price: 138600, paidAmount: 138600 })),
  138600
);

assert(
  '결제완료 미수는 0',
  getJobOutstandingAmount(job({ paymentStatus: '결제완료', price: 138600, paidAmount: 0 })),
  0
);

assert(
  '카드결제 미수는 0',
  getJobOutstandingAmount(job({ paymentStatus: '카드결제', price: 138600, paidAmount: 0 })),
  0
);

assert(
  '일부결제는 선불 차감 후 나머지가 미수',
  getJobOutstandingAmount(job({ paymentStatus: '일부결제', price: 100000, prepaidAppliedAmount: 30000, paidAmount: 70000 })),
  70000
);

const others = [
  job({ id: 'a', paymentStatus: '후불결제', price: 100870 }),
  job({ id: 'b', paymentStatus: '결제완료', price: 50000, paidAmount: 0 }),
  job({ id: 'c', paymentStatus: '취소', price: 20000 }),
];
assert(
  '이전 미수는 대기·일부·후불만 (완납·취소 제외)',
  getPreviousClientOutstandingAmount(others, 'current'),
  100870
);

const completed = job({ paymentStatus: '결제완료', price: 138600, paidAmount: 138600, clientName: '거래처A' });
const toPostpaid = { ...completed, paymentStatus: '후불결제' as const };
const reversed = resolvePrepaidOnJobUpdate(completed, toPostpaid, [client]);
assert('결제완료→후불: 별도수납 0', reversed.job.paidAmount, 0);
assert('결제완료→후불: 미수 = 작업금액', getJobOutstandingAmount(reversed.job), 138600);

const created = resolvePrepaidOnJobUpdate(
  job({ paymentStatus: '결제대기', price: 0, paidAmount: 0 }),
  job({ paymentStatus: '후불결제', price: 138600 }),
  [client]
);
assert('신규 후불: 별도수납 0', created.job.paidAmount, 0);
assert('신규 후불: 미수 = 작업금액', getJobOutstandingAmount(created.job), 138600);
assert('신규 후불: 선불은 안 뺌', created.job.prepaidAppliedAmount || 0, 0);
assert('신규 후불: 거래처 선불 원장 변동 없음', created.clientUpdates.length, 0);

const completedNew = resolvePrepaidOnJobUpdate(
  job({ paymentStatus: '결제대기', price: 0, paidAmount: 0 }),
  job({ paymentStatus: '결제완료', price: 80000, usePrepaidForPayment: false }),
  [client]
);
assert('신규 결제완료(선불 안 씀): 별도수납 = 전액', completedNew.job.paidAmount, 80000);
assert('신규 결제완료: 미수 0', getJobOutstandingAmount(completedNew.job), 0);

const cardPaid = resolvePrepaidOnJobUpdate(
  job({ paymentStatus: '결제대기', price: 0, paidAmount: 0 }),
  job({ paymentStatus: '카드결제', price: 80000, usePrepaidForPayment: false }),
  [client]
);
assert('신규 카드결제(선불 안 씀): 별도수납 = 전액', cardPaid.job.paidAmount, 80000);
assert('신규 카드결제: 미수 0', getJobOutstandingAmount(cardPaid.job), 0);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall payment/outstanding checks passed');
