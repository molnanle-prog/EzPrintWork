export type JobTombstone = { id: string; deletedAt: string };

export function tombstoneStorageKey(tenantId: string): string {
    return `ezpw_deleted_jobs_${tenantId}`;
}

export function loadJobTombstoneMap(tenantId: string): Map<string, number> {
    const map = new Map<string, number>();
    if (!tenantId || typeof localStorage === 'undefined') return map;
    try {
        const raw = localStorage.getItem(tombstoneStorageKey(tenantId));
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

export function saveJobTombstoneMap(tenantId: string, map: Map<string, number>): void {
    if (!tenantId || typeof localStorage === 'undefined') return;
    const obj: Record<string, number> = {};
    map.forEach((ms, id) => {
        obj[id] = ms;
    });
    localStorage.setItem(tombstoneStorageKey(tenantId), JSON.stringify(obj));
}

export function mergeTombstoneLists(...lists: (JobTombstone[] | undefined)[]): JobTombstone[] {
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

export function tombstoneMapToPayload(map: Map<string, number>): JobTombstone[] {
    return Array.from(map.entries())
        .map(([id, ms]) => ({ id, deletedAt: new Date(ms).toISOString() }))
        .sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt));
}

export function isJobTombstoned(
    jobId: string | undefined,
    tombstones: Map<string, number>,
    jobUpdatedAtMs?: number
): boolean {
    if (!jobId) return false;
    const deletedMs = tombstones.get(jobId);
    if (!deletedMs) return false;
    if (!jobUpdatedAtMs || !Number.isFinite(jobUpdatedAtMs)) return true;
    return jobUpdatedAtMs <= deletedMs;
}

export function filterJobsByTombstones<T extends { id?: string; createdAt?: string; updatedAt?: string }>(
    jobs: T[],
    tombstones: Map<string, number>,
    jobTimestampMs: (job: T) => number
): T[] {
    return jobs.filter((job) => !isJobTombstoned(job.id, tombstones, jobTimestampMs(job)));
}
