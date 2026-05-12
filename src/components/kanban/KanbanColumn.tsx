
import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Job, JobStatusDefinition } from '../../types';
import { KanbanCard } from './KanbanCard';
import { db } from '../../services/dataService'; // Need staff access to resolve names

interface KanbanColumnProps {
  statusDef: JobStatusDefinition;
  jobs: Job[];
  getStaffName: (job?: Job) => string; // Updated signature
  onSelectJob: (job: Job) => void;
  onStatusChange: (job: Job, direction: 'next' | 'prev') => void;
  onDropJob: (jobId: string, statusKey: string, targetJobId?: string) => void;
  currentUserId?: string;
  isCompact?: boolean;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  statusDef,
  jobs,
  getStaffName,
  onSelectJob,
  onStatusChange,
  onDropJob,
  currentUserId,
  isCompact = false
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: statusDef.key,
    data: { type: 'Column', statusKey: statusDef.key }
  });

  const getColorForStatus = (statusKey: string) => {
    switch (statusKey) {
      case 'RECEIVED': return 'bg-red-500';
      case 'DESIGN': return 'bg-orange-500';
      case 'PRINTING': return 'bg-amber-500';
      case 'POST_PROCESSING': return 'bg-emerald-500';
      case 'DELIVERY': return 'bg-blue-600';
      default: return 'bg-slate-500';
    }
  };

  // Sort logic: Primary sort is 'order' to allow manual reordering.
  // Secondary sort (fallback) is Date.
  const sortedJobs = [...jobs].sort((a, b) => {
    // If orders are different, use order
    if (a.order !== b.order) return a.order - b.order;
    // Fallback
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 flex flex-col h-full rounded-xl border shadow-inner transition-colors duration-200
        ${isOver
          ? 'bg-blue-100/80 dark:bg-blue-900/50 border-blue-400 ring-2 ring-blue-300 ring-inset'
          : 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200/60 dark:border-slate-700'
        }
      `}
    >
      <div className="p-3 lg:p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 rounded-t-xl backdrop-blur-sm sticky top-0 z-10">
        <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 text-sm lg:text-base">
          <div className={`w-3 h-3 rounded-full shadow-sm ${getColorForStatus(statusDef.key)}`} />
          {statusDef.label}
        </h3>
        <span className="bg-white dark:bg-slate-700 px-2.5 py-0.5 rounded-full text-xs font-bold text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600 shadow-sm">
          {jobs.length}
        </span>
      </div>

      <div className="p-2 lg:p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
        {jobs.length === 0 && isCompact && (
          <div className="text-center text-slate-400 text-xs py-4">
            해당 날짜의 완료 내역이 없습니다.
          </div>
        )}
        {sortedJobs.map((job) => (
          <KanbanCard
            key={job.id}
            job={job}
            status={job.status}
            staffName={getStaffName(job)}
            onSelect={onSelectJob}
            onStatusChange={onStatusChange}
            onDropOnCard={() => { }}
            isMyJob={currentUserId ? (job.assignedStaffIds?.includes(currentUserId) || job.assignedStaffId === currentUserId) : false}
            isCompact={isCompact}
          />
        ))}
        {/* Placeholder for dragging feedback if needed */}
        {isOver && (
          <div className="min-h-16 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 flex items-center justify-center pointer-events-none fade-in">
          </div>
        )}
      </div>
    </div>
  );
};
