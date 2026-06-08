
import React, { useState } from 'react';
import { Job, JobStatusDefinition } from '../../types';
import { KanbanCard } from './KanbanCard';
import { db } from '../../services/dataService'; 
import { useTheme } from '../../contexts/ThemeContext';
import { Sparkles } from 'lucide-react';
import { AdBanner } from '../common/AdBanner';

interface KanbanColumnProps {
  statusDef: JobStatusDefinition;
  jobs: Job[];
  quoteJobs?: Job[]; // Added: 견적 대기 작업 목록
  getStaffName: (job?: Job) => string; // Updated signature
  onSelectJob: (job: Job) => void;
  onRightClickJob?: (job: Job) => void;
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
  quoteJobs, // Destruct here
  getStaffName, 
  onSelectJob, 
  onRightClickJob,
  onStatusChange, 
  onDropJob,
  currentUserId,
  isCompact = false,
  showAd = false,
  isTvMode = false
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const { theme } = useTheme();

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

  // Sort logic: Primary sort is 'order' to allow manual reordering.
  // Secondary sort (fallback) is Date.
  const sortedJobs = [...jobs].sort((a, b) => {
    // If orders are different, use order
    if (a.order !== b.order) return a.order - b.order;
    // Fallback: 접수일시 순 정렬
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
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
      className={`flex-1 flex flex-col h-full rounded-xl border transition-colors duration-200
        ${theme === 'trello'
          ? (isDragOver ? 'bg-[#24364e] border-[#384c66] shadow-sm' : 'bg-[#1d2d44] border-[#2c3e56] shadow-none')
          : (isDragOver 
              ? 'bg-blue-100/80 dark:bg-blue-900/50 border-blue-400 ring-2 ring-blue-300 ring-inset' 
              : 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200/60 dark:border-slate-700')
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
            onRightClick={onRightClickJob}
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

      {/* 📋 견적 대기 보관함 (접수 컬럼 하단에 반응형 콤팩트 단추로 자동 정렬) */}
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
          
          {/* 최대 3줄 높이로 제한하며 창 크기에 따라 자동으로 최대로 채워 가로 정렬 */}
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
