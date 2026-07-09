
import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { Job, AdminInstruction, Priority, Staff, JobStatusDefinition } from '../../types';
import { AlertCircle, Clock, Plus, Loader2, Tv } from 'lucide-react';
import { JobStatusItem } from './JobStatusItem';
import { isJobAssignedToUser } from '../../utils/staffMatch';
import { filterJobsForOperationalBoard } from '../../utils/jobDisplayFilters';
import { InstructionPanel } from './InstructionPanel';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { useTheme } from '../../contexts/ThemeContext';
import { JobDetailModal } from '../common/JobDetailModal';
import { ClientContactModal } from '../common/ClientContactModal';

interface DashboardProps {
  onNavigateToQuote: (quoteId?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigateToQuote }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [instructions, setInstructions] = useState<AdminInstruction[]>([]);
  const [statusDefinitions, setStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const { currentUser, canManageInstructions } = useAuth();
  const { showConfirm, showAlert } = useDialog();
  const { theme } = useTheme();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobModalViewMode, setJobModalViewMode] = useState<'summary' | 'edit'>('summary');
  const [contactingJob, setContactingJob] = useState<Job | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isTvMode, setIsTvMode] = useState<boolean>(() => {
    return localStorage.getItem('ezprint_tv_mode') === 'true';
  });

  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverJobId, setDragOverJobId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData("text/plain", jobId);
    setDraggedJobId(jobId);
  };

  const handleDragOver = (e: React.DragEvent, jobId: string) => {
    e.preventDefault();
    if (draggedJobId && draggedJobId !== jobId) {
      setDragOverJobId(jobId);
    }
  };

  const handleDragLeave = () => {
    setDragOverJobId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetJobId: string) => {
    e.preventDefault();
    setDragOverJobId(null);
    const draggedId = e.dataTransfer.getData("text/plain") || draggedJobId;
    if (!draggedId || draggedId === targetJobId) return;

    const allJobs = db.getAllJobs();
    const draggedJob = allJobs.find(j => j.id === draggedId);
    if (!draggedJob) return;

    let activeJobs = filterJobsForOperationalBoard(db.getAllJobs()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const draggedIndex = activeJobs.findIndex(j => j.id === draggedId);
    const targetIndex = activeJobs.findIndex(j => j.id === targetJobId);

    if (draggedIndex === -1 || targetIndex === -1) return;
    if (draggedIndex === targetIndex) return;

    const newActiveJobs = [...activeJobs];
    newActiveJobs.splice(draggedIndex, 1);
    newActiveJobs.splice(targetIndex, 0, draggedJob);

    newActiveJobs.forEach((job, index) => {
      job.order = index;
    });

    const jobsToSave = newActiveJobs.filter((job, index) => {
      const prev = activeJobs.find(j => j.id === job.id);
      return prev && prev.order !== index;
    });

    setJobs(newActiveJobs);
    db.applyLocalJobUpdates(jobsToSave);

    try {
      await db.saveJobsPartial(jobsToSave);
    } catch (error) {
      showAlert(getErrorMessage(error));
      loadData();
    }
    setDraggedJobId(null);
  };

  useEffect(() => {
    const handleTvModeChange = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIsTvMode(customEvent.detail.isTvMode);
    };
    window.addEventListener('ezprint-tv-mode-change', handleTvModeChange);
    return () => window.removeEventListener('ezprint-tv-mode-change', handleTvModeChange);
  }, []);

  const loadData = () => {
    setJobs(filterJobsForOperationalBoard(db.getAllJobs()));
    db.ensureInstructionsSync();
    setInstructions(db.getInstructions());
    setStaff(db.getStaff());
    setStatusDefinitions(db.getStatusDefinitions());
  };

  useEffect(() => {
    loadData();
    // Subscribe to DB changes (Real-time updates)
    const unsubscribe = db.subscribe(() => {
        loadData();
    });
    return () => unsubscribe();
  }, []);

  const handleAddInstruction = async (content: string, important: boolean) => {
    const newInst: Partial<AdminInstruction> = {
      content,
      date: new Date().toISOString(),
      important: important
    };
    try {
        await db.addInstruction(newInst);
    } catch (error) {
        showAlert(getErrorMessage(error));
    }
  };

  const deleteInstruction = async (id: string) => {
    if (await showConfirm('이 지시사항을 삭제하시겠습니까?')) {
        try {
            await db.deleteInstruction(id);
        } catch (error) {
            showAlert(getErrorMessage(error));
        }
    }
  };

  const handleUpdateJob = async (updated: Job) => {
    try {
        await db.updateJob(updated);
        setSelectedJob(null);
    } catch (error) {
        showAlert(getErrorMessage(error));
    }
  };

  const handleCreateJob = async (newJob: Job) => {
    try {
        await db.addJob(newJob);
        setIsCreatingJob(false);
    } catch (error) {
        showAlert(getErrorMessage(error));
    }
  }
  const handleHideFromBoard = async (job: Job) => {
    try {
      await db.hideJobFromBoard(job.id, currentUser?.id);
    } catch (error) {
      showAlert(getErrorMessage(error));
    }
  };

  // Helper: Sort jobs by Order first, then fallback to Created Date
  const sortedJobs = [...jobs].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Empty template for new job
  const emptyJob: Job = {
    id: '', // Will be generated by db.addJob
    title: '',
    clientName: '',
    description: '',
    specs: {
      paperType: '', // Allow dynamic default in Modal
      paperWeight: '',
      size: '',
      quantity: '',
      processing: [],
      printColor: '단면 4도(컬러)', // Default to Color
      memo: ''
    },
    status: statusDefinitions.length > 0 ? statusDefinitions[0].key : 'RECEIVED',
    priority: Priority.NORMAL,
    paymentStatus: '결제대기',
    createdAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    progress: 0,
    type: db.getJobTypes()[0] || '기타', // Dynamic Type
    price: 0,
    order: 0
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex flex-col lg:flex-row flex-1 gap-2 lg:gap-3 overflow-hidden">
        {/* Main Area: Job Status Board */}
      <div className={`flex-1 flex flex-col min-w-0 rounded-xl shadow-sm border overflow-hidden transition-colors ${theme === 'trello' ? 'bg-[#152238] border-[#2c3e56]' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
        {/* Header */}
        {!isTvMode && (
        <div className={`p-2 lg:p-3 border-b flex justify-between items-center flex-none ${theme === 'trello' ? 'border-[#2c3e56] bg-[#1d2d44]' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850'}`}>
          <div className="flex items-center gap-4">
            <div>
              <h2 className={`text-base lg:text-lg font-bold flex items-center gap-2 ${theme === 'trello' ? 'text-slate-300' : 'text-slate-800 dark:text-slate-100'}`}>
                <span className="w-2 lg:w-2.5 h-5 lg:h-7 bg-gradient-to-b from-red-500 to-blue-600 rounded-sm"></span>
                실시간 작업 상황판
              </h2>
            </div>
          </div>
          <div className="flex gap-1.5 items-center">
             <div className="hidden sm:flex gap-1.5 text-[11px] lg:text-xs font-bold mr-1">
               <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-colors ${theme === 'trello' ? 'bg-[#2c3e56] text-slate-300 border-[#384c66]' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-800'}`}>
                  <AlertCircle size={12} />
                  <span>긴급: {jobs.filter(j => j.priority !== Priority.NORMAL).length}</span>
               </div>
               <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border transition-colors ${theme === 'trello' ? 'bg-[#2c3e56] text-slate-300 border-[#384c66]' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800'}`}>
                  <Clock size={12} />
                  <span>진행: {jobs.filter(j => j.status !== 'DELIVERY').length}</span>
               </div>
             </div>

             <button
               onClick={() => {
                 const nextVal = !isTvMode;
                 setIsTvMode(nextVal);
                 localStorage.setItem('ezprint_tv_mode', String(nextVal));
                 window.dispatchEvent(new CustomEvent('ezprint-tv-mode-change', { detail: { isTvMode: nextVal } }));
                 
                 if (nextVal) {
                   if (document.documentElement.requestFullscreen) {
                     document.documentElement.requestFullscreen().catch((err) => {
                       console.log("전체화면 진입 실패:", err);
                     });
                   }
                 } else {
                   if (document.fullscreenElement && document.exitFullscreen) {
                     document.exitFullscreen().catch((err) => {
                       console.log("전체화면 해제 실패:", err);
                     });
                   }
                 }
               }}
               className={`hidden md:flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all border select-none hover:scale-105 active:scale-95 shadow-md
                 ${isTvMode 
                   ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/40 hover:bg-purple-700' 
                   : 'bg-purple-900 dark:bg-purple-950 border-purple-800 dark:border-purple-900 text-white hover:bg-purple-800 dark:hover:bg-purple-900 hover:border-purple-500'}`}
               title="대형 화면용 모니터링 모드로 전환합니다"
             >
               <Tv size={14} className={isTvMode ? "text-white animate-pulse" : "text-purple-300"} />
               <span>모니터링 모드</span>
             </button>
             
             <button 
               onClick={() => setIsCreatingJob(true)}
               title="새로운 작업을 등록합니다"
               className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition-all hover:scale-105 active:scale-95"
             >
               <Plus size={16} />
               <span className="hidden sm:inline">작업 등록</span>
               <span className="sm:hidden">등록</span>
             </button>
          </div>
        </div>
        )}

        {/* List Content */}
        <div className={`flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar ${theme === 'trello' ? 'bg-[#152238]' : 'bg-slate-50/50 dark:bg-slate-900/50'}`}>
          {sortedJobs.length === 0 && (
             <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <p>현재 진행 중인 작업이 없습니다.</p>
                <button onClick={() => setIsCreatingJob(true)} className="mt-2 text-blue-600 hover:underline" title="작업 등록하기">새 작업 등록하기</button>
             </div>
          )}
          {sortedJobs.map((job) => {
             const isMyJob = currentUser ? isJobAssignedToUser(job, currentUser, staff) : false;
             return (
               <div 
                 key={job.id} 
                 className={`${isMyJob ? "relative" : ""} cursor-pointer transition-all ${dragOverJobId === job.id ? 'border-t-4 border-t-blue-500 scale-[1.01]' : ''}`}
                 onClick={() => { setSelectedJob(job); setJobModalViewMode('summary'); }}
                 onContextMenu={(e) => { e.preventDefault(); setSelectedJob(job); setJobModalViewMode('edit'); }}
                 title="클릭하여 상세 정보 보기"
                 draggable
                 onDragStart={(e) => handleDragStart(e, job.id)}
                 onDragOver={(e) => handleDragOver(e, job.id)}
                 onDragLeave={handleDragLeave}
                 onDrop={(e) => handleDrop(e, job.id)}
               >
                 {isMyJob && (
                   <div className="absolute -left-1 top-2 bottom-2 w-1 bg-blue-600 rounded-r-md z-10 shadow-sm"></div>
                 )}
                 <JobStatusItem 
                  job={job} 
                  staff={staff} 
                  statusDefinitions={statusDefinitions}
                  onContact={(j) => setContactingJob(j)}
                  onHideFromBoard={handleHideFromBoard}
                 />
               </div>
             );
          })}
        </div>
      </div>

      {/* Side Panel: Admin Instructions - Hidden on Mobile */}
      {!isTvMode && (
      <div className="hidden lg:flex w-full lg:w-80 xl:w-96 flex-col gap-6 flex-none pb-24 lg:pb-24 transition-all duration-300">
        <InstructionPanel 
          instructions={instructions} 
          onAdd={handleAddInstruction} 
          onDelete={deleteInstruction}
          canManage={canManageInstructions}
        />
      </div>
      )}
    </div>

      {selectedJob && (
        <JobDetailModal 
          job={selectedJob} 
          staff={staff} 
          initialViewMode={jobModalViewMode}
          onClose={() => setSelectedJob(null)} 
          onUpdate={handleUpdateJob}
          onNavigateToQuote={onNavigateToQuote}
        />
      )}
      
      {isCreatingJob && (
        <JobDetailModal 
          job={emptyJob}
          staff={staff}
          onClose={() => setIsCreatingJob(false)}
          onUpdate={handleCreateJob}
          isNew={true}
        />
      )}

      {contactingJob && (
        <ClientContactModal 
          job={contactingJob} 
          onClose={() => setContactingJob(null)} 
        />
      )}

      {isTvMode && (
        <button
          onClick={() => {
            setIsTvMode(false);
            localStorage.setItem('ezprint_tv_mode', 'false');
            window.dispatchEvent(new CustomEvent('ezprint-tv-mode-change', { detail: { isTvMode: false } }));
            
            if (document.fullscreenElement && document.exitFullscreen) {
              document.exitFullscreen().catch((err) => {
                console.log("전체화면 해제 실패:", err);
              });
            }
          }}
          className="fixed top-3 right-[10%] md:right-[15%] z-[9999] flex items-center gap-1.5 px-3 py-2 bg-slate-900/95 hover:bg-slate-800 text-white rounded-xl border border-slate-700/80 shadow-2xl hover:scale-105 active:scale-95 transition-all text-xs font-bold backdrop-blur-md"
          title="일반 화면으로 복원 (모니터링 모드 종료)"
        >
          <Tv size={13} className="text-purple-400 animate-pulse" />
          <span>모니터링 끄기</span>
        </button>
      )}
    </div>
  );
};
