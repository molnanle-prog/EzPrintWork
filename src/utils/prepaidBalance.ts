import { Client, Job, PaymentStatus } from '../types';

const CHARGE_STATUSES: PaymentStatus[] = ['일부결제', '결제완료'];

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

/** 미수·일부결제 작업의 실제 미수 금액 (선불 차감분 제외) */
export function getJobOutstandingAmount(job: Job): number {
  const price = job.price || 0;
  const applied = job.prepaidAppliedAmount || 0;
  if (job.paymentStatus === '결제완료' || job.paymentStatus === '취소') return 0;
  if (job.paymentStatus === '결제대기' || job.paymentStatus === '일부결제') {
    return Math.max(0, price - applied);
  }
  return price;
}

export function sumClientPrepaidBalances(clients: Client[]): number {
  return clients.reduce((sum, client) => sum + normalizePrepaidBalance(client.prepaidBalance), 0);
}

export interface PrepaidClientUpdate {
  clientId: string;
  prepaidBalance: number;
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
  prepaidBalance: number
): void {
  const idx = clientUpdates.findIndex((row) => row.clientId === clientId);
  if (idx >= 0) clientUpdates[idx].prepaidBalance = prepaidBalance;
  else clientUpdates.push({ clientId, prepaidBalance });
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

/** 작업 저장 시 결제 상태·금액·거래처 변경에 따른 선불 차감/복구 */
export function resolvePrepaidOnJobUpdate(oldJob: Job, newJob: Job, clients: Client[]): PrepaidResolution {
  const oldApplied = oldJob.prepaidAppliedAmount || 0;
  const paymentChanged = oldJob.paymentStatus !== newJob.paymentStatus;
  const priceChanged = oldJob.price !== newJob.price;
  const clientChanged = oldJob.clientName !== newJob.clientName;

  if (!paymentChanged && !priceChanged && !clientChanged) {
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
      applyClientUpdate(clientUpdates, oldClient.id, restored);
    }
  }

  const targetClient = findClientByName(clients, newJob.clientName);
  const price = newJob.price || 0;

  if (shouldApplyPrepaid(newJob.paymentStatus) && targetClient && price > 0) {
    const available = getBalanceAfterUpdates(clients, clientUpdates, targetClient.id);
    const toApply = Math.min(available, price);

    if (toApply > 0) {
      applyClientUpdate(clientUpdates, targetClient.id, available - toApply);
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
  }

  return { job, clientUpdates, notice, warning };
}
