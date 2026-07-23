/**
 * PC 간 거래처 병합 승패 — rev 우선, 없으면 updatedAt/createdAt
 */

function timestampMs(row: { updatedAt?: string; createdAt?: string } | null | undefined): number {
    if (!row) return 0;
    const raw = row.updatedAt || row.createdAt;
    if (!raw) return 0;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
}

function revOf(row: { rev?: number } | null | undefined): number {
    const rev = row?.rev;
    return typeof rev === 'number' && Number.isFinite(rev) ? rev : -1;
}

export function isIncomingClientNewer(
    incoming: { rev?: number; updatedAt?: string; createdAt?: string } | null | undefined,
    prev: { rev?: number; updatedAt?: string; createdAt?: string } | null | undefined
): boolean {
    const ri = revOf(incoming);
    const rp = revOf(prev);
    if (ri >= 0 || rp >= 0) {
        if (ri !== rp) return ri > rp;
    }
    return timestampMs(incoming) >= timestampMs(prev);
}

export function nextClientRev(existing: { rev?: number } | null | undefined): number {
    const cur = revOf(existing);
    return (cur < 0 ? 0 : cur) + 1;
}
