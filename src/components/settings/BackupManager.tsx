import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import {
    Download, Upload, RefreshCw, Trash2,
    CheckCircle2, AlertTriangle, ShieldCheck, HardDrive, Database
} from 'lucide-react';

interface CloudBackupItem {
    name: string;
    date: string;
    size: string;
}

export const BackupManager: React.FC = () => {
    const [backups, setBackups] = useState<CloudBackupItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [isCreating, setIsCreating] = useState<boolean>(false);
    const [restoringFile, setRestoringFile] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');
    const [documentsPath, setDocumentsPath] = useState<string | null>(null);
    const [customBackupPath, setCustomBackupPath] = useState<string | null>(
        typeof window !== 'undefined' ? localStorage.getItem('ezpw_local_backup_path') : null
    );

    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

    useEffect(() => {
        if (isElectron) {
            (window as any).electron.getDocumentsPath().then((path: string) => {
                setDocumentsPath(path);
            }).catch((err: unknown) => {
                console.error('Failed to get documents path:', err);
            });
        }
    }, [isElectron]);

    const fetchBackups = async () => {
        setLoading(true);
        try {
            const list = await db.listCloudBackups();
            setBackups(list);
        } catch (e) {
            console.error('Failed to load backups', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBackups();
    }, []);

    const showStatus = (message: string, type: 'info' | 'success' | 'error') => {
        setStatusMessage(message);
        setStatusType(type);
        if (type !== 'error') {
            setTimeout(() => {
                setStatusMessage((prev) => (prev === message ? null : prev));
            }, 6000);
        }
    };

    const handleSelectCustomFolder = async () => {
        if (!isElectron) return;
        try {
            const selected = await (window as any).electron.selectDirectory();
            if (selected) {
                localStorage.setItem('ezpw_local_backup_path', selected);
                setCustomBackupPath(selected);
                showStatus(`백업 폴더: ${selected}`, 'success');
            }
        } catch (e: unknown) {
            showStatus(`폴더 선택 오류: ${e instanceof Error ? e.message : String(e)}`, 'error');
        }
    };

    const handleResetBackupFolder = () => {
        localStorage.removeItem('ezpw_local_backup_path');
        setCustomBackupPath(null);
        showStatus('백업 폴더를 내 문서 기본값으로 재설정했습니다.', 'success');
    };

    const handleOpenLocalFolder = async () => {
        if (!isElectron) return;
        try {
            const isWin = navigator.platform.toLowerCase().includes('win');
            const sep = isWin ? '\\' : '/';
            let folderPath = customBackupPath
                || (documentsPath ? `${documentsPath}${sep}EzPrintWork_Backups` : '');

            if (!folderPath) {
                showStatus('백업 경로를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.', 'error');
                return;
            }

            const readmePath = `${folderPath}${sep}readme.txt`;
            const electron = (window as any).electron;
            await electron.saveFile(
                readmePath,
                'EzPrintWork 자동 백업 폴더입니다.'
            );
            const success = await electron.openPath(folderPath);
            showStatus(
                success ? '백업 폴더를 열었습니다.' : '백업 폴더를 열 수 없습니다.',
                success ? 'success' : 'error'
            );
        } catch (e: unknown) {
            showStatus(`폴더 열기 실패: ${e instanceof Error ? e.message : String(e)}`, 'error');
        }
    };

    const handleCreateLocalBackup = async () => {
        if (isCreating) return;
        if (!isElectron) {
            handleDownloadLocal();
            return;
        }
        setIsCreating(true);
        showStatus('PC에 백업 저장 중…', 'info');
        try {
            const success = await db.runDailyAutoBackup(true);
            showStatus(
                success ? 'PC 백업이 완료되었습니다.' : '백업 생성에 실패했습니다.',
                success ? 'success' : 'error'
            );
        } catch (e: unknown) {
            showStatus(`백업 실패: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDownloadLocal = () => {
        try {
            const data = db.exportData();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `EzPrintWork_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showStatus('JSON 백업 파일을 다운로드했습니다.', 'success');
        } catch (e: unknown) {
            showStatus(`다운로드 실패: ${e instanceof Error ? e.message : String(e)}`, 'error');
        }
    };

    const handleRestoreFromCloud = async (backupName: string) => {
        if (!window.confirm(
            `"${backupName}" 백업으로 복원하시겠습니까?\n\n현재 데이터가 백업 내용으로 덮어씌워집니다.`
        )) return;
        if (!window.confirm('되돌릴 수 없습니다. 계속하시겠습니까?')) return;

        setRestoringFile(backupName);
        showStatus('복원 중… 브라우저를 닫지 마세요.', 'info');
        try {
            const success = await db.restoreFromCloudBackup(backupName);
            if (success) {
                alert('복원이 완료되었습니다. 화면을 새로고침합니다.');
                window.location.reload();
            } else {
                showStatus('복원에 실패했습니다.', 'error');
            }
        } catch (e: unknown) {
            showStatus(`복원 실패: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setRestoringFile(null);
        }
    };

    const handleDeleteBackup = async (backupName: string) => {
        if (!window.confirm(`"${backupName}" 백업을 삭제하시겠습니까?`)) return;
        try {
            const ok = await db.deleteCloudBackup(backupName);
            if (!ok) {
                showStatus('백업 삭제에 실패했습니다. 권한 또는 네트워크를 확인해 주세요.', 'error');
                return;
            }
            showStatus('백업을 삭제했습니다.', 'success');
            await fetchBackups();
        } catch (e: unknown) {
            showStatus(`삭제 실패: ${e instanceof Error ? e.message : String(e)}`, 'error');
        }
    };

    const handleUploadLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const json = event.target?.result as string;
            if (!window.confirm(
                '선택한 JSON 백업으로 전체 복원합니다.\n현재 데이터는 모두 백업 내용으로 교체됩니다.\n\n계속하시겠습니까?'
            )) return;

            showStatus('백업 파일 복원 중…', 'info');
            try {
                const success = await db.importData(json);
                if (success) {
                    alert('복원이 완료되었습니다.');
                    window.location.reload();
                } else {
                    showStatus('잘못된 백업 파일이거나 복원에 실패했습니다.', 'error');
                }
            } catch (err: unknown) {
                showStatus(`복원 실패: ${err instanceof Error ? err.message : String(err)}`, 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const backupFolderLabel = customBackupPath
        ? customBackupPath
        : documentsPath
            ? `${documentsPath}\\EzPrintWork_Backups`
            : '경로 확인 중…';

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
                <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">
                    재난 대비 백업 및 복구
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    이 화면은 운영 아카이브가 아니라 재난 대비용입니다.
                    PC 포맷/재설치/예기치 않은 데이터 손실에 대비해 별도 백업 파일을 만들고 복구합니다.
                </p>

                <div className="mb-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    [재난 대비] 관리자 백업/복구 작업
                </div>

                {statusMessage && (
                    <div className={`mb-6 p-4 rounded-xl border flex items-start gap-3 ${
                        statusType === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-800 dark:text-emerald-300'
                            : statusType === 'error'
                                ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 text-rose-800 dark:text-rose-300'
                                : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 text-blue-800 dark:text-blue-300'
                    }`}>
                        {statusType === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />}
                        {statusType === 'error' && <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />}
                        {statusType === 'info' && <RefreshCw className="w-5 h-5 shrink-0 mt-0.5 animate-spin" />}
                        <div className="text-sm flex-1">{statusMessage}</div>
                        {statusType === 'error' && (
                            <button type="button" onClick={() => setStatusMessage(null)} className="text-xs underline">
                                닫기
                            </button>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 백업 */}
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/10 p-5 space-y-4">
                        <h3 className="font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5" />
                            백업
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {isElectron
                                ? '지금 PC 폴더에 저장하거나, JSON 파일로 다운로드할 수 있습니다.'
                                : 'JSON 파일로 전체 데이터를 다운로드합니다.'}
                        </p>
                        <button
                            type="button"
                            onClick={handleCreateLocalBackup}
                            disabled={isCreating}
                            title="현재 시점의 전체 데이터를 백업 파일로 저장합니다. (재난 대비용)"
                            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"
                        >
                            {isCreating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                            {isElectron ? '지금 PC에 백업 저장' : 'JSON 백업 다운로드'}
                        </button>
                        <button
                            type="button"
                            onClick={handleDownloadLocal}
                            title="브라우저/PC에서 즉시 JSON 백업 파일을 다운로드합니다."
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm"
                        >
                            <Download className="w-4 h-4" />
                            JSON 파일 다운로드
                        </button>

                        {isElectron && (
                            <div className="pt-3 border-t border-emerald-200/60 dark:border-emerald-900/30 space-y-2">
                                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 break-all">
                                    📂 {backupFolderLabel}
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={handleSelectCustomFolder}
                                        title="재난 대비 백업 파일이 저장될 폴더를 변경합니다."
                                        className="text-xs font-bold py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                                    >
                                        폴더 변경
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleResetBackupFolder}
                                        disabled={!customBackupPath}
                                        title="백업 저장 폴더를 내 문서 기본값으로 되돌립니다."
                                        className="text-xs font-bold py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40"
                                    >
                                        기본값
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleOpenLocalFolder}
                                    title="현재 백업 폴더를 탐색기에서 열어 파일을 확인합니다."
                                    className="w-full text-xs font-bold py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center justify-center gap-1"
                                >
                                    <HardDrive className="w-3.5 h-3.5" />
                                    백업 폴더 열기
                                </button>
                            </div>
                        )}
                    </div>

                    {/* 복구 */}
                    <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 p-5 space-y-4">
                        <h3 className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-2">
                            <Upload className="w-5 h-5" />
                            복구
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            저장해 둔 JSON 백업 파일을 선택하면 <strong>전체 복원</strong>됩니다.
                            현재 데이터는 백업 내용으로 교체됩니다.
                        </p>
                        <label
                            title="JSON 백업 파일을 선택해 현재 데이터 전체를 복원합니다."
                            className="block w-full text-center bg-amber-600 hover:bg-amber-500 text-white py-3 rounded-xl font-bold cursor-pointer flex items-center justify-center gap-2"
                        >
                            <Upload className="w-5 h-5" />
                            JSON 백업 파일 선택…
                            <input type="file" accept=".json" onChange={handleUploadLocal} className="hidden" />
                        </label>
                    </div>
                </div>
            </div>

            {/* 이전 클라우드 백업 — 있을 때만 표시 */}
            {!loading && backups.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Database className="w-5 h-5 text-slate-500" />
                            이전 클라우드 백업
                        </h3>
                        <button
                            type="button"
                            onClick={fetchBackups}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500"
                            title="새로고침"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="space-y-2">
                        {backups.map((item) => (
                            <div
                                key={item.name}
                                className="flex items-center justify-between gap-3 py-3 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                                        {item.date}
                                    </div>
                                    <div className="text-xs text-slate-400">{item.size}</div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleRestoreFromCloud(item.name)}
                                        disabled={restoringFile !== null}
                                        title="선택한 클라우드 백업으로 현재 데이터를 전체 복원합니다."
                                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                                    >
                                        {restoringFile === item.name ? '복원 중…' : '복원'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteBackup(item.name)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg"
                                        title="선택한 클라우드 백업 파일을 삭제합니다."
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
