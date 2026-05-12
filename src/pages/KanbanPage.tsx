import React, { useState, useEffect } from 'react';
import { db } from '../services/dataService';
import { Printer, Clock, CheckCircle2, AlertCircle, Plus, MoreVertical, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

interface Task {
    id: string;
    title: string;
    customerName: string;
    status: 'pending' | 'processing' | 'completed' | 'urgent';
    dueDate: string;
    priority: 'low' | 'medium' | 'high';
}

export const KanbanPage: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTasks = async () => {
            try {
                // 실제 서비스에서는 db.getOrders() 등을 호출
                const data = await db.getActionLogs(); // 임시로 로그 데이터를 가져와서 형태만 맞춤
                // 실제 구현 시에는 별도의 tasks 컬렉션 사용
                const mockTasks: Task[] = [
                    { id: '1', title: '명함 200매 인쇄', customerName: '삼성전자', status: 'pending', dueDate: '2026-05-15', priority: 'high' },
                    { id: '2', title: 'A4 전단지 1000매', customerName: 'LG화학', status: 'processing', dueDate: '2026-05-14', priority: 'medium' },
                    { id: '3', title: '대봉투 제작', customerName: '현대자동차', status: 'completed', dueDate: '2026-05-12', priority: 'low' },
                    { id: '4', title: '카탈로그 50부', customerName: 'SK하이닉스', status: 'urgent', dueDate: '2026-05-13', priority: 'high' },
                ];
                setTasks(mockTasks);
            } catch (error) {
                toast.error('데이터를 불러오지 못했습니다.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchTasks();
    }, []);

    const Column = ({ title, status, icon, color }: any) => (
        <div className="flex-1 min-w-[320px] bg-slate-900/30 rounded-[2rem] border border-slate-800/50 flex flex-col p-5 space-y-4">
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${color} bg-opacity-10 text-opacity-100 text-current`}>
                        {icon}
                    </div>
                    <h3 className="font-bold text-lg text-slate-200">{title}</h3>
                    <span className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">
                        {tasks.filter(t => t.status === status).length}
                    </span>
                </div>
                <button className="text-slate-500 hover:text-white"><Plus size={20} /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-1">
                {tasks.filter(t => t.status === status).map(task => (
                    <div key={task.id} className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-2xl hover:border-blue-500/50 transition-all cursor-pointer group shadow-lg hover:shadow-blue-500/5">
                        <div className="flex justify-between items-start mb-3">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                task.priority === 'high' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                            }`}>
                                {task.priority} Priority
                            </span>
                            <button className="text-slate-600 group-hover:text-slate-400"><MoreVertical size={16} /></button>
                        </div>
                        <h4 className="font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{task.title}</h4>
                        <p className="text-slate-400 text-sm mb-4">{task.customerName}</p>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-slate-700/50">
                            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                                <Clock size={14} />
                                <span>{task.dueDate}</span>
                            </div>
                            <div className="flex -space-x-2">
                                <div className="w-6 h-6 rounded-full bg-blue-600 border-2 border-slate-800 flex items-center justify-center text-[10px] font-bold">JD</div>
                                <div className="w-6 h-6 rounded-full bg-emerald-600 border-2 border-slate-800 flex items-center justify-center text-[10px] font-bold">KS</div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter">작업 관리 <span className="text-blue-500">보드</span></h2>
                    <p className="text-slate-400 font-medium">실시간 인쇄 공정 현황을 드래그 앤 드롭으로 관리하세요.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                        <input 
                            type="text" 
                            placeholder="작업 제목, 고객명 검색..." 
                            className="bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                        />
                    </div>
                    <button className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
                        <Filter size={20} />
                    </button>
                    <button className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2">
                        <Plus size={20} /> 새 작업 등록
                    </button>
                </div>
            </div>

            {/* Kanban Grid */}
            <div className="flex-1 flex gap-6 overflow-x-auto pb-4 custom-scrollbar">
                <Column title="대기 중" status="pending" icon={<Clock size={20} />} color="text-slate-400" />
                <Column title="진행 중" status="processing" icon={<Printer size={20} />} color="text-blue-500" />
                <Column title="긴급/지연" status="urgent" icon={<AlertCircle size={20} />} color="text-red-500" />
                <Column title="완료" status="completed" icon={<CheckCircle2 size={20} />} color="text-emerald-500" />
            </div>
        </div>
    );
};
