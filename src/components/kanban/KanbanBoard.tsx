
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { Job, Staff, Priority, JobStatusDefinition, JobHistoryLog } from '../../types';
import { JobDetailModal } from '../common/JobDetailModal';
import { KanbanColumn } from './KanbanColumn';
import { useAuth } from '../../contexts/AuthContext';
import { Calendar as CalendarIcon, AlertCircle, Clock, Plus } from 'lucide-react';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanCard } from './KanbanCard';

interface KanbanBoardProps {
  onNavigateToQuote: (quoteId?: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ onNavigateToQuote }) => {
  const [displayJobs, setDisplayJobs] = useState<Job[]>([]);
  const [activeJobsStats, setActiveJobsStats] = useState<Job[]>([]); // For Header Stats
  const [staff, setStaff] = useState<Staff[]>([]);
  const [statusDefinitions, setStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { currentUser } = useAuth();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Optimized Data Loading
  const loadBoardData = () => {
    const allJobs = db.getAllJobs();
    const activeJobs = db.getActiveJobs(); // For Stats
    const statuses = db.getStatusDefinitions();
    setStatusDefinitions(statuses);

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

  const getProgressForStatus = (statusKey: string) => {
    const idx = statusDefinitions.findIndex(s => s.key === statusKey);
    if (idx === -1) return 0;
    return (idx / (statusDefinitions.length - 1)) * 100;
  };

  const updateJobStatus = (job: Job, direction: 'next' | 'prev') => {
    const currentIndex = statusDefinitions.findIndex(s => s.key === job.status);
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (newIndex >= 0 && newIndex < statusDefinitions.length) {
      const newStatusKey = statusDefinitions[newIndex].key;
      handleJobDrop(job.id, newStatusKey);
    }
  };

  const handleJobDrop = (draggedJobId: string, newStatusKey: string, targetJobId?: string) => {
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
      const fromStatus = statusDefinitions.find(s => s.key === draggedJob.status)?.label || draggedJob.status;
      const toStatus = statusDefinitions.find(s => s.key === newStatusKey)?.label || newStatusKey;

      newHistory.push({
        timestamp: new Date().toISOString(),
        staffId: currentUser.id,
        action: '칸반 이동',
        details: `${fromStatus} → ${toStatus}`
      });

      // Logic: 칸반 이동 시, 이동시킨 사람(currentUser)을 '대표 담당자(첫번째)'로 설정하고 기존 담당자는 유지
      const currentStaffIds = draggedJob.assignedStaffIds || (draggedJob.assignedStaffId ? [draggedJob.assignedStaffId] : []);

      // 이미 대표 담당자인지 확인 (첫번째 인덱스가 본인인지)
      const isAlreadyPrimary = currentStaffIds.length > 0 && currentStaffIds[0] === currentUser.id;

      if (!isAlreadyPrimary) {
        // 기존 목록에서 본인이 있다면 제거하고(중복방지), 맨 앞에 추가하여 대표로 설정
        const otherStaffIds = currentStaffIds.filter(id => id !== currentUser.id);
        const newStaffIds = [currentUser.id, ...otherStaffIds];

        updatedJob.assignedStaffIds = newStaffIds;
        updatedJob.assignedStaffId = currentUser.id; // Legacy sync (대표 담당자 필드 동기화)

        newHistory.push({
          timestamp: new Date().toISOString(),
          staffId: currentUser.id,
          action: '담당자 변경 (이동)',
          details: `${currentUser.name}님이 단계 이동 및 주 담당자로 설정됨`
        });
      }
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

    db.saveJobs(newAllJobs);
  };

  const handleCreateJob = (newJob: Job) => {
    db.addJob(newJob);
    setIsCreatingJob(false);
  };

  // Helper to handle both single (legacy) and multi staff
  // UPDATED: Now returns all names separated by commas instead of "Name + others"
  const getStaffName = (job?: Job) => {
    if (!job) return '미배정';

    const staffIds = job.assignedStaffIds || (job.assignedStaffId ? [job.assignedStaffId] : []);

    if (staffIds.length === 0) return '미배정';

    // Map all IDs to names
    const names = staffIds.map(id => {
      const found = staff.find(s => s.id === id);
      return found ? found.name : '알수없음';
    });

    return names.join(', ');
  };

  const getJobsForStatus = (statusKey: string) => {
    return displayJobs.filter(j => j.status === statusKey).sort((a, b) => a.order - b.order);
  };

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
    status: statusDefinitions.length > 0 ? statusDefinitions[0].key : 'RECEIVED',
    priority: Priority.NORMAL,
    paymentStatus: '결제대기',
    createdAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    progress: 0,
    type: db.getJobTypes()[0] || '기타',
    price: 0,
    order: 0,
    history: [] // Initialize empty history
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    if (activeIdStr === overIdStr) return;

    // Check if dropped on a column directly
    const isOverColumn = statusDefinitions.some(s => s.key === overIdStr);

    if (isOverColumn) {
      handleJobDrop(activeIdStr, overIdStr);
    } else {
      const overJob = displayJobs.find(j => j.id === overIdStr);
      if (overJob) {
        handleJobDrop(activeIdStr, overJob.status, overIdStr);
      }
    }
  };

  const activeDragJob = activeId ? displayJobs.find(j => j.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
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
        <div className="flex justify-between px-4 md:px-6 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 items-center shadow-sm z-20 relative flex-none gap-2">
          {/* Left: Stats & Action */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden sm:flex gap-2 text-xs md:text-sm font-medium">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg border border-red-100 dark:border-red-800">
                <AlertCircle size={14} />
                <span>긴급: {activeJobsStats.filter(j => j.priority !== Priority.NORMAL).length}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-100 dark:border-blue-800">
                <Clock size={14} />
                <span>진행: {activeJobsStats.filter(j => j.status !== 'DELIVERY').length}</span>
              </div>
            </div>

            <button
              onClick={() => setIsCreatingJob(true)}
              title="새로운 작업을 등록합니다"
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 shadow-sm transition-all hover:scale-105"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">작업 등록</span>
              <span className="sm:hidden">등록</span>
            </button>
          </div>

          {/* Right: Date Picker */}
          <div
            className="flex items-center gap-3 bg-blue-50 dark:bg-slate-700 px-3 md:px-5 py-2 rounded-lg border border-blue-100 dark:border-slate-600 shadow-sm transition-all hover:shadow-md max-w-full"
            title="선택한 날짜에 완료된 작업도 표시합니다 (과거 이력 조회용)"
          >
            <span className="text-xs md:text-sm font-extrabold text-blue-700 dark:text-blue-300 flex items-center gap-1 md:gap-2 whitespace-nowrap">
              <CalendarIcon size={16} />
              <span className="hidden sm:inline">완료 기준일</span>
            </span>
            <div className="w-px h-3 md:h-4 bg-blue-200 dark:bg-slate-500"></div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 text-xs md:text-sm rounded-md focus:ring-2 focus:ring-blue-500 block px-2 py-1 md:px-3 md:py-1.5 cursor-pointer font-bold shadow-sm hover:border-blue-400 min-w-0 flex-1"
            />
          </div>
        </div>

        <div className="flex-1 overflow-x-auto pb-2">
          {/* Responsive Width */}
          <div className="flex gap-4 h-full min-w-[280%] sm:min-w-[140%] xl:min-w-full xl:w-full p-4">
            {statusDefinitions.map((statusDef) => (
              <KanbanColumn
                key={statusDef.key}
                statusDef={statusDef}
                jobs={getJobsForStatus(statusDef.key)}
                getStaffName={getStaffName}
                onSelectJob={setSelectedJob}
                onStatusChange={updateJobStatus}
                onDropJob={handleJobDrop}
                currentUserId={currentUser?.id}
                isCompact={statusDef.key === 'DELIVERY'}
              />
            ))}
          </div>
        </div>

        {selectedJob && (
          <JobDetailModal
            job={selectedJob}
            staff={staff}
            onClose={() => setSelectedJob(null)}
            onUpdate={(updated) => {
              db.updateJob(updated);
              setSelectedJob(null);
            }}
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

        <DragOverlay>
          {activeDragJob ? (
            <KanbanCard
              job={activeDragJob}
              status={activeDragJob.status}
              staffName={getStaffName(activeDragJob)}
              onSelect={() => { }}
              onStatusChange={() => { }}
              onDropOnCard={() => { }}
              isMyJob={currentUser ? (activeDragJob.assignedStaffIds?.includes(currentUser.id) || activeDragJob.assignedStaffId === currentUser.id) : false}
              isOverlay={true}
            />
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
};
