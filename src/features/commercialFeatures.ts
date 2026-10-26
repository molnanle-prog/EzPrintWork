import type { Client, Job, PaperStock, PricingConfig, Staff } from '../types';
import {
  canManageCompany,
  canManageStaff,
  canManageTenantRoot,
  canDeletePermanently,
  type CompanyPermissionContext,
} from '../utils/adminAccess';
import { getJobOutstandingAmount } from '../utils/prepaidBalance';

export type IndustryTemplateId = 'print-shop' | 'copy-shop' | 'sign-shop' | 'package-shop';

export interface IndustryTemplate {
  id: IndustryTemplateId;
  name: string;
  statuses: string[];
  products: string[];
}

export interface CostMarginResult {
  price: number;
  laborCost: number;
  printCost: number;
  paperCost: number;
  totalCost: number;
  margin: number;
  marginRate: number;
}

export interface InventorySuggestion {
  paperName: string;
  sheetsUsed: number;
  currentLevel: PaperStock['stockLevel'];
  nextLevel: PaperStock['stockLevel'];
  shouldReorder: boolean;
}

export interface QrTrackingPayload {
  tenantId: string;
  jobId: string;
  status: string;
  issuedAt: string;
}

export interface TaxInvoiceDraft {
  clientName: string;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  issuedAt: string;
  adapter: 'mock';
}

export interface SyncDiagnosticSnapshot {
  status: string;
  cloudDegraded: boolean;
  lastNasMirrorAt: string | null;
  lastMirrorReceivedAt: string | null;
}

export interface ConflictRecord {
  id: string;
  entityType: string;
  entityId: string;
  reason: string;
  createdAt: string;
}

export interface ReorderCandidate {
  clientName: string;
  lastJobId: string;
  lastTitle: string;
  lastOrderedAt: string;
}

export interface WebhookEvent {
  type: string;
  tenantId: string;
  entityId: string;
  payload: Record<string, unknown>;
}

export interface MgmtReport {
  jobCount: number;
  completedCount: number;
  revenue: number;
  outstanding: number;
  staffLoad: Array<{ staffId: string; name: string; assigned: number }>;
}

export interface CustomerPortalSession {
  token: string;
  clientName: string;
  jobIds: string[];
  expiresAt: string;
}

const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: 'print-shop',
    name: '인쇄소',
    statuses: ['접수', '디자인', '인쇄', '후가공', '출고'],
    products: ['명함', '전단지', '책자', '스티커'],
  },
  {
    id: 'copy-shop',
    name: '복사·출력',
    statuses: ['접수', '출력', '제본', '출고'],
    products: ['복사', '컬러출력', '제본'],
  },
  {
    id: 'sign-shop',
    name: '간판·실사',
    statuses: ['접수', '디자인', '출력', '시공', '완료'],
    products: ['실사출력', '현수막', '간판'],
  },
  {
    id: 'package-shop',
    name: '패키지',
    statuses: ['접수', '디자인', '샘플', '본생산', '출고'],
    products: ['박스', '쇼핑백', '라벨'],
  },
];

export function listIndustryTemplates(): IndustryTemplate[] {
  return INDUSTRY_TEMPLATES;
}

export function getIndustryTemplate(id: IndustryTemplateId): IndustryTemplate | undefined {
  return INDUSTRY_TEMPLATES.find((item) => item.id === id);
}

export function parseSheetQuantity(raw?: string): number {
  const match = String(raw || '').replace(/,/g, '').match(/(\d+)/);
  return match ? Math.max(0, Number(match[1])) : 0;
}

export function estimateJobSheets(job: Pick<Job, 'specs' | 'subJobs'>): number {
  const fromMain = parseSheetQuantity(job.specs?.quantity);
  const fromSub = (job.subJobs || []).reduce(
    (sum, item) => sum + parseSheetQuantity(item.specs?.quantity),
    0
  );
  return Math.max(fromMain, fromSub, 1);
}

export function calculateCostMargin(
  job: Pick<Job, 'price' | 'specs' | 'subJobs'>,
  pricing: PricingConfig,
  paper?: Pick<PaperStock, 'unitPrice'> | null
): CostMarginResult {
  const sheets = estimateJobSheets(job);
  const laborCost = Math.max(0, Number(pricing.baseLaborCost) || 0);
  const printCost = Math.max(0, Number(pricing.printColorCost) || 0) * sheets;
  const paperCost = Math.max(0, Number(paper?.unitPrice) || 0) * sheets;
  const totalCost = laborCost + printCost + paperCost;
  const price = Math.max(0, Number(job.price) || 0);
  const margin = price - totalCost;
  const marginRate = price > 0 ? margin / price : 0;
  return { price, laborCost, printCost, paperCost, totalCost, margin, marginRate };
}

function nextStockLevel(
  current: PaperStock['stockLevel'],
  sheetsUsed: number
): PaperStock['stockLevel'] {
  if (sheetsUsed >= 1000) return 'low';
  if (sheetsUsed >= 300) return current === 'high' ? 'medium' : 'low';
  return current;
}

export function suggestInventoryAfterJob(
  job: Pick<Job, 'specs' | 'subJobs'>,
  papers: PaperStock[]
): InventorySuggestion[] {
  const paperName = String(job.specs?.paperType || '').trim();
  if (!paperName) return [];
  const sheetsUsed = estimateJobSheets(job);
  return papers
    .filter((paper) => paper.name === paperName || paper.type === paperName)
    .map((paper) => {
      const nextLevel = nextStockLevel(paper.stockLevel, sheetsUsed);
      return {
        paperName: paper.name,
        sheetsUsed,
        currentLevel: paper.stockLevel,
        nextLevel,
        shouldReorder: nextLevel === 'low',
      };
    });
}

