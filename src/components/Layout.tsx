import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Trello, Calendar, Users, FileText, Settings, Printer, Search, Minus, Square, X, ArrowDownToLine, Pin, Phone, Loader2, AlertTriangle, CheckCircle2, CloudOff, Eye, Crown, Zap, RefreshCw, CreditCard, ArrowBigUp, History, Building2, Menu } from 'lucide-react';
import { hardReloadApp } from '../utils/hardReload';
import { UserProfile } from './auth/UserProfile';
import { ChatWidget } from './common/ChatWidget';
import { CompanyNasBanner } from './common/CompanyNasBanner';
import { CloudDegradedBanner } from './common/CloudDegradedBanner';
import { CompletedJobSearchModal } from './kanban/CompletedJobSearchModal';
import { JobDetailModal } from './common/JobDetailModal';
import { UpgradeModal } from './common/UpgradeModal';
import { FinanceBoardModal } from './payments/FinanceBoardModal';
import { db } from '../services/dataService';
import { Job, Staff } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from 'sonner';
import { useInstalledAppVersion } from '../hooks/useInstalledAppVersion';
import { triggerDesktopSetupDownload } from '../utils/desktopDownload';

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
        ? '웹 — 작업·칸반은 조회 전용. 관리자는 상품·설정 저장 가능'
        : '웹·태블릿 조회 전용 — 수정은 매장 PC 앱에서';
    const webReadOnlyLabel = canAccessAdminSettings ? '작업 조회 전용' : '조회 전용';

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
    const [status, setStatus] = useState(db.getSyncStatus());
    const [syncError, setSyncError] = useState(db.getLastSyncError());
    const [isRetrying, setIsRetrying] = useState(false);

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

    if (status !== 'disconnected') return null;

    if (
        db.hasLocalOperationalData() &&
        (syncError === 'resource-exhausted' || syncError === 'unavailable' || syncError === 'pull-failed' || syncError === 'permission-denied' || syncError === 'auth-not-ready')
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
                <button
                    onClick={handleRetry}
                    disabled={isRetrying}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 text-white py-2.5 rounded-xl font-bold shadow-md text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                    {isRetrying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    새로고침하여 재연결
                </button>
            </div>
        </div>
    );
};

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const { tenantPlan } = useAuth();
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

  useEffect(() => {
    const handleTvModeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsTvMode(customEvent.detail.isTvMode);
    };
    window.addEventListener('ezprint-tv-mode-change', handleTvModeChange);
    return () => window.removeEventListener('ezprint-tv-mode-change', handleTvModeChange);
  }, []);

  useEffect(() => {
    const onMasterUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      toast.message(detail?.message || '회사 상품/후가공 설정이 갱신되었습니다.', {
        duration: 8000,
        action: {
          label: '앱 다시 시작',
          onClick: () => hardReloadApp(),
        },
      });
    };
    window.addEventListener('ezpw-product-processing-updated', onMasterUpdated);
    return () => window.removeEventListener('ezpw-product-processing-updated', onMasterUpdated);
  }, []);
  const [companyName, setCompanyName] = useState('EzPrintWork');
  const [isElectron, setIsElectron] = useState(false);
  const [showDownloadBanner, setShowDownloadBanner] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('hide-desktop-banner') && !localStorage.getItem('desktop-app-installed');
    }
    return true;
  });
  
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('ezprint_widget_mode') === 'true';
  });
  const [opacity, setOpacity] = useState(1);
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
    };

    refresh();
    const unsubscribe = db.subscribe(refresh);
    return () => unsubscribe();
  }, []);

  const handleJobUpdate = (updatedJob: Job) => {
      db.updateJob(updatedJob);
      setSelectedSearchJob(null);
  };

  const menuItems = [
    { id: 'dashboard', label: '상황판', icon: LayoutDashboard },
    { id: 'kanban', label: '작업진행', icon: Trello },
    { id: 'calendar', label: '달력', icon: Calendar },
    { id: 'history', label: '작업내역', icon: History },
    { id: 'customers', label: '거래처관리', icon: Building2 },
    { id: 'quotes', label: '견적서관리', icon: FileText },
    { id: 'payments', label: '결제상황', icon: CreditCard },
  ];

  // Window Controls
  const togglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      localStorage.setItem('ezprint_widget_mode', next ? 'true' : 'false');
      toast.info(next ? '위젯 모드 — 하단 탭만 표시됩니다.' : '일반 모드로 돌아왔습니다.');
      return next;
    });
  };
  const toggleOpacity = () => setOpacity((prev) => (prev === 1 ? 0.88 : 1));
  const sendWindowToBack = () => {
    if (isElectron && window.electron?.lower) {
      window.electron.lower();
      toast.success('다른 창 뒤로 보냈습니다. 작업표시줄에서 다시 열 수 있습니다.');
      return;
    }
    toast.info('이 기능은 PC 전용 앱에서 사용할 수 있습니다.');
  };

  const containerClass = isPinned 
    ? "flex flex-col h-screen bg-slate-900/95 border-2 border-blue-500 overflow-hidden transition-all duration-300 shadow-2xl"
    : `flex flex-col h-screen ${theme === 'trello' ? 'bg-[#1d2d44]' : 'bg-slate-100 dark:bg-slate-900'} overflow-hidden transition-colors duration-200`;

  const sidebarClass = isPinned
    ? "hidden"
    : `hidden lg:flex flex-col bg-slate-900 dark:bg-slate-950 text-slate-300 shadow-xl z-50 transition-all duration-300 relative ${isSidebarExpanded ? 'w-72' : 'w-14'}`;

  return (
    <div className={containerClass} style={{ opacity: opacity < 1 ? opacity : 1 }}>
      
      {/* Title Bar */}
      <div 
        className={`h-8 lg:h-10 flex justify-between items-center select-none z-[60] shrink-0 border-b border-slate-800 transition-colors ${isPinned ? 'bg-blue-900' : 'bg-slate-900 dark:bg-slate-950'} ${isTvMode ? 'hidden' : ''}`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
          <div className="flex items-center gap-2 px-3 text-slate-300">
              <Printer size={isPinned ? 14 : 16} className={isPinned ? "text-yellow-400" : "text-blue-500"} />
              <span className={`font-bold tracking-wide ${isPinned ? 'text-[10px]' : 'text-xs'}`}>
                  {isPinned ? `EzPrint v${installedAppVersion} (위젯)` : `EzPrintWork Cloud v${installedAppVersion}`}
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
                    onClick={toggleOpacity}
                    className="w-10 lg:w-11 h-full flex items-center justify-center hover:bg-slate-800 hover:text-white transition-colors"
                    title="창 투명도"
                  >
                    <Eye size={14} className={opacity < 1 ? 'text-blue-400' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={togglePin}
                    className="w-10 lg:w-11 h-full flex items-center justify-center hover:bg-slate-800 hover:text-white transition-colors"
                    title={isPinned ? '위젯 모드 해제' : '위젯 모드 (컴팩트)'}
                  >
                    <Pin size={14} className={isPinned ? 'text-yellow-400 fill-yellow-400/20' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={sendWindowToBack}
                    className="w-10 lg:w-11 h-full flex items-center justify-center hover:bg-slate-800 hover:text-amber-300 transition-colors"
                    title="다른 창 맨 뒤로 (최하단 고정)"
                  >
                    <ArrowDownToLine size={14} />
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
      <CompanyNasBanner />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - Hover based expansion */}
        {!isPinned && !isTvMode && (
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
                                {staff.filter(s => s.active && s.extensionNumber).map(s => (
                                    <div key={s.id} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-700/30 last:border-0 group">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            <span className="text-slate-300 font-bold">{s.name}</span>
                                        </div>
                                        <span className="text-blue-400 font-black font-mono group-hover:text-blue-300 transition-colors">{s.extensionNumber}</span>
                                    </div>
                                ))}
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
        {!isPinned && !isTvMode && mobileNavOpen && (
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
            {!isPinned && !isTvMode && (
                <header className={`border-b flex items-center justify-between z-10 shrink-0 h-14 lg:h-16 px-3 sm:px-4 md:px-5 lg:px-7 ${
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
                    <div className="flex items-center gap-2 sm:gap-3 lg:gap-5 shrink-0">
                        {tenantPlan === 'free' && (
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
            {!isElectron && showDownloadBanner && !isPinned && !isTvMode && (
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
            
            <div className={`flex-1 flex flex-col min-h-0 relative ${theme === 'trello' ? 'bg-[#1d2d44]' : 'bg-slate-100 dark:bg-slate-900'} ${isPinned ? 'p-1' : isTvMode ? 'p-0.5' : 'p-2 md:p-3 lg:p-4'}`}>
                {children}
            </div>
            
            {isPinned && (
                <div className="flex-none bg-slate-800 border-t border-slate-700 h-14 flex items-center justify-between px-2 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">
                    {menuItems.map(item => (
                        <button 
                            key={item.id} 
                            onClick={() => onTabChange(item.id)} 
                            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${activeTab === item.id ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <item.icon size={22} />
                            <span className="text-xs font-bold mt-0.5">{item.label}</span>
                        </button>
                    ))}
                    <button 
                        onClick={() => setShowSearchModal(true)} 
                        className="flex flex-col items-center justify-center flex-1 h-full text-slate-500 hover:text-slate-300"
                    >
                        <Search size={22} />
                        <span className="text-xs font-bold mt-0.5">작업 검색</span>
                    </button>
                </div>
            )}
            
            <ChatWidget />
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
