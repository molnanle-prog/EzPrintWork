import { Priority } from '../types';
import type { Theme } from '../contexts/ThemeContext';

export type JobUrgencySurface = 'kanban' | 'dashboard';

export interface JobUrgencyStyleInput {
  theme: Theme;
  priority: Priority;
  daysRemaining: number;
  isDone: boolean;
  isMyJob?: boolean;
  isTvMode?: boolean;
  surface?: JobUrgencySurface;
}

/** D-Day·우선순위에 따른 카드/항목 테두리·배경 (모든 테마 공통) */
export function getJobUrgencyStyles({
  theme,
  priority,
  daysRemaining,
  isDone,
  isMyJob = false,
  isTvMode = false,
  surface = 'kanban',
}: JobUrgencyStyleInput): string {
  const flowingRed = isTvMode ? 'flowing-border-red-lg' : 'flowing-border-red';
  const flowingRedSm = 'flowing-border-red-sm';
  const flowingOrangeSm = 'flowing-border-orange-sm';

  const trelloKanbanBase =
    'bg-white text-[#172b4d] shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)]';
  const trelloDashboardBase =
    'bg-[#1d2d44] border-[#2c3e56] text-slate-200 hover:border-[#384c66]';

  const lightDarkKanbanBase = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700';
  const lightDarkDashboardBase = 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700';

  const base =
    surface === 'dashboard'
      ? theme === 'trello'
        ? trelloDashboardBase
        : lightDarkDashboardBase
      : theme === 'trello'
        ? trelloKanbanBase
        : lightDarkKanbanBase;

  if (isDone) {
    return base;
  }

  let tierClass = '';

  if (priority === Priority.VERY_URGENT) {
    tierClass =
      surface === 'kanban'
        ? theme === 'trello'
          ? `job-urgency-very-urgent ${flowingRed} bg-red-50 border-2 border-red-600 shadow-md ring-2 ring-red-200`
          : `job-urgency-very-urgent ${flowingRed} bg-red-100 dark:bg-red-950/30 border-2 border-red-600 dark:border-red-500 shadow-md ring-2 ring-red-200 dark:ring-red-950/40`
        : theme === 'trello'
          ? `job-urgency-very-urgent ${flowingRedSm} bg-[#3d1f24] border-2 border-red-400 shadow-md`
          : `job-urgency-very-urgent ${flowingRedSm} bg-red-50 dark:bg-red-900/20 border-2 border-red-500 dark:border-red-500 shadow-sm`;
  } else if (priority === Priority.URGENT) {
    tierClass =
      surface === 'kanban'
        ? theme === 'trello'
          ? `job-urgency-urgent ${flowingOrangeSm} bg-orange-50 border-2 border-orange-500 shadow-md ring-1 ring-orange-200`
          : `job-urgency-urgent bg-orange-100 dark:bg-orange-950/40 border-2 border-orange-500 dark:border-orange-400 shadow-sm ring-1 ring-orange-200 dark:ring-orange-950/30`
        : theme === 'trello'
          ? `job-urgency-urgent ${flowingOrangeSm} bg-[#3d2a1a] border-2 border-orange-400 shadow-sm`
          : `job-urgency-urgent ${flowingOrangeSm} bg-orange-50 dark:bg-orange-900/15 border-2 border-orange-500 dark:border-orange-500 shadow-sm`;
  } else if (daysRemaining <= 0) {
    tierClass =
      surface === 'kanban'
        ? theme === 'trello'
          ? 'job-urgency-overdue bg-red-50 border-2 border-red-500 ring-2 ring-red-200 shadow-md'
          : 'job-urgency-overdue bg-red-100 dark:bg-red-950/70 border-2 border-red-500 dark:border-red-400 ring-2 ring-red-200 dark:ring-red-900/60 shadow-md'
        : theme === 'trello'
          ? `job-urgency-overdue ${flowingRedSm} bg-[#3d1f24] border-2 border-red-400 shadow-sm`
          : `job-urgency-overdue ${flowingRedSm} bg-red-50 dark:bg-slate-800 border-2 border-red-500 dark:border-red-400 shadow-sm`;
  } else if (daysRemaining === 1) {
    tierClass =
      surface === 'kanban'
        ? theme === 'trello'
          ? 'job-urgency-d1 bg-orange-50 border-2 border-orange-500 ring-1 ring-orange-200 shadow-sm'
          : 'job-urgency-d1 bg-orange-100 dark:bg-orange-950/70 border-2 border-orange-500 dark:border-orange-400 ring-1 ring-orange-200 dark:ring-orange-950/20 shadow-sm'
        : theme === 'trello'
          ? `job-urgency-d1 ${flowingOrangeSm} bg-[#3d2a1a] border-2 border-orange-400 shadow-sm`
          : `job-urgency-d1 ${flowingOrangeSm} bg-orange-50 dark:bg-orange-900/10 border-2 border-orange-500 dark:border-orange-400 shadow-sm`;
  } else if (daysRemaining <= 3) {
    tierClass =
      surface === 'kanban'
        ? theme === 'trello'
          ? 'job-urgency-d3 bg-amber-50 border-2 border-amber-400 shadow-sm'
          : 'job-urgency-d3 bg-amber-100 dark:bg-amber-950/50 border-2 border-amber-500 dark:border-amber-500 shadow-sm'
        : theme === 'trello'
          ? 'job-urgency-d3 bg-[#3d3520] border-2 border-amber-400 shadow-sm'
          : 'job-urgency-d3 bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-500 dark:border-amber-500 shadow-sm';
  } else if (daysRemaining <= 7 && surface === 'kanban') {
    tierClass =
      theme === 'trello'
        ? 'job-urgency-d7 bg-blue-50 border-2 border-blue-300 shadow-sm'
        : 'job-urgency-d7 bg-blue-100 dark:bg-blue-950/50 border-2 border-blue-400 dark:border-blue-700 shadow-sm';
  }

  if (tierClass) {
    return tierClass;
  }

  if (isMyJob && surface === 'kanban') {
    return theme === 'trello'
      ? 'bg-white border-2 border-blue-400 ring-2 ring-blue-100 shadow-[0_1px_1px_rgba(9,30,66,0.25)]'
      : 'bg-white dark:bg-slate-800 border-2 border-blue-400 dark:border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/40 shadow-blue-100 dark:shadow-none';
  }

  return base;
}

export function getJobUrgencyBadgeStyles(
  theme: Theme,
  priority: Priority,
  daysRemaining: number,
): string {
  if (priority === Priority.VERY_URGENT) {
    return theme === 'trello'
      ? 'bg-red-600 text-white border border-red-500 shadow-sm'
      : 'bg-red-600 text-white shadow-sm';
  }
  if (priority === Priority.URGENT) {
    return theme === 'trello'
      ? 'bg-orange-600/80 text-white border border-orange-500'
      : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800';
  }
  if (daysRemaining <= 3) {
    return theme === 'trello'
      ? 'bg-[#2c3e56] text-amber-300 border border-amber-500/60'
      : 'bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300';
  }
  return theme === 'trello'
    ? 'bg-[#2c3e56] text-slate-300 border border-[#384c66]'
    : 'bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-300';
}

export function getJobUrgencyDateTextStyles(
  daysRemaining: number,
  isDone: boolean,
): string {
  if (isDone) return '';
  if (daysRemaining < 0) return 'text-slate-800 dark:text-slate-200 font-extrabold';
  if (daysRemaining <= 1) return 'text-red-600 dark:text-red-400 font-bold';
  if (daysRemaining <= 3) return 'text-orange-600 dark:text-orange-400 font-bold';
  return '';
}
