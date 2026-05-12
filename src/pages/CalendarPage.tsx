import React, { useState, useEffect } from 'react';
import { db } from '../services/dataService';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';

export const CalendarPage: React.FC = () => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [jobs, setJobs] = useState<any[]>([]);

    useEffect(() => {
        setJobs(db.getAllJobs());
    }, []);

    const renderHeader = () => {
        return (
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tighter flex items-center gap-3">
                        <CalendarIcon className="text-blue-500" size={32} />
                        작업 일정 <span className="text-blue-500">달력</span>
                    </h2>
                    <p className="text-slate-400 font-medium">월간 작업 현황과 납기일을 한눈에 확인하세요.</p>
                </div>
                <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-2 rounded-2xl">
                    <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all">
                        <ChevronLeft size={24} />
                    </button>
                    <span className="text-xl font-bold text-white min-w-[140px] text-center">
                        {format(currentMonth, 'yyyy년 MM월', { locale: ko })}
                    </span>
                    <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all">
                        <ChevronRight size={24} />
                    </button>
                </div>
            </div>
        );
    };

    const renderDays = () => {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return (
            <div className="grid grid-cols-7 mb-2">
                {days.map((day, i) => (
                    <div key={i} className={`text-center font-bold text-sm py-3 ${day === '일' ? 'text-red-500' : day === '토' ? 'text-blue-500' : 'text-slate-500'}`}>
                        {day}
                    </div>
                ))}
            </div>
        );
    };

    const renderCells = () => {
        const monthStart = startOfMonth(currentMonth);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);

        const rows = [];
        let days = [];
        let day = startDate;
        let formattedDate = "";

        while (day <= endDate) {
            for (let i = 0; i < 7; i++) {
                formattedDate = format(day, "d");
                const cloneDay = day;
                const dayJobs = jobs.filter(j => isSameDay(new Date(j.createdAt), cloneDay));

                days.push(
                    <div
                        key={day.toString()}
                        className={`min-h-[140px] border border-slate-800/50 p-3 transition-all relative group cursor-pointer ${
                            !isSameMonth(day, monthStart) ? "bg-slate-950/30 text-slate-700" : "bg-slate-900/20 text-slate-300"
                        } ${isSameDay(day, selectedDate) ? "bg-blue-600/10 border-blue-500/50" : "hover:bg-slate-800/40"}`}
                        onClick={() => setSelectedDate(cloneDay)}
                    >
                        <span className={`text-sm font-bold ${isSameDay(day, new Date()) ? "bg-blue-600 text-white w-7 h-7 flex items-center justify-center rounded-full" : ""}`}>
                            {formattedDate}
                        </span>
                        
                        <div className="mt-2 space-y-1">
                            {dayJobs.slice(0, 3).map((job, idx) => (
                                <div key={idx} className="text-[10px] bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-slate-300 truncate font-medium flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                    {job.title}
                                </div>
                            ))}
                            {dayJobs.length > 3 && (
                                <div className="text-[9px] text-slate-500 font-bold pl-1">
                                    외 {dayJobs.length - 3}건 더보기...
                                </div>
                            )}
                        </div>

                        {dayJobs.length > 0 && (
                            <div className="absolute top-3 right-3 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        )}
                    </div>
                );
                day = addDays(day, 1);
            }
            rows.push(
                <div className="grid grid-cols-7" key={day.toString()}>
                    {days}
                </div>
            );
            days = [];
        }
        return <div className="border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">{rows}</div>;
    };

    return (
        <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-700">
            {renderHeader()}
            <div className="flex-1 bg-slate-900/20 p-6 rounded-[3rem] border border-slate-800/50 overflow-y-auto custom-scrollbar">
                {renderDays()}
                {renderCells()}
            </div>
            
            {/* Selected Date Detail Panel (Floating) */}
            <div className="mt-8 bg-slate-900 border border-slate-800 p-6 rounded-3xl flex items-center justify-between">
                <div className="flex items-center gap-6">
                    <div className="text-center px-6 py-3 bg-blue-600/10 rounded-2xl border border-blue-500/20">
                        <p className="text-blue-500 text-xs font-black uppercase tracking-widest">{format(selectedDate, 'MMM', { locale: ko })}</p>
                        <p className="text-3xl font-black text-white leading-none mt-1">{format(selectedDate, 'dd')}</p>
                    </div>
                    <div>
                        <h4 className="text-xl font-bold text-white">{format(selectedDate, 'yyyy년 MM월 dd일', { locale: ko })}</h4>
                        <p className="text-slate-500">이날 등록된 작업이 총 <span className="text-blue-400 font-bold">{jobs.filter(j => isSameDay(new Date(j.createdAt), selectedDate)).length}건</span> 있습니다.</p>
                    </div>
                </div>
                <button className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-8 py-3 rounded-xl transition-all">상세 내역 보기</button>
            </div>
        </div>
    );
};
