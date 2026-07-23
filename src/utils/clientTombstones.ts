export type ClientTombstone = { id: string; deletedAt: string };

export function clientTombstoneStorageKey(tenantId: string): string {
    return `ezpw_deleted_clients_${tenantId}`;
}

export function loadClientTombstoneMap(tenantId: string): Map<string, number> {
    const map = new Map<string, number>();
    if (!tenantId || typeof localStorage === 'undefined') return map;
    try {
        const raw = localStorage.getItem(clientTombstoneStorageKey(tenantId));
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

export function saveClientTombstoneMap(tenantId: string, map: Map<string, number>): void {
    if (!tenantId || typeof localStorage === 'undefined') return;
    const obj: Record<string, number> = {};
    map.forEach((ms, id) => {
        obj[id] = ms;
    });
    localStorage.setItem(clientTombstoneStorageKey(tenantId), JSON.stringify(obj));
}

export function mergeClientTombstoneLists(...lists: (ClientTombstone[] | undefined)[]): ClientTombstone[] {
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

export function clientTombstoneMapToPayload(map: Map<string, number>): ClientTombstone[] {
    return Array.from(map.entries())
        .map(([id, ms]) => ({ id, deletedAt: new Date(ms).toISOString() }))
        .sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
}

export function clientTimestampMs(client: { updatedAt?: string; createdAt?: string } | null | undefined): number {
    if (!client) return 0;
    const raw = client.updatedAt || client.createdAt;
    if (!raw) return 0;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
}

export function isClientTombstoned(
    clientId: string | undefined,
    tombstones: Map<string, number>,
    clientUpdatedAtMs?: number
): boolean {
    if (!clientId) return false;
    const deletedMs = tombstones.get(clientId);
    if (!deletedMs) return false;
    if (!clientUpdatedAtMs || !Number.isFinite(clientUpdatedAtMs)) return true;
    return clientUpdatedAtMs <= deletedMs;
}

export function filterClientsByTombstones<T extends { id?: string; updatedAt?: string; createdAt?: string }>(
    clients: T[],
    tombstones: Map<string, number>
): T[] {
    return clients.filter((c) => !isClientTombstoned(c.id, tombstones, clientTimestampMs(c)));
}
