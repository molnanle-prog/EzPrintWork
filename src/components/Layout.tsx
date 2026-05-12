
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Trello, Calendar, Users, FileText, Settings, Printer, Search, Minus, Square, X, ArrowDownToLine, Pin, Phone, Loader2, AlertTriangle, CheckCircle2, CloudOff, Eye } from 'lucide-react';
import { UserProfile } from './auth/UserProfile';
import { ChatWidget } from './common/ChatWidget';
import { CompletedJobSearchModal } from './kanban/CompletedJobSearchModal';
import { JobDetailModal } from './common/JobDetailModal';
import { db, SyncStatus } from '../services/dataService';
import { Job, Staff } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const SyncStatusIndicator: React.FC<{ condensed?: boolean }> = ({ condensed }) => {
    const [status, setStatus] = useState<SyncStatus>(db.getSyncStatus());
    const [lastUpdated, setLastUpdated] = useState<number>(db.getLastUpdated());

    useEffect(() => {
        const handleUpdate = () => {
            setStatus(db.getSyncStatus());
            setLastUpdated(db.getLastUpdated());
        };
        const unsubscribe = db.subscribe(handleUpdate);
        return () => unsubscribe();
    }, []);

    const isNasEnabled = db.getNasConfig().isEnabled;
    let icon, color, title;

    switch (status) {
        case 'syncing':
            icon = <Loader2 size={14} className="animate-spin" />;
            color = 'text-blue-400';
            title = '동기화 중...';
            break;
        case 'error':
            icon = <AlertTriangle size={14} />;
            color = 'text-red-400';
            title = '동기화 오류';
            break;
        case 'disconnected':
            icon = <CloudOff size={14} />;
            color = 'text-slate-400';
            title = '서버 연결 끊김';
            break;
        case 'synced':
        default:
            icon = <CheckCircle2 size={14} />;
            color = 'text-emerald-400';
            title = `저장 완료 (${new Date(lastUpdated).toLocaleTimeString()})`;
            break;
    }

    if (condensed) {
        return <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 ${color}`} title={title}>{icon}</div>;
    }

    return (
        <div className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-slate-800 ${color}`} title={title}>
            {icon}
            <span className="font-medium">{title}</span>
        </div>
    );
};

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedSearchJob, setSelectedSearchJob] = useState<Job | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [companyName, setCompanyName] = useState('EzPrintWork');
  const [isElectron, setIsElectron] = useState(false);
  
  // Widget Mode States
  const [isPinned, setIsPinned] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [appVersion, setAppVersion] = useState(import.meta.env.VITE_APP_VERSION || '1.2.0');

  useEffect(() => {
    setStaff(db.getStaff());
    setCompanyName(db.getCompanyInfo().name);
    setIsElectron(!!window.electron);

    if (window.electron) {
        window.electron.getAppVersion().then(v => setAppVersion(v));
    }

    const unsubscribe = db.subscribe(() => {
        setCompanyName(db.getCompanyInfo().name);
        setStaff(db.getStaff()); 
    });
    return () => unsubscribe();
  }, []);

  const handleJobUpdate = (updatedJob: Job) => {
      const allJobs = db.getAllJobs();
      const newJobs = allJobs.map(j => j.id === updatedJob.id ? updatedJob : j);
      db.saveJobs(newJobs);
      setSelectedSearchJob(null);
  };

  const menuItems = [
    { id: 'dashboard', label: '상황판', icon: LayoutDashboard },
    { id: 'kanban', label: '작업진행', icon: Trello },
    { id: 'calendar', label: '달력', icon: Calendar },
    { id: 'quotes', label: '견적', icon: FileText },
  ];

  // Window Controls
  const handleMinimize = () => window.electron?.minimize();
  const handleMaximize = () => window.electron?.maximize();
  const handleClose = () => window.electron?.close();
  const handleLower = () => window.electron?.lower();
  
  const togglePin = () => {
    const newState = !isPinned;
    setIsPinned(newState);
    if (window.electron) {
        window.electron.toggleAlwaysOnTop(newState);
        // Widget Mode: Resize window to mobile-like vertical layout
        if (newState) {
            window.electron.setSize(400, 700); 
        } else {
            // Restore to standard desktop size
            window.electron.setSize(1400, 900);
        }
    }
  };

  const toggleOpacity = () => {
      const newOpacity = opacity === 1 ? 0.9 : 1;
      setOpacity(newOpacity);
  };

  // Pinned mode classes
  const containerClass = isPinned 
    ? "flex flex-col h-screen bg-slate-900/95 border-2 border-blue-500 overflow-hidden transition-all duration-300 shadow-2xl"
    : "flex flex-col h-screen bg-slate-100 dark:bg-slate-900 overflow-hidden transition-colors duration-200";

  // Hide sidebar when pinned (too narrow)
  const sidebarClass = isPinned
    ? "hidden"
    : "hidden lg:flex flex-col bg-slate-900 dark:bg-slate-950 text-slate-300 shadow-xl z-20 transition-all duration-300 w-72";

  return (
    <div className={containerClass} style={{ opacity: isPinned ? opacity : 1 }}>
      
      {/* Title Bar */}
      <div className={`h-8 lg:h-10 flex justify-between items-center select-none z-50 shrink-0 border-b border-slate-800 transition-colors ${isPinned ? 'bg-blue-900' : 'bg-slate-900 dark:bg-slate-950'}`} style={{ WebkitAppRegion: isElectron ? 'drag' : 'no-drag' } as any}>
          <div className="flex items-center gap-2 px-3 text-slate-300">
              <Printer size={isPinned ? 14 : 16} className={isPinned ? "text-yellow-400" : "text-blue-500"} />
              <span className={`font-bold tracking-wide ${isPinned ? 'text-[10px]' : 'text-xs'}`}>
                  {isPinned ? `EzPrint 버젼 ${appVersion} (위젯)` : `EzPrintWork 버젼 ${appVersion}`}
              </span>
          </div>

          {isElectron && (
            <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <button onClick={toggleOpacity} className={`w-8 lg:w-10 h-full flex items-center justify-center hover:text-white ${isPinned ? 'text-blue-200' : 'text-slate-400'}`} title="투명도"><Eye size={14}/></button>
                <button onClick={togglePin} className={`w-8 lg:w-12 h-full flex items-center justify-center transition-colors ${isPinned ? 'text-yellow-400 bg-blue-800 hover:bg-blue-700' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`} title={isPinned ? "일반 모드로 복귀" : "바탕화면 고정 (위젯 모드)"}><Pin size={16} className={isPinned ? "fill-current" : ""} /></button>
                {!isPinned && <button onClick={handleLower} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white"><ArrowDownToLine size={16}/></button>}
                <button onClick={handleMinimize} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white"><Minus size={16}/></button>
                {!isPinned && <button onClick={handleMaximize} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white"><Square size={14}/></button>}
                <button onClick={handleClose} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-red-600 hover:text-white"><X size={18}/></button>
            </div>
          )}
      </div>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar (Desktop Only) */}
        <aside className={sidebarClass}>
            <div className="p-6 pb-2">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <h1 className="text-xl font-bold text-white truncate">{companyName}</h1>
                    <p className="text-xs text-slate-400 mt-1">통합 관리 시스템 버젼 {appVersion}</p>
                </div>
            </div>
            
            <nav className="flex-1 space-y-1 py-4 px-3">
            {menuItems.map((item) => (
                <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center w-full space-x-3 px-4 py-3 rounded-lg transition-all ${
                    activeTab === item.id ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-800 hover:text-white text-slate-400'
                }`}
                >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
                </button>
            ))}
            </nav>

            <div className="px-4 py-2 mb-2">
                <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/60">
                    <h3 className="text-sm font-bold text-slate-300 mb-2 flex items-center gap-2"><Phone size={14} className="text-blue-500"/> 내선 번호</h3>
                    <div className="space-y-1 max-h-[150px] overflow-y-auto custom-scrollbar">
                        {staff.filter(s => s.active && s.extensionNumber).map(s => (
                            <div key={s.id} className="flex justify-between text-xs py-1 border-b border-slate-700/50 last:border-0">
                                <span className="text-slate-400">{s.name}</span>
                                <span className="text-blue-400 font-bold font-mono">{s.extensionNumber}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="border-t border-slate-800 p-4 space-y-3">
              <SyncStatusIndicator />
              <UserProfile />
              <button onClick={() => onTabChange('settings')} className="flex items-center w-full space-x-3 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                  <Settings size={18} />
                  <span>설정</span>
              </button>
            </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative">
            {/* Top Bar (Search) - Only show in normal mode */}
            {!isPinned && (
                <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between z-10 shrink-0 h-14 lg:h-16 px-4 lg:px-8">
                    <div className="flex items-baseline gap-3">
                        <h2 className="font-bold text-slate-800 dark:text-slate-100 text-lg">
                            {activeTab === 'settings' ? '설정' : menuItems.find(m => m.id === activeTab)?.label}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setShowSearchModal(true)}
                            className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-full flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors px-3 py-1.5"
                        >
                            <Search size={16} />
                            <span className="text-sm font-medium">통합 검색</span>
                        </button>
                    </div>
                </header>
            )}
            
            {/* Main Content */}
            <div className={`flex-1 overflow-auto relative bg-slate-100 dark:bg-slate-900 ${isPinned ? 'p-1' : 'p-4 lg:p-6'}`}>
                {children}
            </div>
            
            {/* Pinned Mode Bottom Nav */}
            {isPinned && (
                <div className="flex-none bg-slate-800 border-t border-slate-700 h-12 flex items-center justify-between px-2 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">
                    {menuItems.map(item => (
                        <button 
                            key={item.id} 
                            onClick={() => onTabChange(item.id)} 
                            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${activeTab === item.id ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <item.icon size={18} />
                            <span className="text-[9px] font-bold mt-0.5">{item.label}</span>
                        </button>
                    ))}
                    <button 
                        onClick={() => setShowSearchModal(true)} 
                        className="flex flex-col items-center justify-center flex-1 h-full text-slate-500 hover:text-slate-300"
                    >
                        <Search size={18} />
                        <span className="text-[9px] font-bold mt-0.5">검색</span>
                    </button>
                </div>
            )}
            
            <ChatWidget />
        </main>
      </div>

      {showSearchModal && (
        <CompletedJobSearchModal onClose={() => setShowSearchModal(false)} onSelectJob={(job) => setSelectedSearchJob(job)} />
      )}

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
