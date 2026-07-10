import { Job } from '../types';

const PREFIX = 'job-order-preview:';

export function cacheJobForPreview(job: Job): void {
  try {
    const serialized = JSON.stringify(job);
    localStorage.setItem(`${PREFIX}${job.id}`, serialized);
    sessionStorage.setItem(`${PREFIX}${job.id}`, serialized);
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

export function isJobOrderPreviewRoute(): boolean {
  return typeof window !== 'undefined' && window.location.hash.includes('/job-order-preview/');
}

export function openJobOrderPreviewWindow(job: Job): boolean {
  cacheJobForPreview(job);
  const base = window.location.href.split('#')[0];
  const url = `${base}#/job-order-preview/${encodeURIComponent(job.id)}`;
  const opened = window.open(url, '_blank', 'width=1280,height=900');
  return !!opened;
}
