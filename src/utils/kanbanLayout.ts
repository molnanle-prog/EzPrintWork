import { JobStatusDefinition, KanbanBottomStyle, KanbanLayoutConfig, KanbanSplitPair } from '../types';

export const DEFAULT_RECEIVED_QUOTE_PAIR: KanbanSplitPair = {
  topKey: 'RECEIVED',
  bottomKey: 'QUOTE',
  splitTopPercent: 65,
  bottomStyle: 'grid',
};

export const DEFAULT_DELIVERY_COMPLETED_PAIR: KanbanSplitPair = {
  topKey: 'DELIVERY',
  bottomKey: 'COMPLETED',
  splitTopPercent: 65,
  bottomStyle: 'line',
};

export const DEFAULT_KANBAN_LAYOUT: KanbanLayoutConfig = {
  splitPairs: [DEFAULT_RECEIVED_QUOTE_PAIR, DEFAULT_DELIVERY_COMPLETED_PAIR],
};

export function clampSplitTopPercent(value: number): number {
  return Math.min(85, Math.max(35, Math.round(value)));
}

/** 저장된 값·예전 bottomCompact·기본 견적 하단을 모양으로 맞춤 */
export function resolveBottomStyle(pair: Pick<KanbanSplitPair, 'bottomKey' | 'bottomStyle' | 'bottomCompact'>): KanbanBottomStyle {
  if (pair.bottomStyle === 'grid' || pair.bottomStyle === 'line') return pair.bottomStyle;
  if (pair.bottomCompact === false) return 'line';
  if (pair.bottomKey === 'QUOTE') return 'grid';
  return 'line';
}

export function normalizeSplitPair(pair: KanbanSplitPair): KanbanSplitPair {
  const bottomStyle = resolveBottomStyle(pair);
  return {
    topKey: pair.topKey,
    bottomKey: pair.bottomKey,
    splitTopPercent: clampSplitTopPercent(pair.splitTopPercent ?? 65),
    bottomStyle,
    bottomCompact: bottomStyle === 'grid',
  };
}

export function normalizeKanbanLayoutConfig(raw?: Partial<KanbanLayoutConfig> | null): KanbanLayoutConfig {
  if (Array.isArray(raw?.splitPairs)) {
    return { splitPairs: raw.splitPairs.map(normalizeSplitPair) };
  }
  return {
    splitPairs: DEFAULT_KANBAN_LAYOUT.splitPairs.map(normalizeSplitPair),
  };
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
      bottomStyle: KanbanBottomStyle;
    };

/** 보이는 단계는 모두 칸에 넣는다. 합친 쌍만 한 슬롯으로 묶는다. */
export function buildKanbanColumnSlots(
  definitions: JobStatusDefinition[],
  layout: KanbanLayoutConfig,
  hiddenKeys: string[] = []
): KanbanColumnSlot[] {
  const visible = definitions.filter((s) => s.isVisible !== false);
  const hidden = new Set(hiddenKeys);
  const consumed = new Set<string>();
  const slots: KanbanColumnSlot[] = [];

  const pairs = layout.splitPairs.map(normalizeSplitPair);
  const pairByTop = new Map(pairs.map((p) => [p.topKey, p]));

  const activeSplitBottoms = new Set<string>();
  for (const pair of pairs) {
    const topOk = visible.some((s) => s.key === pair.topKey) && !hidden.has(pair.topKey);
    const bottomOk = visible.some((s) => s.key === pair.bottomKey) && !hidden.has(pair.bottomKey);
    if (topOk && bottomOk) activeSplitBottoms.add(pair.bottomKey);
  }

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
          bottomStyle: normalized.bottomStyle!,
        });
        consumed.add(pair.topKey);
        consumed.add(pair.bottomKey);
        continue;
      }
    }

    if (activeSplitBottoms.has(status.key)) continue;

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

export function slotSortId(slot: KanbanColumnSlot): string {
  return slot.type === 'single' ? `single:${slot.statusKey}` : `split:${slot.topKey}:${slot.bottomKey}`;
}

export function stageSortId(statusKey: string): string {
  return `stage:${statusKey}`;
}

export function parseStageSortId(id: string): string | null {
  return id.startsWith('stage:') ? id.slice('stage:'.length) : null;
}

export function slotContainsStatus(slot: KanbanColumnSlot, statusKey: string): boolean {
  if (slot.type === 'single') return slot.statusKey === statusKey;
  return slot.topKey === statusKey || slot.bottomKey === statusKey;
}

/** 미리보기에서 칸을 좌우로 옮긴 뒤, 칸반에 쓰는 단계 배열 순서로 맞춘다. */
export function reorderDefinitionsBySlots(
  definitions: JobStatusDefinition[],
  orderedSlots: KanbanColumnSlot[]
): JobStatusDefinition[] {
  const byKey = new Map(definitions.map((d) => [d.key, d]));
  const seen = new Set<string>();
  const next: JobStatusDefinition[] = [];

  for (const slot of orderedSlots) {
    const keys = slot.type === 'single' ? [slot.statusKey] : [slot.topKey, slot.bottomKey];
    for (const key of keys) {
      const def = byKey.get(key);
      if (def && !seen.has(key)) {
        next.push(def);
        seen.add(key);
      }
    }
  }

  for (const def of definitions) {
    if (!seen.has(def.key)) {
      next.push(def);
      seen.add(def.key);
    }
  }

  return next;
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

export function swapSplitPair(layout: KanbanLayoutConfig, pair: KanbanSplitPair): KanbanLayoutConfig {
  return upsertSplitPair(layout, pair.bottomKey, pair.topKey, resolveBottomStyle(pair));
}

export function upsertSplitPair(
  layout: KanbanLayoutConfig,
  topKey: string,
  bottomKey: string,
  bottomStyle?: KanbanBottomStyle
): KanbanLayoutConfig {
  const existing = findPairForKey(layout, topKey) || findPairForKey(layout, bottomKey);
  const style = bottomStyle ?? (existing ? resolveBottomStyle(existing) : 'line');

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
        bottomStyle: style,
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
