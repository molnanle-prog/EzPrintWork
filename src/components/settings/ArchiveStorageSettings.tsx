import React, { useEffect, useState } from 'react';
import {
    FolderOpen, HardDrive, Network, CheckCircle2, AlertTriangle,
    RefreshCw, ExternalLink, Shield, Info, Lock
} from 'lucide-react';
import { db } from '../../services/dataService';
import { ARCHIVE_FOLDER_IN_USE_MESSAGE, jobArchiveService } from '../../services/jobArchiveService';
import { getLocalGatewayInfo } from '../../services/gatewayBridge';
import { collectPublishedGatewayUrls } from '../../utils/storeGatewayUrls';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import {
    ARCHIVE_FILE_NAME,
    DEFAULT_ARCHIVE_FOLDER_NAME,
    archivePathsSamePhysicalLocation,
    clearCompanyArchiveRootOverride,
    getArchiveRootPath,
    isDriveLetterPath,
    normalizeArchivePathCompareKey,
    isNasOrNetworkPath,
    isUncPath,
    markArchiveSetupDone,
    resolveArchivePathToUnc,
    setArchiveRootPath,
    setCompanyArchiveRootOverride,
    TENANT_ARCHIVE_ROOT_SETTINGS_KEY,
} from '../../utils/archiveStorage';

interface ArchiveStorageSettingsProps {
    compact?: boolean;
    /** 첫 실행: 기본 폴더로 건너뛰지 않고, 연결 테스트 성공만 완료로 본다 */
    firstRun?: boolean;
    /** 브라우저 미리보기: 버튼은 보여 주되, 폴더 검사 통과 전에는 완료되지 않는다 */
    previewMode?: boolean;
    onConfigured?: () => void;
}

