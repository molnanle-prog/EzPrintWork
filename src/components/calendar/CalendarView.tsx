
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, getHolidayName } from '../../services/dataService';
import { ensureKoreanHolidays } from '../../utils/koreanHolidays';
import { Job, Staff, StaffLeave, Priority, JobStatusDefinition, PaymentStatus, CalendarMark } from '../../types';
import { ChevronLeft, ChevronRight, Palmtree, Plus, Trash2, AlertCircle, Clock, Calendar as CalendarIcon, CheckCircle2, Tv, Users, Cake } from 'lucide-react';
import { calendarMarkOccursOn } from '../../utils/calendarMarkSchedule';
import { CalendarMarkArt } from './CalendarMarkArt';
import { CalendarMarkModal } from './CalendarMarkModal';
import { JobDetailModal } from '../common/JobDetailModal';
import { LeaveModal } from './LeaveModal';
import { useDialog } from '../../contexts/DialogContext';
import { AdBanner } from '../common/AdBanner';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme, Theme } from '../../contexts/ThemeContext';
import { isLongProjectJob, isJobBoardHidden } from '../../utils/jobBoardVisibility';
import { isJobPinnedToManagementCard } from '../../utils/managementCard';
import { getStaffIdForUser, isJobAssignedToStaffId } from '../../utils/staffMatch';
import { canManageLeave } from '../../utils/leaveOverlap';
import { isBoardStatusHidden } from '../../utils/boardStatusFilter';
import { useBoardStatusFilter } from '../../utils/useBoardStatusFilter';
import { toast } from 'sonner';
import { applyMonitoringFullscreen } from '../../utils/monitoringFullscreen';

interface CalendarViewProps {
  onNavigateToQuote: (quoteId?: string) => void;
}

function toLocalDateKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatLeaveDateParts(iso: string) {
  const key = iso.slice(0, 10);
  const date = parseLocalDateKey(key);
  const week = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  return {
    monthDay: `${date.getMonth() + 1}월 ${date.getDate()}일`,
    meta: `${date.getFullYear()} ${week}`,
  };
}

function leaveTypeTextClass(type: string) {
  if (type === '연차') return 'text-amber-700 dark:text-amber-300';
  if (type === '반차') return 'text-sky-700 dark:text-sky-300';
  if (type === '병가') return 'text-rose-600 dark:text-rose-300';
  return 'text-emerald-700 dark:text-emerald-300';
}

function leaveSpanDays(startIso: string, endIso: string) {
  const start = parseLocalDateKey(startIso.slice(0, 10)).getTime();
  const end = parseLocalDateKey(endIso.slice(0, 10)).getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

const JOB_BAR_COLORS_LIGHT = [
  'bg-red-100 text-red-900 border-red-200',
  'bg-orange-100 text-orange-900 border-orange-200',
  'bg-amber-100 text-amber-900 border-amber-200',
  'bg-yellow-100 text-yellow-900 border-yellow-300',
  'bg-lime-100 text-lime-900 border-lime-300',
  'bg-green-100 text-green-900 border-green-200',
  'bg-emerald-100 text-emerald-900 border-emerald-200',
  'bg-teal-100 text-teal-900 border-teal-200',
  'bg-cyan-100 text-cyan-900 border-cyan-200',
  'bg-sky-100 text-sky-900 border-sky-200',
  'bg-blue-100 text-blue-900 border-blue-200',
  'bg-indigo-100 text-indigo-900 border-indigo-200',
  'bg-violet-100 text-violet-900 border-violet-200',
  'bg-purple-100 text-purple-900 border-purple-200',
  'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200',
  'bg-pink-100 text-pink-900 border-pink-200',
  'bg-rose-100 text-rose-900 border-rose-200',
];

const JOB_BAR_COLORS_DARK = [
  'bg-red-600 text-white border-red-500',
  'bg-orange-600 text-white border-orange-500',
  'bg-amber-600 text-white border-amber-500',
  'bg-yellow-600 text-white border-yellow-500',
  'bg-lime-600 text-white border-lime-500',
  'bg-green-600 text-white border-green-500',
  'bg-emerald-600 text-white border-emerald-500',
  'bg-teal-600 text-white border-teal-500',
  'bg-cyan-600 text-white border-cyan-500',
  'bg-sky-600 text-white border-sky-500',
  'bg-blue-600 text-white border-blue-500',
  'bg-indigo-600 text-white border-indigo-500',
  'bg-violet-600 text-white border-violet-500',
  'bg-purple-600 text-white border-purple-500',
  'bg-fuchsia-600 text-white border-fuchsia-500',
  'bg-pink-600 text-white border-pink-500',
  'bg-rose-600 text-white border-rose-500',
];

function getJobColorStyles(id: string, theme: Theme) {
  const styles = theme === 'light' ? JOB_BAR_COLORS_LIGHT : JOB_BAR_COLORS_DARK;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return styles[Math.abs(hash) % styles.length];
}

/** 겹친 막대가 동시에 흐려지지 않도록 줄마다 펄스 위상만 어긋나게 */
function getPulseDelayMs(slotIndex: number) {
  return (slotIndex % 3) * 667;
}

const loadInitialAssigneeStaffIds = (): string[] | null => {
  const saved = localStorage.getItem('ez_calendar_assignee_staff_ids');
  if (saved !== null) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string');
      }
    } catch {
      return [];
    }
  }
  const oldOnlyMy = localStorage.getItem('ez_calendar_only_my_jobs') === 'true';
  const oldSingleId = localStorage.getItem('ez_calendar_assignee_staff_id');
  if (oldOnlyMy && oldSingleId) return [oldSingleId];
  return null;
};

