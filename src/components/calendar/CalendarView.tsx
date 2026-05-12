
import React, { useState, useEffect, useMemo } from 'react';
import { db, getHolidayName } from '../../services/dataService';
import { Job, Staff, StaffLeave, Priority, JobStatusDefinition, PaymentStatus } from '../../types';
import { ChevronLeft, ChevronRight, Palmtree, Plus, Trash2, AlertCircle, Clock, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import { JobDetailModal } from '../common/JobDetailModal';
import { LeaveModal } from './LeaveModal';
import { useDialog } from '../../contexts/DialogContext';
import { AdBanner } from '../common/AdBanner';
import { useAuth } from '../../contexts/AuthContext';

interface CalendarViewProps {
  onNavigateToQuote: (quoteId?: string) => void;
}

// Job ID based color generator
const getJobColorStyles = (id: string) => {
  const styles = [
    'bg-red-100 text-red-900 border-red-200 dark:bg-red-600 dark:text-white dark:border-red-500',
    'bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-600 dark:text-white dark:border-orange-500',
    'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-600 dark:text-white dark:border-amber-500',
    'bg-yellow-100 text-yellow-900 border-yellow-300 dark:bg-yellow-600 dark:text-white dark:border-yellow-500',
    'bg-lime-100 text-lime-900 border-lime-300 dark:bg-lime-600 dark:text-white dark:border-lime-500',
    'bg-green-100 text-green-900 border-green-200 dark:bg-green-600 dark:text-white dark:border-green-500',
    'bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-600 dark:text-white dark:border-emerald-500',
    'bg-teal-100 text-teal-900 border-teal-200 dark:bg-teal-600 dark:text-white dark:border-teal-500',
    'bg-cyan-100 text-cyan-900 border-cyan-200 dark:bg-cyan-600 dark:text-white dark:border-cyan-500',
    'bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-600 dark:text-white dark:border-sky-500',
    'bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-600 dark:text-white dark:border-blue-500',
    'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-600 dark:text-white dark:border-indigo-500',
    'bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-600 dark:text-white dark:border-violet-500',
    'bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-600 dark:text-white dark:border-purple-500',
    'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200 dark:bg-fuchsia-600 dark:text-white dark:border-fuchsia-500',
    'bg-pink-100 text-pink-900 border-pink-200 dark:bg-pink-600 dark:text-white dark:border-pink-500',
    'bg-rose-100 text-rose-900 border-rose-200 dark:bg-rose-600 dark:text-white dark:border-rose-500',
  ];
  
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return styles[Math.abs(hash) % styles.length];
};

export const CalendarView: React.FC<CalendarViewProps> = ({ onNavigateToQuote }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobsStats, setActiveJobsStats] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [statusDefinitions, setStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const { showConfirm } = useDialog();
  const { tenantPlan } = useAuth();
  
  const [showLeaveModal, setShowLeaveModal] = useState(false);

  const loadData = () => {
    // Load ample range to cover overlap
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    // Load surrounding months to handle overlapping jobs correctly
    const currentMonthJobs = db.getJobsByMonth(year, month);
    const prevMonthJobs = db.getJobsByMonth(year, month - 1);
    const nextMonthJobs = db.getJobsByMonth(year, month + 1);
    
    // De-duplicate jobs
    const jobMap = new Map();
    [...prevMonthJobs, ...currentMonthJobs, ...nextMonthJobs].forEach(j => jobMap.set(j.id, j));
    
    setJobs(Array.from(jobMap.values()));
    setActiveJobsStats(db.getActiveJobs());
    setStaff(db.getStaff());
    setLeaves(db.getLeaves());
    setStatusDefinitions(db.getStatusDefinitions());
  };

  useEffect(() => {
    loadData();
    const unsubscribe = db.subscribe(loadData);
    return () => unsubscribe();
  }, [currentDate]);

  // --- Layout Calculation Logic (Tetris/Slot Algorithm) ---
  const calendarLayout = useMemo(() => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
      
      // Generate date keys for the grid (including padding for start of week)
      const gridStartDate = new Date(year, month, 1);
      gridStartDate.setDate(1 - firstDayOfMonth);
      
      const totalDaysNeeded = firstDayOfMonth + lastDateOfMonth;
      const weeksNeeded = Math.ceil(totalDaysNeeded / 7);
      const totalGridCells = weeksNeeded * 7;

      const gridDates: string[] = [];
      for (let i = 0; i < totalGridCells; i++) {
          const d = new Date(gridStartDate);
          d.setDate(gridStartDate.getDate() + i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          gridDates.push(`${y}-${m}-${day}`);
      }

      const viewStartTs = new Date(gridDates[0]).getTime();
      const viewEndTs = new Date(gridDates[gridDates.length - 1]).getTime() + (24 * 60 * 60 * 1000) - 1;

      const visibleJobs = jobs.filter(job => {
          const start = new Date(job.createdAt).getTime();
          const end = new Date(job.dueDate).getTime();
          return end >= viewStartTs && start <= viewEndTs;
      });

      visibleJobs.sort((a, b) => {
          const startA = new Date(a.createdAt).getTime();
          const startB = new Date(b.createdAt).getTime();
          if (startA !== startB) return startA - startB;
          const durA = new Date(a.dueDate).getTime() - startA;
          const durB = new Date(b.dueDate).getTime() - startB;
          return durB - durA;
      });

      const slots: { [date: string]: (Job | null)[] } = {};
      gridDates.forEach(date => slots[date] = []);

      visibleJobs.forEach(job => {
          const jobStart = new Date(job.createdAt); jobStart.setHours(0,0,0,0);
          const jobEnd = new Date(job.dueDate); jobEnd.setHours(0,0,0,0);
          const activeDates = gridDates.filter(dateKey => {
              const d = new Date(dateKey);
              d.setHours(0,0,0,0);
              return d.getTime() >= jobStart.getTime() && d.getTime() <= jobEnd.getTime();
          });
          if (activeDates.length === 0) return;
          let rowIndex = 0;
          while (true) {
              const isRowFree = activeDates.every(dateKey => !slots[dateKey][rowIndex]);
              if (isRowFree) break;
              rowIndex++;
          }
          activeDates.forEach(dateKey => {
              while (slots[dateKey].length <= rowIndex) slots[dateKey].push(null);
              slots[dateKey][rowIndex] = job;
          });
      });
      return { gridDates, slots };
  }, [jobs, currentDate]);

  // Find the best padding cells for the Ad
  const adCellIndices = useMemo(() => {
    const { gridDates } = calendarLayout;
    if (tenantPlan === 'pro') return [];
    
    // Find non-current month cells
    const paddingIndices = gridDates.reduce((acc: number[], dateKey, idx) => {
        const [y, m] = dateKey.split('-').map(Number);
        if ((m - 1) !== currentDate.getMonth()) acc.push(idx);
        return acc;
    }, []);

    if (paddingIndices.length === 0) return [];
    
    // Pick two separate cells: First and Last padding cells
    if (paddingIndices.length >= 2) {
        return [paddingIndices[0], paddingIndices[paddingIndices.length - 1]];
    }
    return [paddingIndices[0]];
  }, [calendarLayout, currentDate, tenantPlan]);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const handleUpdateJob = (updated: Job) => {
    db.updateJob(updated);
    setSelectedJob(null);
  };

  const handleCreateJob = (newJob: Job) => {
    db.addJob(newJob);
    setIsCreatingJob(false);
    setSelectedJob(null); // Clear potential template job
  };

  const handleDeleteLeave = async (id: string, name: string) => {
    if (await showConfirm(`${name}의 휴가 일정을 삭제하시겠습니까?`)) {
        db.deleteLeave(id);
        loadData();
    }
  };

  const getStaffName = (id: string) => staff.find(s => s.id === id)?.name || '직원';
  // --- Render ---
  const renderCells = () => {
    const { gridDates, slots } = calendarLayout;
    
    return gridDates.map((dateKey, index) => {
        const isAdCell = adCellIndices.includes(index);
        // Construct Date object manually to ensure local time interpretation from string YYYY-MM-DD
        const [y, m, d] = dateKey.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        
        const isCurrentMonth = dateObj.getMonth() === currentDate.getMonth();
        const isToday = new Date().toDateString() === dateObj.toDateString();
        const dayOfWeek = dateObj.getDay();
        const holidayName = getHolidayName(dateObj);

        // Styling
        let dateColorClass = isCurrentMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-300 dark:text-slate-600';
        let bgColorClass = isCurrentMonth ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-900/50';
        
        if (isCurrentMonth) {
            if (dayOfWeek === 0 || holidayName) dateColorClass = 'text-red-500 dark:text-red-400';
            else if (dayOfWeek === 6) dateColorClass = 'text-blue-500 dark:text-blue-400';
        }

        const dayLeaves = leaves.filter(leave => {
            const start = new Date(leave.startDate); start.setHours(0,0,0,0);
            const end = new Date(leave.endDate); end.setHours(23,59,59,999);
            const current = dateObj.getTime();
            return current >= start.getTime() && current <= end.getTime();
        });

        // Current Day's Job Slots
        const daySlots = slots[dateKey] || [];

        return (
            <div 
                key={dateKey} 
                className={`
                    min-h-[100px] border-b border-r border-slate-100 dark:border-slate-700 flex flex-col transition-all duration-200 relative group/cell
                    ${isToday ? 'bg-blue-50 dark:bg-blue-900/20' : bgColorClass}
                    ${isAdCell ? 'p-0 overflow-hidden' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}
                `}
            >
                {isAdCell ? (
                    <div className="w-full h-full flex items-center justify-center p-1 bg-slate-50 dark:bg-slate-900/40">
                         <AdBanner slot={`calendar_day_${index}`} size="234x60" type="dashed" />
                    </div>
                ) : (
                    <>
                        {/* Header: Date & Add Button */}
                        <div className="flex justify-between items-start px-1 pt-1 mb-1 relative z-10 flex-none">
                            <div className="flex flex-wrap items-center gap-1.5 w-full">
                                <span className={`text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full transition-all ${isToday ? 'bg-blue-600 text-white shadow-md' : dateColorClass}`}>
                                    {dateObj.getDate()}
                                </span>
                                {holidayName && (
                                    <span className="text-[10px] bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-200 px-1.5 py-0.5 rounded font-bold whitespace-nowrap overflow-hidden text-ellipsis shadow-sm flex-1 md:flex-none">
                                        {holidayName}
                                    </span>
                                )}
                            </div>
                            <button 
                                onClick={() => {
                                    const newJobDate = new Date(dateObj);
                                    newJobDate.setHours(9, 0, 0, 0);
                                    const defaultJob: Job = { 
                                        id: '',
                                        title: '',
                                        clientName: '',
                                        description: '',
                                        specs: { paperType: '', paperWeight: '', size: '', quantity: '', processing: [], printColor: '단면 4도(컬러)', memo: '' },
                                        status: 'RECEIVED', priority: Priority.NORMAL, paymentStatus: '결제대기',
                                        progress: 0, type: db.getJobTypes()[0] || '기타', price: 0, order: 0,
                                        createdAt: newJobDate.toISOString(), 
                                        dueDate: newJobDate.toISOString() 
                                    };
                                    setSelectedJob(defaultJob);
                                    setIsCreatingJob(true);
                                }}
                                className="opacity-0 group-hover/cell:opacity-100 p-0.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-opacity"
                                title="이 날짜에 작업 등록"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </>
                )}

                {/* Content Area */}
                <div className="flex-1 flex flex-col gap-0.5 w-full pb-1">
                    {/* Vacations (Always on top) */}
                    {dayLeaves.map(leave => (
                        <div key={leave.id} className="mx-1 mb-0.5 flex items-center bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800 text-[10px] font-bold truncate">
                            <span className="truncate flex-1">🌴 {getStaffName(leave.staffId)}</span>
                            <button onClick={(e) => {e.stopPropagation(); handleDeleteLeave(leave.id, getStaffName(leave.staffId));}} className="ml-1 hover:text-red-600"><Trash2 size={10} /></button>
                        </div>
                    ))}

                    {/* Job Slots */}
                    {daySlots.map((job, idx) => {
                        if (!job) {
                            // Empty slot placeholder to maintain alignment
                            return <div key={`empty-${idx}`} className="h-5"></div>;
                        }

                        // Determine Start/End Logic for UI - USING STRING COMPARISON
                        // This avoids timezone issues where setHours(0,0,0,0) might shift the date
                        const jobStart = new Date(job.createdAt);
                        const jobStartDateStr = `${jobStart.getFullYear()}-${String(jobStart.getMonth()+1).padStart(2,'0')}-${String(jobStart.getDate()).padStart(2,'0')}`;
                        
                        const jobEnd = new Date(job.dueDate);
                        const jobEndDateStr = `${jobEnd.getFullYear()}-${String(jobEnd.getMonth()+1).padStart(2,'0')}-${String(jobEnd.getDate()).padStart(2,'0')}`;
                        
                        const isStart = jobStartDateStr === dateKey;
                        const isEnd = jobEndDateStr === dateKey;
                        
                        // Compare Date objects for 'Single Day' check to handle same-day edge cases properly
                        const isSingleDay = isStart && isEnd;
                        
                        const isSunday = dateObj.getDay() === 0;
                        // Always show label on the first day displayed in the grid
                        const isFirstDayOfGrid = dateKey === gridDates[0];

                        // Label Visibility Logic: Start, End, Sunday, or First day of visible grid
                        const showLabel = isSingleDay || isStart || isEnd || isSunday || isFirstDayOfGrid;

                        const isDone = job.status === 'DELIVERY';
                        const isHovered = hoveredJobId === job.id;

                        // Bar Styles
                        let containerClass = `h-5 flex items-center shadow-sm transition-all cursor-pointer border text-[10px] relative ${getJobColorStyles(job.id)}`;
                        let textClass = "truncate font-bold px-1 w-full dark:text-white flex items-center gap-1";

                        // Shape Logic
                        if (isSingleDay) {
                            containerClass += " mx-1 rounded-md"; 
                        } else if (isStart) {
                            containerClass += " ml-1 mr-[-1px] rounded-l-md rounded-r-none border-r-0 z-10"; 
                        } else if (isEnd) {
                            containerClass += " mr-1 ml-[-1px] rounded-r-md rounded-l-none border-l-0 z-10 justify-end"; 
                            textClass += " justify-end text-right";
                        } else {
                            containerClass += " mx-[-1px] rounded-none border-x-0 z-0";
                        }

                        // Priority/Urgency Pulse
                        if (!isDone) {
                            const now = new Date();
                            const due = new Date(job.dueDate);
                            const diff = due.getTime() - now.getTime();
                            const daysRemaining = Math.ceil(diff / (1000 * 3600 * 24));

                            if (job.priority === Priority.VERY_URGENT) containerClass += " animate-pulse ring-1 ring-red-600 dark:ring-red-400 z-20";
                            else if (daysRemaining <= 1) containerClass += " animate-pulse ring-1 ring-indigo-500 dark:ring-indigo-400 z-10";
                        }

                        if (isDone) containerClass += " opacity-60 grayscale";
                        // FIX: Removed 'scale-[1.02]' to prevent layout jitter on hover.
                        // Added 'brightness-105' for hover effect instead.
                        if (isHovered) containerClass += " ring-2 ring-blue-400 z-30 shadow-md opacity-100 animate-none brightness-105";

                        const content = (
                            <>
                                {isDone && <CheckCircle2 size={10} className="inline mr-0.5 text-emerald-100" />}
                                {job.title} <span className="font-normal opacity-80 hidden sm:inline">({job.clientName})</span>
                            </>
                        );

                        return (
                            <div
                                key={job.id}
                                onClick={() => setSelectedJob(job)}
                                onMouseEnter={() => setHoveredJobId(job.id)}
                                onMouseLeave={() => setHoveredJobId(null)}
                                className={containerClass}
                                title={`${job.title} (${job.clientName}) - ${new Date(job.dueDate).toLocaleDateString()} 마감`}
                            >
                                {showLabel && <span className={textClass}>{content}</span>}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    });
  };

  return (
    <>
      <div className="h-full flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
        <div className="p-4 md:p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-850 flex-none">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <CalendarIcon className="text-blue-600 dark:text-blue-400" />
              {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
            </h2>
            <div className="hidden md:flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
               <div className="flex items-center gap-1">
                 <div className="w-2 h-2 rounded-full bg-red-500"></div> <span>일요일</span>
               </div>
               <div className="flex items-center gap-1">
                 <div className="w-2 h-2 rounded-full bg-blue-500"></div> <span>토요일</span>
               </div>
               <div className="flex items-center gap-1 ml-2">
                 <div className="w-3 h-3 rounded bg-purple-100 dark:bg-purple-900 border border-purple-300 dark:border-purple-700"></div> <span>휴가</span>
               </div>
            </div>
          </div>
          
          <div className="flex gap-1 md:gap-2 items-center">
            <div className="hidden xl:flex gap-2 text-xs md:text-sm font-medium mr-2">
               <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg border border-red-100 dark:border-red-800">
                  <AlertCircle size={14} />
                  <span>긴급: {activeJobsStats.filter(j => j.priority !== Priority.NORMAL).length}</span>
               </div>
               <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-100 dark:border-blue-800">
                  <Clock size={14} />
                  <span>진행: {activeJobsStats.filter(j => j.status !== 'DELIVERY').length}</span>
               </div>
            </div>

            <button onClick={() => setIsCreatingJob(true)} className="mr-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 shadow-sm transition-all hover:scale-105">
               <Plus size={16} /><span className="hidden sm:inline">작업 등록</span>
             </button>

            <button onClick={() => setShowLeaveModal(true)} className="mr-2 px-3 py-1.5 bg-purple-600 text-white text-xs md:text-sm font-bold rounded-lg hover:bg-purple-700 shadow-sm flex items-center gap-1">
                <Palmtree size={16} /><span className="hidden sm:inline">휴가 등록</span>
            </button>
            <button onClick={prevMonth} className="p-1.5 md:p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 shadow-sm"><ChevronLeft size={20} /></button>
            <button onClick={goToday} className="px-3 py-1.5 md:px-4 md:py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 font-bold shadow-sm">오늘</button>
            <button onClick={nextMonth} className="p-1.5 md:p-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 shadow-sm"><ChevronRight size={20} /></button>
          </div>
        </div>
        
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex-none">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={`p-2 md:p-3 text-center text-xs md:text-sm font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-600 dark:text-slate-400'}`}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 flex-1 auto-rows-fr overflow-y-auto dark:bg-slate-800">
            {renderCells()}
          </div>
        </div>
      </div>

      {isCreatingJob ? (
        <JobDetailModal 
          job={selectedJob && selectedJob.id === '' ? selectedJob : {
              id: '', title: '', clientName: '', description: '',
              specs: { paperType: '', paperWeight: '', size: '', quantity: '', processing: [], printColor: '단면 4도(컬러)', memo: '' },
              status: 'RECEIVED', priority: Priority.NORMAL, paymentStatus: '결제대기' as PaymentStatus,
              progress: 0, type: db.getJobTypes()[0] || '기타', price: 0, order: 0,
              createdAt: new Date().toISOString(), dueDate: new Date().toISOString()
          } as Job}
          staff={staff} 
          onClose={() => { setIsCreatingJob(false); setSelectedJob(null); }} 
          onUpdate={handleCreateJob}
          isNew={true}
        />
      ) : selectedJob && (
        <JobDetailModal 
          job={selectedJob} 
          staff={staff} 
          onClose={() => setSelectedJob(null)} 
          onUpdate={handleUpdateJob}
          onNavigateToQuote={onNavigateToQuote}
        />
      )}

      {showLeaveModal && (
        <LeaveModal 
            onClose={() => setShowLeaveModal(false)}
            onSave={() => { setShowLeaveModal(false); loadData(); }}
            staffList={staff}
        />
      )}
    </>
  );
};
