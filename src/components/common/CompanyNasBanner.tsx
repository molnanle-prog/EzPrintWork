import React, { useEffect, useState } from 'react';
import { AlertTriangle, FolderSync, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../../services/dataService';

/**
 * 회사 NAS 경로 변경 / 연결 실패 시 전원에게 동일하게 표시.
 * 짧은 끊김은 유예, 길면 작업 잠금. 게이트웨이는 같은 NAS 파일 공유용.
 */
export const CompanyNasBanner: React.FC = () => {
    const [health, setHealth] = useState(() => db.getCompanyNasHealth());
    const [busy, setBusy] = useState(false);
    const isElectron = typeof window !== 'undefined' && !!window.electron;

    useEffect(() => {
        const unsub = db.subscribe(() => setHealth(db.getCompanyNasHealth()));
        return unsub;
    }, []);

    if (!isElectron) return null;

    const showPending = health.pendingReconnect && !!health.pendingPath;
    const showLocked = !showPending && health.healthy === false;
    const showGrace = !showPending && !showLocked && health.inGrace;

    if (!showPending && !showLocked && !showGrace) return null;

    const handleReconnect = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const result = await db.reconnectCompanyArchiveRoot();
            if (result.ok) {
                toast.success('회사 NAS에 다시 연결했습니다. 작업·메신저를 동기화합니다.');
            } else {
                toast.error(result.error || 'NAS 연결에 실패했습니다.');
            }
        } finally {
            setBusy(false);
        }
    };

    if (showGrace) {
        return (
            <div className="shrink-0 z-50 border-b px-4 py-2 bg-sky-50 border-sky-200 text-sky-950 flex items-center gap-2 text-xs font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>
                    NAS 연결이 잠시 불안정합니다. 재시도 중…
                    {health.channel === 'gateway' ? ' (게이트웨이)' : ''}
                    {' '}전원은 같은 자료를 유지합니다.
                </span>
            </div>
        );
    }

    return (
        <div
            className={`shrink-0 z-50 border-b px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 ${
                showPending
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
        >
            <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="min-w-0 text-sm leading-snug">
                    {showPending ? (
                        <>
                            <p className="font-bold">회사 NAS 경로가 변경되었습니다 — 작업 잠금</p>
                            <p className="text-xs mt-0.5 opacity-90">
                                「지금 연결」 전까지 작업·거래처·메신저를 사용할 수 없고, 이전 폴더 자료도 쓰지 않습니다.
                                연결 후 전원 동일하게 새 폴더만 봅니다.
                            </p>
                            <p className="text-[11px] font-mono mt-1 break-all opacity-80">
                                새 경로: {health.pendingPath}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="font-bold">회사 NAS 연결 끊김 — 작업 잠금</p>
                            <p className="text-xs mt-0.5 opacity-90">
                                NAS 직접 연결·사내 게이트웨이 모두 실패했습니다.
                                복구되면 자동으로 잠금이 해제됩니다. (전원 동일)
                            </p>
                            {(health.path || health.error) && (
                                <p className="text-[11px] font-mono mt-1 break-all opacity-80">
                                    {health.path || ''}
                                    {health.error ? ` — ${health.error}` : ''}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
            <button
                type="button"
                disabled={busy}
                onClick={() => void handleReconnect()}
                className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-60 ${
                    showPending ? 'bg-amber-600 hover:bg-amber-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
            >
                {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : showPending ? (
                    <FolderSync className="w-3.5 h-3.5" />
                ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                )}
                {busy ? '연결 중…' : '지금 연결'}
            </button>
        </div>
    );
};