export const CalendarView: React.FC<CalendarViewProps> = ({ onNavigateToQuote }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobsStats, setActiveJobsStats] = useState<Job[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [leaves, setLeaves] = useState<StaffLeave[]>([]);
  const [statusDefinitions, setStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobModalViewMode, setJobModalViewMode] = useState<'summary' | 'edit'>('summary');
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const { showConfirm, showAlert } = useDialog();
  const { showsAds, currentUser, canAccessAdminSettings } = useAuth();
  const { theme } = useTheme();
  
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveDraft, setLeaveDraft] = useState<StaffLeave | null>(null);
  const [calendarMarks, setCalendarMarks] = useState<CalendarMark[]>([]);
  const [editingMark, setEditingMark] = useState<CalendarMark | null>(null);
  const [viewingLeave, setViewingLeave] = useState<StaffLeave | null>(null);
  const [isTvMode, setIsTvMode] = useState<boolean>(() => {
    return localStorage.getItem('ezprint_tv_mode') === 'true';
  });

  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dragOverJobId, setDragOverJobId] = useState<string | null>(null);
  const [selectedAssigneeStaffIds, setSelectedAssigneeStaffIds] = useState<string[]>(() => loadInitialAssigneeStaffIds() ?? []);
  const [assigneeFilterInitialized, setAssigneeFilterInitialized] = useState(() => loadInitialAssigneeStaffIds() !== null);
  const [showAssigneePopover, setShowAssigneePopover] = useState(false);
  const [filterLongProjectOnly, setFilterLongProjectOnly] = useState<boolean>(() => localStorage.getItem('ez_calendar_only_long_projects') === 'true');
  const [hideHolidayJobs, setHideHolidayJobs] = useState<boolean>(() => localStorage.getItem('ez_calendar_hide_holiday_jobs') === 'true');
  const { hiddenStatusKeys: hiddenCalendarStatusKeys, boardStatusDefs: calendarStatusDefs, toggleBoardStatus: toggleCalendarStatus } = useBoardStatusFilter(
    currentUser?.tenantId,
    currentUser,
    staff,
    statusDefinitions
  );

  const defaultAssigneeStaffId = useMemo(
    () => (currentUser ? getStaffIdForUser(staff, currentUser) : undefined),
    [currentUser, staff]
  );

  const activeStaff = useMemo(() => staff.filter((s) => !s.isDeleted), [staff]);

  const toggleAssigneeStaff = useCallback((staffId: string) => {
    setSelectedAssigneeStaffIds((prev) =>
      prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId]
    );
  }, []);

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

  const handleDropOnBar = async (e: React.DragEvent, targetJobId: string) => {
    e.preventDefault();
    setDragOverJobId(null);
    const draggedId = e.dataTransfer.getData("text/plain") || draggedJobId;
    if (!draggedId || draggedId === targetJobId) return;

    const allJobs = db.getAllJobs();
    const draggedJob = allJobs.find(j => j.id === draggedId);
    const targetJob = allJobs.find(j => j.id === targetJobId);
    if (!draggedJob || !targetJob) return;

    const tempOrder = draggedJob.order;
    draggedJob.order = targetJob.order;
    targetJob.order = tempOrder;

    if (draggedJob.order === targetJob.order) {
      draggedJob.order = targetJob.order + 1;
    }

    let newAllJobs = [...allJobs];
    const draggedIdx = newAllJobs.findIndex(j => j.id === draggedId);
    const targetIdx = newAllJobs.findIndex(j => j.id === targetJobId);
    if (draggedIdx !== -1) newAllJobs[draggedIdx] = draggedJob;
    if (targetIdx !== -1) newAllJobs[targetIdx] = targetJob;

    try {
      await db.saveJobs(newAllJobs);
    } catch (error) {
      console.error("Failed to swap order in calendar:", error);
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

  useEffect(() => {
    localStorage.setItem('ez_calendar_assignee_staff_ids', JSON.stringify(selectedAssigneeStaffIds));
  }, [selectedAssigneeStaffIds]);

  useEffect(() => {
    if (assigneeFilterInitialized || !defaultAssigneeStaffId) return;
    setSelectedAssigneeStaffIds([defaultAssigneeStaffId]);
    setAssigneeFilterInitialized(true);
  }, [assigneeFilterInitialized, defaultAssigneeStaffId]);

  useEffect(() => {
    if (selectedAssigneeStaffIds.length === 0) return;
    const validIds = new Set(activeStaff.map((s) => s.id));
    const filtered = selectedAssigneeStaffIds.filter((id) => validIds.has(id));
    if (filtered.length !== selectedAssigneeStaffIds.length) {
      setSelectedAssigneeStaffIds(filtered);
    }
  }, [activeStaff, selectedAssigneeStaffIds]);

  useEffect(() => {
    localStorage.setItem('ez_calendar_only_long_projects', String(filterLongProjectOnly));
  }, [filterLongProjectOnly]);

  useEffect(() => {
    localStorage.setItem('ez_calendar_hide_holiday_jobs', String(hideHolidayJobs));
  }, [hideHolidayJobs]);

  const paintCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const currentMonthJobs = db.getJobsByMonth(year, month);
    const prevMonthJobs = db.getJobsByMonth(year, month - 1);
    const nextMonthJobs = db.getJobsByMonth(year, month + 1);
    const jobMap = new Map();
    [...prevMonthJobs, ...currentMonthJobs, ...nextMonthJobs].forEach((j) => jobMap.set(j.id, j));
    setJobs(Array.from(jobMap.values()));
    setActiveJobsStats(db.getActiveJobs());
    setStaff(db.getStaff());
    setLeaves(db.getLeaves());
    setStatusDefinitions(db.getStatusDefinitions());
    setCalendarMarks(db.getCalendarMarks());
  };

  const [holidayTick, setHolidayTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void ensureKoreanHolidays().then((updated) => {
      if (!cancelled && updated) setHolidayTick((tick) => tick + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [currentDate.getFullYear()]);

  useEffect(() => {
    let cancelled = false;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    paintCalendar();
    db.ensureLeavesSync();
    void db.ensureCalendarJobsSync(year, month).then(() => {
      if (!cancelled) paintCalendar();
    });
    void db.ensureCalendarMarks();
    void db.ensureColdArchiveLoaded().then(() => {
      if (!cancelled) paintCalendar();
    });
    const unsubscribe = db.subscribe(() => {
      if (!cancelled) paintCalendar();
    });
    const timer = window.setInterval(() => {
      void db.ensureCalendarMarks();
    }, 3000);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [currentDate]);

  // --- Layout Calculation Logic (Tetris/Slot Algorithm) ---
  const calendarLayout = useMemo(() => {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const firstDayOfMonth = new Date(year, month, 1).getDay();
      const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
      
      // Generate date keys for the grid (including padding for start of week)
      const gridStartDate = new Date(year, month, 1);
      gridStartDate.setDate(1 - firstDayOfMonth);
      
      const totalDaysNeeded = firstDayOfMonth + lastDateOfMonth;
      const weeksNeeded = Math.ceil(totalDaysNeeded / 7);
      const totalGridCells = weeksNeeded * 7;

      const gridDates: string[] = [];
      for (let i = 0; i < totalGridCells; i++) {
          const d = new Date(gridStartDate);
          d.setDate(gridStartDate.getDate() + i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          gridDates.push(`${y}-${m}-${day}`);
      }

      const viewStartTs = parseLocalDateKey(gridDates[0]).getTime();
      const viewEndTs = parseLocalDateKey(gridDates[gridDates.length - 1]).getTime() + (24 * 60 * 60 * 1000) - 1;

      const visibleJobs = jobs.filter(job => {
          if (isJobBoardHidden(job) || isJobPinnedToManagementCard(job)) return false;
          if (isBoardStatusHidden(job, hiddenCalendarStatusKeys)) return false;
          const start = new Date(job.createdAt).getTime();
          const end = new Date(job.dueDate).getTime();
          if (!(end >= viewStartTs && start <= viewEndTs && job.status !== 'CANCELED' && job.status !== 'QUOTE')) {
            return false;
          }
          if (selectedAssigneeStaffIds.length > 0) {
            const matchesAny = selectedAssigneeStaffIds.some((id) => isJobAssignedToStaffId(job, id, staff));
            if (!matchesAny) return false;
          }
          if (filterLongProjectOnly && !isLongProjectJob(job)) return false;
          return true;
      });

      visibleJobs.sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          const startA = new Date(a.createdAt).getTime();
          const startB = new Date(b.createdAt).getTime();
          return startA - startB;
      });

      const slots: { [date: string]: (Job | null)[] } = {};
      gridDates.forEach(date => slots[date] = []);

      visibleJobs.forEach(job => {
          const jobStartKey = toLocalDateKey(job.createdAt);
          const jobEndKey = toLocalDateKey(job.dueDate);
          if (!jobStartKey || !jobEndKey) return;
          const rangeStart = jobStartKey <= jobEndKey ? jobStartKey : jobEndKey;
          const rangeEnd = jobStartKey <= jobEndKey ? jobEndKey : jobStartKey;
          const activeDates = gridDates.filter((dateKey) => dateKey >= rangeStart && dateKey <= rangeEnd);
          if (activeDates.length === 0) return;
          let rowIndex = 0;
          while (true) {
              const isRowFree = activeDates.every(dateKey => !slots[dateKey][rowIndex]);
              if (isRowFree) break;
              rowIndex++;
          }
          activeDates.forEach(dateKey => {
              while (slots[dateKey].length <= rowIndex) slots[dateKey].push(null);
              slots[dateKey][rowIndex] = job;
          });
      });
      return { gridDates, slots };
  }, [jobs, currentDate, staff, selectedAssigneeStaffIds, filterLongProjectOnly, hiddenCalendarStatusKeys]);

  // Find the best padding cells for the Ad
  const adCellIndices = useMemo(() => {
    const { gridDates } = calendarLayout;
    if (!showsAds) return [];
    
    // Find non-current month cells
    const paddingIndices = gridDates.reduce((acc: number[], dateKey, idx) => {
        const [y, m] = dateKey.split('-').map(Number);
        if ((m - 1) !== currentDate.getMonth()) acc.push(idx);
        return acc;
    }, []);

    if (paddingIndices.length === 0) return [];
    
    // Pick two separate cells: First and Last padding cells
    if (paddingIndices.length >= 2) {
        return [paddingIndices[0], paddingIndices[paddingIndices.length - 1]];
    }
    return [paddingIndices[0]];
  }, [calendarLayout, currentDate, showsAds]);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const handleUpdateJob = async (updated: Job) => {
    try {
      await db.updateJob(updated);
      setSelectedJob(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '작업 저장에 실패했습니다.';
      toast.error(msg);
      throw error;
    }
  };

  const handleCreateJob = async (newJob: Job) => {
    try {
      await db.addJob(newJob);
      setIsCreatingJob(false);
      setSelectedJob(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '작업 등록에 실패했습니다.';
      toast.error(msg);
      throw error;
    }
  };

  const canDeleteThisLeave = (leave: StaffLeave) =>
    canManageLeave(leave, currentUser, staff, canAccessAdminSettings);

  const handleDeleteLeave = async (id: string, name: string) => {
    const leave = leaves.find((item) => item.id === id);
    if (!leave || !canManageLeave(leave, currentUser, staff, canAccessAdminSettings)) {
      await showAlert('휴가 삭제는 등록 본인 또는 관리자만 할 수 있습니다.');
      return;
    }
    if (await showConfirm(`${name}의 휴가 일정을 삭제하시겠습니까?`)) {
        await db.deleteLeave(id);
        paintCalendar();
    }
  };

  const getStaffName = (id: string) => staff.find(s => s.id === id)?.name || '직원';
  // --- Render ---
  const renderCells = () => {
    const { gridDates, slots } = calendarLayout;
    
    return gridDates.map((dateKey, index) => {
        const isAdCell = adCellIndices.includes(index);
        // Construct Date object manually to ensure local time interpretation from string YYYY-MM-DD
        const [y, m, d] = dateKey.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        
        const isCurrentMonth = dateObj.getMonth() === currentDate.getMonth();
        const isToday = new Date().toDateString() === dateObj.toDateString();
        const dayOfWeek = dateObj.getDay();
        const holidayName = holidayTick >= 0 ? getHolidayName(dateObj) : null;

        // Styling
        let dateColorClass = isCurrentMonth 
          ? (theme === 'trello' ? 'text-slate-300' : 'text-slate-700 dark:text-slate-300') 
          : (theme === 'trello' ? 'text-slate-500' : 'text-slate-300 dark:text-slate-600');
          
        let bgColorClass = isCurrentMonth 
          ? (theme === 'trello' ? 'bg-[#152238]' : 'bg-white dark:bg-slate-800') 
          : (theme === 'trello' ? 'bg-[#182535]' : 'bg-slate-50/50 dark:bg-slate-900/50');
        
        if (isCurrentMonth) {
            if (dayOfWeek === 0 || holidayName) dateColorClass = 'text-red-500 dark:text-red-400';
            else if (dayOfWeek === 6) dateColorClass = 'text-blue-500 dark:text-blue-400';
        }

        const dayLeaves = leaves.filter(leave => {
            const start = new Date(leave.startDate); start.setHours(0,0,0,0);
            const end = new Date(leave.endDate); end.setHours(23,59,59,999);
            const current = dateObj.getTime();
            return current >= start.getTime() && current <= end.getTime();
        });

        // Current Day's Job Slots
        const daySlots = slots[dateKey] || [];
        const hideJobsOnThisDay = hideHolidayJobs && !!holidayName;
        const dayMarks = calendarMarks.filter((mark) => calendarMarkOccursOn(mark, dateKey));
        let markCursor = 0;

        return (
            <div 
                key={dateKey} 
                className={`
                    min-h-full border-b border-r flex flex-col transition-all duration-200 relative group/cell
                    ${theme === 'trello' ? 'border-[#2c3e56]' : 'border-slate-100 dark:border-slate-700'}
                    ${isToday ? (theme === 'trello' ? 'bg-[#24364e]' : 'bg-blue-50 dark:bg-blue-900/20') : bgColorClass}
                    ${isAdCell ? 'p-0 overflow-hidden' : theme === 'trello' ? 'hover:bg-[#1d2d44]' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}
                `}
            >
                {isAdCell ? (
                    <div className="w-full h-full flex items-center justify-center p-1 bg-slate-50 dark:bg-slate-900/40">
                         <AdBanner slot={`calendar_day_${index}`} size="234x60" type="dashed" />
                    </div>
                ) : (
                    <>
                        {/* Header: Date & Add Button */}
                        <div className={`sticky top-0 z-20 flex items-center h-7 px-1 gap-0.5 flex-none overflow-hidden ${isToday ? (theme === 'trello' ? 'bg-[#24364e]' : 'bg-blue-50 dark:bg-blue-950') : isCurrentMonth ? (theme === 'trello' ? 'bg-[#152238]' : 'bg-white dark:bg-slate-800') : (theme === 'trello' ? 'bg-[#182535]' : 'bg-slate-50 dark:bg-slate-900')}`}>
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                                <span className={`text-sm font-bold w-6 h-6 shrink-0 flex items-center justify-center rounded-full transition-all ${isToday ? 'bg-blue-600 text-white shadow-md' : dateColorClass}`}>
                                    {dateObj.getDate()}
                                </span>
                                {holidayName && (
                                    <span className="text-[10px] bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-200 px-1 py-0.5 rounded font-bold truncate min-w-0">
                                        {holidayName}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                                    setEditingMark({
                                        id,
                                        text: '',
                                        icon: 'cake',
                                        repeat: 'yearly',
                                        calendar: 'solar',
                                        date: dateKey,
                                    });
                                }}
                                className="opacity-0 group-hover/cell:opacity-100 p-0.5 bg-amber-100 text-amber-700 rounded hover:bg-amber-200 transition-opacity"
                                title="이 날짜에 표시"
                            >
                                <Cake size={14} />
                            </button>
                            <button 
                                onClick={() => {
                                    const newJobDate = new Date(dateObj);
                                    newJobDate.setHours(9, 0, 0, 0);
                                    const defaultJob: Job = { 
                                        id: '',
                                        title: '',
                                        clientName: '',
                                        description: '',
                                        specs: { paperType: '', paperWeight: '', size: '', quantity: '', processing: [], printColor: '단면 4도(컬러)', memo: '' },
                                        status: 'RECEIVED', priority: Priority.NORMAL, paymentStatus: '결제대기',
                                        progress: 0, type: db.getJobTypes()[0] || '기타', price: 0, order: 0,
                                        createdAt: newJobDate.toISOString(), 
                                        dueDate: newJobDate.toISOString() 
                                    };
                                    setSelectedJob(defaultJob);
                                    setIsCreatingJob(true);
                                }}
                                className="opacity-0 group-hover/cell:opacity-100 p-0.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-opacity"
                                title="이 날짜에 작업 등록"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </>
                )}

                {/* Content Area */}
                <div className="flex-1 flex flex-col gap-0.5 w-full pb-1 relative z-10">
                    {/* Vacations (Always on top) */}
                    {dayLeaves.map(leave => (
                        <div
                          key={leave.id}
                          className="mx-1 mb-0.5 flex items-center text-purple-900 dark:text-purple-50 px-1.5 py-0.5 rounded border border-dashed border-purple-500 text-[10px] font-bold truncate"
                          style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(168,85,247,0.16) 0 3px, rgba(168,85,247,0.5) 3px 6px)' }}
                        >
                            <button
                              type="button"
                              className="truncate flex-1 text-left"
                              title={`휴가 ${leave.type} ${getStaffName(leave.staffId)}`}
                              onClick={(e) => { e.stopPropagation(); setViewingLeave(leave); }}
                            >
                              휴가 <span className={leaveTypeTextClass(leave.type)}>{leave.type}</span> {getStaffName(leave.staffId)}
                            </button>
                            {canDeleteThisLeave(leave) && (
                              <button
                                type="button"
                                onClick={(e) => {e.stopPropagation(); handleDeleteLeave(leave.id, getStaffName(leave.staffId));}}
                                className="ml-1 hover:text-red-600"
                                title="휴가 삭제"
                              >
                                <Trash2 size={10} />
                              </button>
                            )}
                        </div>
                    ))}

                    {/* Job Slots. 쉬는 날 가리기는 작업만 빼고 칸 표시는 남긴다. */}
                    {hideJobsOnThisDay && dayMarks.map((mark) => (
                        <button
                            key={mark.id}
                            type="button"
                            onClick={() => setEditingMark(mark)}
                            className="mx-1 h-5 flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-300"
                            title={mark.text}
                        >
                            <CalendarMarkArt icon={mark.icon} size={12} />
                            <span className="truncate">{mark.text}</span>
                        </button>
                    ))}
                    {!hideJobsOnThisDay && daySlots.length === 0 && dayMarks.map((mark) => (
                        <button
                            key={mark.id}
                            type="button"
                            onClick={() => setEditingMark(mark)}
                            className="mx-1 h-5 flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-300 z-0"
                            title={mark.text}
                        >
                            <CalendarMarkArt icon={mark.icon} size={12} />
                            <span className="truncate">{mark.text}</span>
                        </button>
                    ))}
                    {!hideJobsOnThisDay && daySlots.map((job, idx) => {
                        if (!job) {
                            const mark = dayMarks[markCursor];
                            if (mark) {
                                markCursor += 1;
                                return (
                                    <button
                                        key={mark.id}
                                        type="button"
                                        onClick={() => setEditingMark(mark)}
                                        className="mx-1 h-5 flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-300 z-0"
                                        title={mark.text}
                                    >
                                        <CalendarMarkArt icon={mark.icon} size={12} />
                                        <span className="truncate">{mark.text}</span>
                                    </button>
                                );
                            }
                            return <div key={`empty-${idx}`} className="h-5"></div>;
                        }

                        const jobStartDateStr = toLocalDateKey(job.createdAt);
                        const jobEndDateStr = toLocalDateKey(job.dueDate);
                        const isStart = jobStartDateStr === dateKey;
                        const isEnd = jobEndDateStr === dateKey;
                        const isSingleDay = isStart && isEnd;
                        const isSunday = dateObj.getDay() === 0;
                        const isFirstDayOfGrid = dateKey === gridDates[0];
                        const showLabel = isSingleDay || isStart || isEnd || isSunday || isFirstDayOfGrid;
                        const isDone = job.status === 'DELIVERY';
                        const isHovered = hoveredJobId === job.id;
                        const due = new Date(job.dueDate);
                        const daysRemaining = Math.ceil((due.getTime() - Date.now()) / (1000 * 3600 * 24));
                        const isPulsing = !isDone && (job.priority === Priority.VERY_URGENT || daysRemaining <= 1);

                        let containerClass = `h-5 flex items-center shadow-sm transition-all cursor-pointer border text-[10px] relative ${getJobColorStyles(job.id, theme)}`;
                        let textClass = "truncate font-bold px-1 w-full flex items-center gap-1";

                        if (isSingleDay) {
                            containerClass += " mx-1 rounded-md";
                        } else if (isStart) {
                            containerClass += " ml-1 mr-[-1px] rounded-l-md rounded-r-none border-r-0 z-10";
                        } else if (isEnd) {
                            containerClass += " mr-1 ml-[-1px] rounded-r-md rounded-l-none border-l-0 z-10 justify-end";
                            textClass += " justify-end text-right";
                        } else {
                            containerClass += " mx-[-1px] rounded-none border-x-0 z-10";
                        }

                        if (isPulsing) {
                            if (job.priority === Priority.VERY_URGENT) containerClass += " animate-pulse ring-1 ring-red-400 z-20";
                            else containerClass += " animate-pulse ring-1 ring-indigo-400 z-10";
                        }

                        if (isDone) containerClass += " opacity-60 grayscale";
                        if (isHovered) containerClass += " ring-2 ring-blue-400 z-30 shadow-md opacity-100 animate-none brightness-105";

                        const content = (
                            <>
                                {isDone && <CheckCircle2 size={10} className="inline mr-0.5 text-emerald-100" />}
                                {job.title} <span className="font-normal opacity-80 hidden sm:inline">({job.clientName})</span>
                            </>
                        );

                        return (
                            <div
                                key={job.id}
                                onClick={() => { setSelectedJob(job); setJobModalViewMode('summary'); }}
                                onContextMenu={(e) => { e.preventDefault(); setSelectedJob(job); setJobModalViewMode('edit'); }}
                                onMouseEnter={() => setHoveredJobId(job.id)}
                                onMouseLeave={() => setHoveredJobId(null)}
                                className={`${containerClass} ${dragOverJobId === job.id ? 'ring-4 ring-blue-500 scale-[1.05] z-50 brightness-110' : ''}`}
                                style={isPulsing && !isHovered ? { animationDelay: `-${getPulseDelayMs(idx)}ms` } : undefined}
                                title={`${job.title} (${job.clientName}) - ${new Date(job.dueDate).toLocaleDateString()} 마감`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, job.id)}
                                onDragOver={(e) => handleDragOver(e, job.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDropOnBar(e, job.id)}
                            >
                                {isDone && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void db.hideJobFromBoard(job.id, currentUser?.id);
                                    }}
                                    className="absolute right-0.5 top-0.5 z-20 rounded bg-slate-900/70 text-white text-[9px] px-1"
                                    title="보드에서 내리기"
                                  >
                                    숨김
                                  </button>
                                )}
                                {showLabel && <span className={textClass}>{content}</span>}
                            </div>
                        );
                    })}
                    {!hideJobsOnThisDay && daySlots.some((job) => job) && dayMarks.slice(markCursor).map((mark, overflowIndex) => (
                        <button
                            key={mark.id}
                            type="button"
                            onClick={() => setEditingMark(mark)}
                            className="absolute inset-x-1 z-0 mx-0 h-5 flex items-center gap-1 text-[10px] font-bold text-slate-400 pointer-events-auto"
                            style={{ bottom: `${overflowIndex * 20}px` }}
                            title={mark.text}
                        >
                            <CalendarMarkArt icon={mark.icon} size={12} />
                            <span className="truncate">{mark.text}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    });
  };

  return (
    <>
      <div className={`h-full flex flex-col rounded-xl shadow-sm border overflow-hidden transition-colors ${theme === 'trello' ? 'bg-[#152238] border-[#2c3e56]' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
        {isTvMode ? (
          <div className={`p-3 border-b flex items-center justify-center flex-none relative ${theme === 'trello' ? 'border-[#2c3e56] bg-[#1d2d44]' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850'}`}>
            <h2 className={`text-xl md:text-3xl font-bold flex items-center gap-3 ${theme === 'trello' ? 'text-slate-300' : 'text-slate-800 dark:text-slate-100'}`}>
              <CalendarIcon className="text-blue-600 dark:text-blue-400" size={28} />
              {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
            </h2>
          </div>
        ) : (
          <div className={`px-3 py-2 border-b flex items-center gap-2 flex-none whitespace-nowrap ${theme === 'trello' ? 'border-[#2c3e56] bg-[#1d2d44]' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850'}`}>
            <div className="flex items-center gap-2 shrink-0">
              <h2 className={`text-base md:text-lg font-bold flex items-center gap-1.5 ${theme === 'trello' ? 'text-slate-300' : 'text-slate-800 dark:text-slate-100'}`}>
                <CalendarIcon className="text-blue-600 dark:text-blue-400 shrink-0" size={18} />
                <span>{currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월</span>
              </h2>
              <div className={`hidden lg:flex items-center gap-2 text-[11px] ${theme === 'trello' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                 <div className="flex items-center gap-1">
                   <div className="w-2 h-2 rounded-full bg-red-500"></div> <span>일</span>
                 </div>
                 <div className="flex items-center gap-1">
                   <div className="w-2 h-2 rounded-full bg-blue-500"></div> <span>토</span>
                 </div>
                 <div className="flex items-center gap-1">
                   <div className="w-2.5 h-2.5 rounded border border-dashed border-purple-500" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(168,85,247,0.16) 0 2px, rgba(168,85,247,0.5) 2px 3px)' }}></div> <span>휴가</span>
                 </div>
              </div>
            </div>

            {calendarStatusDefs.length > 0 ? (
              <div className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className={`flex items-center justify-center gap-x-2.5 w-max min-w-full text-xs ${theme === 'trello' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {calendarStatusDefs.map((status) => {
                    const checked = !hiddenCalendarStatusKeys.includes(status.key);
                    return (
                      <label
                        key={status.key}
                        className="flex items-center gap-1 cursor-pointer select-none shrink-0"
                        title={checked ? `${status.label} 숨기기` : `${status.label} 보기`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCalendarStatus(status.key)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0"
                        />
                        <span className={checked ? '' : 'opacity-50'}>{status.label}</span>
                      </label>
                    );
                  })}
                  <label
                    className="flex items-center gap-1 cursor-pointer select-none shrink-0"
                    title="쉬는 날 칸의 작업 막대만 가립니다. 칸 표시와 휴일 이름은 남습니다."
                  >
                    <input
                      type="checkbox"
                      checked={hideHolidayJobs}
                      onChange={() => setHideHolidayJobs((prev) => !prev)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0"
                    />
                    <span className={hideHolidayJobs ? '' : 'opacity-50'}>쉬는날 작업 가리기</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0 flex justify-center">
                <label
                  className={`flex items-center gap-1 cursor-pointer select-none text-xs ${theme === 'trello' ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}
                  title="쉬는 날 칸의 작업 막대만 가립니다. 칸 표시와 휴일 이름은 남습니다."
                >
                  <input
                    type="checkbox"
                    checked={hideHolidayJobs}
                    onChange={() => setHideHolidayJobs((prev) => !prev)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0"
                  />
                  <span className={hideHolidayJobs ? '' : 'opacity-50'}>쉬는날 작업 가리기</span>
                </label>
              </div>
            )}
            
            <div className="flex gap-1 items-center shrink-0 h-8">
              <div className="relative h-8">
                <button
                  onClick={() => setShowAssigneePopover((prev) => !prev)}
                  className={`h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-bold border box-border transition-colors ${
                    selectedAssigneeStaffIds.length > 0
                      ? 'bg-blue-600 text-white border-blue-600'
                      : theme === 'trello'
                        ? 'bg-[#1d2d44] border-[#2c3e56] text-slate-300'
                        : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                  }`}
                  title="담당자를 체크하면 해당 담당자 작업만 표시 (복수 선택 가능)"
                >
                  <Users size={14} />
                  담당자 보기
                  {selectedAssigneeStaffIds.length > 0 && (
                    <span className={`px-1.5 rounded text-[10px] font-bold ${selectedAssigneeStaffIds.length > 0 ? 'bg-white/20' : ''}`}>
                      {selectedAssigneeStaffIds.length}
                    </span>
                  )}
                </button>

                {showAssigneePopover && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowAssigneePopover(false)} />
                    <div
                      className={`absolute top-full right-0 mt-2 w-56 rounded-xl shadow-2xl border p-2 z-40 overflow-hidden ${
                        theme === 'trello'
                          ? 'bg-[#1d2d44] border-[#2c3e56]'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className={`px-3 py-2 border-b mb-1 flex items-center justify-between ${theme === 'trello' ? 'border-[#2c3e56]' : 'border-slate-100 dark:border-slate-700'}`}>
                        <p className={`text-[10px] font-medium uppercase tracking-widest ${theme === 'trello' ? 'text-slate-400' : 'text-slate-400'}`}>
                          담당자 선택
                        </p>
                        {selectedAssigneeStaffIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedAssigneeStaffIds([])}
                            className="text-[10px] font-bold text-blue-500 hover:text-blue-400"
                          >
                            전체 해제
                          </button>
                        )}
                      </div>
                      <div className="max-h-[280px] overflow-y-auto custom-scrollbar p-1 space-y-0.5">
                        {activeStaff.map((s) => {
                          const checked = selectedAssigneeStaffIds.includes(s.id);
                          return (
                            <label
                              key={s.id}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                theme === 'trello'
                                  ? checked
                                    ? 'bg-[#2c3e56] text-slate-200'
                                    : 'hover:bg-[#24364e] text-slate-300'
                                  : checked
                                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-200'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleAssigneeStaff(s.id)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 shrink-0"
                              />
                              <span className="text-sm font-medium truncate">
                                {s.name} <span className="text-xs opacity-70">({s.role})</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className={`px-3 py-2 text-[10px] ${theme === 'trello' ? 'text-slate-500' : 'text-slate-400'}`}>
                        체크한 담당자 작업만 표시 · 복수 선택 가능
                      </p>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setFilterLongProjectOnly((prev) => !prev)}
                className={`h-8 inline-flex items-center px-2.5 rounded-lg text-xs font-bold border box-border transition-colors ${
                  filterLongProjectOnly
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                }`}
                title="장기프로젝트만 보기 (담당자 보기와 함께 사용 가능)"
              >
                장기프로젝트만
              </button>

              <div className="hidden xl:flex gap-1 h-8">
                 <div className={`h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-bold border box-border ${theme === 'trello' ? 'bg-[#2c3e56] text-slate-300 border-[#384c66]' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800'}`}>
                    <AlertCircle size={14} />
                    <span>긴급: {activeJobsStats.filter(j => j.priority !== Priority.NORMAL).length}</span>
                 </div>
                 <div className={`h-8 inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-bold border box-border ${theme === 'trello' ? 'bg-[#2c3e56] text-slate-300 border-[#384c66]' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800'}`}>
                    <Clock size={14} />
                    <span>진행: {activeJobsStats.filter(j => j.status !== 'DELIVERY').length}</span>
                 </div>
              </div>
              
              <button
                onClick={() => {
                  const nextVal = !isTvMode;
                  setIsTvMode(nextVal);
                  localStorage.setItem('ezprint_tv_mode', String(nextVal));
                  window.dispatchEvent(new CustomEvent('ezprint-tv-mode-change', { detail: { isTvMode: nextVal } }));
                  applyMonitoringFullscreen(nextVal);
                }}
                className={`hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-bold transition-all border box-border select-none hover:scale-105 active:scale-95 shadow-md
                  ${isTvMode 
                    ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/40 hover:bg-purple-700' 
                    : 'bg-purple-900 dark:bg-purple-950 border-purple-800 dark:border-purple-900 text-white hover:bg-purple-800 dark:hover:bg-purple-900 hover:border-purple-500'}`}
                title="대형 화면용 모니터링 모드로 전환합니다"
              >
                <Tv size={14} className={isTvMode ? "text-white animate-pulse" : "text-purple-300"} />
                <span className="hidden xl:inline">모니터링 모드</span>
              </button>

              <button onClick={() => setIsCreatingJob(true)} className="h-8 inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 rounded-lg text-xs font-bold shadow-sm box-border transition-all hover:scale-105">
                 <Plus size={14} /><span className="hidden sm:inline">작업 등록</span>
               </button>

              <button onClick={() => { setLeaveDraft(null); setShowLeaveModal(true); }} className="h-8 inline-flex items-center gap-1 px-2.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 shadow-sm box-border">
                  <Palmtree size={14} /><span className="hidden sm:inline">휴가 등록</span>
              </button>
              <button
                onClick={() => {
                  const today = new Date();
                  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  setEditingMark({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    text: '',
                    icon: 'cake',
                    repeat: 'yearly',
                    calendar: 'solar',
                    date,
                  });
                }}
                className="h-8 inline-flex items-center gap-1 px-2.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 shadow-sm box-border"
                title="생일, 회식처럼 달력 칸에만 표시"
              >
                  <Cake size={14} /><span className="hidden sm:inline">칸 표시</span>
              </button>

              <div className="flex gap-1 items-center h-8">
                <button onClick={prevMonth} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 border shadow-sm box-border transition-colors ${theme === 'trello' ? 'bg-[#1d2d44] border-[#2c3e56] text-slate-300 hover:bg-[#24364e]' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600'}`}><ChevronLeft size={16} /></button>
                <button onClick={goToday} className={`h-8 inline-flex items-center px-3 rounded-lg text-xs font-bold shadow-sm border box-border transition-colors ${theme === 'trello' ? 'bg-[#1d2d44] border-[#2c3e56] text-slate-300 hover:bg-[#24364e]' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600'}`}>오늘</button>
                <button onClick={nextMonth} className={`h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 border shadow-sm box-border transition-colors ${theme === 'trello' ? 'bg-[#1d2d44] border-[#2c3e56] text-slate-300 hover:bg-[#24364e]' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600'}`}><ChevronRight size={16} /></button>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className={`flex-none overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] border-b ${theme === 'trello' ? 'border-[#2c3e56] bg-[#1d2d44]' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'}`}>
            <div className="grid grid-cols-7">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div key={d} className={`p-2 md:p-3 text-center text-xs md:text-sm font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : theme === 'trello' ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>
                {d}
              </div>
            ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden dark:bg-slate-800">
            {(() => {
              const cells = renderCells();
              const weeks: React.ReactNode[][] = [];
              for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
              return weeks.map((week, weekIndex) => (
                <div
                  key={weekIndex}
                  className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]"
                >
                  <div className="grid grid-cols-7 min-h-full">
                    {week}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      {isCreatingJob ? (
        <JobDetailModal 
          job={selectedJob && selectedJob.id === '' ? selectedJob : {
              id: '', title: '', clientName: '', description: '',
              specs: { paperType: '', paperWeight: '', size: '', quantity: '', processing: [], printColor: '단면 4도(컬러)', memo: '' },
              status: 'RECEIVED', priority: Priority.NORMAL, paymentStatus: '결제대기' as PaymentStatus,
              progress: 0, type: db.getJobTypes()[0] || '기타', price: 0, order: 0,
              createdAt: new Date().toISOString(), dueDate: new Date().toISOString()
          } as Job}
          staff={staff} 
          onClose={() => { setIsCreatingJob(false); setSelectedJob(null); }} 
          onUpdate={handleCreateJob}
          isNew={true}
        />
      ) : selectedJob && (
        <JobDetailModal 
          job={selectedJob} 
          staff={staff} 
          initialViewMode={jobModalViewMode}
          onClose={() => setSelectedJob(null)} 
          onUpdate={handleUpdateJob}
          onNavigateToQuote={onNavigateToQuote}
        />
      )}

      {editingMark && (
        <CalendarMarkModal
          mark={editingMark}
          onClose={() => setEditingMark(null)}
          onSave={async (mark) => {
            await db.saveCalendarMark(mark);
            setEditingMark(null);
            paintCalendar();
          }}
          onDelete={calendarMarks.some((row) => row.id === editingMark.id) ? async (id) => {
            await db.deleteCalendarMark(id);
            setEditingMark(null);
            paintCalendar();
          } : undefined}
        />
      )}

      {viewingLeave && (() => {
        const startParts = formatLeaveDateParts(viewingLeave.startDate);
        const endParts = formatLeaveDateParts(viewingLeave.endDate);
        const sameDay = viewingLeave.startDate.slice(0, 10) === viewingLeave.endDate.slice(0, 10);
        const spanDays = leaveSpanDays(viewingLeave.startDate, viewingLeave.endDate);
        return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setViewingLeave(null)}>
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 bg-purple-50 dark:bg-purple-950/40 border-b border-purple-100 dark:border-purple-900">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-wide text-purple-500">휴가</p>
                <p className="text-xl font-black text-slate-900 dark:text-white truncate">{getStaffName(viewingLeave.staffId)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-purple-600 px-3 py-1 text-sm font-black text-white">{viewingLeave.type}</span>
            </div>
            <div className={`grid ${sameDay ? 'grid-cols-1' : 'grid-cols-2'} border-b border-slate-200 dark:border-slate-700`}>
              <div className="px-5 py-4">
                <p className="text-[11px] font-bold text-slate-400 mb-1">{sameDay ? '날짜' : '시작'}</p>
                <p className="text-2xl font-black leading-none text-slate-900 dark:text-white">{startParts.monthDay}</p>
                <p className="mt-1 text-sm font-bold text-slate-500">{startParts.meta}</p>
              </div>
              {!sameDay && (
                <div className="px-5 py-4 border-l border-slate-200 dark:border-slate-700">
                  <p className="text-[11px] font-bold text-slate-400 mb-1">종료</p>
                  <p className="text-2xl font-black leading-none text-slate-900 dark:text-white">{endParts.monthDay}</p>
                  <p className="mt-1 text-sm font-bold text-slate-500">{endParts.meta}</p>
                </div>
              )}
            </div>
            <div className="px-5 py-2 text-xs font-bold text-purple-600 dark:text-purple-300 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700">
              {sameDay ? '당일' : `${spanDays}일`}
            </div>
            <div className="px-5 py-4">
              <p className="text-[11px] font-bold text-slate-400 mb-1">사유</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words min-h-6">
                {viewingLeave.reason?.trim() || '사유 없음'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700">
              {canDeleteThisLeave(viewingLeave) && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center h-9 w-[4.5rem] box-border text-sm font-bold rounded-lg border border-red-300 text-red-600 dark:border-red-700 dark:text-red-300"
                  onClick={() => {
                    const leave = viewingLeave;
                    setViewingLeave(null);
                    void handleDeleteLeave(leave.id, getStaffName(leave.staffId));
                  }}
                >
                  삭제
                </button>
              )}
              {canDeleteThisLeave(viewingLeave) && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center h-9 w-[4.5rem] box-border text-sm font-bold rounded-lg border border-purple-300 text-purple-700 dark:border-purple-600 dark:text-purple-200"
                  onClick={() => {
                    setLeaveDraft(viewingLeave);
                    setViewingLeave(null);
                    setShowLeaveModal(true);
                  }}
                >
                  수정
                </button>
              )}
              <button type="button" onClick={() => setViewingLeave(null)} className="inline-flex items-center justify-center h-9 w-[4.5rem] box-border text-sm font-bold rounded-lg border border-slate-200 dark:border-slate-600">
                닫기
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {showLeaveModal && (
        <LeaveModal 
            leave={leaveDraft}
            onClose={() => { setShowLeaveModal(false); setLeaveDraft(null); }}
            onSave={() => { setShowLeaveModal(false); setLeaveDraft(null); paintCalendar(); }}
            staffList={staff}
        />
      )}

      {isTvMode && (
        <button
          onClick={() => {
            setIsTvMode(false);
            localStorage.setItem('ezprint_tv_mode', 'false');
            window.dispatchEvent(new CustomEvent('ezprint-tv-mode-change', { detail: { isTvMode: false } }));
            applyMonitoringFullscreen(false);
          }}
          className="fixed top-3 right-[10%] md:right-[15%] z-[9999] flex items-center gap-1.5 px-3 py-2 bg-slate-900/95 hover:bg-slate-800 text-white rounded-xl border border-slate-700/80 shadow-2xl hover:scale-105 active:scale-95 transition-all text-xs font-bold backdrop-blur-md"
          title="일반 화면으로 복원 (모니터링 모드 종료)"
        >
          <Tv size={13} className="text-purple-400 animate-pulse" />
          <span>모니터링 끄기</span>
        </button>
      )}
    </>
  );
};
