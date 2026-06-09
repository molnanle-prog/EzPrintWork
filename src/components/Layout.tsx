import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Trello, Calendar, Users, FileText, Settings, Printer, Search, Minus, Square, X, ArrowDownToLine, Pin, Phone, Loader2, AlertTriangle, CheckCircle2, CloudOff, Eye, Crown, Zap, RefreshCw } from 'lucide-react';
import { UserProfile } from './auth/UserProfile';
import { ChatWidget } from './common/ChatWidget';
import { CompletedJobSearchModal } from './kanban/CompletedJobSearchModal';
import { JobDetailModal } from './common/JobDetailModal';
import { UpgradeModal } from './common/UpgradeModal';
import { db } from '../services/dataService';
import { Job, Staff } from '../types';
import { AdBanner } from './common/AdBanner';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const SyncStatusIndicator: React.FC<{ condensed?: boolean }> = ({ condensed }) => {
    const [status, setStatus] = useState(db.getSyncStatus());

    useEffect(() => {
        const unsubscribe = db.subscribe(() => {
            setStatus(db.getSyncStatus());
        });
        return () => unsubscribe();
    }, []);

    let icon, color, title;

    switch (status) {
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

    if (condensed) {
        return <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 ${color}`} title={title}>{icon}</div>;
    }

    return (
        <div className={`flex items-center gap-2 px-3.5 py-2 text-sm rounded-lg bg-slate-800 ${color}`} title={title}>
            {icon}
            <span className="font-bold">{title}</span>
        </div>
    );
};

const ReconnectOverlay: React.FC = () => {
    const [status, setStatus] = useState(db.getSyncStatus());
    const [isRetrying, setIsRetrying] = useState(false);
    const isConfigured = db.isDbPathConfigured();

    useEffect(() => {
        const unsubscribe = db.subscribe(() => {
            setStatus(db.getSyncStatus());
        });
        return () => unsubscribe();
    }, []);

    const handleRetry = async () => {
        setIsRetrying(true);
        try {
            await db.init();
            await db.setTenant('dev-tenant-id');
        } catch (e) {
            console.error("Manual retry failed:", e);
        } finally {
            setTimeout(() => setIsRetrying(false), 1000);
        }
    };

    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
    if (!isElectron) return null; // 웹 브라우저 환경에서는 전체 화면 차단 오버레이를 띄우지 않습니다.
    if (!isConfigured || status !== 'disconnected') return null;

    return (
        <div className="fixed inset-0 bg-slate-900/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md w-full border border-slate-200 dark:border-slate-700 text-center space-y-6">
                <div className="flex justify-center">
                    <div className="relative">
                        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/30 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 border border-rose-200/50">
                            <CloudOff size={32} className="animate-bounce" style={{ animationDuration: '2.5s' }} />
                        </div>
                        <div className="absolute top-0 right-0 w-4 h-4 bg-yellow-500 rounded-full border-2 border-white dark:border-slate-800 animate-ping" />
                    </div>
                </div>
                <div className="space-y-2">
                    <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">
                        네트워크(NAS) 연결이 끊겼습니다
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        설정된 공유 폴더(NAS) 경로에 접근할 수 없습니다.<br/>
                        네트워크 케이블이나 NAS의 전원 상태를 확인해 주세요.<br/>
                        연결이 복구되면 프로그램이 자동으로 재개됩니다.
                    </p>
                </div>
                <div className="flex flex-col gap-2 pt-2">
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 py-2.5 rounded-lg border border-blue-100 dark:border-blue-900/40">
                        <Loader2 size={14} className="animate-spin" />
                        5초 간격으로 자동 재연결을 시도하고 있습니다...
                    </div>
                    <button
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/50 text-white py-2.5 rounded-xl font-bold shadow-md text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    >
                        {isRetrying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        즉시 재연결 시도
                    </button>
                    <button
                        onClick={() => {
                            localStorage.removeItem('ezpw_custom_db_path');
                            window.location.reload();
                        }}
                        className="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95"
                    >
                        기본 저장 폴더로 리셋 (내 문서 경로로 초기화)
                    </button>
                </div>
            </div>
        </div>
    );
};

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const { tenantPlan } = useAuth();
  const { theme } = useTheme();
  const [isTvMode, setIsTvMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ezprint_tv_mode') === 'true';
    }
    return false;
  });
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
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
  const [companyName, setCompanyName] = useState('EzPrintWork');
  const [isElectron, setIsElectron] = useState(false);
  const [hasHelper, setHasHelper] = useState(false);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  const [showDownloadBanner, setShowDownloadBanner] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('hide-desktop-banner') && !localStorage.getItem('desktop-app-installed');
    }
    return true;
  });
  
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [appVersion, setAppVersion] = useState('2.0.0 (Cloud)');
  const sidebarRef = useRef<HTMLElement>(null);



  useEffect(() => {
    const isRunningInElectron = typeof window !== 'undefined' && !!window.electron;
    setIsElectron(isRunningInElectron);
    
    // 모바일/태블릿 감지
    const mobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobileOrTablet(!!mobile);

    if (isRunningInElectron) {
      localStorage.setItem('desktop-app-installed', 'true');
      setShowDownloadBanner(false);
      setHasHelper(true);
      return;
    }

    // 웹 브라우저: 로컬 헬퍼 서버가 실행 중인지 조용히 백그라운드 체크 진행
    const checkLocalHelper = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000); // 1초 타임아웃
        
        const response = await fetch('http://127.0.0.1:23230/get-documents-path', { 
          method: 'GET', 
          signal: controller.signal 
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          setHasHelper(true);
          localStorage.setItem('desktop-app-installed', 'true');
          setShowDownloadBanner(false);
        } else {
          setHasHelper(false);
        }
      } catch (error) {
        setHasHelper(false);
      }
    };

    checkLocalHelper();
  }, []);

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
    { id: 'quotes', label: '견적', icon: FileText },
  ];

  // Window Controls (Mock for Web)
  const togglePin = () => setIsPinned(!isPinned);
  const toggleOpacity = () => setOpacity(opacity === 1 ? 0.9 : 1);

  const containerClass = isPinned 
    ? "flex flex-col h-screen bg-slate-900/95 border-2 border-blue-500 overflow-hidden transition-all duration-300 shadow-2xl"
    : `flex flex-col h-screen ${theme === 'trello' ? 'bg-[#1d2d44]' : 'bg-slate-100 dark:bg-slate-900'} overflow-hidden transition-colors duration-200`;

  const sidebarClass = isPinned
    ? "hidden"
    : `hidden lg:flex flex-col bg-slate-900 dark:bg-slate-950 text-slate-300 shadow-xl z-50 transition-all duration-300 relative ${isSidebarExpanded ? 'w-72' : 'w-14'}`;

  return (
    <div className={containerClass} style={{ opacity: isPinned ? opacity : 1 }}>
      
      {/* Title Bar */}
      <div 
        className={`h-8 lg:h-10 flex justify-between items-center select-none z-[60] shrink-0 border-b border-slate-800 transition-colors ${isPinned ? 'bg-blue-900' : 'bg-slate-900 dark:bg-slate-950'} ${isTvMode ? 'hidden' : ''}`}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
          <div className="flex items-center gap-2 px-3 text-slate-300">
              <Printer size={isPinned ? 14 : 16} className={isPinned ? "text-yellow-400" : "text-blue-500"} />
              <span className={`font-bold tracking-wide ${isPinned ? 'text-[10px]' : 'text-xs'}`}>
                  {isPinned ? `EzPrint v${appVersion} (위젯)` : `EzPrintWork Cloud v${appVersion}`}
              </span>
          </div>
          
          {/* Windows-style Window Controls */}
          <div 
            className="flex items-center h-full text-slate-400" 
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
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
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
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
                ))}
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
                        <button 
                            onClick={() => {
                                const link = document.createElement('a');
                                link.href = '/downloads/EzPrintWork-Setup.zip';
                                link.setAttribute('download', 'EzPrintWork-Setup.zip');
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }} 
                            className={`flex items-center w-full px-3 py-3 rounded-xl transition-all text-slate-500 hover:text-white hover:bg-slate-800 ${!isSidebarExpanded ? 'justify-center' : 'gap-4'}`}
                            title={!isSidebarExpanded ? '데스크톱 앱 다운로드' : ''}
                        >
                            <ArrowDownToLine size={22} className="text-blue-500 hover:scale-110 transition-transform animate-bounce" style={{ animationDuration: '3s' }} />
                            {isSidebarExpanded && <span className="text-[15px] font-bold text-slate-300">데스크톱 앱 다운로드</span>}
                        </button>
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

        <main className="flex-1 flex flex-col h-full overflow-hidden relative">
            {!isPinned && !isTvMode && (
                <header className={`border-b flex items-center justify-between z-10 shrink-0 h-14 lg:h-16 px-4 md:px-5 lg:px-7 ${
                  theme === 'trello' 
                    ? 'bg-[#152238]/90 border-[#22334b]' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}>
                    <div className="flex items-baseline gap-3">
                        <h2 className={`font-bold text-lg md:text-xl ${
                          theme === 'trello' 
                            ? 'text-white' 
                            : 'text-slate-800 dark:text-slate-100'
                        }`}>
                            {activeTab === 'settings' ? '설정' : menuItems.find(m => m.id === activeTab)?.label}
                        </h2>
                    </div>
                    <div className="flex items-center gap-3 lg:gap-5">
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
                            onClick={() => setShowSearchModal(true)}
                            className={`rounded-full flex items-center gap-3 transition-colors px-6 h-12 shadow-sm ${
                              theme === 'trello' 
                                ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' 
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                            }`}
                        >
                            <Search size={22} />
                            <span className="text-base font-bold">등록 작업 검색</span>
                        </button>
                    </div>
                </header>
            )}
            
            {/* 데이터 폴더 미설정 시 경고 배너 (관리자 대상) */}
            {isElectron && !db.isDbPathConfigured() && !isPinned && !isTvMode && (
                <div className="bg-gradient-to-r from-amber-500 via-orange-600 to-amber-600 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-md shrink-0 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                            <AlertTriangle size={16} className="text-yellow-300 animate-bounce" />
                        </div>
                        <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3 text-left">
                            <span className="text-sm font-black tracking-tight">⚠️ 데이터 저장 폴더가 지정되지 않아 임시 읽기 전용 상태입니다.</span>
                            <span className="text-xs text-amber-100/90 font-medium">자료 유실 및 데이터 합치기 번거로움을 방지하기 위해 저장 폴더를 먼저 지정해 주세요.</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button 
                            onClick={() => onTabChange('settings')}
                            className="bg-white text-orange-700 hover:bg-orange-50 px-4 py-1.5 rounded-lg text-xs font-black shadow-sm transition-all active:scale-95 whitespace-nowrap"
                        >
                            폴더 설정하러 가기
                        </button>
                    </div>
                </div>
            )}

            {/* 웹 브라우저 환경에서 실제 로컬 헬퍼가 오프라인일 때의 경고 배너 (모바일/태블릿 기기는 제외) */}
            {!isElectron && !hasHelper && !isMobileOrTablet && !isPinned && !isTvMode && (
                <div className="bg-amber-500 text-slate-950 px-4 py-2.5 flex items-center justify-between gap-3 shadow-md shrink-0 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-950/20 flex items-center justify-center shrink-0">
                            <AlertTriangle size={16} className="text-slate-950 animate-bounce" />
                        </div>
                        <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3 text-left">
                            <span className="text-sm font-extrabold tracking-tight">⚠️ 로컬 연동 도우미(헬퍼) 프로그램이 작동하고 있지 않습니다!</span>
                            <span className="text-xs text-slate-900 font-medium">회사 로컬 폴더(NAS) 연동을 사용하시려면 도우미 설치파일을 다운로드해 실행해 주세요.</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button 
                            onClick={() => {
                                const link = document.createElement('a');
                                link.href = '/downloads/EzPrintWork-Setup.zip';
                                link.setAttribute('download', 'EzPrintWork-Setup.zip');
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }}
                            className="bg-slate-950 text-white hover:bg-slate-900 px-4 py-1.5 rounded-lg text-xs font-black shadow-sm transition-all active:scale-95 whitespace-nowrap"
                        >
                            도우미 다운로드
                        </button>
                    </div>
                </div>
            )}

            {/* 데스크톱 앱 다운로드 유도 프리미엄 배너 (웹 브라우저 접속 시 상단 노출, 모바일/태블릿 제외) */}
            {!isElectron && showDownloadBanner && !isMobileOrTablet && !isPinned && !isTvMode && (
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-md shrink-0 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                            <Zap size={16} className="fill-white text-yellow-300 animate-pulse" />
                        </div>
                        <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3 text-left">
                            <span className="text-sm font-black tracking-tight">EzPrintWork 데스크톱 전용 앱으로 100% 성능을 누리세요!</span>
                            <span className="text-xs text-blue-100/90 font-medium">바탕화면 바로가기 및 파일 탐색기(돋보기) 자동 연동 등 모든 로컬 연동이 가능해집니다.</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button 
                            onClick={() => {
                                const link = document.createElement('a');
                                link.href = '/downloads/EzPrintWork-Setup.zip';
                                link.setAttribute('download', 'EzPrintWork-Setup.zip');
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }}
                            className="bg-white text-blue-700 hover:bg-blue-50 px-3.5 py-1.5 rounded-lg text-xs font-black shadow-sm transition-all active:scale-95 whitespace-nowrap"
                        >
                            앱 다운로드 및 설치
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
        <CompletedJobSearchModal onClose={() => setShowSearchModal(false)} onSelectJob={(job) => setSelectedSearchJob(job)} />
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
                onClose={() => setSelectedSearchJob(null)}
                onUpdate={handleJobUpdate}
                onNavigateToQuote={() => onTabChange('quotes')}
            />
        </div>
      )}
      <ReconnectOverlay />
    </div>
  );
};
