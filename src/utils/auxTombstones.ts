export type AuxTombstone = { id: string; deletedAt: string };
export type AuxTombstoneCollection = 'quotes' | 'papers' | 'leaves' | 'instructions';

export function auxTombstoneStorageKey(tenantId: string, collection: AuxTombstoneCollection): string {
    return `ezpw_deleted_aux_${collection}_${tenantId}`;
}

export function loadAuxTombstoneMap(tenantId: string, collection: AuxTombstoneCollection): Map<string, number> {
    const map = new Map<string, number>();
    if (!tenantId || typeof localStorage === 'undefined') return map;
    try {
        const raw = localStorage.getItem(auxTombstoneStorageKey(tenantId, collection));
        if (!raw) return map;
        const parsed = JSON.parse(raw) as Record<string, number | string>;
        for (const [id, value] of Object.entries(parsed)) {
            if (!id) continue;
            const ms = typeof value === 'number' ? value : Date.parse(String(value));
            if (Number.isFinite(ms)) map.set(id, ms);
        }
    } catch {
        /* ignore */
    }
    return map;
}

export function saveAuxTombstoneMap(
    tenantId: string,
    collection: AuxTombstoneCollection,
    map: Map<string, number>
): void {
    if (!tenantId || typeof localStorage === 'undefined') return;
    const obj: Record<string, number> = {};
    map.forEach((ms, id) => {
        obj[id] = ms;
    });
    localStorage.setItem(auxTombstoneStorageKey(tenantId, collection), JSON.stringify(obj));
}

export function mergeAuxTombstoneLists(...lists: (AuxTombstone[] | undefined)[]): AuxTombstone[] {
    const byId = new Map<string, string>();
    for (const list of lists) {
        if (!list?.length) continue;
        for (const row of list) {
            if (!row?.id || !row.deletedAt) continue;
            const prev = byId.get(row.id);
            if (!prev || Date.parse(row.deletedAt) >= Date.parse(prev)) {
                byId.set(row.id, row.deletedAt);
            }
        }
    }
    return Array.from(byId.entries()).map(([id, deletedAt]) => ({ id, deletedAt }));
}

export function auxTombstoneMapToPayload(map: Map<string, number>): AuxTombstone[] {
    return Array.from(map.entries())
        .map(([id, ms]) => ({ id, deletedAt: new Date(ms).toISOString() }))
        .sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
}

function entityTimeMs(row: { updatedAt?: unknown; createdAt?: unknown; timestamp?: unknown }): number {
    const raw = String(row.updatedAt || row.createdAt || row.timestamp || '');
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
}

export function isAuxTombstoned(
    id: string | undefined,
    tombstones: Map<string, number>,
    updatedAtMs?: number
): boolean {
    if (!id) return false;
    const deletedMs = tombstones.get(id);
    if (!deletedMs) return false;
    if (!updatedAtMs || !Number.isFinite(updatedAtMs)) return true;
    return updatedAtMs <= deletedMs;
}

export function filterAuxItemsByTombstones(
    items: Array<Record<string, unknown>>,
    tombstones: Map<string, number>
): Array<Record<string, unknown>> {
    return items.filter((row) => {
        const id = row?.id != null ? String(row.id) : '';
        return !isAuxTombstoned(id, tombstones, entityTimeMs(row));
    });
}

export function applyAuxTombstonesFromList(
    map: Map<string, number>,
    list: AuxTombstone[] | undefined
): boolean {
    if (!list?.length) return false;
    let changed = false;
    for (const row of list) {
        if (!row?.id || !row.deletedAt) continue;
        const ms = Date.parse(row.deletedAt);
        if (!Number.isFinite(ms)) continue;
        const prev = map.get(row.id) || 0;
        if (ms > prev) {
            map.set(row.id, ms);
            changed = true;
        }
    }
    return changed;
}
