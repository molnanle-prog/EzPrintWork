import { JobStatusDefinition, KanbanLayoutConfig, KanbanSplitPair } from '../types';

export const DEFAULT_RECEIVED_QUOTE_PAIR: KanbanSplitPair = {
  topKey: 'RECEIVED',
  bottomKey: 'QUOTE',
  splitTopPercent: 65,
  bottomCompact: true,
};

export const DEFAULT_KANBAN_LAYOUT: KanbanLayoutConfig = {
  splitPairs: [DEFAULT_RECEIVED_QUOTE_PAIR],
};

export function clampSplitTopPercent(value: number): number {
  return Math.min(85, Math.max(35, Math.round(value)));
}

export function normalizeSplitPair(pair: KanbanSplitPair): KanbanSplitPair {
  return {
    topKey: pair.topKey,
    bottomKey: pair.bottomKey,
    splitTopPercent: clampSplitTopPercent(pair.splitTopPercent ?? 65),
    bottomCompact: pair.bottomCompact !== false,
  };
}

export function normalizeKanbanLayoutConfig(raw?: Partial<KanbanLayoutConfig> | null): KanbanLayoutConfig {
  if (raw?.splitPairs?.length) {
    return { splitPairs: raw.splitPairs.map(normalizeSplitPair) };
  }
  return { splitPairs: [DEFAULT_RECEIVED_QUOTE_PAIR] };
}

export function normalizeStatusDefinition(status: JobStatusDefinition): JobStatusDefinition {
  return {
    ...status,
    isVisible: status.isVisible !== false,
  };
}

export type KanbanColumnSlot =
  | { type: 'single'; statusKey: string }
  | {
      type: 'split';
      topKey: string;
      bottomKey: string;
      splitTopPercent: number;
      bottomCompact: boolean;
    };

/** 파이프라인 순서대로 칸반 슬롯 구성 (한 슬롯 = 가로 1칸) */
export function buildKanbanColumnSlots(
  definitions: JobStatusDefinition[],
  layout: KanbanLayoutConfig,
  hiddenKeys: string[] = []
): KanbanColumnSlot[] {
  const visible = definitions.filter((s) => s.isVisible !== false);
  const hidden = new Set(hiddenKeys);
  const consumed = new Set<string>();
  const slots: KanbanColumnSlot[] = [];

  const pairByTop = new Map(layout.splitPairs.map((p) => [p.topKey, normalizeSplitPair(p)]));
  const bottomKeys = new Set(layout.splitPairs.map((p) => p.bottomKey));

  for (const status of visible) {
    if (consumed.has(status.key) || hidden.has(status.key)) continue;

    const pair = pairByTop.get(status.key);
    if (pair && !hidden.has(pair.bottomKey)) {
      const bottomVisible = visible.some((s) => s.key === pair.bottomKey);
      if (bottomVisible) {
        const normalized = normalizeSplitPair(pair);
        slots.push({
          type: 'split',
          topKey: normalized.topKey,
          bottomKey: normalized.bottomKey,
          splitTopPercent: normalized.splitTopPercent!,
          bottomCompact: normalized.bottomCompact!,
        });
        consumed.add(pair.topKey);
        consumed.add(pair.bottomKey);
        continue;
      }
    }

    if (bottomKeys.has(status.key) && !pairByTop.has(status.key)) {
      continue;
    }

    if (status.key === 'QUOTE' && !bottomKeys.has('QUOTE')) continue;

    slots.push({ type: 'single', statusKey: status.key });
    consumed.add(status.key);
  }

  return slots;
}

export function getKeysInKanbanSlots(slots: KanbanColumnSlot[]): string[] {
  const keys: string[] = [];
  for (const slot of slots) {
    if (slot.type === 'single') keys.push(slot.statusKey);
    else {
      keys.push(slot.topKey, slot.bottomKey);
    }
  }
  return keys;
}

export function findPairForKey(layout: KanbanLayoutConfig, key: string): KanbanSplitPair | undefined {
  return layout.splitPairs.find((p) => p.topKey === key || p.bottomKey === key);
}

/** 목록 순서 기준 위=상단, 아래=하단 */
export function orderedPairKeysFromSelection(
  definitions: JobStatusDefinition[],
  selectedKeys: string[]
): [string, string] | null {
  if (selectedKeys.length !== 2) return null;
  const ordered = definitions
    .filter((s) => selectedKeys.includes(s.key))
    .sort(
      (a, b) =>
        definitions.findIndex((x) => x.key === a.key) - definitions.findIndex((x) => x.key === b.key)
    );
  if (ordered.length !== 2) return null;
  return [ordered[0].key, ordered[1].key];
}

export function upsertSplitPair(
  layout: KanbanLayoutConfig,
  topKey: string,
  bottomKey: string
): KanbanLayoutConfig {
  const existing = findPairForKey(layout, topKey) || findPairForKey(layout, bottomKey);
  const bottomCompact =
    bottomKey === 'QUOTE' || bottomKey === 'COMPLETED' ? true : existing?.bottomCompact !== false;

  const withoutOverlap = layout.splitPairs.filter(
    (p) =>
      p.topKey !== topKey &&
      p.bottomKey !== topKey &&
      p.topKey !== bottomKey &&
      p.bottomKey !== bottomKey
  );

  return {
    splitPairs: [
      ...withoutOverlap,
      normalizeSplitPair({
        topKey,
        bottomKey,
        splitTopPercent: existing?.splitTopPercent ?? 65,
        bottomCompact,
      }),
    ],
  };
}

export function isCompletedStatusKey(statusKey: string): boolean {
  return statusKey === 'COMPLETED';
}

export function isLegacyCompletedDelivery(job: { status: string; completedAt?: string }): boolean {
  return job.status === 'DELIVERY' && !!job.completedAt;
}
