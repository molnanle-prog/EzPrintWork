import React, { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { db } from '../../services/dataService';

/**
 * Firebase/Firestore 일시 장애 시 — 업무는 로컬로 계속, 상태만 안내.
 * (관리 프로그램 장애와 무관하게 EzPrintWork 운영 유지)
 */
export const CloudDegradedBanner: React.FC = () => {
  const [degraded, setDegraded] = useState(() => db.isCloudDegraded());

  useEffect(() => {
    return db.subscribe(() => setDegraded(db.isCloudDegraded()));
  }, []);

  if (!degraded) return null;

  return (
    <div
      className="shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/80 dark:border-amber-800/50 text-amber-800 dark:text-amber-200 text-xs font-semibold"
      role="status"
    >
      <CloudOff size={14} className="shrink-0" />
      <span>클라우드 일시 불가 · 로컬로 정상 운영 중 (복구되면 자동 동기화)</span>
    </div>
  );
};
