import { KanbanLayoutConfig } from '../types';
import { clampSplitTopPercent } from './kanbanLayout';

const STORAGE_PREFIX = 'ezpw_kanban_split_percents:';

export type KanbanSplitPercentMap = Record<string, number>;

export function kanbanSplitPrefKey(topKey: string, bottomKey: string): string {
  return `${topKey}|${bottomKey}`;
}

export function getKanbanSplitStorageKey(opts: {
  tenantId?: string | null;
  loginId?: string | null;
  uid?: string | null;
  email?: string | null;
}): string {
  const tenant = String(opts.tenantId || 'default').trim() || 'default';
  const id = String(opts.loginId || opts.uid || opts.email || 'anon')
    .trim()
    .toLowerCase() || 'anon';
  return `${STORAGE_PREFIX}${tenant}:${id}`;
}

export function loadKanbanSplitPercents(storageKey: string): KanbanSplitPercentMap {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: KanbanSplitPercentMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = clampSplitTopPercent(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveKanbanSplitPercent(
  storageKey: string,
  topKey: string,
  bottomKey: string,
  percent: number
): KanbanSplitPercentMap {
  const next = {
    ...loadKanbanSplitPercents(storageKey),
    [kanbanSplitPrefKey(topKey, bottomKey)]: clampSplitTopPercent(percent),
  };
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

/** 회사 칸 배치(어떤 단계를 위·아래로 붙일지)는 유지하고, 높이만 이 아이디 값으로 덮음 */
export function applyKanbanSplitPercents(
  layout: KanbanLayoutConfig,
  percents: KanbanSplitPercentMap
): KanbanLayoutConfig {
  if (!layout?.splitPairs?.length) return layout;
  return {
    splitPairs: layout.splitPairs.map((pair) => {
      const saved = percents[kanbanSplitPrefKey(pair.topKey, pair.bottomKey)];
      if (typeof saved !== 'number') return pair;
      return { ...pair, splitTopPercent: clampSplitTopPercent(saved) };
    }),
  };
}
