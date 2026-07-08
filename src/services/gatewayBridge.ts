export interface LocalGatewayInfo {
    port: number;
    baseUrl: string;
    lanUrls: string[];
}

function isElectron(): boolean {
    return typeof window !== 'undefined' && !!window.electron;
}

/** Electron 매장 PC — NAS 파일을 LAN HTTP로 노출 (웹/태블릿 사내 접근) */
export async function refreshLocalGateway(
    archiveRoot: string | null,
    tenantId: string | null
): Promise<LocalGatewayInfo | null> {
    if (!isElectron() || !window.electron.gatewaySetConfig || !window.electron.gatewayGetInfo) {
        return null;
    }
    try {
        await window.electron.gatewaySetConfig({
            archiveRoot: archiveRoot?.replace(/[\\/]$/, '') || null,
            tenantId,
        });
        return (await window.electron.gatewayGetInfo()) as LocalGatewayInfo;
    } catch (error) {
        console.warn('[LocalGateway] refresh failed:', error);
        return null;
    }
}

export async function getLocalGatewayInfo(): Promise<LocalGatewayInfo | null> {
    if (!isElectron() || !window.electron.gatewayGetInfo) return null;
    try {
        return (await window.electron.gatewayGetInfo()) as LocalGatewayInfo;
    } catch {
        return null;
    }
}

function normalizeGatewayBase(url: string | null | undefined): string | null {
    const base = url?.trim().replace(/\/$/, '');
    return base || null;
}

/** 웹·태블릿 — 매장 PC LAN 게이트웨이 연결 확인 */
export async function isStoreGatewayReachable(gatewayBaseUrl: string | null | undefined): Promise<boolean> {
    const base = normalizeGatewayBase(gatewayBaseUrl);
    if (!base) return false;
    try {
        const res = await fetch(`${base}/health`, { cache: 'no-store' });
        return res.ok;
    } catch {
        return false;
    }
}

/** 웹·태블릿 — NAS jobs-archive에 작업 반영 (사내 Wi‑Fi) */
export async function postJobsPartialViaGateway(
    gatewayBaseUrl: string,
    tenantId: string,
    jobs: unknown[]
): Promise<{ ok: boolean; updatedAt?: string }> {
    const base = normalizeGatewayBase(gatewayBaseUrl);
    if (!base || !tenantId || jobs.length === 0) return { ok: false };
    try {
        const res = await fetch(`${base}/api/v1/jobs/partial`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantId, jobs }),
            cache: 'no-store',
        });
        if (!res.ok) return { ok: false };
        const data = (await res.json()) as { updatedAt?: string };
        return { ok: true, updatedAt: data.updatedAt };
    } catch (error) {
        console.warn('[WebGateway] jobs partial post failed:', error);
        return { ok: false };
    }
}
