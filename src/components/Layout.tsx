import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Trello, Calendar, Users, FileText, Settings, Printer, Search, Minus, Square, X, ArrowDownToLine, Pin, Phone, Loader2, AlertTriangle, CheckCircle2, CloudOff, Eye, Crown, Zap } from 'lucide-react';
import { UserProfile } from './auth/UserProfile';
import { ChatWidget } from './common/ChatWidget';
import { CompletedJobSearchModal } from './kanban/CompletedJobSearchModal';
import { JobDetailModal } from './common/JobDetailModal';
import { UpgradeModal } from './common/UpgradeModal';
import { db } from '../services/dataService';
import { Job, Staff } from '../types';
import { AdBanner } from './common/AdBanner';
import { useAuth } from '../contexts/AuthContext';

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
            title = '클라우드 동기화 완료';
            break;
        case 'disconnected':
        default:
            icon = <CloudOff size={14} />;
            color = 'text-slate-400';
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

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const { tenantPlan } = useAuth();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedSearchJob, setSelectedSearchJob] = useState<Job | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [companyName, setCompanyName] = useState('EzPrintWork');
  const [isElectron, setIsElectron] = useState(false);
  
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [appVersion, setAppVersion] = useState('2.0.0 (Cloud)');

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
    : "flex flex-col h-screen bg-slate-100 dark:bg-slate-900 overflow-hidden transition-colors duration-200";

  const sidebarClass = isPinned
    ? "hidden"
    : `hidden lg:flex flex-col bg-slate-900 dark:bg-slate-950 text-slate-300 shadow-xl z-50 transition-all duration-300 relative ${isSidebarExpanded ? 'w-72' : 'w-14'}`;

  return (
    <div className={containerClass} style={{ opacity: isPinned ? opacity : 1 }}>
      
      {/* Title Bar */}
      <div className={`h-8 lg:h-10 flex justify-between items-center select-none z-[60] shrink-0 border-b border-slate-800 transition-colors ${isPinned ? 'bg-blue-900' : 'bg-slate-900 dark:bg-slate-950'}`}>
          <div className="flex items-center gap-2 px-3 text-slate-300">
              <Printer size={isPinned ? 14 : 16} className={isPinned ? "text-yellow-400" : "text-blue-500"} />
              <span className={`font-bold tracking-wide ${isPinned ? 'text-[10px]' : 'text-xs'}`}>
                  {isPinned ? `EzPrint v${appVersion} (위젯)` : `EzPrintWork Cloud v${appVersion}`}
              </span>
          </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - Hover based expansion */}
        {!isPinned && (
          <aside 
              className={`hidden lg:flex flex-col bg-slate-900 dark:bg-slate-950 text-slate-300 shadow-2xl transition-all duration-300 ease-out shrink-0 z-50 border-r border-slate-800 ${isSidebarExpanded ? 'w-72' : 'w-14'}`}
              onMouseEnter={() => setIsSidebarExpanded(true)}
              onMouseLeave={() => setIsSidebarExpanded(false)}
          >
            {/* The actual sidebar content */}
            <div className="flex flex-col h-full overflow-hidden">
                {/* Logo Section */}
                <div className="h-24 lg:h-28 flex-none relative overflow-hidden">
                    <div className={`absolute inset-0 p-4 transition-all duration-500 ${isSidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10 pointer-events-none'}`}>
                        <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/60 h-full flex flex-col justify-center backdrop-blur-md">
                            <h1 className="text-xl font-black text-white tracking-tighter leading-tight">{companyName}</h1>
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-[0.2em]">Enterprise Cloud</p>
                            </div>
                        </div>
                    </div>
                    <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${!isSidebarExpanded ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 rotate-90 pointer-events-none'}`}>
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
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

                    {/* Download Shortcut Button */}
                    <button 
                        onClick={() => {
                            const shortcutContent = `[InternetShortcut]
URL=https://ez-hub.kr/ezpw/
IDList=
HotKey=0
IconIndex=0
IconFile=https://ez-hub.kr/favicon.ico
`;
                            const blob = new Blob([shortcutContent], { type: 'text/plain;charset=utf-8' });
                            const url = window.URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = 'EzPrintWork 바로가기.url';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            window.URL.revokeObjectURL(url);
                            alert('바탕화면 아이콘 파일이 다운로드되었습니다. 다운로드 폴더의 파일을 컴퓨터 바탕화면에 끌어다(드래그) 놓고 사용하세요!');
                        }} 
                        className={`flex items-center w-full px-3 py-3 rounded-xl transition-all text-slate-500 hover:text-white hover:bg-slate-800 ${!isSidebarExpanded ? 'justify-center' : 'gap-4'}`}
                        title={!isSidebarExpanded ? '바탕화면에 아이콘 만들기' : ''}
                    >
                        <ArrowDownToLine size={22} className="text-blue-500 hover:scale-110 transition-transform" />
                        {isSidebarExpanded && <span className="text-[15px] font-bold text-slate-300">바탕화면에 아이콘 만들기</span>}
                    </button>

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
            {!isPinned && (
                <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between z-10 shrink-0 h-14 lg:h-16 px-4 md:px-5 lg:px-7">
                    <div className="flex items-baseline gap-3">
                        <h2 className="font-bold text-slate-800 dark:text-slate-100 text-lg md:text-xl">
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
                            className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-full flex items-center gap-3 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors px-6 h-12 shadow-sm"
                        >
                            <Search size={22} />
                            <span className="text-base font-bold">등록 작업 검색</span>
                        </button>
                    </div>
                </header>
            )}
            
            <div className={`flex-1 flex flex-col min-h-0 relative bg-slate-100 dark:bg-slate-900 ${isPinned ? 'p-1' : 'p-2 md:p-3 lg:p-4'}`}>
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
    </div>
  );
};