export const ArchiveStorageSettings: React.FC<ArchiveStorageSettingsProps> = ({
    compact = false,
    firstRun = false,
    previewMode = false,
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
        firstRun ? (companyPath || null) : (companyPath || getArchiveRootPath())
    );
    /** 경로 이전 시 원본(복사 출발) */
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
        if (!synced) return;
        setSelectedPath((current) => {
            if (!current) return synced;
            if (normalizeArchivePathCompareKey(current) === normalizeArchivePathCompareKey(synced)) return synced;
            return current;
        });
    }, [companyPath]);

    const persistArchivePath = async (path: string | null) => {
        if (!path?.trim() || !tenantId || (!canManageCompany && !firstRun)) return;
        const resolved = await resolveArchivePathToUnc(path.trim());
        if (!resolved.ok) {
            throw new Error(resolved.error || 'UNC 경로 변환 실패');
        }
        if (isNasOrNetworkPath(path) && !isUncPath(resolved.path)) {
            throw new Error(
                '회사 NAS는 네트워크 절대경로(\\\\서버\\공유)로만 저장됩니다.\n' +
                'Z: 같은 드라이브 문자 대신 탐색기에서 \\\\nas2dual\\... 경로로 열어 선택해 주세요.'
            );
        }
        await db.saveArchiveRootPath(resolved.path);
        setSelectedPath(resolved.path);
        await refreshGatewayInfo();
        if (!db.isOutsideViewerMode()) {
            const info = await getLocalGatewayInfo();
            const urls = collectPublishedGatewayUrls(info);
            if (urls.length > 0) {
                await db.saveStoreGatewayUrls(urls);
            }
        }
        return resolved;
    };

    useEffect(() => {
        if (!isElectron) return;
        window.electron.getDocumentsPath().then((path) => {
            const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
            setDefaultPathLabel(`${path}${sep}${DEFAULT_ARCHIVE_FOLDER_NAME}`);
        }).catch(() => {});
    }, [isElectron]);

    const showStatus = (message: string, type: 'info' | 'success' | 'error') => {
        setStatusMessage(message);
        setStatusType(type);
    };

    // 이미 Firestore에 Z: 가 있으면 관리자 Electron에서 UNC로 자동 교정 시도
    useEffect(() => {
        if (!isElectron || !canManageCompany || !companyPath) return;
        if (!isDriveLetterPath(companyPath) || !isNasOrNetworkPath(companyPath)) return;
        void (async () => {
            try {
                const corrected = await db.maybeCorrectDriveLetterArchiveRoot();
                if (corrected) {
                    setSelectedPath(corrected);
                    showStatus(
                        `드라이브 경로를 네트워크 절대경로로 교정했습니다.\n${corrected}`,
                        'success'
                    );
                }
            } catch (e) {
                console.warn('[ArchiveStorageSettings] UNC auto-correct:', e);
            }
        })();
    }, [isElectron, canManageCompany, companyPath]);

    useEffect(() => {
        if (firstRun || !selectedPath) return;
        setShowNasGuide(isNasOrNetworkPath(selectedPath));
    }, [selectedPath, firstRun]);

    const handleSelectFolder = async () => {
        if (!isElectron) {
            showStatus('폴더를 고르고 연결 테스트가 통과해야 이 단계가 완료됩니다. 검사는 설치된 PC 앱에서 진행됩니다.', 'info');
            return;
        }
        if (!canManageCompany && !firstRun && !previewMode) {
            showStatus('관리자 권한이 아직 반영되지 않았습니다. 잠시 후 다시 눌러 주세요.', 'error');
            return;
        }
        try {
            const currentRoot = String((firstRun ? companyPath : (companyPath || selectedPath)) || '').trim();
            if (currentRoot) {
                const ok = await showConfirm(
                    '[저장 폴더 변경]\n\n' +
                    '지금 작업이 나오는 폴더:\n' +
                    `${currentRoot}\n\n` +
                    '다른 폴더를 고른 뒤 「연결 테스트 후 회사에 저장」을 눌러야 실제로 바뀝니다.\n' +
                    '저장 전에는 작업이 이 폴더에서 계속 나옵니다.\n\n' +
                    '다른 회사가 쓰는 폴더는 선택할 수 없습니다.',
                    { confirmLabel: '계속', tone: 'default' }
                );
                if (!ok) return;
            }

            const picked = await window.electron.selectDirectory(currentRoot);
            if (!picked) return;

            const uncCheck = await resolveArchivePathToUnc(picked);
            if ((isNasOrNetworkPath(picked) || isDriveLetterPath(picked)) && !uncCheck.ok) {
                showStatus(uncCheck.error || 'UNC 변환 실패', 'error');
                await showAlert(uncCheck.error || '네트워크 절대경로로 변환하지 못했습니다.');
                return;
            }
            const effectivePicked = uncCheck.ok ? uncCheck.path : picked;
            if (uncCheck.changed && isUncPath(effectivePicked)) {
                showStatus(
                    `드라이브 문자를 네트워크 경로로 변환했습니다.\n${effectivePicked}`,
                    'info'
                );
            }

            const samePhysical =
                !!currentRoot &&
                (await archivePathsSamePhysicalLocation(currentRoot, effectivePicked));

            if (tenantId) {
                const pickedForeign = await jobArchiveService.findForeignFolderOwner(effectivePicked, tenantId);
                if (pickedForeign) {
                    showStatus(`${ARCHIVE_FOLDER_IN_USE_MESSAGE}\n${effectivePicked}`, 'error');
                    await showAlert(ARCHIVE_FOLDER_IN_USE_MESSAGE);
                    return;
                }
            }

            const sourceForeign =
                !!currentRoot &&
                !!tenantId &&
                !!(await jobArchiveService.findForeignFolderOwner(currentRoot, tenantId));

            if (currentRoot && !samePhysical && !sourceForeign) {
                showStatus(
                    '폴더는 선택만 했습니다. 파일은 복사하지 않습니다.\n「연결 테스트 후 회사에 저장」을 누르면 이 폴더에 있는 것만 읽습니다.',
                    'info'
                );
            } else if (samePhysical && currentRoot && !isUncPath(currentRoot) && isUncPath(effectivePicked)) {
                showStatus(
                    '같은 NAS입니다. Z: 대신 네트워크 절대경로(UNC)로 저장됩니다.\n「연결 테스트 후 회사에 저장」을 눌러 확정하세요.',
                    'success'
                );
            }

            setSelectedPath(effectivePicked);
            if (!currentRoot || sourceForeign) {
                showStatus(
                    isUncPath(effectivePicked)
                        ? `폴더를 선택했습니다 (UNC).\n${effectivePicked}\n연결 테스트를 진행해 주세요.`
                        : '폴더를 선택했습니다. 연결 테스트를 진행해 주세요.',
                    'info'
                );
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
        if (!isElectron) {
            showStatus('연결 테스트가 통과해야 저장이 완료됩니다. 통과 후에는 이 단계를 다시 하지 않습니다.', 'info');
            return;
        }
        if (!tenantId || (!canManageCompany && !firstRun && !previewMode)) return;
        setTesting(true);
        showStatus('폴더 읽기/쓰기 테스트 중…', 'info');
        try {
        if (firstRun && !selectedPath?.trim()) {
            showStatus('저장 폴더를 먼저 선택해 주세요. 연결 테스트가 통과해야 다음으로 갑니다.', 'error');
            return;
        }
        let pathToSave = firstRun ? selectedPath : (selectedPath || defaultPathLabel);
            if (!pathToSave) {
                showStatus('저장할 경로가 없습니다.', 'error');
                return;
            }
            // 저장 전 UNC 확정 — 화면에 UNC를 골라도 override가 옛 Z:면 테스트가 Z:로 감
            const resolved = await resolveArchivePathToUnc(pathToSave);
            if (isNasOrNetworkPath(pathToSave) && !resolved.ok) {
                showStatus(resolved.error || 'UNC 변환 실패', 'error');
                await showAlert(resolved.error || '네트워크 절대경로로 변환하지 못했습니다.');
                return;
            }
            pathToSave = resolved.ok ? resolved.path : pathToSave;
            let leavingForeignFolder = false;
            const inspection = await jobArchiveService.inspectArchiveFolder(pathToSave, tenantId);
            if (!inspection.readable) {
                const message = inspection.error || '이 폴더의 파일을 읽지 못했습니다. 기존 파일은 그대로 두었습니다.';
                showStatus(message, 'error');
                await showAlert(message);
                return;
            }
            if (inspection.foreign) {
                const message = inspection.error || ARCHIVE_FOLDER_IN_USE_MESSAGE;
                showStatus(message, 'error');
                await showAlert(message);
                return;
            }
            if (inspection.hasContent) {
                const detail = [
                    inspection.jobCount > 0 ? `작업 ${inspection.jobCount}건` : '',
                    inspection.clientCount > 0 ? `거래처 ${inspection.clientCount}건` : '',
                    inspection.chatCount > 0 ? `채팅 ${inspection.chatCount}건` : '',
                ].filter(Boolean).join(', ');
                const proceed = await showConfirm(
                    '이 폴더에 이미 데이터가 있습니다.\n' +
                    `${detail}\n\n` +
                    '파일은 덮어쓰지 않습니다. 이 폴더에 있는 것만 불러옵니다.\n' +
                    '이 PC에 남아 있던 다른 작업은 이 폴더에 저장하지 않습니다.\n\n' +
                    '이 폴더가 맞습니까?',
                    { confirmLabel: '이 폴더만 연결', tone: 'default' }
                );
                if (!proceed) {
                    showStatus('저장을 취소했습니다. 폴더 파일은 그대로입니다.', 'info');
                    return;
                }
            }
            if (companyPath && (await jobArchiveService.findForeignFolderOwner(companyPath, tenantId))) {
                leavingForeignFolder = true;
                await db.releaseForeignArchiveBinding();
            }
            setSelectedPath(pathToSave);
            setArchiveRootPath(pathToSave);
            setCompanyArchiveRootOverride(pathToSave);

            const ready = await jobArchiveService.ensureArchiveFolderReady(tenantId);
            if (!ready.ok) {
                if (!leavingForeignFolder && companyPath) setCompanyArchiveRootOverride(companyPath);
                else {
                    clearCompanyArchiveRootOverride();
                    setArchiveRootPath(null);
                }
                showStatus(ready.error || '이 폴더는 사용할 수 없습니다. 다른 폴더를 선택해 주세요.', 'error');
                return;
            }
            jobArchiveService.clearPendingJobs(tenantId);
            const persisted = await persistArchivePath(pathToSave);
            const savedPath = persisted?.path || '';
            if (!savedPath) {
                if (!leavingForeignFolder && companyPath) setCompanyArchiveRootOverride(companyPath);
                else {
                    clearCompanyArchiveRootOverride();
                    setArchiveRootPath(null);
                }
                showStatus('폴더 확인은 됐지만 회사에 저장되지 않았습니다. 다시 시도해 주세요.', 'error');
                return;
            }
            await db.adoptOperationalDataFromCurrentFolder();
            markArchiveSetupDone();

            const uncNote = isUncPath(savedPath)
                ? `\n저장 경로(UNC): ${savedPath}`
                : '';
            const contentNote = inspection.hasContent
                ? `\n이 폴더에 있는 작업 ${inspection.jobCount}건만 불러왔습니다. 파일은 덮어쓰지 않았습니다.`
                : '\n폴더에 작업이 없어 칸반도 비워 둡니다. 다른 곳에서 가져온 작업은 넣지 않았습니다.';
            showStatus(
                firstRun
                    ? `이 폴더로 저장되었습니다. 다음으로 진행합니다.\n${savedPath}${contentNote}`
                    : `회사 공통 NAS 경로가 네트워크 절대경로로 저장되었습니다. 다른 PC·직원은 같은 경로를 사용합니다.${uncNote}${contentNote}`,
                'success'
            );
            onConfigured?.();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            showStatus(`테스트/저장 실패: ${msg}`, 'error');
            await showAlert(msg);
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

    const pendingDiffers =
        !!selectedPath &&
        !!companyPath &&
        normalizeArchivePathCompareKey(selectedPath) !== normalizeArchivePathCompareKey(companyPath);
    const displayPath = firstRun
        ? (selectedPath || '저장할 폴더를 선택해 주세요')
        : pendingDiffers
            ? `지금 작업이 나오는 폴더:\n${companyPath}\n\n선택한 폴더 (저장 전):\n${selectedPath}`
            : (companyPath || selectedPath || defaultPathLabel || '경로 확인 중…');

    if (!isElectron && !firstRun && !previewMode) {
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

    if (!canManageCompany && !firstRun && !previewMode) {
        return (
            <div className={`space-y-4 ${compact ? '' : 'rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-5'}`}>
                <div className="flex items-start gap-2">
                    <Lock className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                    <div>
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">회사 NAS 경로 (관리자 설정)</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            NAS 경로는 <strong>관리자가 1회 설정</strong>하면 모든 PC·직원에게 자동 적용됩니다.
                            저장 시 <strong>네트워크 절대경로(UNC, \\서버\공유)</strong>로 저장되어 Z: 드라이브 유무와 무관하게 동일하게 보입니다.
                            직원은 경로를 변경할 수 없습니다.
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
                        <strong>관리자가 1회 설정</strong>하면 Firestore에 <strong>네트워크 절대경로(UNC)</strong>로 저장되고, <strong>모든 PC·직원 앱이 같은 NAS</strong>를 사용합니다 ({ARCHIVE_FILE_NAME}, situation-mirror.json).
                        Z: 드라이브 매핑 여부와 관계없이 직원·관리자 화면이 동일해야 합니다.
                        직원 목록은 Firestore, <strong>작업·거래처는 이 NAS</strong>에 있습니다.
                    </p>
                </div>
            )}

            {companyPathLocked && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-950/30 p-3 text-xs text-amber-950 dark:text-amber-100 leading-relaxed space-y-1">
                    <p className="font-bold">경로 변경은 신중히 하세요</p>
                    <p>빈 폴더는 바로 연결됩니다. 데이터가 있는 폴더는 덮어쓰지 않고, 확인한 뒤에 그 안의 내용만 읽습니다.</p>
                </div>
            )}

            {statusMessage && (
                <div className={`p-3 rounded-xl text-sm flex items-start gap-2 ${
                    firstRun
                        ? statusType === 'success'
                            ? 'bg-emerald-950/60 text-emerald-200 border border-emerald-800'
                            : statusType === 'error'
                                ? 'bg-rose-950/60 text-rose-200 border border-rose-800'
                                : 'bg-slate-950 text-slate-200 border border-slate-700'
                        : statusType === 'success'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : statusType === 'error'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                }`}>
                    {statusType === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                    <span className="whitespace-pre-wrap">{statusMessage}</span>
                </div>
            )}

            <div className={firstRun
                ? 'text-[12px] font-mono break-all text-slate-100 bg-slate-950 border border-slate-700 rounded-xl px-3 py-3'
                : 'text-[11px] font-mono break-all text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3'
            }>
                {displayPath}
            </div>

            {firstRun && (
                <p className="text-[11px] text-slate-400 leading-relaxed">
                    폴더를 고른 뒤 연결 테스트가 성공해야 다음으로 갑니다. 쓰기가 안 되는 폴더는 저장되지 않습니다.
                </p>
            )}

            {gatewayLanUrls.length > 0 && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        사내 웹/태블릿 접속 (LAN 게이트웨이 · WiFi/유선 IP 모두 등록)
                    </p>
                    {gatewayLanUrls.map((url) => (
                        <p key={url} className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 break-all">
                            {url}/api/v1/mirror
                        </p>
                    ))}
                </div>
            )}

            <div className={firstRun ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-2'}>
                <button
                    type="button"
                    onClick={() => void handleSelectFolder()}
                    className={`text-sm font-bold py-3 rounded-xl text-white flex items-center justify-center gap-2 ${
                        firstRun ? 'w-full bg-blue-600 hover:bg-blue-500' : 'bg-indigo-600 hover:bg-indigo-500'
                    }`}
                >
                    <FolderOpen className="w-4 h-4" />
                    {companyPathLocked ? '저장 경로 변경(이전)' : (firstRun ? '저장 폴더 선택' : 'NAS 폴더 선택')}
                </button>
                {!companyPathLocked && !firstRun && (
                    <button
                        type="button"
                        onClick={handleUseDefault}
                        className="text-sm font-bold py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                    >
                        내 문서 기본값 (임시)
                    </button>
                )}
            </div>

            <div className={firstRun ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-2'}>
                <button
                    type="button"
                    onClick={() => void handleTestAndSave()}
                    disabled={testing || (firstRun && !selectedPath?.trim())}
                    className={`text-sm font-bold py-3 rounded-xl text-white flex items-center justify-center gap-2 ${
                        firstRun
                            ? 'w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:hover:bg-slate-800'
                            : 'bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40'
                    }`}
                >
                    {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                    {testing ? '폴더 확인 중…' : '연결 테스트 후 회사에 저장'}
                </button>
                {!firstRun && (
                <button
                    type="button"
                    onClick={() => void handleOpenFolder()}
                    className="text-sm font-bold py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 flex items-center justify-center gap-2"
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    폴더 열기
                </button>
                )}
            </div>

            <button
                type="button"
                onClick={() => setShowNasGuide((v) => !v)}
                className={`text-xs font-bold flex items-center gap-1 ${
                    firstRun ? 'text-slate-400 hover:text-slate-200' : 'text-indigo-700 dark:text-indigo-300 underline'
                }`}
            >
                <Network className="w-3.5 h-3.5" />
                {firstRun ? '저장 폴더 연결 안내' : 'NAS/네트워크 공유 설정 안내'} {showNasGuide ? '닫기' : '보기'}
            </button>

            {showNasGuide && (
                <div className={firstRun
                    ? 'rounded-xl border border-slate-700 bg-slate-950 p-4 space-y-3 text-xs text-slate-300 leading-relaxed'
                    : 'rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed'
                }>
                    <p className={`font-bold flex items-center gap-1 ${firstRun ? 'text-slate-100' : 'text-amber-900 dark:text-amber-300'}`}>
                        <Info className="w-4 h-4" />
                        {firstRun ? 'NAS 공유 폴더 또는 PC 공유 폴더' : 'NAS 또는 사내 공유 폴더 연결 방법'}
                    </p>
                    <ol className="list-decimal pl-4 space-y-2">
                        <li>Windows 탐색기에서 저장 폴더를 <strong>\\서버\공유</strong> 형태로 엽니다. NAS 예: <code>\\nas2dual\공유폴더</code> / PC 공유 예: <code>\\매장PC\공유폴더</code></li>
                        <li>드라이브 문자(Z:)로 선택해도 저장 시 자동으로 UNC로 변환됩니다. 변환 실패 시 Z: 대신 UNC로 직접 선택해 주세요.</li>
                        <li>「{firstRun ? '저장 폴더 선택' : 'NAS 폴더 선택'}」→ 「연결 테스트 후 회사에 저장」 — <strong>한 번만</strong> 하면 전 PC가 같은 경로를 사용합니다.</li>
                        <li>경로를 바꿀 때는 기존 파일 복사를 확인한 뒤 저장하세요.</li>
                        <li>다른 PC·직원은 로그인만 하면 <strong>같은 UNC 경로가 자동 적용</strong>됩니다 ({TENANT_ARCHIVE_ROOT_SETTINGS_KEY}).</li>
                    </ol>
                </div>
            )}
        </div>
    );
};
