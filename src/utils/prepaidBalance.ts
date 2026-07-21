import { Client, Job, PaymentStatus, PrepaidLedgerEntry } from '../types';

const CHARGE_STATUSES: PaymentStatus[] = ['일부결제', '결제완료'];
const MAX_LEDGER_ENTRIES = 100;

export function normalizePrepaidBalance(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
  return 0;
}

export function findClientByName(clients: Client[], name?: string): Client | undefined {
  const trimmed = (name || '').trim();
  if (!trimmed) return undefined;
  return clients.find((c) => c.name.trim() === trimmed);
}

function shouldApplyPrepaid(status?: PaymentStatus): boolean {
  return !!status && CHARGE_STATUSES.includes(status);
}

export function isPrepaidChargeableStatus(status?: PaymentStatus): boolean {
  return shouldApplyPrepaid(status);
}

/** 저장 전에도 결제완료·일부결제 + 선불차감이면 예상 차감액 */
export function getProjectedPrepaidApplied(job: Job, balanceBefore: number): number {
  const stored = job.prepaidAppliedAmount || 0;
  if (stored > 0) return stored;
  if (!shouldUsePrepaidForJob(job)) return 0;
  if (!shouldApplyPrepaid(job.paymentStatus)) return 0;
  const price = job.price || 0;
  if (price <= 0) return 0;
  return Math.min(Math.max(0, balanceBefore), price);
}

export interface JobPrepaidSlot {
  balanceBefore: number;
  applied: number;
  balanceAfter: number;
}

