import { fetchWithTimeout, DEFAULT_LAN_FETCH_TIMEOUT_MS } from './fetchWithTimeout';

export type StoreGatewayInput = string | string[] | null | undefined;

let cachedClientLanIp: string | null | undefined;

export function normalizeGatewayBase(url: string | null | undefined): string | null {
    const base = url?.trim().replace(/\/$/, '');
    return base || null;
}

export function normalizeStoreGatewayUrls(urls: StoreGatewayInput): string[] {
    const list = Array.isArray(urls) ? urls : urls ? [urls] : [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
        const base = normalizeGatewayBase(raw);
        if (!base || seen.has(base)) continue;
        seen.add(base);
        out.push(base);
    }
    return out;
}

/** Firestore settings — storeGatewayUrls + 구버전 storeGatewayUrl */
export function collectStoreGatewayUrlsFromSettings(
    settings?: Record<string, unknown> | null
): string[] {
    if (!settings || typeof settings !== 'object') return [];
    const fromArray = Array.isArray(settings.storeGatewayUrls)
        ? normalizeStoreGatewayUrls(settings.storeGatewayUrls as string[])
        : [];
    const legacy = normalizeGatewayBase(
        typeof settings.storeGatewayUrl === 'string' ? settings.storeGatewayUrl : null
    );
    if (!legacy) return fromArray;
    if (fromArray.includes(legacy)) return fromArray;
    return normalizeStoreGatewayUrls([legacy, ...fromArray]);
}

export function extractIpv4FromGatewayUrl(url: string): string | null {
    try {
        const host = new URL(url).hostname;
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? host : null;
    } catch {
        return null;
    }
}

export function getSubnetPrefix24(ip: string): string | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}`;
}

/** 브라우저 WebRTC — 태블릿/웹이 같은 서브넷 게이트웨이 URL을 우선 시도 */
export async function detectClientLanIpv4(): Promise<string | null> {
    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
        return null;
    }
    if (cachedClientLanIp !== undefined) return cachedClientLanIp;

    cachedClientLanIp = await new Promise<string | null>((resolve) => {
        const ips = new Set<string>();
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            try {
                pc.close();
            } catch {
                /* ignore */
            }
            const pick = [...ips].find((ip) => !ip.startsWith('127.') && !ip.startsWith('169.254.'));
            resolve(pick || null);
        };

        const pc = new RTCPeerConnection({ iceServers: [] });
        const timer = window.setTimeout(finish, 1200);

        pc.onicecandidate = (event) => {
            const candidate = event.candidate?.candidate;
            if (!candidate) return;
            const match = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(candidate);
            if (match?.[1]) ips.add(match[1]);
        };

        pc.createDataChannel('ezpw');
        pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .catch(() => {
                window.clearTimeout(timer);
                finish();
            });

        pc.onicegatheringstatechange = () => {
            if (pc.iceGatheringState === 'complete') {
                window.clearTimeout(timer);
                finish();
            }
        };
    });

    return cachedClientLanIp;
}

/** 클라이언트 서브넷과 일치하는 LAN URL을 앞으로 정렬 */
export async function orderStoreGatewayUrls(urls: StoreGatewayInput): Promise<string[]> {
    const normalized = normalizeStoreGatewayUrls(urls);
    if (normalized.length <= 1) return normalized;

    const clientIp = await detectClientLanIpv4();
    const clientPrefix = clientIp ? getSubnetPrefix24(clientIp) : null;
    if (!clientPrefix) return normalized;

    return [...normalized].sort((a, b) => {
        const ipA = extractIpv4FromGatewayUrl(a);
        const ipB = extractIpv4FromGatewayUrl(b);
        const matchA = ipA && getSubnetPrefix24(ipA) === clientPrefix ? 0 : 1;
        const matchB = ipB && getSubnetPrefix24(ipB) === clientPrefix ? 0 : 1;
        if (matchA !== matchB) return matchA - matchB;
        return normalized.indexOf(a) - normalized.indexOf(b);
    });
}

export function resolveStoreGatewayUrlList(input?: StoreGatewayInput): string[] {
    return normalizeStoreGatewayUrls(input);
}

/** 여러 LAN URL을 병렬 시도 — 첫 성공 응답 반환 */
export async function fetchFirstSuccessful<T>(
    tasks: Array<() => Promise<T | null | undefined>>
): Promise<T | null> {
    if (tasks.length === 0) return null;
    if (tasks.length === 1) {
        const single = await tasks[0]();
        return single ?? null;
    }

    return new Promise<T | null>((resolve) => {
        let pending = tasks.length;
        let resolved = false;
        let best: T | null = null;

        const done = () => {
            pending -= 1;
            if (!resolved && pending === 0) {
                resolved = true;
                resolve(best);
            }
        };

        for (const task of tasks) {
            void task()
                .then((value) => {
                    if (value == null) {
                        done();
                        return;
                    }
                    best = value;
                    if (!resolved) {
                        resolved = true;
                        resolve(value);
                    }
                    done();
                })
                .catch(() => done());
        }
    });
}

export async function fetchJsonWithGatewayTimeout<T>(
    url: string,
    init?: RequestInit,
    timeoutMs = DEFAULT_LAN_FETCH_TIMEOUT_MS
): Promise<T | null> {
    try {
        const res = await fetchWithTimeout(url, init, timeoutMs);
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}
