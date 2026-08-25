
import React from 'react';
import { Job, Priority, Staff, JobStatusDefinition } from '../../types';
import { CheckCircle2, User, Calendar, AlertTriangle, Phone, MessageCircle } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getJobUrgencyStyles,
  getJobUrgencyBadgeStyles,
  getJobUrgencyDateTextStyles,
} from '../../utils/jobUrgencyStyles';

interface JobStatusItemProps {
  job: Job;
  staff: Staff[];
  statusDefinitions: JobStatusDefinition[];
  onContact?: (job: Job) => void;
  onHideFromBoard?: (job: Job) => void;
}

export const JobStatusItem: React.FC<JobStatusItemProps> = ({ job, staff, statusDefinitions, onContact, onHideFromBoard }) => {
  const { theme } = useTheme();
  
  const getStatusStepIndex = (statusKey: string) => {
    return statusDefinitions.findIndex(def => def.key === statusKey);
  };

  const getAssignedStaffList = () => {
      // Fallback for migration
      const staffIds = job.assignedStaffIds || (job.assignedStaffId ? [job.assignedStaffId] : []);
      
      if (staffIds.length === 0) return [];
      
      // Map IDs to Staff objects, filtering out undefined ones
      return staffIds.map(id => staff.find(s => s.id === id)).filter((s): s is Staff => !!s);
  };

  const assignedStaff = getAssignedStaffList();
  const currentStepIdx = getStatusStepIndex(job.status);
  const isDone = job.status === 'DELIVERY' || job.status === 'COMPLETED';

  const typeLabels = (() => {
    if (job.subJobs && job.subJobs.length > 0) {
      const seen = new Set<string>();
      const labels: string[] = [];
      for (const sub of job.subJobs) {
        const type = (sub.type || '').trim();
        if (!type || seen.has(type)) continue;
        seen.add(type);
        labels.push(type);
      }
      if (labels.length > 0) return labels;
    }
    return job.type ? [job.type] : [];
  })();

  // Calculate Days Remaining
  const now = new Date();
  const due = new Date(job.dueDate);
  const diffTime = due.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const containerStyles = [
    'border rounded-xl p-2 md:p-2.5 transition-all hover:shadow-lg shadow-sm group',
    getJobUrgencyStyles({
      theme,
      priority: job.priority,
      daysRemaining,
      isDone,
      surface: 'dashboard',
    }),
  ].join(' ');

  const priorityBadgeStyles = getJobUrgencyBadgeStyles(theme, job.priority, daysRemaining);
  const dateTextStyles = getJobUrgencyDateTextStyles(daysRemaining, isDone);

  const stepFills = ['#f97316', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#ea580c', '#64748b'];

  return (
    <div className={containerStyles}>
      <div className="flex flex-col gap-1.5">
        {/* Row 1: Horizontal Info (Title, Client, Staff, Phone) */}
        <div className="flex flex-wrap items-center justify-between gap-y-1 gap-x-2">
           
           {/* Left Group: Title, Client, Types */}
           <div className="flex items-center gap-2 min-w-0 flex-1">
              {(job.priority !== Priority.NORMAL || daysRemaining <= 3) && (
                <span className={`text-[10px] font-bold px-1 py-0.5 rounded flex items-center gap-1 shrink-0 ${priorityBadgeStyles}`}>
                  {job.priority === Priority.VERY_URGENT && <AlertTriangle size={10} />}
                  {job.priority}
                </span>
              )}

              <div className="flex items-baseline gap-1.5 min-w-0">
                  <h3 className={`text-sm font-bold truncate leading-tight ${theme === 'trello' ? 'text-slate-100' : 'text-slate-800 dark:text-slate-100'}`} title={job.title}>
                    {job.title}
                  </h3>
                  <span className={`text-[11px] truncate hidden sm:inline ${theme === 'trello' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>- {job.clientName}</span>
                  <span className={`text-[11px] truncate sm:hidden block ${theme === 'trello' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{job.clientName}</span>
              </div>

              {typeLabels.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  {typeLabels.map((type) => (
                    <span
                      key={type}
                      className={`text-[10px] font-medium px-1 py-0.5 rounded border whitespace-nowrap ${theme === 'trello' ? 'text-slate-300 bg-[#2c3e56]/50 border-[#384c66]' : 'text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-600 border-slate-200 dark:border-slate-500'}`}
                    >
                      {type}
                    </span>
                  ))}
                </div>
              )}
           </div>

           {/* Right Group: Staff, Contact, Date */}
           <div className={`flex items-center gap-2 text-[11px] shrink-0 ml-auto sm:ml-0 rounded-lg py-0.5 px-1.5 ${theme === 'trello' ? 'text-slate-300 bg-[#152238]/60' : 'text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/50'}`}>
              {/* Staff - Modified to show ALL staff */}
              <div className="flex items-center gap-1.5" title="담당자">
                {assignedStaff.length > 0 ? (
                    <div className="flex items-center gap-1">
                        {assignedStaff.map((s, idx) => (
                            <React.Fragment key={s.id}>
                                <div className="flex items-center gap-1">
                                    <img src={s.avatarUrl} className="w-4 h-4 rounded-full border border-slate-200" alt="" />
                                    <span className={`font-medium ${theme === 'trello' ? 'text-slate-200' : 'text-slate-600 dark:text-slate-300'}`}>{s.name}</span>
                                </div>
                                {idx < assignedStaff.length - 1 && <span className="text-slate-300">,</span>}
                            </React.Fragment>
                        ))}
                    </div>
                ) : (
                    <div className="flex items-center gap-1">
                        <User size={12} className="text-slate-400"/>
                        <span className="text-slate-400">-</span>
                    </div>
                )}
              </div>

              <div className="w-px h-3 bg-slate-200 dark:bg-slate-600"></div>

              {/* Phone */}
              {job.clientPhone && (
                <div className="flex items-center gap-1 hidden sm:flex">
                   <Phone size={10} />
                   <span>{job.clientPhone}</span>
                </div>
              )}
               {onContact && (
                <button 
                  onClick={(e) => { e.stopPropagation(); onContact(job); }}
                  className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 rounded transition-colors"
                  title="고객 알림"
                >
                  <MessageCircle size={12} />
                </button>
               )}
               {onHideFromBoard && isDone && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onHideFromBoard(job);
                  }}
                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 rounded transition-colors"
                  title="보드에서 내리기"
                >
                  <CheckCircle2 size={12} />
                </button>
               )}

              <div className="w-px h-3 bg-slate-200 dark:bg-slate-600"></div>

              {/* Due Date */}
              <div className={`flex items-center gap-1 font-medium ${dateTextStyles}`}>
                 <Calendar size={10} />
                 <span>
                    {new Date(job.dueDate).toLocaleDateString()}
                    {daysRemaining <= 5 && !isDone && <span className="ml-1 font-mono">({daysRemaining < 0 ? `+${Math.abs(daysRemaining)}` : `D-${daysRemaining}`})</span>}
                 </span>
              </div>
           </div>
        </div>

        {/* Row 2: Segmented progress bar */}
        {statusDefinitions.length > 0 && (
          <div
            className={`flex h-6 overflow-hidden rounded-md border ${theme === 'trello' ? 'border-[#2c3e56] bg-[#0f1b2d]' : 'border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-800'}`}
            title={`현재: ${statusDefinitions[currentStepIdx]?.label || '-'}`}
          >
            {statusDefinitions.map((step, idx) => {
              const fill = stepFills[idx % stepFills.length];
              const reached = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              const divider = theme === 'trello' ? 'border-[#2c3e56]' : 'border-slate-200 dark:border-slate-600';
              return (
                <div
                  key={step.key}
                  className={`flex-1 min-w-0 flex items-center justify-center border-r last:border-r-0 text-[9px] sm:text-[10px] font-bold whitespace-nowrap px-0.5 ${divider} ${
                    isCurrent
                      ? 'text-white z-[1] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.85)]'
                      : reached
                        ? 'text-white/90'
                        : theme === 'trello'
                          ? 'text-slate-500'
                          : 'text-slate-400 dark:text-slate-500'
                  }`}
                  style={{
                    backgroundColor: isCurrent ? fill : reached ? fill : 'transparent',
                    opacity: reached && !isCurrent ? 0.55 : 1,
                  }}
                >
                  {step.label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