/** 관리카드 선불 차감 순서 — 먼저 올린 작업부터 */
export function sortJobsForPrepaidRun(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    const ta = new Date(a.managementCardPinnedAt || 0).getTime();
    const tb = new Date(b.managementCardPinnedAt || 0).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function getClientNameKey(job: Job): string {
  return (job.clientName || '').trim() || '미지정';
}

/** 관리카드 작업별 선불 잔액 흐름 (거래처별, 올린 순서대로 차감) */
export function buildPrepaidBoardRunByClient(
  boardJobs: Job[],
  clients: Client[]
): Map<string, Map<string, JobPrepaidSlot>> {
  const grouped = new Map<string, Job[]>();
  for (const job of boardJobs) {
    const key = getClientNameKey(job);
    const list = grouped.get(key) || [];
    list.push(job);
    grouped.set(key, list);
  }

  const result = new Map<string, Map<string, JobPrepaidSlot>>();
  for (const [clientName, clientJobs] of grouped) {
    const client = findClientByName(clients, clientName);
    const ledgerBalance = normalizePrepaidBalance(client?.prepaidBalance);
    const sorted = sortJobsForPrepaidRun(clientJobs);
    const savedOnBoard = sorted.reduce((sum, job) => sum + (job.prepaidAppliedAmount || 0), 0);
    let running = ledgerBalance + savedOnBoard;

    const jobMap = new Map<string, JobPrepaidSlot>();
    for (const job of sorted) {
      const balanceBefore = running;
      const applied = getProjectedPrepaidApplied(job, balanceBefore);
      const balanceAfter = Math.max(0, balanceBefore - applied);
      jobMap.set(job.id, { balanceBefore, applied, balanceAfter });
      running = balanceAfter;
    }
    result.set(clientName, jobMap);
  }
  return result;
}

export function getPrepaidSlotForJob(
  targetJob: Job,
  boardJobs: Job[],
  clients: Client[]
): JobPrepaidSlot | null {
  const clientName = getClientNameKey(targetJob);
  const client = findClientByName(clients, clientName);
  const hasPrepaidContext =
    normalizePrepaidBalance(client?.prepaidBalance) > 0 ||
    boardJobs.some((job) => getClientNameKey(job) === clientName);
  if (!hasPrepaidContext) return null;

  const sameClientJobs = boardJobs
    .filter((job) => getClientNameKey(job) === clientName)
    .map((job) => (job.id === targetJob.id ? targetJob : job));

  if (sameClientJobs.length === 0 && normalizePrepaidBalance(client?.prepaidBalance) <= 0) {
    return null;
  }

  const jobsForRun = sameClientJobs.length > 0 ? sameClientJobs : [targetJob];
  const run = buildPrepaidBoardRunByClient(jobsForRun, clients);
  return run.get(clientName)?.get(targetJob.id) || null;
}

export function summarizePrepaidBoardRun(
  boardJobs: Job[],
  clients: Client[]
): { totalApplied: number; remainingBalance: number } {
  const run = buildPrepaidBoardRunByClient(boardJobs, clients);
  let totalApplied = 0;
  let remainingBalance = 0;

  for (const [clientName, jobMap] of run) {
    for (const slot of jobMap.values()) {
      totalApplied += slot.applied;
    }
    const clientJobs = boardJobs.filter((job) => getClientNameKey(job) === clientName);
    if (clientJobs.length === 0) continue;
    const sorted = sortJobsForPrepaidRun(clientJobs);
    const lastJob = sorted[sorted.length - 1];
    const lastSlot = jobMap.get(lastJob.id);
    if (lastSlot) {
      remainingBalance += lastSlot.balanceAfter;
    }
  }

  return { totalApplied, remainingBalance };
}

export function getManagementCardPrepaidDisplay(slot: JobPrepaidSlot): number {
  return slot.applied > 0 ? slot.balanceAfter : slot.balanceBefore;
}

/** 관리카드 카드용 — 이 건이 선불을 어떻게 처리했는지 */
export type ManagementPrepaidBadge =
  | { kind: 'deducted'; amount: number }
  | { kind: 'pending'; amount: number }
  | { kind: 'separate' }
  | { kind: 'receivable'; amount: number };

export function getManagementPrepaidBadge(
  job: Job,
  slot: JobPrepaidSlot | undefined
): ManagementPrepaidBadge | null {
  if (!slot) return null;
  if (slot.applied > 0) return { kind: 'deducted', amount: slot.applied };
  if (slot.balanceBefore <= 0) return null;

  const usePrepaid = shouldUsePrepaidForJob(job);
  const outstanding = getJobOutstandingAmount(job);

  if (
    usePrepaid &&
    (job.paymentStatus === '결제대기' || job.paymentStatus === '일부결제' || job.paymentStatus === '후불결제')
  ) {
    const pending = Math.min(slot.balanceBefore, job.price || 0);
    if (pending > 0) return { kind: 'pending', amount: pending };
  }

  if (!usePrepaid && job.paymentStatus === '결제완료') {
    return { kind: 'separate' };
  }

  if (!usePrepaid && outstanding > 0) {
    return { kind: 'receivable', amount: outstanding };
  }

  return null;
}

export function getClientPrepaidFormula(
  clientJobs: Job[],
  jobMap: Map<string, JobPrepaidSlot> | undefined,
  ledgerBalance: number
): { start: number; applied: number; remaining: number } {
  const sorted = sortJobsForPrepaidRun(clientJobs);
  const firstSlot = sorted.length > 0 ? jobMap?.get(sorted[0].id) : undefined;
  const lastSlot = sorted.length > 0 ? jobMap?.get(sorted[sorted.length - 1].id) : undefined;
  const start = firstSlot?.balanceBefore ?? ledgerBalance;
  const applied = sorted.reduce((sum, job) => sum + (jobMap?.get(job.id)?.applied || 0), 0);
  const remaining = lastSlot?.balanceAfter ?? ledgerBalance;
  return { start, applied, remaining };
}

/** 선불 차감 2건 이상일 때만 흐름 문구 */
export function buildPrepaidFlowLabel(
  clientJobs: Job[],
  jobMap: Map<string, JobPrepaidSlot> | undefined
): string | null {
  if (!jobMap) return null;
  const deducted = sortJobsForPrepaidRun(clientJobs).filter(
    (job) => (jobMap.get(job.id)?.applied || 0) > 0
  );
  if (deducted.length < 2) return null;

  const first = jobMap.get(deducted[0].id);
  if (!first) return null;

  const parts: string[] = [first.balanceBefore.toLocaleString()];
  for (const job of deducted) {
    const slot = jobMap.get(job.id);
    if (!slot) continue;
    const shortTitle = ((job.title || '작업').trim() || '작업').slice(0, 10);
    parts.push(`${shortTitle} −${slot.applied.toLocaleString()}`);
    parts.push(slot.balanceAfter.toLocaleString());
  }
  return parts.join(' → ');
}

export function shouldUsePrepaidForJob(job: Job): boolean {
  return job.usePrepaidForPayment !== false;
}

/** 미수·일부결제 작업의 실제 미수 금액 (선불 차감분 제외) */
export function getJobOutstandingAmount(job: Job): number {
  const price = job.price || 0;
  const applied = job.prepaidAppliedAmount || 0;
  if (job.paymentStatus === '결제완료' || job.paymentStatus === '취소') return 0;
  if (job.paymentStatus === '결제대기' || job.paymentStatus === '일부결제' || job.paymentStatus === '후불결제') {
    return Math.max(0, price - applied);
  }
  return price;
}

export interface JobPrepaidBreakdown {
  price: number;
  applied: number;
  outstanding: number;
  /** 선불 잔액으로도 부족한 금액 (차감 전 기준) */
  prepaidShortfall: number;
  clientPrepaidBalance: number;
}

export function getJobPrepaidBreakdown(
  job: Job,
  clientPrepaidBalance = 0,
  options?: { balanceBefore?: number }
): JobPrepaidBreakdown {
  const price = job.price || 0;
  const balanceBefore =
    options?.balanceBefore !== undefined
      ? Math.max(0, Math.round(options.balanceBefore))
      : normalizePrepaidBalance(clientPrepaidBalance);
  const applied = getProjectedPrepaidApplied(job, balanceBefore);
  const outstanding = getJobOutstandingAmount(job);
  const balance = balanceBefore;

  let prepaidShortfall = 0;
  if (job.paymentStatus === '결제대기' || job.paymentStatus === '일부결제' || job.paymentStatus === '후불결제') {
    if (applied > 0) {
      prepaidShortfall = outstanding;
    } else if (shouldUsePrepaidForJob(job) && balance > 0 && balance < price) {
      prepaidShortfall = price - balance;
    } else if (shouldUsePrepaidForJob(job) && balance === 0) {
      prepaidShortfall = price;
    }
  }

  return { price, applied, outstanding, prepaidShortfall, clientPrepaidBalance: balance };
}

export function sumClientPrepaidBalances(clients: Client[]): number {
  return clients.reduce((sum, client) => sum + normalizePrepaidBalance(client.prepaidBalance), 0);
}

export function appendPrepaidLedger(
  client: Client,
  entry: Omit<PrepaidLedgerEntry, 'id'> & { id?: string }
): PrepaidLedgerEntry[] {
  const row: PrepaidLedgerEntry = {
    id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...entry,
  };
  return [...(client.prepaidLedger || []), row].slice(-MAX_LEDGER_ENTRIES);
}

/** 이력 삭제 후 잔액·balanceAfter 재계산 */
export function recalculatePrepaidLedger(entries: PrepaidLedgerEntry[]): {
  ledger: PrepaidLedgerEntry[];
  prepaidBalance: number;
} {
  const sorted = [...entries].sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  let balance = 0;
  const ledger = sorted.map((entry) => {
    balance = Math.max(0, Math.round(balance + entry.amount));
    return { ...entry, balanceAfter: balance };
  });
  return { ledger, prepaidBalance: balance };
}

export function removeAndRecalculatePrepaidLedger(
  client: Client,
  entryId: string
): { ledger: PrepaidLedgerEntry[]; prepaidBalance: number } | null {
  const entries = client.prepaidLedger || [];
  if (!entries.some((e) => e.id === entryId)) return null;
  return recalculatePrepaidLedger(entries.filter((e) => e.id !== entryId));
}

export function canDeletePrepaidLedgerEntry(entry: PrepaidLedgerEntry): boolean {
  return entry.type === 'deposit' || entry.type === 'adjustment';
}

export interface PrepaidClientUpdate {
  clientId: string;
  prepaidBalance: number;
  ledgerEntry?: PrepaidLedgerEntry;
}

export interface PrepaidResolution {
  job: Job;
  clientUpdates: PrepaidClientUpdate[];
  notice?: string;
  warning?: string;
}

function applyClientUpdate(
  clientUpdates: PrepaidClientUpdate[],
  clientId: string,
  prepaidBalance: number,
  ledgerEntry?: PrepaidLedgerEntry
): void {
  const idx = clientUpdates.findIndex((row) => row.clientId === clientId);
  if (idx >= 0) {
    clientUpdates[idx].prepaidBalance = prepaidBalance;
    if (ledgerEntry) clientUpdates[idx].ledgerEntry = ledgerEntry;
  } else {
    clientUpdates.push({ clientId, prepaidBalance, ledgerEntry });
  }
}

function getBalanceAfterUpdates(
  clients: Client[],
  clientUpdates: PrepaidClientUpdate[],
  clientId: string
): number {
  const pending = clientUpdates.find((row) => row.clientId === clientId);
  if (pending) return pending.prepaidBalance;
  const client = clients.find((c) => c.id === clientId);
  return normalizePrepaidBalance(client?.prepaidBalance);
}

function buildLedgerEntry(
  client: Client,
  balanceAfter: number,
  amount: number,
  type: PrepaidLedgerEntry['type'],
  options?: { staffId?: string; jobId?: string; jobTitle?: string; note?: string }
): PrepaidLedgerEntry {
  return {
    id: `${Date.now()}-${client.id}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    amount,
    balanceAfter,
    staffId: options?.staffId,
    jobId: options?.jobId,
    jobTitle: options?.jobTitle,
    note: options?.note,
  };
}

/** 작업 저장 시 결제 상태·금액·거래처 변경에 따른 선불 차감/복구 */
export function resolvePrepaidOnJobUpdate(oldJob: Job, newJob: Job, clients: Client[]): PrepaidResolution {
  const oldApplied = oldJob.prepaidAppliedAmount || 0;
  const paymentChanged = oldJob.paymentStatus !== newJob.paymentStatus;
  const priceChanged = oldJob.price !== newJob.price;
  const clientChanged = oldJob.clientName !== newJob.clientName;
  const usePrepaidChanged = oldJob.usePrepaidForPayment !== newJob.usePrepaidForPayment;
  const needsPrepaidApply =
    shouldApplyPrepaid(newJob.paymentStatus) &&
    shouldUsePrepaidForJob(newJob) &&
    (newJob.prepaidAppliedAmount || 0) === 0 &&
    (newJob.price || 0) > 0;

  if (!paymentChanged && !priceChanged && !clientChanged && !usePrepaidChanged && !needsPrepaidApply) {
    return { job: newJob, clientUpdates: [] };
  }

  const clientUpdates: PrepaidClientUpdate[] = [];
  let job: Job = { ...newJob, prepaidAppliedAmount: 0 };
  let notice: string | undefined;
  let warning: string | undefined;

  if (oldApplied > 0) {
    const oldClient = findClientByName(clients, oldJob.clientName);
    if (oldClient) {
      const restored = getBalanceAfterUpdates(clients, clientUpdates, oldClient.id) + oldApplied;
      const entry = buildLedgerEntry(oldClient, restored, oldApplied, 'restore', {
        jobId: newJob.id,
        jobTitle: newJob.title,
        note: '작업 변경·결제 취소 선불 복구',
      });
      applyClientUpdate(clientUpdates, oldClient.id, restored, entry);
    }
  }

  const targetClient = findClientByName(clients, newJob.clientName);
  const price = newJob.price || 0;
  const usePrepaid = shouldUsePrepaidForJob(newJob);

  if (shouldApplyPrepaid(newJob.paymentStatus) && targetClient && price > 0 && usePrepaid) {
    const available = getBalanceAfterUpdates(clients, clientUpdates, targetClient.id);
    const toApply = Math.min(available, price);

    if (toApply > 0) {
      const newBalance = available - toApply;
      const entry = buildLedgerEntry(targetClient, newBalance, -toApply, 'deduction', {
        jobId: newJob.id,
        jobTitle: newJob.title,
        note: '작업 결제 선불 차감',
      });
      applyClientUpdate(clientUpdates, targetClient.id, newBalance, entry);
      job.prepaidAppliedAmount = toApply;

      const remaining = price - toApply;
      if (newJob.paymentStatus === '결제완료' && remaining > 0) {
        warning = `선불 ${toApply.toLocaleString()}원 차감. 잔여 ${remaining.toLocaleString()}원은 별도 수금으로 처리됩니다.`;
      } else if (newJob.paymentStatus === '일부결제') {
        notice =
          remaining > 0
            ? `선불 ${toApply.toLocaleString()}원 차감 (미수 ${remaining.toLocaleString()}원)`
            : `선불 ${toApply.toLocaleString()}원 전액 차감되었습니다.`;
      } else if (remaining === 0) {
        notice = `선불 ${toApply.toLocaleString()}원 전액 차감되었습니다.`;
      }
    } else if (newJob.paymentStatus === '일부결제') {
      notice = '선불 잔액이 없어 미수 상태로 유지됩니다.';
    }
  } else if (
    shouldApplyPrepaid(newJob.paymentStatus) &&
    !usePrepaid &&
    (paymentChanged || usePrepaidChanged)
  ) {
    notice = '별도 수금으로 처리됩니다. (선불 차감 안 함)';
  }

  return { job, clientUpdates, notice, warning };
}
