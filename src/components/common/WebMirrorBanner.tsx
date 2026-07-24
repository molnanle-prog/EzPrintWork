import React, { useEffect, useState } from 'react';
import { WifiOff, Loader2 } from 'lucide-react';
import { db } from '../../services/dataService';

/**
 * 웹/태블릿 전용 — NAS 미러 연결 실패와 “작업 없음”을 구분해서 안내.
 * Firestore jobs 폴백은 쓰지 않음 (비용·정책).
 */
export const WebMirrorBanner: React.FC = () => {
  const [failed, setFailed] = useState(() => db.isWebMirrorFailed());
  const [connecting, setConnecting] = useState(
    () => db.isWebViewOnly() && db.getWebMirrorLinkStatus() === 'connecting' && !db.hasWebMirrorData()
  );
  const [reason, setReason] = useState(() => db.getWebMirrorFailReason());

  useEffect(() => {
    return db.subscribe(() => {
      if (!db.isWebViewOnly()) {
        setFailed(false);
        setConnecting(false);
        setReason(null);
        return;
      }
      const status = db.getWebMirrorLinkStatus();
      setFailed(status === 'failed' && !db.hasWebMirrorData());
      setConnecting(status === 'connecting' && !db.hasWebMirrorData());
      setReason(db.getWebMirrorFailReason());
    });
  }, []);

  if (!db.isWebViewOnly()) return null;

  if (connecting) {
    return (
      <div
        className="shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 bg-sky-50 dark:bg-sky-950/40 border-b border-sky-200/80 dark:border-sky-800/50 text-sky-800 dark:text-sky-200 text-xs font-semibold"
        role="status"
      >
        <Loader2 size={14} className="shrink-0 animate-spin" />
        <span>회사 작업판 불러오는 중… (매장 PC NAS 미러)</span>
      </div>
    );
  }

  if (!failed) return null;

  return (
    <div
      className="shrink-0 flex items-center justify-center gap-2 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200/80 dark:border-rose-800/50 text-rose-800 dark:text-rose-200 text-xs font-semibold"
      role="status"
    >
      <WifiOff size={14} className="shrink-0" />
      <span>{reason || '회사 작업판 미러 연결 실패 — 매장 PC·같은 Wi‑Fi를 확인해 주세요.'}</span>
    </div>
  );
};
