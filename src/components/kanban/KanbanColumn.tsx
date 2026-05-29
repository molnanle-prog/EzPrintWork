
import React, { useState } from 'react';
import { Job, JobStatusDefinition } from '../../types';
import { KanbanCard } from './KanbanCard';
import { db } from '../../services/dataService'; 
import { Sparkles } from 'lucide-react';
import { AdBanner } from '../common/AdBanner';

interface KanbanColumnProps {
  statusDef: JobStatusDefinition;
  jobs: Job[];
  getStaffName: (job?: Job) => string; // Updated signature
  onSelectJob: (job: Job) => void;
  onStatusChange: (job: Job, direction: 'next' | 'prev') => void;
  onDropJob: (jobId: string, statusKey: string, targetJobId?: string) => void;
  currentUserId?: string;
  isCompact?: boolean;
  showAd?: boolean;
  isTvMode?: boolean;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
  statusDef, 
  jobs, 
  getStaffName, 
  onSelectJob, 
  onStatusChange, 
  onDropJob,
  currentUserId,
  isCompact = false,
  showAd = false,
  isTvMode = false
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const jobId = e.dataTransfer.getData("jobId");
    // If we drop on the column directly (not on a card), targetJobId is undefined
    if (jobId) {
      onDropJob(jobId, statusDef.key, undefined);
    }
  };

  const handleCardDrop = (draggedJobId: string, targetJobId: string) => {
      onDropJob(draggedJobId, statusDef.key, targetJobId);
  }

  return (
    <div 
      className={`flex-1 flex flex-col h-full rounded-xl border shadow-inner transition-colors duration-200
        ${isDragOver 
          ? 'bg-blue-100/80 dark:bg-blue-900/50 border-blue-400 ring-2 ring-blue-300 ring-inset' 
          : 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200/60 dark:border-slate-700'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="p-1.5 lg:p-2 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 rounded-t-xl backdrop-blur-sm sticky top-0 z-10">
        <h3 className={`font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 ${isTvMode ? 'text-[19px] lg:text-[22px] font-medium' : 'text-[15px] lg:text-[17px]'}`}>
          <div className={`rounded-full shadow-sm ${isTvMode ? 'w-3 h-3' : 'w-2 h-2'} ${getColorForStatus(statusDef.key)}`} />
          {statusDef.label}
        </h3>
        <span className={`bg-white dark:bg-slate-700 rounded-full font-medium text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600 shadow-sm ${isTvMode ? 'text-[13px] lg:text-[14px] px-3 py-0.5 font-medium' : 'text-[10px] px-2 py-0.5'}`}>
          {jobs.length}
        </span>
      </div>
      
      <div className="p-1 lg:p-1.5 flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
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
            onDropOnCard={handleCardDrop}
            isMyJob={currentUserId ? (job.assignedStaffIds?.includes(currentUserId) || job.assignedStaffId === currentUserId) : false}
            isCompact={isCompact}
            currentUserId={currentUserId}
            isTvMode={isTvMode}
          />
        ))}

        {/* Placeholder for dragging feedback if needed */}
        {isDragOver && (
          <div className="h-16 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 flex items-center justify-center pointer-events-none">
            <span className="text-blue-400 text-sm font-bold">맨 뒤로 이동</span>
          </div>
        )}
      </div>

      {showAd && (
        <div className="p-3 mt-auto flex-none">
          <AdBanner slot="kanban_column" type="dashed" size="300x250" format="rectangle" />
        </div>
      )}
    </div>
  );
};
