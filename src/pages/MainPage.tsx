import React, { useState, useEffect } from 'react';
import { 
    LayoutDashboard, Users, Settings, LogOut, Printer, Activity, 
    FileDown, FileUp, Bell, Search, Globe, ShieldCheck, ChevronRight,
    Calendar as CalendarIcon, Briefcase
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../services/dataService';
import { toast, Toaster } from 'sonner';

// --- Real Original Components ---
import { Dashboard } from '../components/dashboard/Dashboard';
import { KanbanBoard } from '../components/kanban/KanbanBoard';
import { CalendarView } from '../components/calendar/CalendarView';
import { QuoteManager } from '../components/quotes/QuoteManager';
import { SettingsView } from '../components/settings/SettingsView';
import { StaffManager } from '../components/staff/StaffManager';
import { ClientManager } from '../components/settings/ClientManager';
import { PaperManager } from '../components/settings/PaperManager';
import { ActionLogPage } from './ActionLogPage';

type ViewType = 'dashboard' | 'kanban' | 'calendar' | 'logs' | 'customers' | 'quotes' | 'staff' | 'inventory' | 'settings';

export const MainPage: React.FC = () => {
    const { currentUser, logout, tenantPlan } = useAuth();
    const [currentView, setCurrentView] = useState<ViewType>('dashboard');
    const [stats, setStats] = useState({
        todayJobs: 0,
        totalCustomers: 0,
        pendingOrders: 0
    });

    useEffect(() => {
        const updateStats = () => {
            setStats({
                todayJobs: db.getAllJobs().length,
                totalCustomers: db.getClients().length,
                pendingOrders: db.getActiveJobs().length
            });
        };
        updateStats();
        const unsub = db.subscribe(updateStats);
        return () => unsub();
    }, []);

    const handleNavigateToQuote = (quoteId?: string) => {
        setCurrentView('quotes');
    };

    const NavItem = ({ icon, label, id, sub = false }: { icon: React.ReactNode, label: string, id: ViewType, sub?: boolean }) => (
        <button 
            onClick={() => setCurrentView(id)}
            className={`w-full flex items-center justify-between group px-4 py-3 rounded-2xl transition-all duration-300 ${
                currentView === id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            } ${sub ? 'py-2 px-3 text-sm' : ''}`}
        >
            <div className="flex items-center gap-3">
                <div className={`${currentView === id ? 'text-white' : 'text-slate-500 group-hover:text-blue-400'} transition-colors`}>
                    {icon}
                </div>
                <span className="font-bold tracking-tight">{label}</span>
            </div>
            {currentView === id && <ChevronRight size={14} className="opacity-50" />}
        </button>
    );

    const renderContent = () => {
        switch (currentView) {
            case 'kanban': return <KanbanBoard onNavigateToQuote={handleNavigateToQuote} />;
            case 'calendar': return <CalendarView onNavigateToQuote={handleNavigateToQuote} />;
            case 'customers': return <ClientManager />;
            case 'quotes': return <QuoteManager />;
            case 'staff': return <StaffManager />;
            case 'inventory': return <PaperManager />;
            case 'settings': return <SettingsView />;
            case 'logs': return <ActionLogPage />;
            case 'dashboard':
            default:
                return (
                    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        {/* Header Section */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-1">
                                <h2 className="text-4xl font-black text-white tracking-tighter">
                                    반갑습니다, {currentUser?.displayName || '사용자'}님!
                                </h2>
                                <p className="text-slate-400 font-medium text-lg">인쇄소 업무 현황을 한눈에 관리하세요.</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-2xl shadow-xl">
                                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                    <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Cloud Database Connected</span>
                                </div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard title="오늘의 작업" value={`${stats.todayJobs}건`} trend="+20%" icon={<Printer size={24} />} color="blue" />
                            <StatCard title="등록된 고객" value={`${stats.totalCustomers}명`} trend="+5%" icon={<Users size={24} />} color="emerald" />
                            <StatCard title="진행 중 주문" value={`${stats.pendingOrders}건`} trend="Active" icon={<Activity size={24} />} color="rose" />
                            <StatCard title="시스템 상태" value="안정" trend="100%" icon={<ShieldCheck size={24} />} color="amber" />
                        </div>

                        <div className="grid lg:grid-cols-3 gap-10">
                            {/* Dashboard Component (Original) */}
                            <div className="lg:col-span-2 bg-slate-900/30 border border-slate-800/50 rounded-[3rem] p-8 overflow-hidden min-h-[500px]">
                                <Dashboard onNavigateToQuote={handleNavigateToQuote} />
                            </div>

                            {/* Shortcut Section */}
                            <div className="space-y-6">
                                <h3 className="text-2xl font-black text-white tracking-tight">빠른 실행</h3>
                                <div className="grid gap-4">
                                    <button onClick={() => setCurrentView('kanban')} className="group flex items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl hover:border-blue-500/50 transition-all">
                                        <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                            <Printer size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-white">작업 관리 보드</p>
                                            <p className="text-slate-500 text-xs italic">실시간 공정 관리</p>
                                        </div>
                                    </button>
                                    <button onClick={() => setCurrentView('calendar')} className="group flex items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl hover:border-emerald-500/50 transition-all">
                                        <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-500 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                                            <CalendarIcon size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-white">작업 달력</p>
                                            <p className="text-slate-500 text-xs italic">월간 일정 확인</p>
                                        </div>
                                    </button>
                                    <button onClick={() => setCurrentView('quotes')} className="group flex items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl hover:border-amber-500/50 transition-all">
                                        <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 group-hover:bg-amber-600 group-hover:text-white transition-all">
                                            <FileDown size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-white">견적서 관리</p>
                                            <p className="text-slate-500 text-xs italic">신규 견적 발행</p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="flex h-screen w-screen bg-slate-950 text-slate-200 font-sans overflow-hidden p-2 md:p-4 gap-4 md:gap-6">
            {/* Sidebar */}
            <aside className="w-20 md:w-72 bg-slate-900/40 backdrop-blur-3xl border border-slate-800/50 rounded-[3rem] flex flex-col p-6 shadow-2xl relative z-20 shrink-0">
                <div className="flex items-center gap-3 px-2 mb-10">
                    <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                        <Printer size={20} className="text-white" />
                    </div>
                    <span className="hidden md:block font-black text-2xl tracking-tighter text-white">EzPrintWork</span>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto custom-scrollbar pr-2">
                    <NavItem icon={<LayoutDashboard size={20} />} label="대시보드" id="dashboard" />
                    <NavItem icon={<Printer size={20} />} label="작업 관리 (칸반)" id="kanban" />
                    <div className="py-2 ml-4 border-l border-slate-800 my-2 space-y-1">
                        <NavItem icon={<CalendarIcon size={18} />} label="달력 보기" id="calendar" sub />
                        <NavItem icon={<Activity size={18} />} label="작업 기록" id="logs" sub />
                    </div>
                    <NavItem icon={<Users size={20} />} label="고객 관리" id="customers" />
                    <NavItem icon={<FileDown size={20} />} label="견적서 관리" id="quotes" />
                    <NavItem icon={<Briefcase size={20} />} label="직원 관리" id="staff" />
                    <NavItem icon={<FileUp size={20} />} label="종이/재고 관리" id="inventory" />
                    <NavItem icon={<Settings size={20} />} label="시스템 설정" id="settings" />
                </nav>

                <div className="mt-6 pt-6 border-t border-slate-800 space-y-4">
                    <button 
                        onClick={logout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all font-bold"
                    >
                        <LogOut size={20} />
                        <span className="hidden md:block">로그아웃</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 relative overflow-hidden bg-slate-900/20 border border-slate-800/50 rounded-[3rem] flex flex-col shadow-inner">
                {/* Top Utility Bar */}
                <header className="h-20 flex items-center justify-between px-10 border-b border-slate-800/50 shrink-0">
                    <div className="flex items-center gap-6 flex-1 max-w-xl">
                        <div className="relative w-full group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                            <input 
                                type="text" 
                                placeholder="통합 검색..." 
                                className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-6 ml-6">
                        <div className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-2xl">
                            <div className="px-2 py-0.5 bg-blue-600/10 text-blue-500 text-[10px] font-black uppercase tracking-widest rounded border border-blue-500/20">
                                {tenantPlan || 'Free Plan'}
                            </div>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-xs shadow-lg">
                                {currentUser?.displayName?.[0] || 'U'}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content Container */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
                    {renderContent()}
                </div>
            </main>
            <Toaster richColors position="top-right" />
        </div>
    );
};

const StatCard = ({ title, value, trend, icon, color }: any) => {
    const colorClasses: any = {
        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20 shadow-blue-500/10',
        emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/10',
        rose: 'text-rose-500 bg-rose-500/10 border-rose-500/20 shadow-rose-500/10',
        amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20 shadow-amber-500/10',
    };

    return (
        <div className={`bg-slate-900 border ${colorClasses[color].split(' ')[2]} p-8 rounded-[2.5rem] shadow-2xl space-y-4 hover:scale-[1.02] transition-all cursor-pointer group relative overflow-hidden`}>
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-current opacity-[0.03] rounded-full group-hover:scale-150 transition-transform"></div>
            <div className="flex items-center justify-between relative z-10">
                <div className={`p-4 rounded-2xl ${colorClasses[color].split(' ').slice(0,2).join(' ')} group-hover:scale-110 transition-transform`}>
                    {icon}
                </div>
                <span className={`text-xs font-black px-2 py-1 rounded-lg ${colorClasses[color].split(' ').slice(0,2).join(' ')}`}>
                    {trend}
                </span>
            </div>
            <div className="relative z-10">
                <p className="text-slate-500 font-bold text-sm uppercase tracking-widest">{title}</p>
                <p className="text-4xl font-black text-white mt-1 tracking-tighter">{value}</p>
            </div>
        </div>
    );
};