export function buildQrTrackingPayload(
  tenantId: string,
  job: Pick<Job, 'id' | 'status'>
): QrTrackingPayload {
  return {
    tenantId,
    jobId: job.id,
    status: job.status,
    issuedAt: new Date().toISOString(),
  };
}

export function encodeQrTrackingPayload(payload: QrTrackingPayload): string {
  return `ezpw:job:${payload.tenantId}:${payload.jobId}:${encodeURIComponent(payload.status)}`;
}

export function parseQrTrackingPayload(raw: string): QrTrackingPayload | null {
  const parts = String(raw || '').split(':');
  if (parts.length < 5 || parts[0] !== 'ezpw' || parts[1] !== 'job') return null;
  return {
    tenantId: parts[2],
    jobId: parts[3],
    status: decodeURIComponent(parts.slice(4).join(':')),
    issuedAt: new Date().toISOString(),
  };
}

export function buildTaxInvoiceDraft(job: Pick<Job, 'clientName' | 'price' | 'priceIncludesVat'>): TaxInvoiceDraft {
  const total = Math.max(0, Number(job.price) || 0);
  const supplyAmount = job.priceIncludesVat === false ? total : Math.round(total / 1.1);
  const vatAmount = Math.max(0, total - supplyAmount);
  return {
    clientName: job.clientName || '미지정',
    supplyAmount,
    vatAmount,
    totalAmount: total,
    issuedAt: new Date().toISOString(),
    adapter: 'mock',
  };
}

export function buildPermissionMatrix(ctx: CompanyPermissionContext) {
  return {
    companyAdmin: canManageCompany(ctx),
    staffAdmin: canManageStaff(ctx),
    rootSettings: canManageTenantRoot(ctx),
    permanentDelete: canDeletePermanently(ctx),
    staffOperations: !canManageCompany(ctx),
  };
}

export function buildSyncDiagnosticSnapshot(input: SyncDiagnosticSnapshot): SyncDiagnosticSnapshot {
  return {
    status: input.status || 'unknown',
    cloudDegraded: !!input.cloudDegraded,
    lastNasMirrorAt: input.lastNasMirrorAt || null,
    lastMirrorReceivedAt: input.lastMirrorReceivedAt || null,
  };
}

export function listConflictRecords(records: ConflictRecord[]): ConflictRecord[] {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listReorderCandidates(jobs: Job[], limit = 20): ReorderCandidate[] {
  const latest = new Map<string, Job>();
  for (const job of jobs) {
    const key = (job.clientName || '').trim();
    if (!key) continue;
    const prev = latest.get(key);
    if (!prev || String(job.createdAt) > String(prev.createdAt)) {
      latest.set(key, job);
    }
  }
  return [...latest.values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map((job) => ({
      clientName: job.clientName,
      lastJobId: job.id,
      lastTitle: job.title,
      lastOrderedAt: job.createdAt,
    }));
}

export function cloneJobForReorder(job: Job, now = new Date().toISOString()): Job {
  return {
    ...job,
    id: '',
    status: 'RECEIVED',
    paymentStatus: '결제대기',
    prepaidAppliedAmount: 0,
    paidAmount: 0,
    createdAt: now,
    completedAt: undefined,
    boardHiddenAt: null,
    boardHiddenBy: null,
    boardHiddenReason: null,
    jobOrderPrintCount: 0,
    jobOrderPrintLogs: [],
    subJobs: (job.subJobs || []).map((item) => ({
      ...item,
      externalOrderAckStage: undefined,
      externalOrderProgress: undefined,
      externalOrderArrivedAt: undefined,
    })),
    history: [
      {
        timestamp: now,
        staffId: job.receivedByStaffId || job.assignedStaffId || 'system',
        action: '재주문',
        details: `원본 ${job.id}`,
      },
    ],
  };
}

export function buildWebhookEvent(
  type: string,
  tenantId: string,
  entityId: string,
  payload: Record<string, unknown>
): WebhookEvent {
  return { type, tenantId, entityId, payload };
}

export function dispatchMockWebhook(event: WebhookEvent): { ok: true; mock: true; event: WebhookEvent } {
  return { ok: true, mock: true, event };
}

export function buildMgmtReport(jobs: Job[], staff: Staff[], clients: Client[] = []): MgmtReport {
  void clients;
  const completed = jobs.filter((job) => !!job.completedAt);
  const revenue = completed.reduce((sum, job) => sum + (Number(job.price) || 0), 0);
  const outstanding = jobs.reduce((sum, job) => sum + getJobOutstandingAmount(job), 0);
  const loadMap = new Map<string, number>();
  for (const job of jobs) {
    const ids = job.assignedStaffIds?.length
      ? job.assignedStaffIds
      : job.assignedStaffId
        ? [job.assignedStaffId]
        : [];
    for (const id of ids) loadMap.set(id, (loadMap.get(id) || 0) + 1);
  }
  return {
    jobCount: jobs.length,
    completedCount: completed.length,
    revenue,
    outstanding,
    staffLoad: staff
      .filter((row) => row.active !== false && !row.isDeleted)
      .map((row) => ({
        staffId: row.id,
        name: row.name,
        assigned: loadMap.get(row.id) || loadMap.get(row.uid || '') || 0,
      })),
  };
}

export function createCustomerPortalSession(
  clientName: string,
  jobs: Job[],
  now = Date.now()
): CustomerPortalSession {
  const related = jobs.filter((job) => (job.clientName || '').trim() === clientName.trim());
  return {
    token: `mock-portal-${now}`,
    clientName,
    jobIds: related.map((job) => job.id),
    expiresAt: new Date(now + 30 * 60_000).toISOString(),
  };
}
