import { Job, JobOrderPrintLog, Staff } from '../types';
import { db } from '../services/dataService';
import {
  buildJobOrderPaymentSummary,
  JobOrderPaymentSummary,
} from './prepaidBalance';
import { resolveHistoryActorName } from './staffMatch';

const PREFIX = 'job-order-preview:';
const PAY_PREFIX = 'job-order-preview-pay:';

export type { JobOrderPaymentSummary };

export function getJobOrderPreviewCacheKey(jobId: string): string {
  return `${PREFIX}${jobId}`;
}

/** 작업지시서 출력 시각을 'YYYY년 MM월 DD일 HH시 mm분' 형식으로 변환 */
export function formatJobOrderPrintDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}년 ${pad(d.getMonth() + 1)}월 ${pad(d.getDate())}일 ${pad(d.getHours())}시 ${pad(d.getMinutes())}분`;
}

/** 작업지시서 출력 이력 목록 (최신순) */
export function getJobOrderPrintLogs(
  job: Job | null | undefined,
  staffList: Staff[] = []
): JobOrderPrintLog[] {
  if (!job) return [];
  const rawLogs: JobOrderPrintLog[] = Array.isArray(job.jobOrderPrintLogs)
    ? job.jobOrderPrintLogs.map((entry) => ({
        printedAt: entry.printedAt,
        staffId: entry.staffId,
        staffName:
          entry.staffName?.trim() ||
          resolveHistoryActorName(staffList, entry.staffId, '직원'),
      }))
    : [];

  const seenTimestamps = new Set(rawLogs.map((l) => l.printedAt));
  if (Array.isArray(job.history)) {
    for (const h of job.history) {
      if (
        (h.action === '작업지시서 출력' || h.action === '작업지시서 인쇄') &&
        h.timestamp &&
        !seenTimestamps.has(h.timestamp)
      ) {
        seenTimestamps.add(h.timestamp);
        rawLogs.push({
          printedAt: h.timestamp,
          staffId: h.staffId,
          staffName: resolveHistoryActorName(staffList, h.staffId, '직원'),
        });
      }
    }
  }

  return rawLogs
    .filter((l) => !!l.printedAt)
    .sort(
      (a, b) =>
        new Date(b.printedAt).getTime() - new Date(a.printedAt).getTime()
    );
}

/** 작업지시서 총 출력 횟수 */
export function getJobOrderPrintCount(
  job: Job | null | undefined,
  staffList: Staff[] = []
): number {
  if (!job) return 0;
  const logsLen = getJobOrderPrintLogs(job, staffList).length;
  const explicit =
    typeof job.jobOrderPrintCount === 'number' &&
    Number.isFinite(job.jobOrderPrintCount) &&
    job.jobOrderPrintCount >= 0
      ? Math.floor(job.jobOrderPrintCount)
      : 0;
  return Math.max(explicit, logsLen);
}

export function cacheJobForPreview(
  job: Job,
  paymentSummary?: JobOrderPaymentSummary
): void {
  try {
    const serialized = JSON.stringify(job);
    localStorage.setItem(`${PREFIX}${job.id}`, serialized);
    sessionStorage.setItem(`${PREFIX}${job.id}`, serialized);
    if (paymentSummary) {
      const paySerialized = JSON.stringify(paymentSummary);
      localStorage.setItem(`${PAY_PREFIX}${job.id}`, paySerialized);
      sessionStorage.setItem(`${PAY_PREFIX}${job.id}`, paySerialized);
    }
  } catch {
    /* ignore */
  }
}

export function readCachedJobForPreview(jobId: string): Job | null {
  try {
    const raw =
      localStorage.getItem(`${PREFIX}${jobId}`) ??
      sessionStorage.getItem(`${PREFIX}${jobId}`);
    return raw ? (JSON.parse(raw) as Job) : null;
  } catch {
    return null;
  }
}

export function readCachedPaymentSummaryForPreview(
  jobId: string
): JobOrderPaymentSummary | null {
  try {
    const raw =
      localStorage.getItem(`${PAY_PREFIX}${jobId}`) ??
      sessionStorage.getItem(`${PAY_PREFIX}${jobId}`);
    return raw ? (JSON.parse(raw) as JobOrderPaymentSummary) : null;
  } catch {
    return null;
  }
}

/** 캐시·메모리 DB로 결제요약 재구성 (미리보기 창에서도 최신 반영) */
export function resolveJobOrderPaymentSummary(job: Job): JobOrderPaymentSummary {
  const clientJobs = db.getJobsByClient(job.clientName || '');
  if (clientJobs.length > 0) {
    return buildJobOrderPaymentSummary(job, clientJobs);
  }
  return (
    readCachedPaymentSummaryForPreview(job.id) ??
    buildJobOrderPaymentSummary(job, [])
  );
}

export function isJobOrderPreviewRoute(): boolean {
  return typeof window !== 'undefined' && window.location.hash.includes('/job-order-preview/');
}

export function mergeLatestJobOrderPrintMeta(job: Job): Job {
  const fromDb = db.getAllJobs().find((row) => row.id === job.id);
  const fromCache = readCachedJobForPreview(job.id);
  const candidates = [job, fromDb, fromCache].filter(Boolean) as Job[];
  let bestCount = 0;
  const logMap = new Map<string, JobOrderPrintLog>();

  for (const c of candidates) {
    if (typeof c.jobOrderPrintCount === 'number' && c.jobOrderPrintCount > bestCount) {
      bestCount = c.jobOrderPrintCount;
    }
    if (Array.isArray(c.jobOrderPrintLogs)) {
      for (const l of c.jobOrderPrintLogs) {
        if (l?.printedAt && !logMap.has(l.printedAt)) {
          logMap.set(l.printedAt, l);
        }
      }
    }
  }

  const mergedLogs = [...logMap.values()].sort(
    (a, b) => new Date(b.printedAt).getTime() - new Date(a.printedAt).getTime()
  );
  const finalCount = Math.max(bestCount, mergedLogs.length);
  if (finalCount === 0 && mergedLogs.length === 0) {
    return job;
  }
  return {
    ...job,
    jobOrderPrintCount: finalCount,
    jobOrderPrintLogs: mergedLogs,
  };
}

export function openJobOrderPreviewWindow(job: Job): boolean {
  const syncedJob = mergeLatestJobOrderPrintMeta(job);
  const paymentSummary = resolveJobOrderPaymentSummary(syncedJob);
  cacheJobForPreview(syncedJob, paymentSummary);
  const base = window.location.href.split('#')[0];
  const url = `${base}#/job-order-preview/${encodeURIComponent(syncedJob.id)}`;
  const opened = window.open(url, '_blank', 'width=1280,height=900');
  return !!opened;
}
