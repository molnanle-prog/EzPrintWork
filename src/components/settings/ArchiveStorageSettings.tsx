import React, { useEffect, useState } from 'react';
import {
    FolderOpen, HardDrive, Network, CheckCircle2, AlertTriangle,
    RefreshCw, ExternalLink, Shield, Info
} from 'lucide-react';
import { db } from '../../services/dataService';
import { jobArchiveService } from '../../services/jobArchiveService';
import {
    ARCHIVE_FILE_NAME,
    DEFAULT_ARCHIVE_FOLDER_NAME,
    getArchiveRootPath,
    isNasOrNetworkPath,
    markArchiveSetupDone,
    setArchiveRootPath,
} from '../../utils/archiveStorage';

interface ArchiveStorageSettingsProps {
    compact?: boolean;
    onConfigured?: () => void;
}

export const ArchiveStorageSettings: React.FC<ArchiveStorageSettingsProps> = ({
    compact = false,
    onConfigured,
}) => {
    const isElectron = typeof window !== 'undefined' && !!window.electron;
    const [documentsPath, setDocumentsPath] = useState<string | null>(null);
    const [selectedPath, setSelectedPath] = useState<string | null>(getArchiveRootPath());
    const [defaultPathLabel, setDefaultPathLabel] = useState<string>('');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');
    const [testing, setTesting] = useState(false);
    const [showNasGuide, setShowNasGuide] = useState(false);

    const tenantId = db.getTenantId();

    useEffect(() => {
        if (!isElectron) return;
        window.electron.getDocumentsPath().then((path) => {
            setDocumentsPath(path);
            const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
            setDefaultPathLabel(`${path}${sep}${DEFAULT_ARCHIVE_FOLDER_NAME}`);
        }).catch(() => {});
    }, [isElectron]);

    useEffect(() => {
        if (selectedPath) {
            setShowNasGuide(isNasOrNetworkPath(selectedPath));
        }
    }, [selectedPath]);

    const showStatus = (message: string, type: 'info' | 'success' | 'error') => {
        setStatusMessage(message);
        setStatusType(type);
    };

    const handleSelectFolder = async () => {
        if (!isElectron) return;
        try {
            const picked = await window.electron.selectDirectory();
            if (!picked) return;
            setSelectedPath(picked);
            setArchiveRootPath(picked);
            showStatus('폴더를 선택했습니다. 연결 테스트를 진행해 주세요.', 'info');
        } catch (e: unknown) {
            showStatus(`폴더 선택 오류: ${e instanceof Error ? e.message : String(e)}`, 'error');
        }
    };

    const handleUseDefault = () => {
        setSelectedPath(null);
        setArchiveRootPath(null, true);
        setShowNasGuide(false);
        showStatus(`기본 폴더를 사용합니다: ${defaultPathLabel || '내 문서'}`, 'success');
        onConfigured?.();
    };

    const handleTestAndSave = async () => {
        if (!isElectron || !tenantId) return;
        setTesting(true);
        showStatus('폴더 읽기/쓰기 테스트 중…', 'info');
        try {
            const ready = await jobArchiveService.ensureArchiveFolderReady(tenantId);
            if (!ready.ok) {
                showStatus(ready.error || '폴더 테스트에 실패했습니다.', 'error');
                return;
            }
            markArchiveSetupDone();
            const flushed = await jobArchiveService.flushPendingQueue(tenantId);
            showStatus(
                flushed > 0
                    ? `설정 완료 · 네트워크 대기 ${flushed}건을 보관 파일에 반영했습니다.`
                    : '이력 보관 폴더 설정이 완료되었습니다.',
                'success'
            );
            onConfigured?.();
        } catch (e: unknown) {
            showStatus(`테스트 실패: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setTesting(false);
        }
    };

    const handleOpenFolder = async () => {
        if (!isElectron) return;
        const root = selectedPath || defaultPathLabel;
        if (!root) return;
        await window.electron.openPath(root);
    };

    const displayPath = selectedPath || defaultPathLabel || '경로 확인 중…';

    if (!isElectron) {
        return (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 text-sm text-slate-600 dark:text-slate-300">
                <p className="font-bold mb-1">업무 데이터 = Firestore (공통)</p>
                <p>직원·관리자·PC·태블릿 모두 Firestore에서 같은 작업을 봅니다. 1년이 지난 과거 이력도 클라우드 공통 복사본으로 동일하게 조회됩니다. PC/NAS 폴더 설정은 관리자 PC 앱에서만 합니다 (회사 백업용).</p>
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${compact ? '' : 'rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/10 p-5'}`}>
            {!compact && (
                <div>
                    <h3 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                        <HardDrive className="w-5 h-5" />
                        PC/NAS 이력 보관 폴더
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                        <strong>조회 원본은 Firestore(1년) + 클라우드 공통 복사본</strong>입니다. 이 폴더는 1년 초과 이력의 <strong>회사 백업 사본</strong>만 저장합니다 ({ARCHIVE_FILE_NAME}). 관리자·직원 화면은 NAS 경로와 무관하게 동일합니다.
                    </p>
                </div>
            )}

            {statusMessage && (
                <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
                    statusType === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : statusType === 'error'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                }`}>
                    {statusType === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
                    <span>{statusMessage}</span>
                </div>
            )}

            <div className="text-[11px] font-mono break-all text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                📂 {displayPath}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={handleSelectFolder}
                    title="NAS 또는 로컬 폴더를 선택합니다. (아카이브 보관 사본 경로)"
                    className="text-sm font-bold py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2"
                >
                    <FolderOpen className="w-4 h-4" />
                    폴더 선택 (PC/NAS)
                </button>
                <button
                    type="button"
                    onClick={handleUseDefault}
                    title="별도 경로 지정 없이 내 문서 기본 아카이브 폴더를 사용합니다."
                    className="text-sm font-bold py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                >
                    내 문서 기본값 사용
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={handleTestAndSave}
                    disabled={testing}
                    title="선택한 경로의 읽기/쓰기 가능 여부를 검사한 뒤 아카이브 경로로 확정합니다."
                    className="text-sm font-bold py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center justify-center gap-2"
                >
                    {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    연결 테스트 후 저장
                </button>
                <button
                    type="button"
                    onClick={handleOpenFolder}
                    title="현재 설정된 아카이브 폴더를 탐색기에서 엽니다."
                    className="text-sm font-bold py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 flex items-center justify-center gap-2"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    폴더 열기
                </button>
            </div>

            <button
                type="button"
                onClick={() => setShowNasGuide((v) => !v)}
                title="NAS/네트워크 공유 폴더 권한 및 불안정 네트워크 대응 가이드를 표시합니다."
                className="text-xs font-bold text-indigo-700 dark:text-indigo-300 underline flex items-center gap-1"
            >
                <Network className="w-3.5 h-3.5" />
                NAS/네트워크 공유 설정 안내 {showNasGuide ? '닫기' : '보기'}
            </button>

            {showNasGuide && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <p className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1">
                        <Info className="w-4 h-4" />
                        NAS 또는 사내 공유 폴더 연결 방법
                    </p>
                    <ol className="list-decimal pl-4 space-y-2">
                        <li>Windows 탐색기에서 NAS 공유 폴더를 먼저 연결합니다. (예: <code>\\NAS\ezprint</code> 또는 드라이브 문자 <code>Z:</code>)</li>
                        <li>공유 폴더에 <strong>읽기+쓰기</strong> 권한이 있는 계정으로 PC에 로그인합니다.</li>
                        <li>위 「폴더 선택」에서 연결된 NAS 경로를 직접 선택합니다.</li>
                        <li>「연결 테스트 후 저장」으로 쓰기 테스트를 반드시 확인합니다.</li>
                    </ol>
                    <p className="font-bold text-slate-800 dark:text-slate-200">네트워크가 불안정할 때</p>
                    <ul className="list-disc pl-4 space-y-1">
                        <li>저장 실패 시 앱이 자동으로 <strong>로컬 임시 보관</strong>에 먼저 저장합니다.</li>
                        <li>네트워크가 복구되면 다음 로그인 때 <strong>자동으로 NAS에 다시 반영</strong>합니다.</li>
                        <li>태블릿·웹에서는 클라우드 읽기 복사본으로 과거 작업을 계속 조회할 수 있습니다.</li>
                    </ul>
                    <p className="text-[10px] text-slate-500">
                        Synology/QNAP: 제어판 → 공유 폴더 → 권한에서 EzPrintWork 전용 폴더를 만들고 SMB 활성화를 권장합니다.
                    </p>
                </div>
            )}
        </div>
    );
};
