import { deriveStoreGatewayToken } from '../utils/gatewayToken';

export interface LocalGatewayInfo {
    port: number;
    baseUrl: string;
    lanUrls: string[];
}

function isElectron(): boolean {
    return typeof window !== 'undefined' && !!window.electron;
}

function normalizeGatewayBase(url: string | null | undefined): string | null {
    const base = url?.trim().replace(/\/$/, '');
    return base || null;
}

function gatewayHeaders(tenantId?: string | null): HeadersInit {
    const token = deriveStoreGatewayToken(tenantId);
    return token ? { 'X-Ezpw-Gateway-Token': token } : {};
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
            gatewayToken: deriveStoreGatewayToken(tenantId),
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

/** 웹·태블릿 — 매장 PC LAN 게이트웨이 연결 확인 */
export async function isStoreGatewayReachable(
    gatewayBaseUrl: string | null | undefined,
    tenantId?: string | null
): Promise<boolean> {
    const base = normalizeGatewayBase(gatewayBaseUrl);
    if (!base) return false;
    try {
        const res = await fetch(`${base}/health`, {
            cache: 'no-store',
            headers: gatewayHeaders(tenantId),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** @deprecated 웹은 조회 전용 — 저장 경로 사용 금지 */
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
            headers: {
                'Content-Type': 'application/json',
                ...gatewayHeaders(tenantId),
            },
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

export async function fetchMirrorViaGateway(
    gatewayBaseUrl: string | null | undefined,
    tenantId: string
): Promise<Response | null> {
    const base = normalizeGatewayBase(gatewayBaseUrl);
    if (!base || !tenantId) return null;
    try {
        return await fetch(
            `${base}/api/v1/mirror?tenantId=${encodeURIComponent(tenantId)}`,
            {
                cache: 'no-store',
                headers: gatewayHeaders(tenantId),
            }
        );
    } catch {
        return null;
    }
}
