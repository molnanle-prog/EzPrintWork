
import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { Job, Staff, Priority, JobStatusDefinition, JobHistoryLog } from '../../types';
import { JobDetailModal } from '../common/JobDetailModal';
import { KanbanColumn } from './KanbanColumn';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { Calendar as CalendarIcon, AlertCircle, Clock, Plus, Filter, CheckCircle2 } from 'lucide-react';

interface KanbanBoardProps {
  onNavigateToQuote: (quoteId?: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ onNavigateToQuote }) => {
  const [displayJobs, setDisplayJobs] = useState<Job[]>([]);
  const [activeJobsStats, setActiveJobsStats] = useState<Job[]>([]); 
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allStatusDefinitions, setAllStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const [visibleStatusDefinitions, setVisibleStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const [hiddenStatusKeys, setHiddenStatusKeys] = useState<string[]>(() => {
    const saved = localStorage.getItem('ezprint_hidden_columns');
    return saved ? JSON.parse(saved) : [];
  });
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const { currentUser, tenantPlan } = useAuth();
  const { showAlert } = useDialog();

  // Optimized Data Loading
  const loadBoardData = () => {
    const allJobs = db.getAllJobs();
    const activeJobs = db.getActiveJobs(); 
    const statuses = db.getStatusDefinitions();
    
    // 1. Data-level visibility (from settings)
    const dbVisibleStatuses = statuses.filter(s => s.isVisible !== false);
    setAllStatusDefinitions(dbVisibleStatuses);
    
    // 2. User-level visibility (from local UI filter)
    const userFiltered = dbVisibleStatuses.filter(s => !hiddenStatusKeys.includes(s.key));
    setVisibleStatusDefinitions(userFiltered);
    const filteredJobs = allJobs.filter(job => {
      // 1. Active jobs are always visible
      if (job.status !== 'DELIVERY') return true;

      // 2. Completed Jobs Logic
      
      // Rule A: If payment is incomplete, ALWAYS show it regardless of date
      if (job.paymentStatus !== '결제완료') return true;

      // Rule B: Show if completed within last 3 days
      const completedAt = job.completedAt ? new Date(job.completedAt) : new Date(job.createdAt);
      const now = new Date();
      const diffTime = now.getTime() - completedAt.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      if (diffDays <= 3) return true;

      // Rule C: Show if matches the manually selected date (for history lookup)
      const completedDateStr = completedAt.toISOString().split('T')[0];
      if (completedDateStr === selectedDate) return true;

      return false;
    });

    setDisplayJobs(filteredJobs);
    setActiveJobsStats(activeJobs);
    setStaff(db.getStaff());
  };

  useEffect(() => {
    loadBoardData();
    // Real-time updates subscription
    const unsubscribe = db.subscribe(() => {
        loadBoardData();
    });
    return () => unsubscribe();
  }, [selectedDate]); // Reload if date changes

  useEffect(() => {
    localStorage.setItem('ezprint_hidden_columns', JSON.stringify(hiddenStatusKeys));
    const userFiltered = allStatusDefinitions.filter(s => !hiddenStatusKeys.includes(s.key));
    setVisibleStatusDefinitions(userFiltered);
  }, [hiddenStatusKeys, allStatusDefinitions]);

  const toggleStatusVisibility = (key: string) => {
    setHiddenStatusKeys(prev => {
        if (prev.includes(key)) {
            return prev.filter(k => k !== key);
        } else {
            // Ensure at least 1 column is visible
            if (allStatusDefinitions.length - prev.length <= 1) {
                showAlert('최소 하나의 컬럼은 표시되어야 합니다.');
                return prev;
            }
            return [...prev, key];
        }
    });
  };

  const getProgressForStatus = (statusKey: string) => {
    const idx = allStatusDefinitions.findIndex(s => s.key === statusKey);
    if (idx === -1) return 0;
    return (idx / (allStatusDefinitions.length - 1)) * 100;
  };

  const updateJobStatus = (job: Job, direction: 'next' | 'prev') => {
    const currentIndex = allStatusDefinitions.findIndex(s => s.key === job.status);
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (newIndex >= 0 && newIndex < allStatusDefinitions.length) {
      const newStatusKey = allStatusDefinitions[newIndex].key;
      handleJobDrop(job.id, newStatusKey);
    }
  };

  const handleJobDrop = async (draggedJobId: string, newStatusKey: string, targetJobId?: string) => {
    const allJobs = db.getAllJobs(); 
    const draggedJob = allJobs.find(j => j.id === draggedJobId);
    if (!draggedJob || !currentUser) return;

    let newAllJobs = [...allJobs];
    newAllJobs = newAllJobs.filter(j => j.id !== draggedJobId);

    const updatedJob = { ...draggedJob };
    const newHistory: JobHistoryLog[] = [...(draggedJob.history || [])];

    // --- Automatic Assignment & History Logging ---
    if (draggedJob.status !== newStatusKey) {
        updatedJob.status = newStatusKey;
        const fromStatus = allStatusDefinitions.find(s => s.key === draggedJob.status)?.label || draggedJob.status;
        const toStatus = allStatusDefinitions.find(s => s.key === newStatusKey)?.label || newStatusKey;
        
        newHistory.push({
            timestamp: new Date().toISOString(),
            staffId: currentUser.id,
            action: '칸반 이동',
            details: `${fromStatus} → ${toStatus}`
        });
    }
    
    updatedJob.history = newHistory;
    
    if (newStatusKey === 'DELIVERY' && draggedJob.status !== 'DELIVERY') {
        updatedJob.completedAt = new Date().toISOString();
        updatedJob.progress = 100;
    } else if (newStatusKey !== 'DELIVERY' && draggedJob.status === 'DELIVERY') {
        updatedJob.completedAt = undefined;
        updatedJob.progress = getProgressForStatus(newStatusKey);
    } else {
        updatedJob.progress = getProgressForStatus(newStatusKey);
    }

    const columnJobs = newAllJobs
        .filter(j => j.status === newStatusKey)
        .sort((a, b) => a.order - b.order);

    if (targetJobId) {
        const targetIndex = columnJobs.findIndex(j => j.id === targetJobId);
        if (targetIndex !== -1) {
            columnJobs.splice(targetIndex, 0, updatedJob);
        } else {
            columnJobs.push(updatedJob);
        }
    } else {
        columnJobs.push(updatedJob);
    }

    columnJobs.forEach((job, index) => {
        job.order = index;
    });

    newAllJobs = newAllJobs.filter(j => j.status !== newStatusKey);
    newAllJobs = [...newAllJobs, ...columnJobs];

    try {
        await db.saveJobs(newAllJobs);
    } catch (error) {
        showAlert(getErrorMessage(error));
        // On error, the subscription will reload the old state from DB, 
        // but we might want to force a refresh if the optimism failed.
        loadBoardData();
    }
  };

  const handleCreateJob = async (newJob: Job) => {
    try {
        await db.addJob(newJob);
        setIsCreatingJob(false);
    } catch (error) {
        showAlert(getErrorMessage(error));
    }
  };

  // Helper to handle both single (legacy) and multi staff
  // UPDATED: Now returns all names separated by commas instead of "Name + others"
  const getStaffName = (job?: Job) => {
    if (!job) return '미배정';
    
    const staffIds = job.assignedStaffIds || (job.assignedStaffId ? [job.assignedStaffId] : []);
    if (staffIds.length === 0) return '미배정';
    
    // 유효한 직원만 찾고 중복 제거
    const uniqueValidStaff = Array.from(new Set(staffIds))
        .map(id => staff.find(s => s.id === id))
        .filter((s): s is Staff => !!s && !s.isDeleted);

    if (uniqueValidStaff.length === 0) return '미배정';

    // 이름(직책) 형식으로 변환
    return uniqueValidStaff.map(s => `${s.name}(${s.role})`).join(', ');
  };

  const getJobsForStatus = (statusKey: string) => {
    return displayJobs.filter(j => j.status === statusKey).sort((a,b) => a.order - b.order);
  };

  const getAdStatusKey = () => {
    if (visibleStatusDefinitions.length === 0) return null;
    
    // Calculate job counts for each visible column
    const counts = visibleStatusDefinitions.map(status => ({
        key: status.key,
        count: getJobsForStatus(status.key).length
    }));

    // Find the minimum count
    const minCount = Math.min(...counts.map(c => c.count));
    
    // Filter columns that have the minimum count
    const candidates = counts.filter(c => c.count === minCount);
    
    // Preference: If 'DELIVERY' is in candidates, use it. 
    // Otherwise use the column with fewest items (last one in list if tied).
    const hasDelivery = candidates.find(c => c.key === 'DELIVERY');
    if (hasDelivery) return 'DELIVERY';
    
    return candidates[candidates.length - 1].key;
  };

  const adStatusKey = getAdStatusKey();

  const emptyJob: Job = {
    id: '',
    title: '',
    clientName: '',
    description: '',
    specs: {
      paperType: '',
      paperWeight: '',
      size: '',
      quantity: '',
      processing: [],
      printColor: '단면 4도(컬러)',
      memo: ''
    },
    status: allStatusDefinitions.length > 0 ? allStatusDefinitions[0].key : 'RECEIVED',
    priority: Priority.NORMAL,
    paymentStatus: '결제대기',
    createdAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    progress: 0,
    type: db.getJobTypes()[0]?.name || '기타',
    price: 0,
    order: 0,
    history: [] // Initialize empty history
  };

  const defaultStatus = allStatusDefinitions.length > 0 ? allStatusDefinitions[0].key : 'RECEIVED';
  const newJobTemplate = { ...emptyJob, status: defaultStatus };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/40">
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator {
          background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%231e293b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E");
          background-position: center;
          background-size: contain;
          cursor: pointer;
          opacity: 1;
          width: 20px;
          height: 20px;
          margin-left: 0.5rem;
        }
        /* Dark mode icon invert */
        .dark input[type="date"]::-webkit-calendar-picker-indicator {
            filter: invert(1);
        }
      `}</style>
      <div className="flex justify-between px-0 py-1.5 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 items-center shadow-sm z-20 relative flex-none gap-2">
        {/* Left: Stats & Action */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-1">
             <div className="hidden sm:flex gap-1.5 text-xs md:text-sm font-bold mr-1">
               <div className="flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg border border-red-100 dark:border-red-800 transition-colors">
                  <AlertCircle size={14} />
                  <span>긴급: {activeJobsStats.filter(j => j.priority !== Priority.NORMAL).length}</span>
               </div>
               <div className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-100 dark:border-blue-800 transition-colors">
                  <Clock size={14} />
                  <span>진행: {activeJobsStats.filter(j => j.status !== 'DELIVERY').length}</span>
               </div>
             </div>
             
             <div className="relative">
                <button 
                  onClick={() => setShowFilterPopover(!showFilterPopover)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all border
                    ${showFilterPopover 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg' 
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'}`}
                >
                    <Filter size={14} />
                    <span className="hidden lg:inline">단계 필터</span>
                    <span className="px-1.5 bg-slate-200 dark:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-400">
                        {visibleStatusDefinitions.length}/{allStatusDefinitions.length}
                    </span>
                </button>

                {showFilterPopover && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowFilterPopover(false)}></div>
                        <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-2 z-40 overflow-hidden animate-in fade-in zoom-in duration-200">
                            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 mb-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">보드 구성 설정</p>
                            </div>
                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1 space-y-1">
                                {allStatusDefinitions.map(status => (
                                    <button
                                        key={status.key}
                                        onClick={() => toggleStatusVisibility(status.key)}
                                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group"
                                    >
                                        <span className={`text-sm font-bold ${hiddenStatusKeys.includes(status.key) ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                            {status.label}
                                        </span>
                                        {!hiddenStatusKeys.includes(status.key) ? (
                                            <div className="bg-blue-600 text-white rounded-full p-0.5">
                                                <CheckCircle2 size={14} />
                                            </div>
                                        ) : (
                                            <div className="w-4 h-4 border-2 border-slate-200 dark:border-slate-600 rounded"></div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}
             </div>

             <button 
               onClick={() => setIsCreatingJob(true)}
               title="새로운 작업을 등록합니다"
               className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 ml-1"
             >
               <Plus size={18} />
               <span className="hidden sm:inline">작업 등록</span>
               <span className="sm:hidden">등록</span>
             </button>
        </div>

        {/* Right: Date Picker */}
        <div 
            className="flex items-center gap-2 bg-blue-50 dark:bg-slate-700 px-2.5 md:px-3.5 py-1.5 rounded-lg border border-blue-100 dark:border-slate-600 shadow-sm transition-all hover:shadow-md max-w-full"
            title="선택한 날짜에 완료된 작업도 표시합니다 (과거 이력 조회용)"
        >
           <span className="text-xs md:text-sm font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 whitespace-nowrap">
             <CalendarIcon size={16} />
             <span className="hidden sm:inline">완료 기준일</span>
           </span>
           <div className="w-px h-4 bg-blue-200 dark:bg-slate-500"></div>
           <input 
             type="date" 
             value={selectedDate}
             onChange={(e) => setSelectedDate(e.target.value)}
             className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 text-xs md:text-sm rounded-md focus:ring-2 focus:ring-blue-500 block px-2 py-1 md:px-2.5 md:py-1.5 cursor-pointer font-bold shadow-sm hover:border-blue-400 min-w-0 flex-1"
           />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-0 custom-scrollbar h-full min-h-0">
        {/* Responsive Width logic: 
            Columns will grow and shrink to fit the screen. 
            Horizontal scroll only appears when absolutely necessary (on very small screens). */}
        <div 
            className="flex gap-1.5 h-full py-1.5 px-0 w-full"
        >
          {visibleStatusDefinitions.map((statusDef) => (
            <div 
                key={statusDef.key} 
                className="h-full flex-1 min-w-[200px] transition-all duration-300"
            >
                <KanbanColumn
                    statusDef={statusDef}
                    jobs={getJobsForStatus(statusDef.key)}
                    getStaffName={getStaffName}
                    onSelectJob={setSelectedJob}
                    onStatusChange={updateJobStatus}
                    onDropJob={handleJobDrop}
                    currentUserId={currentUser?.id}
                    isCompact={statusDef.key === 'DELIVERY' || visibleStatusDefinitions.length > 5}
                    showAd={tenantPlan === 'free' && statusDef.key === adStatusKey}
                />
            </div>
          ))}
        </div>
      </div>

      {selectedJob && (
        <JobDetailModal 
          key={selectedJob.id}
          job={selectedJob} 
          staff={staff} 
          onClose={() => setSelectedJob(null)} 
          onUpdate={async (updated) => {
             try {
                await db.updateJob(updated);
                setSelectedJob(null);
             } catch (error) {
                showAlert(getErrorMessage(error));
             }
          }}
          onNavigateToQuote={onNavigateToQuote}
        />
      )}

      {isCreatingJob && (
        <JobDetailModal 
          key="new-job-modal"
          job={newJobTemplate}
          staff={staff}
          onClose={() => setIsCreatingJob(false)}
          onUpdate={handleCreateJob}
          isNew={true}
        />
      )}
    </div>
  );
};
