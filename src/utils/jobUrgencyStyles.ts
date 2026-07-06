import { Priority } from '../types';
import type { Theme } from '../contexts/ThemeContext';

export type JobUrgencySurface = 'kanban' | 'dashboard';

/** 납기·우선순위 복합 티어 (색상 = 납기, 두께·ring = 우선순위) */
export type UrgencyTier = 'safe' | 'notice' | 'warn' | 'critical' | 'overdue' | 'very-urgent';

const DATE_TIERS: UrgencyTier[] = ['safe', 'notice', 'warn', 'critical', 'overdue'];

export interface JobUrgencyStyleInput {
  theme: Theme;
  priority: Priority;
  daysRemaining: number;
  isDone: boolean;
  isMyJob?: boolean;
  isTvMode?: boolean;
  surface?: JobUrgencySurface;
}

/** 납기만 기준 티어 */
export function resolveDateTier(daysRemaining: number): UrgencyTier {
  if (daysRemaining <= 0) return 'overdue';
  if (daysRemaining === 1) return 'critical';
  if (daysRemaining <= 3) return 'warn';
  if (daysRemaining <= 7) return 'notice';
  return 'safe';
}

/** 납기 + 우선순위 부스트 복합 티어 */
export function resolveEffectiveTier(daysRemaining: number, priority: Priority): UrgencyTier {
  if (priority === Priority.VERY_URGENT) return 'very-urgent';

  const dateTier = resolveDateTier(daysRemaining);
  if (priority === Priority.URGENT) {
    const idx = DATE_TIERS.indexOf(dateTier);
    const boosted = Math.min(idx + 1, DATE_TIERS.length - 1);
    return DATE_TIERS[boosted];
  }
  return dateTier;
}

export function formatDDayLabel(daysRemaining: number): string {
  if (daysRemaining < 0) return `D+${Math.abs(daysRemaining)}`;
  if (daysRemaining === 0) return 'D-Day';
  return `D-${daysRemaining}`;
}

function getSurfaceBase(theme: Theme, surface: JobUrgencySurface): string {
  if (surface === 'dashboard') {
    return theme === 'trello'
      ? 'job-urgency-surface-dashboard bg-[#1d2d44] border-[#2c3e56] text-slate-200'
      : 'job-urgency-surface-dashboard border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700';
  }
  return theme === 'trello'
    ? 'job-urgency-surface-kanban bg-white text-[#172b4d] shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)]'
    : 'job-urgency-surface-kanban bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700';
}

function getTierModifierClasses(tier: UrgencyTier, priority: Priority, isTvMode: boolean): string {
  const parts = [`job-urgency-tier-${tier}`];

  if (tier === 'very-urgent') {
    parts.push('job-urgency-pulse');
  } else if (tier === 'overdue') {
    parts.push('job-urgency-overdue-blink');
  }
  if (priority === Priority.URGENT && tier !== 'very-urgent') {
    parts.push('job-priority-urgent');
  }
  if (isTvMode && (tier === 'very-urgent' || tier === 'overdue')) {
    parts.push('job-urgency-tv-emphasis');
  }

  return parts.join(' ');
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
  const base = getSurfaceBase(theme, surface);

  if (isDone) {
    return `${base} job-urgency-done`;
  }

  const tier = resolveEffectiveTier(daysRemaining, priority);
  const tierClasses = getTierModifierClasses(tier, priority, isTvMode);

  if (isMyJob && surface === 'kanban') {
    return `${base} ${tierClasses} job-my-assignee`;
  }

  return `${base} ${tierClasses}`;
}

export function getDDayBadgeClasses(tier: UrgencyTier): string {
  return `job-dday-badge job-dday-tier-${tier}`;
}

export function getJobUrgencyBadgeStyles(
  theme: Theme,
  priority: Priority,
  daysRemaining: number,
): string {
  const tier = resolveEffectiveTier(daysRemaining, priority);

  if (tier === 'very-urgent') {
    return theme === 'trello'
      ? 'bg-red-600 text-white border border-red-500 shadow-sm'
      : 'bg-red-600 text-white shadow-sm';
  }
  if (priority === Priority.URGENT || tier === 'overdue' || tier === 'critical') {
    return theme === 'trello'
      ? 'bg-orange-600/90 text-white border border-orange-500'
      : 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 border border-orange-300 dark:border-orange-700';
  }
  if (tier === 'warn' || tier === 'notice') {
    return theme === 'trello'
      ? 'bg-[#2c3e56] text-amber-300 border border-amber-500/60'
      : 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700';
  }
  return theme === 'trello'
    ? 'bg-[#2c3e56] text-slate-300 border border-[#384c66]'
    : 'bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-500';
}

export function getJobUrgencyDateTextStyles(
  daysRemaining: number,
  isDone: boolean,
): string {
  if (isDone) return '';
  const tier = resolveDateTier(daysRemaining);
  if (tier === 'overdue') return 'text-red-700 dark:text-red-300 font-extrabold';
  if (tier === 'critical') return 'text-orange-700 dark:text-orange-300 font-bold';
  if (tier === 'warn') return 'text-amber-700 dark:text-amber-300 font-bold';
  if (tier === 'notice') return 'text-blue-700 dark:text-blue-300 font-semibold';
  return 'text-slate-600 dark:text-slate-400';
}
