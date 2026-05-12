
import React from 'react';
import { Job, Priority, Staff, JobStatusDefinition } from '../../types';
import { CheckCircle2, User, Calendar, AlertTriangle, Phone, MessageCircle, Layers, Users } from 'lucide-react';

interface JobStatusItemProps {
  job: Job;
  staff: Staff[];
  statusDefinitions: JobStatusDefinition[];
  onContact?: (job: Job) => void;
}

export const JobStatusItem: React.FC<JobStatusItemProps> = ({ job, staff, statusDefinitions, onContact }) => {
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
  const isDone = job.status === 'DELIVERY';

  // Multi-job Detection
  const subJobCount = job.subJobs ? job.subJobs.length : 1;
  const isMultiJob = subJobCount > 1;

  // Calculate Days Remaining
  const now = new Date();
  const due = new Date(job.dueDate);
  const diffTime = due.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // Determine Container Styles
  let containerStyles = "bg-white dark:bg-slate-700 border rounded-xl p-2 md:p-2.5 transition-all hover:shadow-lg shadow-sm group";
  let priorityBadgeStyles = "bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300";
  let dateTextStyles = "";

  if (job.priority === Priority.VERY_URGENT) {
    containerStyles += " bg-red-50 dark:bg-red-900/20 border-red-500 border-2 shadow-sm ring-1 ring-red-200 dark:ring-red-800 animate-pulse";
    priorityBadgeStyles = "bg-red-600 text-white shadow-sm";
  } else if (job.priority === Priority.URGENT) {
    containerStyles += " bg-red-50/50 dark:bg-red-900/10 border-red-300 dark:border-red-800 border shadow-sm animate-pulse";
    priorityBadgeStyles = "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800";
  } else {
    if (daysRemaining < 0 && !isDone) {
       containerStyles += " bg-slate-50 dark:bg-slate-800 border-slate-400 dark:border-slate-500 border shadow-sm animate-pulse";
       dateTextStyles = "text-slate-800 dark:text-slate-200 font-extrabold";
    } else if (daysRemaining <= 1 && !isDone) {
       containerStyles += " bg-orange-50/50 dark:bg-orange-900/10 border-orange-300 dark:border-orange-800 border shadow-sm animate-pulse";
       dateTextStyles = "text-red-600 dark:text-red-400 font-bold";
    } else if (daysRemaining <= 3) {
       containerStyles += " bg-white dark:bg-slate-700 border-slate-400 dark:border-slate-500 border transition-all hover:shadow-lg shadow-sm";
       dateTextStyles = "text-orange-600 dark:text-orange-400 font-bold";
    } else {
       containerStyles += " bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 border transition-all hover:shadow-lg shadow-sm";
    }
  }

  const stepStyles = [
    { bg: 'bg-red-500', border: 'border-red-500', text: 'text-red-600 dark:text-red-400' },
    { bg: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600 dark:text-orange-400' },
    { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-600 dark:text-amber-400' },
    { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    { bg: 'bg-blue-600', border: 'border-blue-600', text: 'text-blue-600 dark:text-blue-400' }
  ];

  return (
    <div className={containerStyles}>
      <div className="flex flex-col gap-1.5">
        {/* Row 1: Horizontal Info (Title, Client, Staff, Phone) */}
        <div className="flex flex-wrap items-center justify-between gap-y-1 gap-x-2">
           
           {/* Left Group: Title & Badges */}
           <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Badges */}
              <div className="flex items-center gap-1 shrink-0">
                {(job.priority !== Priority.NORMAL || daysRemaining <= 3) && (
                  <span className={`text-[10px] font-bold px-1 py-0.5 rounded flex items-center gap-1 ${priorityBadgeStyles}`}>
                    {job.priority === Priority.VERY_URGENT && <AlertTriangle size={10} />}
                    {job.priority}
                  </span>
                )}
                {/* Type Badge / Multi Badge */}
                {isMultiJob ? (
                    <span className="text-[10px] text-white font-bold bg-slate-600 dark:bg-slate-500 px-1.5 py-0.5 rounded border border-slate-700 dark:border-slate-500 whitespace-nowrap flex items-center gap-1 shadow-sm">
                        <Layers size={10} /> +{subJobCount}
                    </span>
                ) : (
                    <span className="text-[10px] text-slate-500 dark:text-slate-300 font-medium bg-slate-100 dark:bg-slate-600 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-500 whitespace-nowrap">
                        {job.type}
                    </span>
                )}
              </div>

              {/* Title & Client */}
              <div className="flex items-baseline gap-1.5 min-w-0">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate leading-tight" title={job.title}>
                    {job.title}
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:inline">- {job.clientName}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate sm:hidden block">{job.clientName}</span>
              </div>
           </div>

           {/* Right Group: Staff, Contact, Date */}
           <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 shrink-0 ml-auto sm:ml-0 bg-slate-50/50 dark:bg-slate-800/50 rounded-lg py-0.5 px-1.5">
              {/* Staff - Modified to show ALL staff */}
              <div className="flex items-center gap-1.5" title="담당자">
                {assignedStaff.length > 0 ? (
                    <div className="flex items-center gap-1">
                        {assignedStaff.map((s, idx) => (
                            <React.Fragment key={s.id}>
                                <div className="flex items-center gap-1">
                                    <img src={s.avatarUrl} className="w-4 h-4 rounded-full border border-slate-200" alt="" />
                                    <span className="font-medium text-slate-600 dark:text-slate-300">{s.name}</span>
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

        {/* Row 2: Compact Stepper (Bottom Line) */}
        <div className="relative pt-0.5 px-1">
          {/* Background Line */}
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 dark:bg-slate-600 -translate-y-1/2 rounded-full z-0"></div>
          
          {/* Progress Line */}
          <div 
            className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 rounded-full z-0 transition-all duration-500"
            style={{ 
              width: `${(currentStepIdx / (statusDefinitions.length - 1)) * 100}%`,
              background: 'linear-gradient(to right, #ef4444, #f97316, #f59e0b, #10b981, #2563eb)'
            }}
          ></div>

          {/* Steps */}
          <div className="relative z-10 flex justify-between">
            {statusDefinitions.map((step, idx) => {
              const isCompleted = idx <= currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              // Use modulo to cycle through colors if more steps are added
              const style = stepStyles[idx % stepStyles.length];
              
              return (
                <div key={step.key} className="flex flex-col items-center gap-1 group cursor-default">
                  {/* Circle */}
                  <div className={`
                    w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center border transition-all duration-300
                    ${isCompleted 
                      ? `${style.bg} ${style.border} text-white shadow-sm` 
                      : 'bg-white dark:bg-slate-600 border-slate-300 dark:border-slate-500 text-slate-300 dark:text-slate-500'}
                    ${isCurrent && !isDone ? 'ring-2 ring-offset-1 ring-blue-100 dark:ring-slate-700 scale-110' : ''}
                  `}>
                    {isCompleted && <CheckCircle2 size={10} className="sm:w-3 sm:h-3" />}
                  </div>
                  {/* Label */}
                  <span className={`
                    text-[9px] sm:text-[10px] font-bold transition-colors duration-300 whitespace-nowrap
                    ${isCompleted ? style.text : 'text-slate-300 dark:text-slate-500'}
                    ${isCurrent ? 'scale-105' : ''}
                  `}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Multi-job sub-list preview (Optional: show types) */}
        {isMultiJob && (
            <div className="mt-1 flex gap-1 flex-wrap">
                {job.subJobs?.map((sub, idx) => (
                    <span key={idx} className="text-[10px] bg-slate-50 dark:bg-slate-600 text-slate-500 dark:text-slate-300 px-1.5 rounded border border-slate-100 dark:border-slate-500">
                        {sub.type}
                    </span>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};
