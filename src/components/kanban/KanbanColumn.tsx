
import React from 'react';
import { Job, JobStatusDefinition } from '../../types';
import { KanbanCard } from './KanbanCard';
import { useTheme } from '../../contexts/ThemeContext';
import { AdBanner } from '../common/AdBanner';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

export const COLUMN_DROPPABLE_PREFIX = 'column:';

interface KanbanColumnProps {
  statusDef: JobStatusDefinition;
  jobs: Job[];
  quoteJobs?: Job[];
  getStaffName: (job?: Job) => string;
  onSelectJob: (job: Job) => void;
  onRightClickJob?: (job: Job) => void;
  onStatusChange: (job: Job, direction: 'next' | 'prev') => void;
  currentUserId?: string;
  isCompact?: boolean;
  showAd?: boolean;
  isTvMode?: boolean;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
  statusDef, 
  jobs, 
  quoteJobs,
  getStaffName, 
  onSelectJob, 
  onRightClickJob,
  onStatusChange, 
  currentUserId,
  isCompact = false,
  showAd = false,
  isTvMode = false
}) => {
  const { theme } = useTheme();
  const droppableId = `${COLUMN_DROPPABLE_PREFIX}${statusDef.key}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  const getColorForStatus = (statusKey: string) => {
    switch (statusKey) {
      case 'QUOTE': return 'bg-indigo-500';
      case 'RECEIVED': return 'bg-red-500';
      case 'DESIGN': return 'bg-orange-500';
      case 'PRINTING': return 'bg-amber-500';
      case 'POST_PROCESSING': return 'bg-emerald-500';
      case 'DELIVERY': return 'bg-blue-600';
      default: return 'bg-slate-500';
    }
  };

  const sortedJobs = [...jobs].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const jobIds = sortedJobs.map(job => job.id);

  return (
    <div 
      className={`flex-1 flex flex-col h-full rounded-xl border transition-colors duration-200
        ${theme === 'trello'
          ? (isOver ? 'bg-[#24364e] border-[#384c66] shadow-sm' : 'bg-[#1d2d44] border-[#2c3e56] shadow-none')
          : (isOver 
              ? 'bg-blue-100/80 dark:bg-blue-900/50 border-blue-400 ring-2 ring-blue-300 ring-inset' 
              : 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200/60 dark:border-slate-700')
        }
      `}
    >
      <div className={`p-1.5 lg:p-2 flex items-center justify-between rounded-t-xl sticky top-0 z-10 ${theme === "trello" ? "bg-transparent border-b border-transparent" : "bg-white/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 backdrop-blur-sm"}`}>
        <h3 className={`font-medium flex items-center gap-2 ${theme === "trello" ? "text-slate-300 font-bold" : "text-slate-700 dark:text-slate-200"} ${isTvMode ? 'text-[19px] lg:text-[22px] font-medium' : 'text-[15px] lg:text-[17px]'}`}>
          <div className={`rounded-full shadow-sm ${isTvMode ? 'w-3 h-3' : 'w-2 h-2'} ${getColorForStatus(statusDef.key)}`} />
          {statusDef.label}
        </h3>
        <span className={`rounded-full font-medium shadow-sm ${theme === "trello" ? "bg-[#2c3e56] text-slate-300 border-transparent shadow-none font-bold" : "bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600"} ${isTvMode ? 'text-[13px] lg:text-[14px] px-3 py-0.5 font-medium' : 'text-[10px] px-2 py-0.5'}`}>
          {jobs.length}
        </span>
      </div>
      
      <div
        ref={setNodeRef}
        data-kanban-column={statusDef.key}
        className={`flex-1 min-h-0 flex flex-col ${isOver ? 'ring-2 ring-inset ring-blue-400/60 rounded-b-xl' : ''}`}
      >
        <SortableContext items={jobIds} strategy={verticalListSortingStrategy}>
          <div className="p-1 lg:p-1.5 flex-1 overflow-y-auto flex flex-col gap-1.5 custom-scrollbar min-h-[160px]">
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
                onRightClick={onRightClickJob}
                onStatusChange={onStatusChange}
                isMyJob={currentUserId ? (job.assignedStaffIds?.includes(currentUserId) || job.assignedStaffId === currentUserId) : false}
                isCompact={isCompact}
                currentUserId={currentUserId}
                isTvMode={isTvMode}
              />
            ))}

            <div className="flex-1 min-h-[72px] shrink-0 rounded-lg border border-dashed border-transparent pointer-events-none" aria-hidden />

            {isOver && (
              <div className="h-12 shrink-0 rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/40 dark:bg-blue-900/20 flex items-center justify-center pointer-events-none">
                <span className="text-blue-500 dark:text-blue-300 text-xs font-bold">이 위치로 이동</span>
              </div>
            )}
          </div>
        </SortableContext>
      </div>

      {statusDef.key === 'RECEIVED' && quoteJobs && quoteJobs.length > 0 && (
        <div className={`p-2 border-t flex-none select-none ${
          theme === 'trello' 
            ? 'border-[#2c3e56] bg-[#182535]/80' 
            : 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60'
        }`}>
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[10px] lg:text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              📋 견적 문의 보관 상자
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
              theme === 'trello' 
                ? 'bg-[#2c3e56] text-slate-300' 
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}>
              {quoteJobs.length}
            </span>
          </div>
          
          <div className="max-h-[90px] overflow-y-auto custom-scrollbar flex flex-wrap gap-1 pr-0.5">
            {quoteJobs.map(job => (
              <button
                key={job.id}
                onClick={() => onSelectJob(job)}
                onContextMenu={(e) => { e.preventDefault(); onRightClickJob ? onRightClickJob(job) : onSelectJob(job); }}
                className="h-7 px-2.5 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] md:text-[11px] font-extrabold truncate transition-all active:scale-95 flex items-center justify-center max-w-[85px] shadow-sm select-none"
                title={`${job.title} | ${job.clientName} | ${job.price ? job.price.toLocaleString() + '원' : '금액 미정'}\n(클릭 또는 우클릭 시 상세 모달 열기)`}
              >
                {job.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {showAd && (
        <div className="p-3 mt-auto flex-none">
          <AdBanner slot="kanban_column" type="dashed" size="300x250" format="rectangle" />
        </div>
      )}
    </div>
  );
};
