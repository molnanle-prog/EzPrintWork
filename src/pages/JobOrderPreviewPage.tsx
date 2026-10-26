import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Job } from '../types';
import { db } from '../services/dataService';
import { JobOrderPreviewPanel } from '../components/common/JobOrderPreviewPanel';
import {
  getJobOrderPreviewCacheKey,
  mergeLatestJobOrderPrintMeta,
  readCachedJobForPreview,
} from '../utils/jobOrderPreviewStorage';

export const JobOrderPreviewPage: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(() => {
    if (!jobId) return null;
    const cached = readCachedJobForPreview(jobId);
    return cached ? mergeLatestJobOrderPrintMeta(cached) : null;
  });
  const [fetchDone, setFetchDone] = useState(!!job);

  const loadJob = useCallback(async () => {
    if (!jobId) return;

    const fromCache = readCachedJobForPreview(jobId);
    const fromMemory = db.getAllJobs().find((row) => row.id === jobId) ?? null;
    const base = fromMemory || fromCache;
    if (base) {
      setJob(mergeLatestJobOrderPrintMeta(base));
      setFetchDone(true);
      return;
    }

    setJob(null);
    setFetchDone(true);
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    void loadJob();
    const unsubscribe = db.subscribe(() => {
      void loadJob();
    });
    const cacheKey = getJobOrderPreviewCacheKey(jobId);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === cacheKey) {
        void loadJob();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, [jobId, loadJob]);

  const handleClose = () => {
    window.close();
  };

  if (!fetchDone && !job) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-200 gap-3">
        <Loader2 className="animate-spin text-blue-600" size={32} />
        <p className="text-sm text-slate-500 font-medium">작업 지시서 불러오는 중…</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-200 gap-4">
        <p className="text-slate-600 font-bold">작업 지시서를 찾을 수 없습니다.</p>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-bold"
        >
          창 닫기
        </button>
      </div>
    );
  }

  return <JobOrderPreviewPanel job={job} onClose={handleClose} />;
};
