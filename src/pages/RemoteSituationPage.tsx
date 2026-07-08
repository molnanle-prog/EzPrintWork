import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { situationMirrorService, SituationMirrorPayload } from '../services/situationMirrorService';
import { db } from '../services/dataService';
import { Job, JobStatusDefinition } from '../types';
import { RefreshCw, WifiOff, Eye } from 'lucide-react';

const DEFAULT_STATUSES: JobStatusDefinition[] = [
    { key: 'QUOTE', label: '견적' },
    { key: 'RECEIVED', label: '접수' },
    { key: 'DESIGN', label: '디자인' },
    { key: 'PRINTING', label: '인쇄' },
    { key: 'POST_PROCESSING', label: '후가공' },
    { key: 'DELIVERY', label: '납품' },
    { key: 'COMPLETED', label: '완료' },
];

function groupJobsByStatus(jobs: Job[], statuses: JobStatusDefinition[]) {
    const map = new Map<string, Job[]>();
    for (const s of statuses) map.set(s.key, []);
    for (const job of jobs) {
        const key = job.status || 'RECEIVED';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(job);
    }
    return statuses.map((s) => ({ status: s, jobs: map.get(s.key) || [] }));
}

export const RemoteSituationPage: React.FC = () => {
    const { currentUser, logout } = useAuth();
    const tenantId = currentUser?.tenantId;
    const [payload, setPayload] = useState<SituationMirrorPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const load = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        setError(null);
        try {
            const gatewayUrl = db.getSettingsObj()?.storeGatewayUrl as string | undefined;
            const data = await situationMirrorService.readRemoteMirror(tenantId, gatewayUrl);
            if (!data) {
                setError('매장 PC에서 아직 상황판 미러가 올라오지 않았습니다. 매장에서 작업을 한 번 저장한 뒤 새로고침 해 주세요.');
                setPayload(null);
            } else {
                setPayload(data);
                setLastRefresh(new Date());
            }
        } catch (e) {
            setError('상황판을 불러오지 못했습니다.');
            console.warn('[RemoteSituation] load failed:', e);
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => void load(), 2000);
        const onFocus = () => void load();
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [load]);

    const statuses = payload?.statusDefinitions?.length
        ? payload.statusDefinitions
        : DEFAULT_STATUSES;

    const columns = useMemo(
        () => groupJobsByStatus(payload?.jobs || [], statuses),
        [payload?.jobs, statuses]
    );

    const onlineStaff = (payload?.staff || []).filter((s) => s.isOnline || s.online);

    return (
        <div className="h-screen flex flex-col bg-slate-950 text-slate-100">
            <header className="shrink-0 border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
                        <Eye className="w-4 h-4" />
                        외부 보기 (읽기 전용)
                    </div>
                    <h1 className="text-lg font-black truncate">
                        {payload?.companyName || currentUser?.name || 'EzPrintWork'}
                    </h1>
                    {payload?.updatedAt && (
                        <p className="text-xs text-slate-500">
                            매장 기준 {new Date(payload.updatedAt).toLocaleString('ko-KR')}
                            {lastRefresh && ` · 조회 ${lastRefresh.toLocaleTimeString('ko-KR')}`}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => void load()}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-bold disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        새로고침
                    </button>
                    <button
                        type="button"
                        onClick={() => void logout()}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
                    >
                        로그아웃
                    </button>
                </div>
            </header>

            <div className="shrink-0 px-4 py-2 bg-slate-900/80 border-b border-slate-800 text-xs text-slate-400 flex flex-wrap gap-3 items-center">
                <span className="text-amber-400/90 font-bold">Firestore 미사용</span>
                <span>· NAS/Storage 미러만 조회 (과금 최소)</span>
                {onlineStaff.length > 0 && (
                    <span>· 접속 중 {onlineStaff.map((s) => s.name).join(', ')}</span>
                )}
            </div>

            {error && (
                <div className="mx-4 mt-4 p-4 rounded-xl bg-amber-950/50 border border-amber-800/50 text-amber-200 text-sm flex gap-2">
                    <WifiOff className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            <main className="flex-1 overflow-auto p-4">
                {loading && !payload ? (
                    <div className="flex items-center justify-center h-40 text-slate-500">불러오는 중…</div>
                ) : (
                    <div className="flex gap-3 min-w-max pb-4">
                        {columns.map(({ status, jobs }) => (
                            <section
                                key={status.key}
                                className="w-56 shrink-0 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col max-h-[calc(100vh-12rem)]"
                            >
                                <div className="px-3 py-2 border-b border-slate-800 font-bold text-sm flex justify-between">
                                    <span>{status.label}</span>
                                    <span className="text-slate-500">{jobs.length}</span>
                                </div>
                                <ul className="flex-1 overflow-y-auto p-2 space-y-2">
                                    {jobs.length === 0 ? (
                                        <li className="text-xs text-slate-600 text-center py-4">없음</li>
                                    ) : (
                                        jobs.map((job) => (
                                            <li
                                                key={job.id}
                                                className="rounded-lg bg-slate-800/80 border border-slate-700/50 p-2.5 text-sm"
                                            >
                                                <div className="font-bold truncate">{job.clientName || '거래처'}</div>
                                                <div className="text-xs text-slate-400 truncate mt-0.5">
                                                    {job.title || job.type || '작업'}
                                                </div>
                                                {job.dueDate && (
                                                    <div className="text-xs text-slate-500 mt-1">납기 {job.dueDate}</div>
                                                )}
                                            </li>
                                        ))
                                    )}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};
