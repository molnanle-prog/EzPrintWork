import { deriveStoreGatewayToken } from '../utils/gatewayToken';

export interface LocalGatewayInfo {
    port: number;
    baseUrl: string;
    lanUrls: string[];
    archiveRoot?: string | null;
    tenantId?: string | null;
}

export type StoreGatewayHealth = {
    ok: boolean;
    archiveRoot?: string | null;
    tenantId?: string | null;
    port?: number;
    baseUrl?: string;
    lanUrls?: string[];
};

function isElectron(): boolean {
    return typeof window !== 'undefined' && !!window.electron;
}

function normalizeGatewayBase(url: string | null | undefined): string | null {
    const base = url?.trim().replace(/\/$/, '');
    return base || null;
}

/** 경로 비교용 — 슬래시·대소문자 정규화 */
export function normalizeArchivePathKey(folderPath: string | null | undefined): string {
    return String(folderPath || '')
        .trim()
        .replace(/\//g, '\\')
        .replace(/[\\/]+$/, '')
        .toLowerCase();
}

export function archivePathsMatch(
    a: string | null | undefined,
    b: string | null | undefined
): boolean {
    const na = normalizeArchivePathKey(a);
    const nb = normalizeArchivePathKey(b);
    return !!na && !!nb && na === nb;
}

function gatewayHeaders(tenantId?: string | null): HeadersInit {
    const token = deriveStoreGatewayToken(tenantId);
    return token ? { 'X-Ezpw-Gateway-Token': token } : {};
}

/** Electron 매장 PC — 반드시 회사 archiveRoot 만 게이트웨이에 바인딩 (가능하면 UNC) */
export async function refreshLocalGateway(
    archiveRoot: string | null,
    tenantId: string | null
): Promise<LocalGatewayInfo | null> {
    if (!isElectron() || !window.electron.gatewaySetConfig || !window.electron.gatewayGetInfo) {
        return null;
    }
    try {
        let root = archiveRoot?.replace(/[\\/]$/, '') || null;
        if (root && window.electron.resolveUncPath) {
            try {
                const r = await window.electron.resolveUncPath(root);
                if (r?.ok && r.path && String(r.path).startsWith('\\\\')) {
                    root = r.path.replace(/[\\/]$/, '');
                }
            } catch {
                /* keep original */
            }
        }
        const boundRoot = root;
        await window.electron.gatewaySetConfig({
            archiveRoot: boundRoot,
            tenantId,
            gatewayToken: deriveStoreGatewayToken(tenantId),
        });
        const info = (await window.electron.gatewayGetInfo()) as LocalGatewayInfo;
        // 바인딩 불일치면 서비스하지 않음
        if (boundRoot && info?.archiveRoot && !archivePathsMatch(boundRoot, info.archiveRoot)) {
            console.warn('[LocalGateway] archiveRoot mismatch after bind — disabling gateway root');
            await window.electron.gatewaySetConfig({
                archiveRoot: null,
                tenantId,
                gatewayToken: deriveStoreGatewayToken(tenantId),
            });
            return null;
        }
        return info;
    } catch (error) {
        console.warn('[LocalGateway] refresh failed:', error);
    }
    return null;
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
    const health = await fetchStoreGatewayHealth(gatewayBaseUrl, tenantId);
    return !!health?.ok;
}

/** health + archiveRoot 조회 (다른 폴더 게이트웨이 차단용) */
export async function fetchStoreGatewayHealth(
    gatewayBaseUrl: string | null | undefined,
    tenantId?: string | null
): Promise<StoreGatewayHealth | null> {
    const base = normalizeGatewayBase(gatewayBaseUrl);
    if (!base) return null;
    try {
        const res = await fetch(`${base}/health`, {
            cache: 'no-store',
            headers: gatewayHeaders(tenantId),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as StoreGatewayHealth;
        return { ...data, ok: data.ok !== false };
    } catch {
        return null;
    }
}

/**
 * 원격 게이트웨이가 회사 NAS 경로를 그대로 서비스하는지 확인.
 * 경로가 다르면 사용 금지 → 자료 갈라짐 방지.
 */
export async function isStoreGatewayServingCompanyPath(
    gatewayBaseUrl: string | null | undefined,
    companyArchiveRoot: string | null | undefined,
    tenantId?: string | null
): Promise<boolean> {
    if (!companyArchiveRoot?.trim()) return false;
    const health = await fetchStoreGatewayHealth(gatewayBaseUrl, tenantId);
    if (!health?.ok) return false;
    if (!health.archiveRoot) {
        // 구버전 게이트웨이: archiveRoot 미보고 → 안전하게 거부
        return false;
    }
    return archivePathsMatch(health.archiveRoot, companyArchiveRoot);
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
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                ...gatewayHeaders(tenantId),
            },
            body: JSON.stringify({ tenantId, jobs }),
        });
        if (!res.ok) return { ok: false };
        const data = (await res.json()) as { updatedAt?: string };
        return { ok: true, updatedAt: data.updatedAt };
    } catch {
        return { ok: false };
    }
}

export async function fetchMirrorViaGateway(
    gatewayBaseUrl: string | null | undefined,
    tenantId: string
): Promise<unknown | null> {
    const base = normalizeGatewayBase(gatewayBaseUrl);
    if (!base || !tenantId) return null;
    try {
        const res = await fetch(
            `${base}/api/v1/mirror?tenantId=${encodeURIComponent(tenantId)}`,
            {
                cache: 'no-store',
                headers: gatewayHeaders(tenantId),
            }
        );
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}
