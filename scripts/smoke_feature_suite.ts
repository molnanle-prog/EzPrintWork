import { FEATURE_FLAG_KEYS, isFeatureEnabled } from '../src/features/featureFlags';
import {
  buildMgmtReport,
  buildQrTrackingPayload,
  buildTaxInvoiceDraft,
  calculateCostMargin,
  cloneJobForReorder,
  createCustomerPortalSession,
  dispatchMockWebhook,
  encodeQrTrackingPayload,
  listIndustryTemplates,
  listReorderCandidates,
  parseQrTrackingPayload,
  suggestInventoryAfterJob,
} from '../src/features/commercialFeatures';
import { Priority } from '../src/types';
import type { Job, PaperStock, Staff } from '../src/types';

const job: Job = {
  id: 'job-1',
  title: '명함 500매',
  clientName: '봄날인쇄',
  description: '',
  specs: {
    paperType: '아트지',
    paperWeight: '250g',
    size: '명함',
    quantity: '500매',
    processing: [],
    printColor: '양면 4도',
    memo: '',
  },
  status: 'RECEIVED',
  priority: Priority.NORMAL,
  paymentStatus: '결제대기',
  createdAt: '2026-09-01T00:00:00.000Z',
  dueDate: '2026-09-10',
  progress: 0,
  type: '명함',
  price: 110000,
  priceIncludesVat: true,
  order: 0,
};

const paper: PaperStock = {
  id: 'paper-1',
  name: '아트지',
  weight: '250g',
  type: '아트지',
  unitPrice: 20,
  stockLevel: 'high',
};

const staff: Staff[] = [
  {
    id: 'staff-1',
    name: '홍길동',
    role: '사원',
    phone: '',
    avatarUrl: '',
    active: true,
    email: 'a@ez-hub.kr',
    joinDate: '2026-01-01',
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

console.log('feature flags + commercial suite\n');
for (const key of FEATURE_FLAG_KEYS) {
  assert(`${key} 기본 OFF`, isFeatureEnabled(key) === false);
}

const margin = calculateCostMargin(job, { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 }, paper);
assert('원가·마진 계산', margin.totalCost === 10000 + 50 * 500 + 20 * 500 && margin.price === 110000);

const inventory = suggestInventoryAfterJob(job, [paper]);
assert('재고 감산 제안', inventory[0]?.sheetsUsed === 500 && inventory[0]?.nextLevel === 'medium');

const qr = encodeQrTrackingPayload(buildQrTrackingPayload('tenant-1', job));
assert('QR 왕복 파싱', parseQrTrackingPayload(qr)?.jobId === 'job-1');

const invoice = buildTaxInvoiceDraft(job);
assert('세금계산서 모의 초안', invoice.adapter === 'mock' && invoice.totalAmount === 110000);

assert('업종 템플릿 4종', listIndustryTemplates().length === 4);

const reorder = listReorderCandidates([job]);
assert('CRM 재주문 후보', reorder[0]?.clientName === '봄날인쇄');
assert('재주문 원본 id 비움', cloneJobForReorder(job).id === '' && cloneJobForReorder(job).paymentStatus === '결제대기');

const report = buildMgmtReport([job], staff);
assert('경영 리포트 집계', report.jobCount === 1 && report.outstanding >= 0);

const portal = createCustomerPortalSession('봄날인쇄', [job]);
assert('고객 포털은 로컬 토큰만', portal.token.startsWith('mock-portal-') && portal.jobIds[0] === 'job-1');

const webhook = dispatchMockWebhook({
  type: 'job.created',
  tenantId: 'tenant-1',
  entityId: 'job-1',
  payload: {},
});
assert('Webhook 모의 발송', webhook.ok === true && webhook.mock === true);

if (failed) process.exit(1);
console.log('\n✓ 추천 기능 12종 도메인 로직 (플래그 기본 OFF)');
