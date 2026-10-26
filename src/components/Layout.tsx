import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LayoutDashboard, Trello, Calendar, Users, FileText, Settings, Printer, Search, Minus, Square, X, Pin, ChevronsDown, ArrowDownToLine, Phone, Loader2, AlertTriangle, CheckCircle2, CloudOff, Eye, Crown, Zap, RefreshCw, CreditCard, ArrowBigUp, History, Building2, Menu, Bell, BarChart3, Activity, Inbox, Repeat } from 'lucide-react';
import { hardReloadApp } from '../utils/hardReload';
import { UserProfile } from './auth/UserProfile';
import { ChatWidget } from './common/ChatWidget';
import { ExternalOrderAlertModal } from './common/ExternalOrderAlertModal';
import { CompanyNasBanner } from './common/CompanyNasBanner';
import { CloudDegradedBanner } from './common/CloudDegradedBanner';
import { WebMirrorBanner } from './common/WebMirrorBanner';
import { PwaInstallBanner } from './common/PwaInstallBanner';
import { CompletedJobSearchModal } from './kanban/CompletedJobSearchModal';
import { JobDetailModal } from './common/JobDetailModal';
import { UpgradeModal } from './common/UpgradeModal';
import { FinanceBoardModal } from './payments/FinanceBoardModal';
import { db } from '../services/dataService';
import { presenceSessionService, type PresenceSessionEntry } from '../services/presenceSessionService';
import { resolveStaffOnline } from '../utils/staffSession';
import { Job, Staff } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'sonner';
import { isMobileWebClient } from '../utils/touchDevice';
import { useInstalledAppVersion } from '../hooks/useInstalledAppVersion';
import { triggerDesktopSetupDownload } from '../utils/desktopDownload';
import {
  formatAssignmentNoticeTime,
  formatAssigneeNames,
  listUnackedAssignmentJobs,
} from '../utils/assignmentNotice';
import { isFeatureEnabled } from '../features/featureFlags';
import { applyMonitoringFullscreen } from '../utils/monitoringFullscreen';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const SyncStatusIndicator: React.FC<{ condensed?: boolean }> = ({ condensed }) => {
    const { canAccessAdminSettings } = useAuth();
    const [status, setStatus] = useState(db.getSyncStatus());
    const [cloudDegraded, setCloudDegraded] = useState(db.isCloudDegraded());
    const [lastMirrorAt, setLastMirrorAt] = useState(db.getLastNasMirrorAt());
    const [lastReceivedAt, setLastReceivedAt] = useState(db.getLastMirrorReceivedAt());
    const isWeb = typeof window !== 'undefined' && !window.electron;

    useEffect(() => {
        const unsubscribe = db.subscribe(() => {
            setStatus(db.getSyncStatus());
            setCloudDegraded(db.isCloudDegraded());
            setLastMirrorAt(db.getLastNasMirrorAt());
            setLastReceivedAt(db.getLastMirrorReceivedAt());
        });
        return () => unsubscribe();
    }, []);

    const formatMirrorTime = (iso: string | null) => {
        if (!iso) return null;
        try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return null;
            return d.toLocaleString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return null;
        }
    };

    let icon, color, title;

    if (cloudDegraded && status === 'synced') {
        icon = <CloudOff size={14} />;
        color = 'text-amber-400';
        title = '클라우드 일시 불가 · 로컬로 운영 중';
    } else switch (status) {
        case 'synced':
            icon = <CheckCircle2 size={14} />;
            color = 'text-emerald-400';
            title = '데이터베이스 연결됨';
            break;
        case 'connecting':
            icon = <Loader2 size={14} className="animate-spin" />;
            color = 'text-blue-400';
            title = '네트워크 연결 중...';
            break;
        case 'disconnected':
        default:
            icon = <CloudOff size={14} />;
            color = 'text-rose-400';
            title = '서버 연결 끊김';
            break;
    }

    const mirrorLabel = formatMirrorTime(lastMirrorAt);
    const receivedLabel = formatMirrorTime(lastReceivedAt);
    const webReadOnlyTitle = canAccessAdminSettings
        ? '웹 — 매장 PC가 켜져 있으면 저장할 수 있습니다.'
        : '웹·태블릿 — 매장 PC가 켜져 있으면 저장할 수 있습니다.';
    const webReadOnlyLabel = canAccessAdminSettings ? 'PC 켜져 있으면 저장' : 'PC 켜져 있으면 저장';

    if (condensed) {
        return (
            <div className="flex flex-col items-center gap-1">
                {isWeb && (
                    <div
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-950/80 text-sky-300 border border-sky-800/60"
                        title={webReadOnlyTitle}
                    >
                        <Eye size={14} />
                    </div>
                )}
                <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 ${color}`} title={title}>{icon}</div>
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            {isWeb && (
                <div
                    className="flex flex-col gap-0.5 px-3.5 py-2 text-sm rounded-lg bg-sky-950/50 border border-sky-800/40 text-sky-200"
                    title={webReadOnlyTitle}
                >
                    <div className="flex items-center gap-2 font-bold">
                        <Eye size={14} />
                        <span>{webReadOnlyLabel}</span>
                    </div>
                    {mirrorLabel && (
                        <span className="text-[11px] text-sky-300/80 font-medium pl-5">
                            매장 데이터 {mirrorLabel}
                            {receivedLabel && receivedLabel !== mirrorLabel
                                ? ` · 수신 ${receivedLabel}`
                                : ''}
                        </span>
                    )}
                </div>
            )}
            <div className={`flex items-center gap-2 px-3.5 py-2 text-sm rounded-lg bg-slate-800 ${color}`} title={title}>
                {icon}
                <span className="font-bold">{title}</span>
            </div>
        </div>
    );
};

const getDisconnectDetail = (code: string | null) => {
    if (code === 'profile-not-ready') {
        return {
            title: '회사 소속 정보 동기화 대기 중',
            body: <>프로필이 서버에 반영되지 않았습니다.<br/>잠시 후 새로고침하거나, 로그아웃 후 다시 로그인해 주세요.</>,
        };
    }
    if (code === 'auth-not-ready') {
        return {
            title: '로그인 세션 준비 중',
            body: <>Firebase 인증이 아직 준비되지 않았습니다.<br/>잠시 후 새로고침하거나, 로그아웃 후 다시 로그인해 주세요.</>,
        };
    }
    if (code === 'permission-denied') {
        return {
            title: '데이터 접근 권한이 없습니다',
            body: <>Firebase 로그인이 만료되었거나 권한이 없습니다.<br/>로그아웃 후 다시 로그인해 주세요.</>,
        };
    }
    if (code === 'resource-exhausted') {
        return {
            title: 'Firestore 일일 한도 초과',
            body: <>오늘 Firestore 무료 한도에 도달했습니다.<br/>UTC 자정 이후 자동 복구됩니다.</>,
        };
    }
    if (code === 'unavailable') {
        return {
            title: '서버에 일시적으로 연결할 수 없습니다',
            body: <>인터넷·방화벽·회사망 설정을 확인해 주세요.<br/>복구되면 자동으로 재동기화됩니다.</>,
        };
    }
    return {
        title: '클라우드 연결이 끊겼습니다',
        body: <>Firestore 서버와의 연결이 일시적으로 끊어졌습니다.<br/>인터넷 연결을 확인해 주세요. 복구되면 자동으로 재동기화됩니다.</>,
    };
};

const ReconnectOverlay: React.FC = () => {
    const { logout } = useAuth();
    const [status, setStatus] = useState(db.getSyncStatus());
    const [syncError, setSyncError] = useState(db.getLastSyncError());
    const [isRetrying, setIsRetrying] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    useEffect(() => {
        const unsubscribe = db.subscribe(() => {
            setStatus(db.getSyncStatus());
            setSyncError(db.getLastSyncError());
        });
        return () => unsubscribe();
    }, []);

    const handleRetry = async () => {
        setIsRetrying(true);
        await hardReloadApp();
    };

    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await logout();
        } finally {
            setIsLoggingOut(false);
        }
    };

    if (status !== 'disconnected') return null;

    // 로그인 직후·세션 준비 중에는 실제 장애가 아님. 기존 사용자는 이 화면을 보지 않음.
    if (
        !syncError ||
        syncError === 'auth-not-ready' ||
        syncError === 'profile-not-ready'
    ) {
        return null;
    }

    if (
        db.hasLocalOperationalData() &&
        (syncError === 'resource-exhausted' || syncError === 'unavailable' || syncError === 'pull-failed' || syncError === 'permission-denied')
    ) {
        return null;
    }

    const detail = getDisconnectDetail(syncError);

    return (
        <div className="fixed inset-0 bg-slate-900/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full border border-slate-200 dark:border-slate-700 text-center space-y-6">
                <div className="flex justify-center">
                    <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/30 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 border border-rose-200/50">
                        <CloudOff size={32} />
                    </div>
                </div>
                <div className="space-y-2">
                    <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">
                        {detail.title}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {detail.body}
                    </p>
                </div>
                <div className="space-y-2">
                    <button
                        onClick={handleRetry}
                        disabled={isRetrying || isLoggingOut}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 text-white py-2.5 rounded-xl font-bold shadow-md text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    >
                        {isRetrying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        새로고침하여 재연결
                    </button>
                    <button
                        type="button"
                        onClick={handleLogout}
                        disabled={isLoggingOut || isRetrying}
                        className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                    >
                        {isLoggingOut ? '로그아웃 중…' : '로그아웃'}
                    </button>
                </div>
            </div>
        </div>
    );
};

function isStaffCurrentlyOnline(
  s: Staff,
  sessions: Record<string, PresenceSessionEntry>
): boolean {
  const keys = [s.uid, s.id].filter(Boolean) as string[];
  for (const key of keys) {
    const row = sessions[key];
    if (row && resolveStaffOnline(row)) return true;
  }
  for (const row of Object.values(sessions)) {
    if (row?.staffDocId && (row.staffDocId === s.id || row.staffDocId === s.uid) && resolveStaffOnline(row)) {
      return true;
    }
  }
  return false;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const { tenantPlan, currentUser } = useAuth();
  const { theme } = useTheme();
  const installedAppVersion = useInstalledAppVersion();
  const [isTvMode, setIsTvMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ezprint_tv_mode') === 'true';
    }
    return false;
  });
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [selectedSearchJob, setSelectedSearchJob] = useState<Job | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [onlineByKey, setOnlineByKey] = useState<Record<string, boolean>>({});
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const handleTvModeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsTvMode(customEvent.detail.isTvMode);
    };
    window.addEventListener('ezprint-tv-mode-change', handleTvModeChange);
    return () => window.removeEventListener('ezprint-tv-mode-change', handleTvModeChange);
  }, []);

  useEffect(() => {
    if (!window.electron?.setMonitoringFullscreen) return;
    applyMonitoringFullscreen(isTvMode);
  }, [isTvMode]);

  useEffect(() => {
    const onMasterUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      toast.message(detail?.message || '회사 상품/후가공 목록이 다른 PC에서 반영되었습니다.', {
        duration: 5000,
      });
    };
    window.addEventListener('ezpw-product-processing-updated', onMasterUpdated);
    return () => window.removeEventListener('ezpw-product-processing-updated', onMasterUpdated);
  }, []);
  const [companyName, setCompanyName] = useState('EzPrintWork');
  const [isElectron, setIsElectron] = useState(false);
  const isMobileWeb = useMemo(() => isMobileWebClient(), []);
  const [showDownloadBanner, setShowDownloadBanner] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('hide-desktop-banner') && !localStorage.getItem('desktop-app-installed');
    }
    return true;
  });
  
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pinToBack, setPinToBack] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  const handleMobileTabChange = (tab: string) => {
    onTabChange(tab);
    setMobileNavOpen(false);
  };



  useEffect(() => {
    const isRunningInElectron = typeof window !== 'undefined' && !!window.electron;
    setIsElectron(isRunningInElectron);
    
    if (isRunningInElectron) {
      localStorage.setItem('desktop-app-installed', 'true');
      localStorage.removeItem('ezprint_widget_mode');
      setShowDownloadBanner(false);
      return;
    }

  }, []);

  // 데이터 폴더 미설정 시 설정으로 튕겨내는 가딩을 제거하여 클라우드 SaaS 모드로 즉시 기동되도록 완화
  useEffect(() => {
    // 탭 이동 차단 로직 제거 완료
  }, [activeTab]);

  useEffect(() => {
    const handleOpenUpgrade = () => setShowUpgradeModal(true);
    window.addEventListener('open-upgrade-modal', handleOpenUpgrade);
    return () => window.removeEventListener('open-upgrade-modal', handleOpenUpgrade);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setStaff(db.getStaff());
      setCompanyName(db.getCompanyInfo().name);
      setJobs(db.getActiveJobs());
    };

    refresh();
    const unsubscribe = db.subscribe(refresh);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser?.tenantId) return;
    let cancelled = false;

    const refreshPresence = async () => {
      try {
        const file = await presenceSessionService.read(
          currentUser.tenantId!,
          db.getStoreGatewayUrls()
        );
        if (cancelled) return;
        const sessions = file?.sessions || {};
        const next: Record<string, boolean> = {};
        for (const s of db.getStaff()) {
          if (!s?.id) continue;
          const on = isStaffCurrentlyOnline(s, sessions);
          next[s.id] = on;
          if (s.uid) next[s.uid] = on;
        }
        setOnlineByKey(next);
      } catch (e) {
        console.warn('[Layout] presence refresh failed:', e);
      }
    };

    void refreshPresence();
    const timer = window.setInterval(() => void refreshPresence(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUser?.tenantId]);

  const handleJobUpdate = async (updatedJob: Job) => {
      try {
          await db.updateJob(updatedJob);
          setSelectedSearchJob(null);
      } catch (error) {
          const msg = error instanceof Error ? error.message : '작업 저장에 실패했습니다.';
          toast.error(msg);
          throw error;
      }
  };

  const assignmentAlerts = useMemo(
    () => listUnackedAssignmentJobs(jobs, currentUser, staff),
    [jobs, currentUser, staff]
  );
  const assignmentAlertJob = assignmentAlerts[0] || null;
  const assignmentAlertTime = assignmentAlertJob
    ? formatAssignmentNoticeTime(assignmentAlertJob.assignmentNotice?.assignedAt)
    : '';
  const assignmentAlertAssignees = assignmentAlertJob
    ? formatAssigneeNames(assignmentAlertJob.assignmentNotice?.staffIds, staff)
    : '';
  const assignmentAlertAction = assignmentAlertAssignees
    ? `${assignmentAlertAssignees}로 담당자 지정`
    : '담당자 지정';

  const menuItems = [
    { id: 'dashboard', label: '상황판', icon: LayoutDashboard },
    { id: 'kanban', label: '작업진행', icon: Trello },
    { id: 'calendar', label: '달력', icon: Calendar },
    { id: 'history', label: '작업내역', icon: History },
    { id: 'customers', label: '거래처관리', icon: Building2 },
    { id: 'quotes', label: '견적서관리', icon: FileText },
    { id: 'payments', label: '결제상황', icon: CreditCard },
    ...(isFeatureEnabled('mgmtReports') ? [{ id: 'reports', label: '경영리포트', icon: BarChart3 }] : []),
    ...(isFeatureEnabled('syncDiagnostics') ? [{ id: 'diagnostics', label: '동기화진단', icon: Activity }] : []),
    ...(isFeatureEnabled('conflictInbox') ? [{ id: 'conflicts', label: '충돌보관함', icon: Inbox }] : []),
    ...(isFeatureEnabled('crmReorder') ? [{ id: 'reorder', label: '재주문', icon: Repeat }] : []),
  ];

  // Window Controls
  const sendWindowToBack = () => {
    if (isElectron && window.electron?.lower) {
      window.electron.lower();
      toast.success('맨 뒤로 보냈습니다.');
      return;
    }
    toast.info('이 기능은 PC 전용 앱에서 사용할 수 있습니다.');
  };
  const togglePinToBack = async () => {
    if (!isElectron || !window.electron?.pinToBack) {
      toast.info('이 기능은 PC 전용 앱에서 사용할 수 있습니다.');
      return;
    }
    const next = !pinToBack;
    try {
      const res = await window.electron.pinToBack(next);
      if (!res?.ok) {
        toast.error(res?.error || '맨 뒤 고정에 실패했습니다.');
        return;
      }
      setPinToBack(!!res.enabled);
      toast.success(res.enabled
        ? '창을 맨 뒤에 고정했습니다. 다른 프로그램을 쓰면 이 창은 뒤에 머뭅니다.'
        : '맨 뒤 고정을 해제했습니다.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '맨 뒤 고정에 실패했습니다.');
    }
  };

  const containerClass = `flex flex-col h-screen ${theme === 'trello' ? 'bg-[#1d2d44]' : 'bg-slate-100 dark:bg-slate-900'} overflow-hidden transition-colors duration-200`;

  return (
    <div className={containerClass}>
      
      {/* Title Bar */}
      <div 
        className={`h-8 lg:h-10 flex justify-between items-center select-none z-[60] shrink-0 border-b border-slate-800 transition-colors bg-slate-900 dark:bg-slate-950 ${isTvMode || isMobileWeb ? 'hidden' : ''}`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
          <div className="flex items-center gap-2 px-3 text-slate-300">
              <Printer size={16} className="text-blue-500" />
              <span className="font-bold tracking-wide text-xs">
                  EzPrintWork v{installedAppVersion}
              </span>
          </div>
          
          {/* Windows-style Window Controls */}
          <div 
            className="flex items-center h-full text-slate-400" 
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
              {isElectron && (
                <>
                  <button
                    type="button"
                    onClick={sendWindowToBack}
                    className="w-10 lg:w-11 h-full flex items-center justify-center hover:bg-slate-800 hover:text-amber-300 transition-colors"
                    title="맨 뒤로 보내기"
                  >
                    <ChevronsDown size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void togglePinToBack()}
                    className="w-10 lg:w-11 h-full flex items-center justify-center hover:bg-slate-800 hover:text-white transition-colors"
                    title={pinToBack ? '맨 뒤 고정 해제' : '창 맨 뒤에 고정'}
                  >
                    <Pin size={14} className={pinToBack ? 'text-amber-300 fill-amber-300/20' : ''} />
                  </button>
                </>
              )}
              <button
                onClick={() => {
                    if (isElectron && window.electron?.minimize) {
                        window.electron.minimize();
                    } else {
                        // Web fallback
                        alert('최소화는 데스크톱 앱에서 지원됩니다. 바로가기 아이콘을 다운로드하여 앱으로 사용해 보세요!');
                    }
                }}
                className="w-10 lg:w-12 h-full flex items-center justify-center hover:bg-slate-800 hover:text-white transition-colors"
                title="최소화"
              >
                  <Minus size={14} />
              </button>
              <button 
                onClick={() => {
                    if (isElectron && window.electron?.maximize) {
                        window.electron.maximize();
                    } else {
                        // Web fallback: 브라우저 상단 메뉴/주소창을 없애고 꽉 차게 전체화면 모드 토글
                        if (!document.fullscreenElement) {
                            document.documentElement.requestFullscreen().catch((err) => {
                                console.error('전체화면 오류:', err);
                            });
                        } else {
                            document.exitFullscreen();
                        }
                    }
                }}
                className="w-10 lg:w-12 h-full flex items-center justify-center hover:bg-slate-800 hover:text-white transition-colors"
                title={isElectron ? "최대화" : "전체화면 (상단 메뉴 없애기)"}
              >
                  <Square size={12} />
              </button>
              <button 
                onClick={() => {
                    if (isElectron && window.electron?.close) {
                        window.electron.close();
                    } else {
                        // Web fallback
                        if (confirm('프로그램을 종료하시겠습니까? (웹 페이지가 닫히거나 로그아웃됩니다)')) {
                            try {
                                window.close();
                            } catch (e) {
                                window.location.href = 'about:blank';
                            }
                        }
                    }
                }}
                className="w-10 lg:w-12 h-full flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
                title="닫기"
              >
                  <X size={14} />
              </button>
          </div>
      </div>

      <CloudDegradedBanner />
      <WebMirrorBanner />
      <PwaInstallBanner />
      <CompanyNasBanner />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - Hover based expansion */}
        {!isTvMode && (
          <aside 
              ref={sidebarRef}
              className={`hidden lg:flex flex-col bg-slate-900 dark:bg-slate-950 text-slate-300 shadow-2xl transition-all duration-300 ease-out shrink-0 z-50 border-r border-slate-800 ${isSidebarExpanded ? 'w-72' : 'w-14'}`}
          >
            {/* The actual sidebar content */}
            <div className="flex flex-col h-full overflow-hidden">
                {/* Logo Section */}
                <div className="h-24 lg:h-28 flex-none relative overflow-hidden">
                    <div className={`absolute inset-0 p-4 transition-all duration-500 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10 pointer-events-none'}`}>
                        <div 
                            onClick={() => setIsSidebarExpanded(false)}
                            className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 h-full flex flex-col justify-center backdrop-blur-md cursor-pointer hover:bg-slate-800 hover:border-slate-600 transition-all"
                            title="메뉴 접기"
                        >
                            <h1 className="text-xl font-black text-white tracking-tighter leading-tight">{companyName}</h1>
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">Enterprise Cloud</p>
                            </div>
                        </div>
                    </div>
                    <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${!isSidebarExpanded ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 rotate-90 pointer-events-none'}`}>
                        <div 
                            onClick={() => setIsSidebarExpanded(true)}
                            className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20 cursor-pointer hover:scale-105 active:scale-95 transition-all"
                            title="메뉴 펼치기"
                        >
                            <Printer size={24} className="text-white" />
                        </div>
                    </div>
                </div>
                
                {/* Menu Section */}
                <nav className="flex-1 space-y-1.5 py-4 px-2 overflow-x-hidden">
                {menuItems.map((item) => {
                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                onTabChange(item.id);
                            }}
                            className={`group flex items-center w-full px-3 py-3 rounded-xl transition-all relative ${
                                activeTab === item.id 
                                    ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
                                    : 'hover:bg-slate-800 hover:text-white text-slate-400'
                            } ${!isSidebarExpanded ? 'justify-center' : 'gap-4'}`}
                            title={!isSidebarExpanded ? item.label : ''}
                        >
                            <div className={`transition-transform duration-300 ${activeTab === item.id ? 'scale-110' : 'group-hover:scale-110'}`}>
                                <item.icon size={22} className={activeTab === item.id ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'} />
                            </div>
                            {isSidebarExpanded && (
                                <span className="text-[15px] font-bold whitespace-nowrap overflow-hidden text-ellipsis animate-in fade-in slide-in-from-left-2 duration-300">
                                    {item.label}
                                </span>
                            )}
                            {activeTab === item.id && !isSidebarExpanded && (
                                <div className="absolute left-0 w-1 h-6 bg-blue-500 rounded-r-full" />
                            )}
                        </button>
                    );
                })}
                </nav>

                {/* Bottom Section */}
                <div className="flex-none p-2 space-y-2 mb-2">
                    {/* Extension Numbers Section */}
                    <div className={`transition-all duration-300 overflow-hidden ${isSidebarExpanded ? 'opacity-100 h-auto translate-y-0' : 'opacity-0 h-0 translate-y-4 pointer-events-none'}`}>
                        <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/40 backdrop-blur-sm">
                            <h3 className="text-xs font-black text-slate-400 mb-3 flex items-center gap-2 uppercase tracking-widest">
                                <Phone size={14} className="text-blue-500"/> 내선 번호
                            </h3>
                            <div className="space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                                {staff.filter(s => s.active && !s.isDeleted).map(s => {
                                    const online = !!(s.uid && onlineByKey[s.uid]) || !!onlineByKey[s.id];
                                    return (
                                    <div key={s.id} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-700/30 last:border-0 group">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span
                                                className={`w-8 shrink-0 text-center text-[10px] font-black tracking-tight ${
                                                    online ? 'text-emerald-400' : 'text-slate-500'
                                                }`}
                                                title={online ? '온라인' : '오프라인'}
                                            >
                                                {online ? 'ON' : 'OFF'}
                                            </span>
                                            <span className="text-slate-300 font-bold truncate">{s.name}</span>
                                        </div>
                                        <span className="text-blue-400 font-black font-mono group-hover:text-blue-300 transition-colors shrink-0">{s.extensionNumber || ''}</span>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Sync Status */}
                    <div className={`transition-all duration-300 ${isSidebarExpanded ? 'px-1' : 'flex justify-center'}`}>
                        <SyncStatusIndicator condensed={!isSidebarExpanded} />
                    </div>
                    
                    {/* User Profile */}
                    <div className={`transition-all duration-300 ${isSidebarExpanded ? 'px-1' : 'flex justify-center'}`}>
                        <UserProfile compact={!isSidebarExpanded} />
                    </div>

                    {/* 데스크톱 앱 다운로드 버튼 (웹 모드에서 노출) */}
                    {!isElectron && (
                        <div className="space-y-1">
                            <button 
                                onClick={() => triggerDesktopSetupDownload()} 
                                className={`flex items-center w-full px-3 py-2 rounded-xl transition-all text-slate-500 hover:text-white hover:bg-slate-800 ${!isSidebarExpanded ? 'justify-center' : 'gap-4'}`}
                                title={!isSidebarExpanded ? '데스크톱 앱 다운로드 (.exe)' : ''}
                            >
                                <ArrowDownToLine size={22} className="text-blue-500 hover:scale-110 transition-transform" />
                                {isSidebarExpanded && <span className="text-[15px] font-bold text-slate-300">데스크톱 앱 (.exe)</span>}
                            </button>
                        </div>
                    )}

                    {/* Settings Button */}
                    <button 
                        onClick={() => onTabChange('settings')} 
                        className={`flex items-center w-full px-3 py-3 rounded-xl transition-all ${
                            activeTab === 'settings' 
                                ? 'bg-slate-700 text-white shadow-lg' 
                                : 'text-slate-500 hover:text-white hover:bg-slate-800'
                        } ${!isSidebarExpanded ? 'justify-center' : 'gap-4'}`}
                        title={!isSidebarExpanded ? '설정' : ''}
                    >
                        <Settings size={22} className={activeTab === 'settings' ? 'text-white' : 'group-hover:rotate-45 transition-transform'} />
                        {isSidebarExpanded && <span className="text-[15px] font-bold">설정</span>}
                    </button>
                </div>
            </div>
          </aside>
        )}

        {/* 태블릿·휴대폰: 햄버거 드로어 (메뉴·설정·로그아웃) */}
        {!isTvMode && mobileNavOpen && (
          <div className="lg:hidden fixed inset-0 z-[80] flex">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px]"
              aria-label="메뉴 닫기"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative z-10 flex flex-col w-[min(20rem,88vw)] max-w-full h-full bg-slate-900 dark:bg-slate-950 text-slate-300 shadow-2xl border-r border-slate-800 animate-in slide-in-from-left duration-200">
              <div className="h-16 flex-none flex items-center justify-between px-4 border-b border-slate-800">
                <div className="min-w-0">
                  <h1 className="text-lg font-black text-white tracking-tight truncate">{companyName}</h1>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">메뉴</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                  aria-label="닫기"
                >
                  <X size={22} />
                </button>
              </div>
              <nav className="flex-1 space-y-1.5 py-4 px-3 overflow-y-auto">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleMobileTabChange(item.id)}
                    className={`flex items-center gap-4 w-full px-3 py-3.5 rounded-xl transition-all ${
                      activeTab === item.id
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                        : 'hover:bg-slate-800 hover:text-white text-slate-400'
                    }`}
                  >
                    <item.icon size={22} />
                    <span className="text-[15px] font-bold">{item.label}</span>
                  </button>
                ))}
              </nav>
              <div className="flex-none p-3 space-y-2 border-t border-slate-800 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <SyncStatusIndicator condensed={false} />
                <UserProfile compact={false} />
                {!isElectron && (
                  <button
                    type="button"
                    onClick={() => triggerDesktopSetupDownload()}
                    className="flex items-center gap-4 w-full px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <ArrowDownToLine size={22} className="text-blue-500" />
                    <span className="text-[15px] font-bold text-slate-300">데스크톱 앱 (.exe)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleMobileTabChange('settings')}
                  className={`flex items-center gap-4 w-full px-3 py-3 rounded-xl transition-all ${
                    activeTab === 'settings'
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-500 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Settings size={22} />
                  <span className="text-[15px] font-bold">설정</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        <main className="flex-1 flex flex-col h-full overflow-hidden relative">
            {!isTvMode && (
                <header className={`border-b flex items-center justify-between z-[70] shrink-0 min-h-14 lg:min-h-16 py-1 px-3 sm:px-4 md:px-5 lg:px-7 ${
                  theme === 'trello' 
                    ? 'bg-[#152238]/90 border-[#22334b]' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}>
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => setMobileNavOpen(true)}
                          className={`lg:hidden shrink-0 p-2.5 rounded-xl transition-colors ${
                            theme === 'trello'
                              ? 'bg-slate-700 text-white hover:bg-slate-600'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                          aria-label="메뉴 열기"
                          title="메뉴"
                        >
                          <Menu size={22} />
                        </button>
                        <h2 className={`font-bold text-lg md:text-xl truncate ${
                          theme === 'trello' 
                            ? 'text-white' 
                            : 'text-slate-800 dark:text-slate-100'
                        }`}>
                            {activeTab === 'settings' ? '설정' : menuItems.find(m => m.id === activeTab)?.label}
                        </h2>
                    </div>
                    {assignmentAlertJob && (
                        <button
                            type="button"
                            onClick={() => setSelectedSearchJob(assignmentAlertJob)}
                            className={`assignment-notice-blink mx-2 sm:mx-3 flex-1 min-w-[240px] max-w-3xl rounded-full px-3 sm:px-4 h-10 sm:h-11 flex items-center gap-1.5 text-left shadow-sm border ${
                                theme === 'trello'
                                    ? 'bg-amber-400 border-amber-200 text-slate-900'
                                    : 'bg-amber-400 border-amber-500 text-slate-900'
                            }`}
                            title="카드를 열면 이 알림이 멈춥니다"
                        >
                            <Bell size={15} className="shrink-0" />
                            <span className="min-w-0 flex-1 flex items-center gap-1.5 text-[12px] sm:text-[13px] font-bold">
                                {assignmentAlertTime && (
                                    <span className="shrink-0">{assignmentAlertTime}</span>
                                )}
                                <span className="shrink-0 text-slate-800/70">·</span>
                                <span className="min-w-0 truncate">
                                    {assignmentAlertJob.title || '작업'}
                                </span>
                                <span className="shrink-0 text-slate-800/70">·</span>
                                <span className="shrink-0">
                                    {assignmentAlertAction}
                                    {assignmentAlerts.length > 1 ? ` · 외 ${assignmentAlerts.length - 1}건` : ''}
                                </span>
                            </span>
                        </button>
                    )}
                    <div className="flex items-center gap-2 sm:gap-3 lg:gap-5 shrink-0">
                        {tenantPlan === 'free' && !assignmentAlertJob && (
                            <button 
                                onClick={() => setShowUpgradeModal(true)}
                                className="hidden md:flex items-center gap-3 px-4 h-12 bg-gradient-to-r from-amber-500 via-orange-600 to-amber-600 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-500/30 hover:scale-105 active:scale-95 transition-all group border border-amber-400/30 overflow-hidden relative min-w-[220px]"
                            >
                                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                                <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                                    <Crown size={14} className="fill-white animate-pulse" />
                                </div>
                                <div className="flex flex-col items-start gap-0 text-left pr-2 flex-1">
                                    <span className="text-white text-[13px] tracking-tight leading-tight">PRO 버전 업그레이드</span>
                                    <span className="text-amber-100/80 text-[9px] font-medium leading-tight whitespace-nowrap">광고 제거 및 무제한 팀 협업</span>
                                </div>
                                <Zap size={14} className="fill-white opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
                            </button>
                        )}
                        <button 
                            onClick={() => {
                                setShowSearchModal(true);
                            }}
                            className={`rounded-full flex items-center gap-2 sm:gap-3 transition-colors px-3 sm:px-6 h-11 sm:h-12 shadow-sm ${
                                theme === 'trello' 
                                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' 
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            <Search size={22} />
                            <span className="text-base font-bold hidden sm:inline">등록 작업 검색</span>
                        </button>
                        <button
                            onClick={() => setShowFinanceModal(true)}
                            className={`rounded-full flex items-center gap-2 sm:gap-3 transition-colors px-3 sm:px-5 h-11 sm:h-12 shadow-sm ${
                                theme === 'trello'
                                    ? 'bg-violet-700 hover:bg-violet-600 text-white'
                                    : 'bg-violet-600 text-white hover:bg-violet-700'
                            }`}
                        >
                            <ArrowBigUp size={20} className="fill-white" strokeWidth={2} />
                            <span className="text-sm font-bold hidden sm:inline">관리카드</span>
                        </button>
                    </div>
                </header>
            )}
            
            {/* 데스크톱 앱 다운로드 유도 프리미엄 배너 (웹 브라우저 접속 시 상단 노출) */}
            {!isElectron && showDownloadBanner && !isTvMode && !isMobileWeb && (
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-md shrink-0 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                            <Zap size={16} className="fill-white text-yellow-300 animate-pulse" />
                        </div>
                        <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3 text-left">
                            <span className="text-sm font-black tracking-tight">EzPrintWork 데스크톱 전용 앱으로 100% 성능을 누리세요!</span>
                            <span className="text-xs text-blue-100/90 font-medium">바탕화면 바로가기, 파일 탐색기(돋보기) 자동 연동 등 모든 로컬 연동이 가능해집니다.</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button 
                            onClick={() => triggerDesktopSetupDownload()}
                            className="bg-white text-blue-700 hover:bg-blue-50 px-3.5 py-1.5 rounded-lg text-xs font-black shadow-sm transition-all active:scale-95 whitespace-nowrap"
                        >
                            PC 전용 앱 (.exe)
                        </button>
                        <button 
                            onClick={() => {
                                localStorage.setItem('hide-desktop-banner', 'true');
                                setShowDownloadBanner(false);
                            }}
                            className="text-blue-100 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors"
                            title="다시 보지 않기"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}
            
            <div className={`flex-1 flex flex-col min-h-0 relative ${theme === 'trello' ? 'bg-[#1d2d44]' : 'bg-slate-100 dark:bg-slate-900'} ${isTvMode ? 'p-0.5' : 'p-2 md:p-3 lg:p-4'}`}>
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                    {children}
                </div>
            </div>
            
            <ChatWidget />
            <ExternalOrderAlertModal />
        </main>
      </div>

      {showSearchModal && (
        <CompletedJobSearchModal
          onClose={() => setShowSearchModal(false)}
          onSelectJob={(job) => {
            setShowSearchModal(false);
            setSelectedSearchJob(job);
          }}
        />
      )}

      <UpgradeModal 
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />

      {selectedSearchJob && (
        <div className="relative z-[60]">
            <JobDetailModal 
                job={selectedSearchJob}
                staff={staff}
                initialViewMode="summary"
                onClose={() => setSelectedSearchJob(null)}
                onUpdate={handleJobUpdate}
                onNavigateToQuote={() => onTabChange('quotes')}
            />
        </div>
      )}
      {showFinanceModal && (
        <FinanceBoardModal onClose={() => setShowFinanceModal(false)} />
      )}
      <ReconnectOverlay />
    </div>
  );
};
