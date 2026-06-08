import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { 
    Database, Download, Upload, Cloud, RefreshCw, Trash2, 
    CheckCircle2, AlertTriangle, ShieldCheck, HardDrive, HelpCircle
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
    const [showMergeModal, setShowMergeModal] = useState<boolean>(false);
    const [mergeSummary, setMergeSummary] = useState<any>(null);
    const [mergedData, setMergedData] = useState<any>(null);
    const [detectedFiles, setDetectedFiles] = useState<{ name: string; path: string; size: string; mtime: string }[]>([]);

    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

    useEffect(() => {
        if (isElectron) {
            (window as any).electron.getDocumentsPath().then((path: string) => {
                setDocumentsPath(path);
            }).catch((err: any) => {
                console.error("Failed to get documents path:", err);
            });
        }
    }, [isElectron]);

    const handleSelectCustomFolder = async () => {
        if (!isElectron) return;
        try {
            const selected = await (window as any).electron.selectDirectory();
            if (selected) {
                localStorage.setItem('ezpw_local_backup_path', selected);
                setCustomBackupPath(selected);
                showStatus(`백업 폴더가 "${selected}"(으)로 변경되었습니다.`, "success");
            }
        } catch (e: any) {
            showStatus(`폴더 선택 중 오류 발생: ${e.message}`, "error");
        }
    };

    const handleResetBackupFolder = () => {
        localStorage.removeItem('ezpw_local_backup_path');
        setCustomBackupPath(null);
        showStatus("백업 폴더가 기본값(내 문서)으로 재설정되었습니다.", "success");
    };

    const handleOpenLocalFolder = async () => {
        if (!isElectron) return;
        try {
            const isWin = navigator.platform.toLowerCase().includes('win');
            const sep = isWin ? '\\' : '/';
            
            let folderPath = '';
            if (customBackupPath) {
                folderPath = customBackupPath;
            } else if (documentsPath) {
                folderPath = `${documentsPath}${sep}EzPrintWork_Backups`;
            } else {
                showStatus("백업 경로를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.", "error");
                return;
            }

            const readmePath = folderPath.endsWith(sep)
                ? `${folderPath}readme.txt`
                : `${folderPath}${sep}readme.txt`;
            
            const electron = (window as any).electron;
            // Ensure folder exists by writing a readme file first
            await electron.saveFile(readmePath, "EzPrintWork 자동 백업 폴더입니다. 이 곳의 백업 파일들은 삭제 기한 없이 영구 보관됩니다.");
            
            const success = await electron.openPath(folderPath);
            if (success) {
                showStatus("설정된 백업 폴더를 탐색기에서 열었습니다.", "success");
            } else {
                showStatus("백업 폴더를 열 수 없습니다.", "error");
            }
        } catch (e: any) {
            showStatus(`폴더 열기 실패: ${e.message}`, "error");
        }
    };

    // Fetch the list of backups from the cloud
    const fetchBackups = async () => {
        setLoading(true);
        try {
            const list = await db.listCloudBackups();
            setBackups(list);
        } catch (e) {
            console.error("Failed to load backups", e);
            showStatus("클라우드 백업 목록을 불러오는 중 오류가 발생했습니다.", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBackups();
        if (isElectron && (window as any).electron?.findLegacyDbFiles) {
            (window as any).electron.findLegacyDbFiles().then((files: any) => {
                setDetectedFiles(files);
            }).catch((e: any) => console.error("Failed to scan legacy files:", e));
        }
    }, [isElectron]);

    const showStatus = (message: string, type: 'info' | 'success' | 'error') => {
        setStatusMessage(message);
        setStatusType(type);
        // Auto clear after 6 seconds for successes/infos
        if (type !== 'error') {
            setTimeout(() => {
                setStatusMessage(prev => prev === message ? null : prev);
            }, 6000);
        }
    };

    // Manual cloud backup trigger
    const handleCreateManualCloudBackup = async () => {
        if (isCreating) return;
        setIsCreating(true);
        showStatus("새로운 클라우드 백업 스냅샷을 생성하는 중...", "info");
        try {
            const success = await db.runDailyAutoBackup(true); // force = true
            if (success) {
                showStatus("클라우드 안전 백업이 성공적으로 완료되었습니다! (30일 롤링 보관)", "success");
                await fetchBackups();
            } else {
                showStatus("백업 생성 중 오류가 발생했습니다.", "error");
            }
        } catch (e: any) {
            showStatus(`백업 실패: ${e.message}`, "error");
        } finally {
            setIsCreating(false);
        }
    };

    // Restore from Cloud backup
    const handleRestoreFromCloud = async (backupName: string) => {
        const confirm1 = window.confirm(
            `⚠️ [위험] 정말로 "${backupName}" 백업 파일로 복원하시겠습니까?\n\n` +
            `이 작업은 현재 데이터베이스의 모든 작업, 직원, 거래처, 설정을 백업본의 상태로 완전히 덮어씌웁니다.`
        );
        if (!confirm1) return;

        const confirm2 = window.confirm(
            `🚨 [최종 경고] 복원 작업은 되돌릴 수 없습니다.\n` +
            `정말로 복원을 진행하시겠습니까? 현재 화면이 새로고침됩니다.`
        );
        if (!confirm2) return;

        setRestoringFile(backupName);
        showStatus(`"${backupName}" 데이터 복원 중... 절대 브라우저를 닫지 마세요.`, "info");

        try {
            const success = await db.restoreFromCloudBackup(backupName);
            if (success) {
                alert("🎉 데이터 복원이 무결하게 완료되었습니다! 시스템을 다시 시작합니다.");
                window.location.reload();
            } else {
                showStatus("클라우드 데이터 복원에 실패했습니다. 올바른 형식의 백업 파일인지 확인해주세요.", "error");
            }
        } catch (e: any) {
            showStatus(`복원 실패: ${e.message}`, "error");
        } finally {
            setRestoringFile(null);
        }
    };

    // Delete Cloud backup
    const handleDeleteBackup = async (backupName: string) => {
        if (!window.confirm(`선택하신 클라우드 백업 "${backupName}"을 영구 삭제하시겠습니까?`)) return;

        try {
            await db.deleteCloudBackup(backupName);
            showStatus("백업 파일이 클라우드에서 영구 삭제되었습니다.", "success");
            await fetchBackups();
        } catch (e: any) {
            showStatus(`삭제 실패: ${e.message}`, "error");
        }
    };

    // Local download backup
    const handleDownloadLocal = () => {
        try {
            const data = db.exportData();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `printmaster_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showStatus("JSON 백업 파일이 로컬 다운로드 폴더에 안전하게 저장되었습니다.", "success");
        } catch (e: any) {
            showStatus(`로컬 백업 내보내기 실패: ${e.message}`, "error");
        }
    };

    const handleRestoreDetectedFile = async (filePath: string, isMerge: boolean) => {
        if (!isElectron || !(window as any).electron?.readFile) return;
        
        const actionText = isMerge ? "병합(기존 자료 보존하며 합치기)" : "전체 덮어쓰기 복원";
        const confirm1 = window.confirm(
            `⚠️ 자동으로 감지된 기존 데이터 파일 [${filePath.split('\\').pop()}]을 통해 ${actionText}을 진행하시겠습니까?`
        );
        if (!confirm1) return;
        
        showStatus("구버전 데이터 파일을 자동으로 읽어와 병합/복원 준비 중...", "info");
        try {
            const result = await (window as any).electron.readFile(filePath);
            if (!result.success || !result.data) {
                throw new Error(result.error || "파일 데이터를 읽어올 수 없습니다.");
            }
            
            const json = result.data;
            if (isMerge) {
                const preview = db.getMergedPreview(json);
                if (preview.success) {
                    setMergeSummary(preview.summary);
                    setMergedData(preview.mergedData);
                    setShowMergeModal(true);
                    showStatus("병합 미리보기가 정상 준비되었습니다.", "success");
                } else {
                    showStatus(preview.error || "병합 미리보기를 생성하는 데 실패했습니다.", "error");
                }
            } else {
                const confirmOverwrite = window.confirm(
                    "🚨 [최종 경고] 정말로 이 구버전 데이터로 전체 복원하시겠습니까?\n현재 시스템의 모든 데이터가 백업 내용으로 대체되어 덮어씌워집니다."
                );
                if (!confirmOverwrite) return;
                
                showStatus("구버전 데이터로 전체 복원을 진행하는 중...", "info");
                const success = await db.importData(json);
                if (success) {
                    alert("🎉 기존 데이터 전체 복원이 무결하게 완료되었습니다!");
                    window.location.reload();
                } else {
                    showStatus("데이터 가져오기에 실패했습니다. 올바른 형식의 백업 파일인지 확인해주세요.", "error");
                }
            }
        } catch (e: any) {
            showStatus(`구버전 데이터 처리 실패: ${e.message}`, "error");
        }
    };

    // Local upload restore
    const handleUploadLocal = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const json = event.target?.result as string;
            
            // 사용자에게 병합 여부를 묻는 선택창
            const action = window.confirm(
                "가져오기 방식을 선택해 주세요.\n\n" +
                "[확인/예] -> 기존 데이터를 보존하면서 합치기 (병합)\n" +
                "[취소/아니오] -> 기존 데이터를 지우고 덮어쓰기 (전체 복원)"
            );
            
            if (action) {
                // 병합(합치기) 시나리오
                const preview = db.getMergedPreview(json);
                if (preview.success) {
                    setMergeSummary(preview.summary);
                    setMergedData(preview.mergedData);
                    setShowMergeModal(true);
                } else {
                    showStatus(preview.error || "병합 미리보기를 생성하는 데 실패했습니다.", "error");
                }
            } else {
                // 덮어쓰기(전체 복원) 시나리오
                const confirmOverwrite = window.confirm(
                    "⚠️ [최종 경고] 정말로 전체 복원하시겠습니까?\n" +
                    "현재 시스템에 저장된 모든 데이터가 백업 데이터로 대체되어 유실됩니다."
                );
                if (!confirmOverwrite) return;

                showStatus("로컬 백업 파일에서 복원하는 중...", "info");
                try {
                    const success = await db.importData(json);
                    if (success) {
                        alert("데이터 전체 복원이 성공적으로 완료되었습니다! 화면이 새로고침됩니다.");
                        window.location.reload();
                    } else {
                        showStatus("데이터 복원에 실패했습니다. 잘못된 백업 JSON 파일입니다.", "error");
                    }
                } catch (err: any) {
                    showStatus(`복원 실패: ${err.message}`, "error");
                }
            }
        };
        reader.readAsText(file);
        // 파일 input 초기화
        e.target.value = '';
    };

    return (
        <div className="space-y-6 max-w-5xl transition-colors duration-300">
            {/* Top Banner (Status and Premium Title) */}
            <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-900 dark:from-blue-950 dark:to-slate-950 rounded-2xl p-6 md:p-8 shadow-xl text-white border border-blue-500/20 relative overflow-hidden">
                <div className="absolute right-0 top-0 -mt-6 -mr-6 w-36 h-36 bg-blue-500/10 rounded-full blur-3xl"></div>
                <div className="absolute left-1/3 bottom-0 -mb-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-400/30">
                                <Cloud className="w-8 h-8 text-blue-400 animate-pulse" />
                            </div>
                            <div>
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/20 rounded-full text-xs font-semibold tracking-wide uppercase">
                                    Enterprise Safety
                                </span>
                                <h2 className="text-2xl md:text-3xl font-black tracking-tight mt-0.5">
                                    클라우드 자동 백업 및 복구 센터
                                </h2>
                            </div>
                        </div>
                        <p className="text-slate-300 text-sm max-w-2xl leading-relaxed">
                            Firestore 실시간 분산 데이터베이스의 완벽한 안전 지대입니다. 
                            어떠한 해킹 위협, 오작동, 물리적 기기 유실이 발생하더라도 1분 이내에 기업 전체 데이터베이스를 완벽 복구할 수 있습니다.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button 
                            onClick={handleCreateManualCloudBackup}
                            disabled={isCreating}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-3 rounded-xl shadow-lg hover:shadow-blue-500/20 flex items-center gap-2 border border-blue-400/20 transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                        >
                            {isCreating ? (
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            ) : (
                                <ShieldCheck className="w-5 h-5 text-blue-200" />
                            )}
                            즉시 클라우드 백업 생성
                        </button>
                    </div>
                </div>
            </div>

            {/* 📢 컴퓨터 내 구버전/백업 데이터 자동 감지 알림판 */}
            {isElectron && detectedFiles.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-900/50 rounded-2xl p-6 shadow-md animate-fade-in flex flex-col gap-4 text-slate-800 dark:text-slate-200">
                    <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/50 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-300 shrink-0 border border-amber-200/50">
                            <Database className="w-6 h-6 animate-pulse" />
                        </div>
                        <div className="flex-1 space-y-1.5 text-left">
                            <div className="inline-flex items-center gap-1 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 text-[10px] font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                                📢 로컬 구버전 데이터 발견됨 (원클릭 자동 연동)
                            </div>
                            <h4 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                                컴퓨터 내부에서 복구 가능한 이전 데이터 파일이 자동으로 감지되었습니다!
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                번거롭게 파일을 직접 찾아서 선택할 필요가 없습니다. 아래 감지된 목록에서 원하시는 복구 방식의 버튼만 클릭하시면 단 1초 만에 데이터가 자동으로 화면에 병합 및 복원됩니다.
                            </p>
                        </div>
                    </div>
                    
                    <div className="divide-y divide-amber-200/40 dark:divide-amber-900/20 border-t border-amber-200/40 dark:border-amber-900/20 pt-2">
                        {detectedFiles.map((file) => (
                            <div key={file.path} className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-3 first:pt-1">
                                <div className="text-left space-y-1 flex-1 min-w-0">
                                    <div className="font-bold text-slate-700 dark:text-slate-300 text-sm truncate">{file.name}</div>
                                    <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 break-all">경로: {file.path} ({file.size} │ 수정일시: {file.mtime})</div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button
                                        onClick={() => handleRestoreDetectedFile(file.path, true)}
                                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm hover:shadow-blue-500/10 transition-all active:scale-95"
                                    >
                                        이 데이터 자동으로 합치기 (병합)
                                    </button>
                                    <button
                                        onClick={() => handleRestoreDetectedFile(file.path, false)}
                                        className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm hover:shadow-amber-500/10 transition-all active:scale-95"
                                    >
                                        덮어쓰기 (전체 복원)
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Status Feedback Toast/Banner */}
            {statusMessage && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-md animate-fade-in transition-all duration-300 ${
                    statusType === 'success' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                        : statusType === 'error'
                        ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 font-medium'
                        : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40 text-blue-800 dark:text-blue-300'
                }`}>
                    {statusType === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
                    {statusType === 'error' && <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />}
                    {statusType === 'info' && <RefreshCw className="w-5 h-5 text-blue-500 animate-spin shrink-0 mt-0.5" />}
                    <div className="text-sm flex-1">{statusMessage}</div>
                    {statusType === 'error' && (
                        <button onClick={() => setStatusMessage(null)} className="text-xs underline hover:text-rose-600 ml-2">
                            닫기
                        </button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Backups List Table (Left 2 Columns) */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 transition-colors duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                                안전한 클라우드 백업 히스토리
                            </h3>
                        </div>
                        <button 
                            onClick={fetchBackups} 
                            disabled={loading}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg transition-colors border border-slate-200 dark:border-slate-800 disabled:opacity-50"
                            title="백업 목록 새로고침"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
                            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                                클라우드 스토리지 보안 백업을 탐색 중입니다...
                            </p>
                        </div>
                    ) : backups.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                            <Cloud className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                            <div>
                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">보관된 백업 스냅샷이 없습니다.</h4>
                                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                                    상단의 [즉시 클라우드 백업 생성] 버튼을 눌러 첫 번째 안전 스냅샷을 생성하세요.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">
                                        <th className="pb-3 pl-2">백업 일시</th>
                                        <th className="pb-3 text-right">파일 크기</th>
                                        <th className="pb-3 text-right pr-2">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                    {backups.map((item) => (
                                        <tr key={item.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="py-4 pl-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                                                    <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm">
                                                        {item.date}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-4 text-right font-medium text-slate-500 dark:text-slate-400 text-sm">
                                                {item.size}
                                            </td>
                                            <td className="py-4 text-right pr-2">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleRestoreFromCloud(item.name)}
                                                        disabled={restoringFile !== null}
                                                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800/50 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                                                    >
                                                        {restoringFile === item.name ? "복구 진행중..." : "복원"}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteBackup(item.name)}
                                                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors border border-transparent hover:border-rose-100 dark:hover:border-rose-900/30"
                                                        title="영구 삭제"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Right Side: Local Manual Backup / Upload Center */}
                <div className="space-y-6">
                    {/* Local Auto Backup (Electron Only) */}
                    {isElectron && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 transition-colors duration-300">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                이 컴퓨터 자동 백업 (영구 보관)
                            </h3>
                            <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/60 dark:border-emerald-900/30 rounded-xl transition-colors">
                                <h4 className="font-bold text-emerald-900 dark:text-emerald-300 text-sm mb-1.5 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> PC 로컬 세이프가드 가동 중
                                </h4>
                                <p className="text-xs text-emerald-700 dark:text-emerald-400/80 mb-3 leading-relaxed">
                                    대표님 PC(관리자 앱)의 지정된 폴더에 매일 1회 자동으로 전체 데이터 백업 파일이 저장됩니다. 
                                    클라우드 스토리지의 30일 보관 기간과 달리, <strong>이 컴퓨터의 백업은 삭제 기한 없이 영구적(평생)으로 보관</strong>되므로 안전을 100% 보증합니다.
                                </p>
                                
                                <div className="space-y-2 mb-4">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">현재 저장 경로:</span>
                                    <div className="text-[11px] font-mono text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/80 p-2.5 rounded-lg break-all border border-slate-200 dark:border-slate-700/60">
                                        {customBackupPath ? (
                                            <span>📂 {customBackupPath} (사용자 설정 경로)</span>
                                        ) : documentsPath ? (
                                            <span>📂 {documentsPath}\EzPrintWork_Backups (기본 내 문서 경로)</span>
                                        ) : (
                                            '경로를 확인하는 중...'
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    <button 
                                        onClick={handleSelectCustomFolder}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded-lg font-bold shadow-sm text-xs transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 text-center"
                                    >
                                        백업 폴더 변경...
                                    </button>
                                    <button 
                                        onClick={handleResetBackupFolder}
                                        disabled={!customBackupPath}
                                        className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-1.5 rounded-lg font-bold text-xs transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none text-center"
                                    >
                                        기본값(내 문서) 재설정
                                    </button>
                                </div>

                                <button 
                                    onClick={handleOpenLocalFolder}
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-bold shadow-sm text-sm transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-1.5"
                                >
                                    <HardDrive className="w-4 h-4 text-emerald-200" />
                                    이 컴퓨터 백업 폴더 열기
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Local File Actions Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 transition-colors duration-300">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
                            <HardDrive className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            로컬 수동 백업 센터
                        </h3>

                        <div className="space-y-5">
                            {/* Local Download Block */}
                            <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/10 border border-indigo-100/60 dark:border-indigo-900/30 rounded-xl transition-colors">
                                <h4 className="font-bold text-indigo-900 dark:text-indigo-300 text-sm mb-1.5 flex items-center gap-1.5">
                                    <Download className="w-4 h-4" /> 데이터 내보내기 (수동 PC 다운로드)
                                </h4>
                                <p className="text-xs text-indigo-600 dark:text-indigo-400/80 mb-3.5 leading-relaxed">
                                    현재 시스템의 전체 데이터를 단일 JSON 백업 파일로 수동 다운로드하여 컴퓨터의 안전한 하드디스크나 USB에 추가 보관할 수 있습니다.
                                </p>
                                <button 
                                    onClick={handleDownloadLocal}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-bold shadow-sm text-sm transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
                                >
                                    JSON 백업 파일 다운로드
                                </button>
                            </div>

                            {/* Local Upload Block */}
                            <div className="p-4 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100/60 dark:border-amber-900/30 rounded-xl transition-colors">
                                <h4 className="font-bold text-amber-900 dark:text-amber-300 text-sm mb-1.5 flex items-center gap-1.5">
                                    <Upload className="w-4 h-4" /> 데이터 가져오기 (수동 파일 복원)
                                </h4>
                                <p className="text-xs text-amber-700 dark:text-amber-400/80 mb-3.5 leading-relaxed">
                                    이전에 수동으로 다운로드했던 JSON 백업 파일을 불러와 데이터베이스를 원래대로 되돌립니다. 
                                    <strong className="block mt-1 text-amber-800 dark:text-amber-300">※ 주의: 현재 진행 중인 모든 데이터가 덮어씌워져 유실됩니다.</strong>
                                </p>
                                <label className="block w-full text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-2 rounded-lg font-bold hover:bg-slate-50 dark:hover:bg-slate-700/50 shadow-sm text-sm cursor-pointer transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0">
                                    로컬 백업 파일 선택...
                                    <input 
                                        type="file" 
                                        accept=".json" 
                                        onChange={handleUploadLocal} 
                                        className="hidden" 
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
            <MergePreviewModal />
        </div>
    );

    function MergePreviewModal() {
        if (!showMergeModal || !mergeSummary) return null;

        const handleConfirmMerge = async () => {
            if (!mergedData) return;
            showStatus("병합 데이터를 데이터베이스에 반영하는 중...", "info");
            try {
                const success = await db.saveImportedData(mergedData);
                if (success) {
                    alert("🎉 기존 데이터 보존 상태에서 데이터 병합이 무결하게 완료되었습니다!");
                    setShowMergeModal(false);
                    window.location.reload();
                } else {
                    showStatus("데이터 병합 저장에 실패했습니다.", "error");
                }
            } catch (err: any) {
                showStatus(`병합 저장 실패: ${err.message}`, "error");
            }
        };

        return (
            <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col h-[70vh] max-h-[70vh] animate-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="py-4 px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between items-center flex-none">
                        <div className="flex items-center gap-2">
                            <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">
                                데이터 병합(Merge) 미리보기 및 검토
                            </h3>
                        </div>
                        <button 
                            onClick={() => setShowMergeModal(false)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors text-xl font-bold"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-sm">
                        <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl p-4 text-blue-800 dark:text-blue-300 leading-relaxed">
                            💡 <strong>데이터 병합 안내:</strong> 백업 파일 내의 데이터가 현재 데이터베이스에 추가됩니다.
                            동일한 고유 ID(작업 번호, 고객사명, 직원 이메일 등)를 가진 항목은 <strong>기존 데이터를 우선 보존</strong>(중복 생략) 처리하여 충돌 및 데이터 유실을 방지합니다.
                        </div>

                        {/* Summary Stats Table */}
                        <div className="space-y-3">
                            <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                📊 수집 데이터 요약 통계
                            </h4>
                            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                                <table className="w-full border-collapse text-left">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs font-bold border-b border-slate-200 dark:border-slate-800">
                                            <th className="p-3">데이터 분류</th>
                                            <th className="p-3 text-right">현재 기기</th>
                                            <th className="p-3 text-right">가져온 본</th>
                                            <th className="p-3 text-right text-blue-600 dark:text-blue-400">병합 후 합계</th>
                                            <th className="p-3 text-right text-slate-400">중복 제외</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40 text-slate-700 dark:text-slate-300">
                                        <tr>
                                            <td className="p-3 font-semibold">작업 (Jobs)</td>
                                            <td className="p-3 text-right font-mono">{mergeSummary.jobs.current}건</td>
                                            <td className="p-3 text-right font-mono">+{mergeSummary.jobs.imported}건</td>
                                            <td className="p-3 text-right text-blue-600 dark:text-blue-400 font-bold font-mono">{mergeSummary.jobs.merged}건</td>
                                            <td className="p-3 text-right font-mono text-slate-400">-{mergeSummary.jobs.duplicates}건</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-semibold">거래처 (Clients)</td>
                                            <td className="p-3 text-right font-mono">{mergeSummary.clients.current}곳</td>
                                            <td className="p-3 text-right font-mono">+{mergeSummary.clients.imported}곳</td>
                                            <td className="p-3 text-right text-blue-600 dark:text-blue-400 font-bold font-mono">{mergeSummary.clients.merged}곳</td>
                                            <td className="p-3 text-right font-mono text-slate-400">-{mergeSummary.clients.duplicates}곳</td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 font-semibold">직원 (Staff)</td>
                                            <td className="p-3 text-right font-mono">{mergeSummary.staff.current}명</td>
                                            <td className="p-3 text-right font-mono">+{mergeSummary.staff.imported}명</td>
                                            <td className="p-3 text-right text-blue-600 dark:text-blue-400 font-bold font-mono">{mergeSummary.staff.merged}명</td>
                                            <td className="p-3 text-right font-mono text-slate-400">-{mergeSummary.staff.duplicates}명</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Product Definitions Settings Comparison */}
                        <div className="space-y-3">
                            <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                ⚙️ 제품 사양 설정 병합 내역
                            </h4>
                            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-2.5">
                                <div>
                                    <span className="text-xs text-slate-400 block font-bold mb-1">현재 등록된 제품군:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {mergeSummary.settings.productDefs.map((name: string) => (
                                            <span key={name} className="px-2 py-0.5 bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-xs font-medium border border-slate-300/40">{name}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="border-t border-slate-200 dark:border-slate-700/60 pt-2.5">
                                    <span className="text-xs text-blue-600 dark:text-blue-400 block font-bold mb-1">병합 결과 최종 제품군:</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {mergeSummary.settings.mergedProductDefs.map((name: string) => {
                                            const isNew = !mergeSummary.settings.productDefs.includes(name);
                                            return (
                                                <span key={name} className={`px-2 py-0.5 rounded text-xs font-bold border ${isNew ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{name}{isNew && ' [신규]'}</span>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="py-4 px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex justify-end gap-3 flex-none">
                        <button 
                            onClick={() => setShowMergeModal(false)}
                            className="px-5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold border border-slate-200 dark:border-slate-700 transition-colors"
                        >
                            취소
                        </button>
                        <button 
                            onClick={handleConfirmMerge}
                            className="px-7 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-md shadow-blue-600/10 hover:shadow-blue-500/20"
                        >
                            안전하게 병합 및 저장 완료
                        </button>
                    </div>
                </div>
            </div>
        );
    }
};
