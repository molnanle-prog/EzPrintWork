import React, { useEffect, useState } from 'react';
import {
    FolderOpen, HardDrive, Network, CheckCircle2, AlertTriangle,
    RefreshCw, ExternalLink, Shield, Info, Lock
} from 'lucide-react';
import { db } from '../../services/dataService';
import { jobArchiveService } from '../../services/jobArchiveService';
import { getLocalGatewayInfo } from '../../services/gatewayBridge';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import {
    ARCHIVE_FILE_NAME,
    DEFAULT_ARCHIVE_FOLDER_NAME,
    getArchiveRootPath,
    isNasOrNetworkPath,
    markArchiveSetupDone,
    setArchiveRootPath,
    TENANT_ARCHIVE_ROOT_SETTINGS_KEY,
} from '../../utils/archiveStorage';

interface ArchiveStorageSettingsProps {
    compact?: boolean;
    onConfigured?: () => void;
}

export const ArchiveStorageSettings: React.FC<ArchiveStorageSettingsProps> = ({
    compact = false,
    onConfigured,
}) => {
    const { canManageCompany } = useAuth();
    const { showConfirm, showAlert } = useDialog();
    const isElectron = typeof window !== 'undefined' && !!window.electron;
    const [defaultPathLabel, setDefaultPathLabel] = useState<string>('');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');
    const [testing, setTesting] = useState(false);
    const [showNasGuide, setShowNasGuide] = useState(false);
    const [gatewayLanUrls, setGatewayLanUrls] = useState<string[]>([]);
    const tenantId = db.getTenantId();

    const companyPath = db.getTenantArchiveRootPath();
    const companyPathLocked = !!companyPath;
    const [selectedPath, setSelectedPath] = useState<string | null>(
        companyPath || getArchiveRootPath()
    );
    /** 경로 이전 시 원본(복사 출발) */
    const [migrateFromPath, setMigrateFromPath] = useState<string | null>(null);

    const refreshGatewayInfo = async () => {
        if (!isElectron) return;
        const info = await getLocalGatewayInfo();
        setGatewayLanUrls(info?.lanUrls || []);
    };

    useEffect(() => {
        void refreshGatewayInfo();
    }, [isElectron, selectedPath, companyPath]);

    useEffect(() => {
        const synced = db.getTenantArchiveRootPath();
        if (synced) setSelectedPath(synced);
    }, [companyPath]);

    const persistArchivePath = async (path: string | null) => {
        if (!path?.trim() || !tenantId || !canManageCompany) return;
        await db.saveArchiveRootPath(path.trim());
        await refreshGatewayInfo();
        const lanUrl = (await getLocalGatewayInfo())?.lanUrls?.[0];
        if (lanUrl) {
            await db.saveStoreGatewayUrl(lanUrl);
        }
    };

    useEffect(() => {
        if (!isElectron) return;
        window.electron.getDocumentsPath().then((path) => {
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
        if (!isElectron || !canManageCompany) return;
        try {
            const currentRoot = (companyPath || selectedPath || '').trim();
            if (currentRoot) {
                const ok = await showConfirm(
                    '[NAS 경로 변경 — 주의]\n\n' +
                    '경로만 바꾸면 작업·거래처가 비어 보일 수 있습니다.\n' +
                    '(직원 목록은 Firestore에 있고, 작업·거래처는 NAS에 있습니다)\n\n' +
                    `현재: ${currentRoot}\n\n` +
                    '새 폴더로 옮기려면:\n' +
                    '1) 새 폴더 선택\n' +
                    '2) 기존 데이터 파일 복사 후\n' +
                    '3) 연결 테스트·저장\n\n' +
                    '계속하시겠습니까?'
                );
                if (!ok) return;
            }

            const picked = await window.electron.selectDirectory();
            if (!picked) return;

            if (currentRoot && currentRoot.replace(/[\\/]+$/, '') !== picked.replace(/[\\/]+$/, '')) {
                const doMigrate = await showConfirm(
                    '기존 NAS 폴더의 데이터 파일을 새 폴더로 복사할까요?\n\n' +
                    `원본: ${currentRoot}\n` +
                    `대상: ${picked}\n\n` +
                    `복사 대상: ${ARCHIVE_FILE_NAME}, situation-mirror.json, chat-messages.json\n` +
                    '(대상에 같은 파일이 있으면 덮어쓰지 않습니다)'
                );
                if (doMigrate) {
                    showStatus('기존 데이터 파일 복사 중…', 'info');
                    const mig = await jobArchiveService.migrateOperationalFiles(currentRoot, picked);
                    if (!mig.ok) {
                        showStatus(mig.error || '데이터 복사에 실패했습니다.', 'error');
                        await showAlert(`복사 실패: ${mig.error || 'unknown'}\n경로 변경을 취소합니다.`);
                        return;
                    }
                    setMigrateFromPath(currentRoot);
                    showStatus(
                        `복사 완료 · ${mig.copied.length}개 파일` +
                        (mig.skipped.length ? ` · 건너뜀 ${mig.skipped.length}개` : '') +
                        ' — 이제 「연결 테스트 후 회사에 저장」을 눌러 주세요.',
                        'success'
                    );
                } else {
                    setMigrateFromPath(currentRoot);
                    showStatus(
                        '복사 없이 새 폴더만 선택했습니다. 빈 폴더면 작업·거래처가 비어 보일 수 있습니다. 반드시 테스트 후 저장하세요.',
                        'info'
                    );
                }
            }

            setSelectedPath(picked);
            setArchiveRootPath(picked);
            if (!currentRoot) {
                showStatus('폴더를 선택했습니다. 연결 테스트를 진행해 주세요.', 'info');
            }
        } catch (e: unknown) {
            showStatus(`폴더 선택 오류: ${e instanceof Error ? e.message : String(e)}`, 'error');
        }
    };

    const handleUseDefault = () => {
        if (!canManageCompany || companyPathLocked) return;
        setSelectedPath(null);
        setArchiveRootPath(null, true);
        setShowNasGuide(false);
        showStatus(`기본 폴더를 사용합니다: ${defaultPathLabel || '내 문서'}`, 'success');
        onConfigured?.();
    };

    const handleTestAndSave = async () => {
        if (!isElectron || !tenantId || !canManageCompany) return;
        setTesting(true);
        showStatus('폴더 읽기/쓰기 테스트 중…', 'info');
        try {
            const pathToSave = selectedPath || defaultPathLabel;
            if (pathToSave) {
                setArchiveRootPath(pathToSave);
            }

            const ready = await jobArchiveService.ensureArchiveFolderReady(tenantId);
            if (!ready.ok) {
                showStatus(ready.error || '폴더 테스트에 실패했습니다.', 'error');
                return;
            }
            markArchiveSetupDone();
            const flushed = await jobArchiveService.flushPendingQueue(tenantId);
            if (pathToSave) await persistArchivePath(pathToSave);

            const fromNote = migrateFromPath
                ? `\n(이전 경로: ${migrateFromPath})`
                : '';
            showStatus(
                flushed > 0
                    ? `설정 완료 · 회사 공통 NAS 경로로 저장됨 (다른 PC 자동 적용) · 대기 ${flushed}건 반영${fromNote}`
                    : `회사 공통 NAS 경로가 저장되었습니다. 다른 PC·직원은 자동으로 같은 경로를 사용합니다.${fromNote}`,
                'success'
            );
            setMigrateFromPath(null);
            onConfigured?.();
        } catch (e: unknown) {
            showStatus(`테스트 실패: ${e instanceof Error ? e.message : String(e)}`, 'error');
        } finally {
            setTesting(false);
        }
    };

    const handleOpenFolder = async () => {
        if (!isElectron) return;
        const root = companyPath || selectedPath || defaultPathLabel;
        if (!root) return;
        await window.electron.openPath(root);
    };

    const displayPath = companyPath || selectedPath || defaultPathLabel || '경로 확인 중…';

    if (!isElectron) {
        return (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 text-sm text-slate-600 dark:text-slate-300">
                <p className="font-bold mb-1">업무 데이터 = NAS + Firestore (회사 공통)</p>
                <p>매장 PC는 관리자가 설정한 NAS 경로를 사용합니다. 웹·태블릿은 LAN 게이트웨이 또는 Storage 미러로 조회합니다.</p>
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                    ※ 직원 목록은 Firestore, 작업·거래처는 NAS입니다. NAS 경로만 바꾸면 작업·거래처가 안 보일 수 있습니다.
                </p>
            </div>
        );
    }

    if (!canManageCompany) {
        return (
            <div className={`space-y-4 ${compact ? '' : 'rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-5'}`}>
                <div className="flex items-start gap-2">
                    <Lock className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">회사 NAS 경로 (관리자 설정)</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                            NAS 경로는 <strong>관리자가 1회 설정</strong>하면 모든 PC·직원에게 자동 적용됩니다. 직원은 경로를 변경할 수 없습니다.
                        </p>
                    </div>
                </div>
                {companyPath ? (
                    <>
                        <div className="text-[11px] font-mono break-all text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                            📂 {companyPath}
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleOpenFolder()}
                            className="text-sm font-bold py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 flex items-center justify-center gap-2 w-full sm:w-auto"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            폴더 열기
                        </button>
                    </>
                ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm p-3">
                        관리자가 아직 NAS 경로를 설정하지 않았습니다. 관리자 PC에서 「연결 테스트 후 저장」을 완료해 주세요.
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${compact ? '' : 'rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/30 dark:bg-indigo-950/10 p-5'}`}>
            {!compact && (
                <div>
                    <h3 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                        <HardDrive className="w-5 h-5" />
                        회사 NAS 경로 (전 PC 공통)
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                        <strong>관리자가 1회 설정</strong>하면 Firestore에 저장되고, <strong>모든 PC·직원 앱이 같은 NAS</strong>를 강제로 사용합니다 ({ARCHIVE_FILE_NAME}, situation-mirror.json).
                        직원 목록은 Firestore, <strong>작업·거래처는 이 NAS</strong>에 있습니다.
                    </p>
                </div>
            )}

            {companyPathLocked && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/30 p-3 text-xs text-amber-950 dark:text-amber-100 leading-relaxed space-y-1">
                    <p className="font-bold">경로 변경은 신중히 하세요</p>
                    <p>경로만 바꾸면 작업·거래처가 비어 보일 수 있습니다. 「NAS 경로 변경」 시 기존 파일 복사를 진행한 뒤 저장하세요.</p>
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
                    <span className="whitespace-pre-wrap">{statusMessage}</span>
                </div>
            )}

            <div className="text-[11px] font-mono break-all text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                📂 {displayPath}
            </div>

            {gatewayLanUrls.length > 0 && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">사내 웹/태블릿 접속 (LAN 게이트웨이)</p>
                    {gatewayLanUrls.map((url) => (
                        <p key={url} className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 break-all">
                            {url}/api/v1/mirror
                        </p>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => void handleSelectFolder()}
                    className="text-sm font-bold py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2"
                >
                    <FolderOpen className="w-4 h-4" />
                    {companyPathLocked ? 'NAS 경로 변경(이전)' : 'NAS 폴더 선택'}
                </button>
                {!companyPathLocked && (
                    <button
                        type="button"
                        onClick={handleUseDefault}
                        className="text-sm font-bold py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                    >
                        내 문서 기본값 (임시)
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => void handleTestAndSave()}
                    disabled={testing}
                    className="text-sm font-bold py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center justify-center gap-2"
                >
                    {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    연결 테스트 후 회사에 저장
                </button>
                <button
                    type="button"
                    onClick={() => void handleOpenFolder()}
                    className="text-sm font-bold py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 flex items-center justify-center gap-2"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    폴더 열기
                </button>
            </div>

            <button
                type="button"
                onClick={() => setShowNasGuide((v) => !v)}
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
                        <li>Windows 탐색기에서 NAS 공유 폴더를 먼저 연결합니다. (예: <code>\\NAS\ezprint</code> 또는 드라이브 <code>Z:</code>)</li>
                        <li>「NAS 폴더 선택」→ 「연결 테스트 후 회사에 저장」 — <strong>한 번만</strong> 하면 됩니다.</li>
                        <li>경로를 바꿀 때는 기존 파일 복사를 확인한 뒤 저장하세요.</li>
                        <li>다른 PC·직원은 로그인만 하면 <strong>같은 경로가 자동 적용</strong>됩니다 ({TENANT_ARCHIVE_ROOT_SETTINGS_KEY}).</li>
                    </ol>
                </div>
            )}
        </div>
    );
};
