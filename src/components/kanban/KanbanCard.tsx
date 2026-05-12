
import React from 'react';
import { Job, Priority, PaymentStatus } from '../../types';
import { MoreVertical, User, AlertTriangle, ArrowLeft, CheckCircle2, GripHorizontal, Layers, Users } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface KanbanCardProps {
  job: Job;
  status: string; // Changed from JobStatus to string
  staffName: string;
  onSelect: (job: Job) => void;
  onStatusChange: (job: Job, direction: 'next' | 'prev') => void;
  onDropOnCard: (draggedJobId: string, targetJobId: string) => void;
  isMyJob: boolean;
  isCompact?: boolean;
  isOverlay?: boolean;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  job,
  status,
  staffName,
  onSelect,
  onStatusChange,
  onDropOnCard,
  isMyJob,
  isCompact = false,
  isOverlay = false
}) => {
  const { attributes, listeners, setNodeRef: setDraggableRef, transform, isDragging } = useDraggable({
    id: job.id,
    data: { type: 'JobCard', status },
    disabled: isOverlay
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: job.id,
    data: { type: 'JobCard', status },
    disabled: isOverlay
  });

  const setNodeRef = (node: HTMLElement | null) => {
    if (isOverlay) return;
    setDraggableRef(node);
    setDroppableRef(node);
  };

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  // Calculate Days Remaining
  const now = new Date();
  const due = new Date(job.dueDate);
  const diffTime = due.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isDone = status === 'DELIVERY';
  const subJobCount = job.subJobs ? job.subJobs.length : 1;
  const isMultiJob = subJobCount > 1;

  // Logic updated: Check for comma (from 'Name, Name') OR count length
  const assignedCount = (job.assignedStaffIds?.length || (job.assignedStaffId ? 1 : 0));
  const isMultiStaff = assignedCount > 1 || staffName.includes(',');

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case Priority.VERY_URGENT: return 'bg-red-600 text-white border-red-700';
      case Priority.URGENT: return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600';
    }
  };

  const getPaymentColor = (status: PaymentStatus) => {
    switch (status) {
      case '결제대기': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
      case '일부결제': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case '결제완료': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600';
    }
  };

  // Determine Border & Background Styles based on Urgency and Date
  let cardStyleClass = "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600";

  if (isMyJob) {
    cardStyleClass = "bg-white dark:bg-slate-700 border-blue-300 dark:border-blue-500 ring-2 ring-blue-100 dark:ring-blue-900";
  }

  if (job.priority === Priority.VERY_URGENT) {
    cardStyleClass = "bg-red-100 dark:bg-red-900/40 border-red-600 border-2 animate-pulse";
  } else if (job.priority === Priority.URGENT) {
    cardStyleClass = "bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-700 animate-pulse";
  } else if (!isDone) {
    if (daysRemaining < 0) {
      cardStyleClass = "bg-slate-100 dark:bg-slate-800 border-slate-500 dark:border-slate-400 border-2 animate-pulse";
    } else if (daysRemaining <= 1) {
      cardStyleClass = "bg-orange-50 dark:bg-orange-900/20 border-orange-400 dark:border-orange-600 border animate-pulse";
    } else if (!isMyJob) {
      if (daysRemaining <= 3) cardStyleClass = "bg-white dark:bg-slate-700 border-slate-400 dark:border-slate-500";
      else if (daysRemaining <= 5) cardStyleClass = "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600";
    }
  }

  // Visual feedback for dropping ONTO this card
  if (isOver && !isDragging && !isOverlay) {
    cardStyleClass = "bg-blue-50 dark:bg-blue-900/50 border-t-4 border-t-blue-500 border-x border-b border-blue-200 dark:border-blue-700 shadow-lg scale-[1.02] z-50";
  }

  if (isOverlay) {
    cardStyleClass += " shadow-2xl scale-105 rotate-2 cursor-grabbing z-50 ring-4 ring-blue-500/50";
  }

  // ----------------------------------------------------------------------
  // COMPACT VIEW (Single Line for Done Items)
  // ----------------------------------------------------------------------
  if (isCompact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={`bg-white dark:bg-slate-700 px-3 py-2 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600 hover:shadow-md hover:border-blue-300 transition-all cursor-grab active:cursor-grabbing flex items-center gap-3 group ${isOver ? 'border-t-4 border-t-blue-500' : ''}`}
        onClick={() => onSelect(job)}
        title="완료된 작업 (클릭하여 상세보기)"
      >
        <div className="text-emerald-500 cursor-grab active:cursor-grabbing">
          <CheckCircle2 size={16} />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate">{job.title}</span>
          <span className="text-xs text-slate-400 truncate hidden xl:inline">- {job.clientName}</span>
          {isMultiJob && (
            <span className="text-[9px] bg-slate-600 dark:bg-slate-500 text-white px-1 rounded flex items-center gap-0.5">
              <Layers size={8} /> {subJobCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[120px]" title={staffName}>{staffName}</span>
          <div className="w-px h-3 bg-slate-200 dark:bg-slate-600"></div>
          {/* Payment Status in Compact View */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getPaymentColor(job.paymentStatus || '결제대기')}`}>
            {job.paymentStatus || '결제대기'}
          </span>
          <div className="w-px h-3 bg-slate-200 dark:bg-slate-600"></div>
          <button
            onClick={(e) => { e.stopPropagation(); onStatusChange(job, 'prev'); }}
            className="text-slate-300 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="작업 취소/되돌리기 (이전 단계로 이동)"
          >
            <ArrowLeft size={14} />
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // STANDARD VIEW
  // ----------------------------------------------------------------------
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        p-3 lg:p-4 rounded-lg shadow-sm border transition-all cursor-grab active:cursor-grabbing group flex flex-col gap-2 relative
        ${cardStyleClass}
        ${!isMyJob && job.priority === Priority.NORMAL && !isOver && !isOverlay && 'hover:shadow-md hover:border-blue-300'}
        ${!isOverlay && 'active:scale-105 active:shadow-xl active:z-50'}
      `}
      onClick={() => onSelect(job)}
      title="드래그하여 상태 변경 / 클릭하여 상세보기"
    >
      <div className="flex justify-between items-start pointer-events-none">
        <div className="flex gap-2 flex-wrap items-center">
          {isMyJob && <span className="text-[10px] lg:text-xs px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold">ME</span>}
          <span className={`text-[10px] lg:text-xs px-2 py-0.5 rounded border ${getPriorityColor(job.priority)} font-medium`}>
            {job.priority}
          </span>
          {isMultiJob && (
            <span className="text-[10px] lg:text-xs px-1.5 py-0.5 rounded bg-slate-600 dark:bg-slate-500 text-white font-bold flex items-center gap-1 shadow-sm">
              <Layers size={10} /> +{subJobCount}
            </span>
          )}
          {/* Payment Status Badge */}
          <span className={`text-[10px] lg:text-xs px-2 py-0.5 rounded border ${getPaymentColor(job.paymentStatus || '결제대기')} font-bold`}>
            {job.paymentStatus || '결제대기'}
          </span>
        </div>
        <div className="flex gap-1 text-slate-300 dark:text-slate-500 pointer-events-auto">
          <GripHorizontal size={16} className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
          <button className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors" title="추가 메뉴">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      <div className="pointer-events-none">
        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm lg:text-base leading-tight mb-1 truncate">{job.title}</h4>
        <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 truncate">{job.clientName}</p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-50/50 dark:border-slate-600/50 text-xs text-slate-500 dark:text-slate-400 mt-1 pointer-events-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isMyJob ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-600 text-slate-400 dark:text-slate-300'}`}>
            {isMultiStaff ? <Users size={12} /> : <User size={12} />}
          </div>
          <span className={`font-medium truncate ${isMyJob ? 'text-blue-700 dark:text-blue-300 font-bold' : 'text-slate-600 dark:text-slate-400'}`} title={staffName}>
            {staffName}
          </span>
        </div>
        <div className={`flex items-center gap-1 bg-slate-50 dark:bg-slate-600 px-1.5 py-0.5 rounded shrink-0 ${daysRemaining <= 3 ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
          {job.priority === Priority.VERY_URGENT && <AlertTriangle size={12} className="text-red-500" />}
          <span className="font-mono">
            {daysRemaining < 0 ? `+${Math.abs(daysRemaining)}` : `D-${daysRemaining}`}
          </span>
        </div>
      </div>
    </div>
  );
};
