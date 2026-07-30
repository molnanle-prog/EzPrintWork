import { Job } from '../types';
import { db } from '../services/dataService';
import {
  buildJobOrderPaymentSummary,
  JobOrderPaymentSummary,
} from './prepaidBalance';

const PREFIX = 'job-order-preview:';
const PAY_PREFIX = 'job-order-preview-pay:';

export type { JobOrderPaymentSummary };

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

export function openJobOrderPreviewWindow(job: Job): boolean {
  const paymentSummary = resolveJobOrderPaymentSummary(job);
  cacheJobForPreview(job, paymentSummary);
  const base = window.location.href.split('#')[0];
  const url = `${base}#/job-order-preview/${encodeURIComponent(job.id)}`;
  const opened = window.open(url, '_blank', 'width=1280,height=900');
  return !!opened;
}
