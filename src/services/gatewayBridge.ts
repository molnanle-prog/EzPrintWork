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
