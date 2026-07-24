import { ChatMessage } from '../types';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { storage } from './firebase';
import {
    ARCHIVE_USE_DEFAULT_KEY,
    DEFAULT_ARCHIVE_FOLDER_NAME,
    getArchiveRootPath,
    getEffectiveArchiveRootPath,
    hasCompanyArchiveRootConfigured,
} from '../utils/archiveStorage';
import { fetchWithTimeout, DEFAULT_LAN_FETCH_TIMEOUT_MS } from '../utils/fetchWithTimeout';
import {
    normalizeGatewayBase,
    orderStoreGatewayUrls,
    resolveStoreGatewayUrlList,
    type StoreGatewayInput,
} from '../utils/storeGatewayUrls';

const CHAT_VERSION = 1;
export const CHAT_FILE_NAME = 'chat-messages.json';
export const CHAT_ARCHIVE_FOLDER = 'chat-archive';
/** Storage 폴백 상한 — LAN 성공 시 대기하지 않음 */
const STORAGE_FETCH_TIMEOUT_MS = 8000;
/**
 * 실시간용 핫 윈도우 — 최근 N개만 chat-messages.json 에 유지.
 * (몇 페이지 분량. 1년치 전체를 매 전송/폴링하지 않음)
 */
export const HOT_CHAT_LIMIT = 300;
/** 이전 대화 한 번에 불러올 개수 */
export const OLDER_CHAT_PAGE_SIZE = 40;
/** NAS 쓰기 재시도 — 짧게 (긴 대기는 전송 체감만 악화) */
const WRITE_RETRY_DELAYS_MS = [0, 350, 900];

export interface ChatMirrorPayload {
    version: number;
    tenantId: string;
    updatedAt: string;
    messages: ChatMessage[];
}

function messageTime(m: ChatMessage): number {
    const row = m as ChatMessage & { createdAt?: string };
    const ms = Date.parse(m.timestamp || row.createdAt || '');
    return Number.isFinite(ms) ? ms : 0;
}

export function monthKeyFromMessage(m: ChatMessage): string {
    const t = messageTime(m);
    const d = Number.isFinite(t) && t > 0 ? new Date(t) : new Date();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${mo}`;
}

/** 핫 윈도우만 유지 (실시간 경로) */
export function takeHotMessages(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length <= HOT_CHAT_LIMIT) return messages;
    return messages.slice(messages.length - HOT_CHAT_LIMIT);
}

export function mergeChatMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
    const map = new Map<string, ChatMessage>();
    for (const m of current) {
        if (m?.id) map.set(m.id, m);
    }
    for (const m of incoming) {
        if (!m?.id) continue;
        const prev = map.get(m.id);
        if (!prev) {
            map.set(m.id, m);
            continue;
        }
        map.set(m.id, messageTime(m) >= messageTime(prev) ? { ...prev, ...m } : prev);
    }
    const list = Array.from(map.values()).sort((a, b) => messageTime(a) - messageTime(b));
    return takeHotMessages(list);
}

/** 핫에 넣기 전 전체 merge (아카이브 분리용 — 상한 없음) */
export function mergeChatMessagesUnlimited(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
    const map = new Map<string, ChatMessage>();
    for (const m of current) {
        if (m?.id) map.set(m.id, m);
    }
    for (const m of incoming) {
        if (!m?.id) continue;
        const prev = map.get(m.id);
        if (!prev) {
            map.set(m.id, m);
            continue;
        }
        map.set(m.id, messageTime(m) >= messageTime(prev) ? { ...prev, ...m } : prev);
    }
    return Array.from(map.values()).sort((a, b) => messageTime(a) - messageTime(b));
}

export class ChatMirrorService {
    private publishChain: Promise<boolean> = Promise.resolve(true);
    /** write-through 캐시 — 연속 전송 시 NAS 전체 재읽기 생략 */
    private cachedTenantId: string | null = null;
    private cachedMessages: ChatMessage[] | null = null;
    private cachedMtime = 0;
    private cachedUpdatedAt: string | null = null;

    /** 앱 시작·히스토리 로드 시 캐시 무효화 (전체 재읽기) */
    invalidateCache(): void {
        this.cachedTenantId = null;
        this.cachedMessages = null;
        this.cachedMtime = 0;
        this.cachedUpdatedAt = null;
    }

    private isElectron(): boolean {
        return typeof window !== 'undefined' && !!window.electron;
    }

    private getSep(): string {
        return navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
    }

    private joinPath(base: string, name: string): string {
        const sep = this.getSep();
        const normalized = base.endsWith(sep) ? base : `${base}${sep}`;
        return `${normalized}${name}`;
    }

    private storageObjectPath(tenantId: string) {
        return `tenants/${tenantId}/mirror/${CHAT_FILE_NAME}`;
    }

    async resolveMirrorRoot(): Promise<string | null> {
        if (!this.isElectron()) return null;

        const effective = getEffectiveArchiveRootPath();
        if (effective?.trim()) {
            const trimmed = effective.trim();
            return trimmed.endsWith(this.getSep()) ? trimmed : `${trimmed}${this.getSep()}`;
        }

        if (hasCompanyArchiveRootConfigured()) {
            return null;
        }

        if (localStorage.getItem(ARCHIVE_USE_DEFAULT_KEY) === 'true' || !getArchiveRootPath()) {
            const docs = await window.electron.getDocumentsPath();
            return `${docs}${this.getSep()}${DEFAULT_ARCHIVE_FOLDER_NAME}${this.getSep()}`;
        }
        return null;
    }

    private async writeLocalWithRetry(filePath: string, content: string): Promise<boolean> {
        if (!this.isElectron()) return false;
        for (let attempt = 0; attempt < WRITE_RETRY_DELAYS_MS.length; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, WRITE_RETRY_DELAYS_MS[attempt]));
            const result = await window.electron.saveFile(filePath, content);
            if (result?.success) return true;
        }
        return false;
    }

    private async readLocalWithMeta(
        filePath: string
    ): Promise<{ data: string; mtime: number } | null> {
        if (!this.isElectron()) return null;
        for (let attempt = 0; attempt < WRITE_RETRY_DELAYS_MS.length; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, WRITE_RETRY_DELAYS_MS[attempt]));
            const result = await window.electron.readFile(filePath);
            if (result?.success && result.data) {
                return { data: result.data, mtime: Number(result.mtime) || 0 };
            }
            // ENOENT — 재시도 불필요
            if (result && !result.success && String(result.error || '').includes('ENOENT')) {
                return null;
            }
        }
        return null;
    }

    private async readLocalWithRetry(filePath: string): Promise<string | null> {
        const meta = await this.readLocalWithMeta(filePath);
        return meta?.data ?? null;
    }

    private rememberCache(tenantId: string, messages: ChatMessage[], updatedAt: string, mtime = 0) {
        this.cachedTenantId = tenantId;
        this.cachedMessages = messages;
        this.cachedUpdatedAt = updatedAt;
        if (mtime) this.cachedMtime = mtime;
    }

    buildPayload(tenantId: string, messages: ChatMessage[]): ChatMirrorPayload {
        return {
            version: CHAT_VERSION,
            tenantId,
            updatedAt: new Date().toISOString(),
            messages: mergeChatMessages([], messages),
        };
    }

    /** Electron: NAS 원본 읽기→merge→쓰기. Storage는 비동기 보조(사내 Electron 일관성과 분리). */
    async publish(tenantId: string, messages: ChatMessage[]): Promise<boolean> {
        if (!tenantId) return false;

        // 연속 publish 직렬화 — 같은 파일 RMW 경합 방지
        const run = this.publishChain.then(() => this.publishOnce(tenantId, messages));
        this.publishChain = run.then(
            () => true,
            () => true
        );
        return run;
    }

    private async publishOnce(tenantId: string, messages: ChatMessage[]): Promise<boolean> {
        if (this.isElectron()) {
            let nasOk = false;
            const root = await this.resolveMirrorRoot();
            if (root) {
                const filePath = this.joinPath(root, CHAT_FILE_NAME);
                let existing: ChatMessage[] = [];
                if (this.cachedTenantId === tenantId && this.cachedMessages) {
                    existing = this.cachedMessages;
                } else {
                    try {
                        const meta = await this.readLocalWithMeta(filePath);
                        if (meta?.data) {
                            const parsed = JSON.parse(meta.data) as ChatMirrorPayload;
                            if (Array.isArray(parsed?.messages)) existing = parsed.messages;
                            this.cachedMtime = meta.mtime;
                        }
                    } catch {
                        existing = [];
                    }
                }
                // 전체 merge 후 핫만 유지, 넘치면 월별 아카이브
                const full = mergeChatMessagesUnlimited(existing, messages);
                if (full.length > HOT_CHAT_LIMIT) {
                    const overflow = full.slice(0, full.length - HOT_CHAT_LIMIT);
                    void this.archiveOverflow(root, tenantId, overflow);
                }
                const hot = takeHotMessages(full);
                const payload = this.buildPayload(tenantId, hot);
                const content = JSON.stringify(payload);
                nasOk = await this.writeLocalWithRetry(filePath, content);
                if (nasOk) {
                    this.rememberCache(tenantId, hot, payload.updatedAt, 0);
                }
            }
            return nasOk;
        }

        const payload = this.buildPayload(tenantId, takeHotMessages(messages));
        const content = JSON.stringify(payload);
        try {
            const blob = new Blob([content], { type: 'application/json' });
            await uploadBytes(ref(storage, this.storageObjectPath(tenantId)), blob, {
                contentType: 'application/json',
            });
            this.rememberCache(tenantId, payload.messages, payload.updatedAt);
            return true;
        } catch (error) {
            console.warn('[ChatMirror] storage upload failed:', error);
            return false;
        }
    }

    /** 넘친 메시지를 월별 chat-archive/YYYY-MM.json 에 보관 */
    private async archiveOverflow(
        root: string,
        tenantId: string,
        overflow: ChatMessage[]
    ): Promise<void> {
        if (!overflow.length || !this.isElectron()) return;
        const byMonth = new Map<string, ChatMessage[]>();
        for (const m of overflow) {
            const key = monthKeyFromMessage(m);
            const list = byMonth.get(key) || [];
            list.push(m);
            byMonth.set(key, list);
        }
        const archiveDir = this.joinPath(root, CHAT_ARCHIVE_FOLDER);
        if (window.electron?.ensureDir) {
            await window.electron.ensureDir(archiveDir);
        }
        for (const [month, msgs] of byMonth) {
            try {
                const filePath = this.joinPath(archiveDir, `${month}.json`);
                let existing: ChatMessage[] = [];
                const raw = await this.readLocalWithRetry(filePath);
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw) as ChatMirrorPayload;
                        if (Array.isArray(parsed?.messages)) existing = parsed.messages;
                    } catch {
                        existing = [];
                    }
                }
                const merged = mergeChatMessagesUnlimited(existing, msgs);
                const payload: ChatMirrorPayload = {
                    version: CHAT_VERSION,
                    tenantId,
                    updatedAt: new Date().toISOString(),
                    messages: merged,
                };
                await this.writeLocalWithRetry(filePath, JSON.stringify(payload));
            } catch (e) {
                console.warn('[ChatMirror] archive write failed:', month, e);
            }
        }
    }

    /**
     * 이전 대화 페이지 로드 — beforeTimestamp 이전 메시지 중 최근 pageSize개.
     * 아카이브 월 파일을 역순으로 읽음 (실시간 핫 파일과 분리).
     */
    async loadOlderMessages(opts: {
        tenantId: string;
        beforeTimestamp: string;
        excludeIds?: Set<string>;
        pageSize?: number;
        gatewayBaseUrl?: StoreGatewayInput;
    }): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
        const pageSize = opts.pageSize || OLDER_CHAT_PAGE_SIZE;
        const beforeMs = Date.parse(opts.beforeTimestamp) || Date.now();
        const exclude = opts.excludeIds || new Set<string>();
        const collected: ChatMessage[] = [];

        if (this.isElectron()) {
            const root = await this.resolveMirrorRoot();
            if (!root) return { messages: [], hasMore: false };

            // before 시점부터 최대 24개월 역방향
            const cursor = new Date(beforeMs);
            for (let i = 0; i < 24 && collected.length < pageSize + 1; i++) {
                const y = cursor.getFullYear();
                const mo = String(cursor.getMonth() + 1).padStart(2, '0');
                const filePath = this.joinPath(
                    this.joinPath(root, CHAT_ARCHIVE_FOLDER),
                    `${y}-${mo}.json`
                );
                const raw = await this.readLocalWithRetry(filePath);
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw) as ChatMirrorPayload;
                        const list = Array.isArray(parsed?.messages) ? parsed.messages : [];
                        for (const m of list) {
                            if (!m?.id || exclude.has(m.id)) continue;
                            const t = messageTime(m);
                            if (t > 0 && t < beforeMs) collected.push(m);
                        }
                    } catch {
                        /* skip corrupt archive */
                    }
                }
                cursor.setMonth(cursor.getMonth() - 1);
            }
        } else {
            // 웹/태블릿: 매장 게이트웨이 older API
            const viaGw = await this.loadOlderViaGateway(opts.tenantId, beforeMs, pageSize, exclude, opts.gatewayBaseUrl);
            if (viaGw) return viaGw;
            // 폴백: 핫 파일에서 before 필터만
            const payload = await this.readRemote(opts.tenantId, opts.gatewayBaseUrl);
            for (const m of payload?.messages || []) {
                if (!m?.id || exclude.has(m.id)) continue;
                const t = messageTime(m);
                if (t > 0 && t < beforeMs) collected.push(m);
            }
        }

        collected.sort((a, b) => messageTime(a) - messageTime(b));
        const hasMore = collected.length > pageSize;
        const page = hasMore ? collected.slice(collected.length - pageSize) : collected;
        return { messages: page, hasMore };
    }

    private async loadOlderViaGateway(
        tenantId: string,
        beforeMs: number,
        pageSize: number,
        exclude: Set<string>,
        gatewayBaseUrl?: StoreGatewayInput
    ): Promise<{ messages: ChatMessage[]; hasMore: boolean } | null> {
        const urls = await orderStoreGatewayUrls(resolveStoreGatewayUrlList(gatewayBaseUrl));
        if (urls.length === 0) return null;
        const { getGatewayAuthToken } = await import('../utils/gatewayToken');
        const token = getGatewayAuthToken(tenantId);
        const excludeParam = [...exclude].slice(0, 200).join(',');
        for (const base of urls) {
            try {
                const q = new URLSearchParams({
                    tenantId,
                    before: new Date(beforeMs).toISOString(),
                    limit: String(pageSize),
                });
                if (excludeParam) q.set('exclude', excludeParam);
                const res = await fetchWithTimeout(
                    `${base}/api/v1/chat/older?${q.toString()}`,
                    {
                        cache: 'no-store',
                        headers: token ? { 'X-Ezpw-Gateway-Token': token } : {},
                    },
                    DEFAULT_LAN_FETCH_TIMEOUT_MS
                );
                if (!res.ok) continue;
                const data = (await res.json()) as {
                    messages?: ChatMessage[];
                    hasMore?: boolean;
                };
                if (!Array.isArray(data?.messages)) continue;
                return {
                    messages: data.messages,
                    hasMore: Boolean(data.hasMore),
                };
            } catch (error) {
                console.warn('[ChatMirror] gateway older failed:', base, error);
            }
        }
        return null;
    }

    /** 기존 거대 핫 파일을 핫+아카이브로 정리 (백그라운드) */
    async compactHotIfNeeded(tenantId: string): Promise<ChatMessage[] | null> {
        if (!this.isElectron() || !tenantId) return null;
        const root = await this.resolveMirrorRoot();
        if (!root) return null;
        const filePath = this.joinPath(root, CHAT_FILE_NAME);
        const meta = await this.readLocalWithMeta(filePath);
        if (!meta?.data) return null;
        let messages: ChatMessage[] = [];
        try {
            const parsed = JSON.parse(meta.data) as ChatMirrorPayload;
            messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
        } catch {
            return null;
        }
        if (messages.length <= HOT_CHAT_LIMIT) {
            this.rememberCache(tenantId, messages, new Date().toISOString(), meta.mtime);
            return messages;
        }
        const overflow = messages.slice(0, messages.length - HOT_CHAT_LIMIT);
        const hot = takeHotMessages(messages);
        await this.archiveOverflow(root, tenantId, overflow);
        const payload = this.buildPayload(tenantId, hot);
        const ok = await this.writeLocalWithRetry(filePath, JSON.stringify(payload));
        if (ok) this.rememberCache(tenantId, hot, payload.updatedAt, 0);
        return hot;
    }

    private uploadStorageAsync(tenantId: string, content: string): void {
        void (async () => {
            try {
                const blob = new Blob([content], { type: 'application/json' });
                await uploadBytes(ref(storage, this.storageObjectPath(tenantId)), blob, {
                    contentType: 'application/json',
                });
            } catch (error) {
                console.warn('[ChatMirror] storage upload failed (non-blocking):', error);
            }
        })();
    }

    async readFromNas(): Promise<ChatMirrorPayload | null> {
        if (!this.isElectron()) return null;
        const root = await this.resolveMirrorRoot();
        if (!root) return null;
        const filePath = this.joinPath(root, CHAT_FILE_NAME);
        const meta = await this.readLocalWithMeta(filePath);
        if (!meta) return null;

        // mtime 동일하면 파싱 생략
        if (
            this.cachedMtime &&
            meta.mtime === this.cachedMtime &&
            this.cachedMessages &&
            this.cachedTenantId
        ) {
            return {
                version: CHAT_VERSION,
                tenantId: this.cachedTenantId,
                updatedAt: this.cachedUpdatedAt || new Date().toISOString(),
                messages: this.cachedMessages,
            };
        }

        try {
            const parsed = JSON.parse(meta.data) as ChatMirrorPayload;
            if (Array.isArray(parsed?.messages)) {
                this.rememberCache(
                    parsed.tenantId || this.cachedTenantId || '',
                    parsed.messages,
                    parsed.updatedAt || new Date().toISOString(),
                    meta.mtime
                );
            }
            return parsed;
        } catch {
            return null;
        }
    }

    async readFromStorage(tenantId: string): Promise<ChatMirrorPayload | null> {
        if (!tenantId) return null;
        try {
            const bytes = await getBytes(ref(storage, this.storageObjectPath(tenantId)));
            const raw = new TextDecoder().decode(bytes);
            return JSON.parse(raw) as ChatMirrorPayload;
        } catch {
            return null;
        }
    }

    async readFromStorageWithTimeout(
        tenantId: string,
        timeoutMs = STORAGE_FETCH_TIMEOUT_MS
    ): Promise<ChatMirrorPayload | null> {
        if (!tenantId) return null;
        try {
            return await Promise.race([
                this.readFromStorage(tenantId),
                new Promise<null>((_, reject) => {
                    setTimeout(() => reject(new Error('storage-timeout')), timeoutMs);
                }),
            ]);
        } catch {
            return null;
        }
    }

    private async fetchGatewayChatOne(
        tenantId: string,
        gatewayBaseUrl: string
    ): Promise<ChatMirrorPayload | null> {
        const base = normalizeGatewayBase(gatewayBaseUrl);
        if (!base) return null;
        try {
            const { getGatewayAuthToken } = await import('../utils/gatewayToken');
            const token = getGatewayAuthToken(tenantId);
            const res = await fetchWithTimeout(
                `${base}/api/v1/chat?tenantId=${encodeURIComponent(tenantId)}`,
                {
                    cache: 'no-store',
                    headers: token ? { 'X-Ezpw-Gateway-Token': token } : {},
                },
                DEFAULT_LAN_FETCH_TIMEOUT_MS
            );
            if (!res.ok) return null;
            const data = (await res.json()) as ChatMirrorPayload;
            if (!Array.isArray(data?.messages)) return null;
            return data;
        } catch (error) {
            console.warn('[ChatMirror] gateway read failed:', base, error);
            return null;
        }
    }

    private async fetchGatewayChatBest(
        tenantId: string,
        gatewayBaseUrl: StoreGatewayInput
    ): Promise<ChatMirrorPayload | null> {
        const urls = await orderStoreGatewayUrls(resolveStoreGatewayUrlList(gatewayBaseUrl));
        if (urls.length === 0) return null;
        const results = await Promise.all(urls.map((url) => this.fetchGatewayChatOne(tenantId, url)));
        let best: ChatMirrorPayload | null = null;
        for (const payload of results) {
            if (!payload) continue;
            if (!best || Date.parse(payload.updatedAt) > Date.parse(best.updatedAt)) {
                best = payload;
            }
        }
        return best;
    }

    private mergeGatewayAndStorageChat(
        gatewayPayload: ChatMirrorPayload | null,
        storagePayload: ChatMirrorPayload | null
    ): ChatMirrorPayload | null {
        const ts = (p: ChatMirrorPayload | null) => Date.parse(p?.updatedAt || '') || 0;
        if (gatewayPayload && storagePayload) {
            const newer = ts(storagePayload) > ts(gatewayPayload) ? storagePayload : gatewayPayload;
            const older = ts(storagePayload) > ts(gatewayPayload) ? gatewayPayload : storagePayload;
            return {
                ...newer,
                messages: mergeChatMessages(older.messages || [], newer.messages || []),
            };
        }
        return gatewayPayload || storagePayload;
    }

    async readRemote(tenantId: string, gatewayBaseUrl?: StoreGatewayInput): Promise<ChatMirrorPayload | null> {
        if (!tenantId) return null;

        const gatewayPayload = await this.fetchGatewayChatBest(tenantId, gatewayBaseUrl);
        if (gatewayPayload) {
            return gatewayPayload;
        }

        return this.readFromStorageWithTimeout(tenantId);
    }

    /** Electron NAS 실패 시 — 허브 게이트웨이만 (Storage 혼용 안 함) */
    async readViaGatewayOnly(
        tenantId: string,
        gatewayBaseUrl?: StoreGatewayInput
    ): Promise<ChatMirrorPayload | null> {
        if (!tenantId) return null;
        return this.fetchGatewayChatBest(tenantId, gatewayBaseUrl);
    }

    /** 웹에서 매장 PC 게이트웨이로 채팅 저장 시도 (LAN) */
    async publishViaGateway(
        tenantId: string,
        messages: ChatMessage[],
        gatewayBaseUrl?: StoreGatewayInput
    ): Promise<boolean> {
        if (!tenantId) return false;
        const urls = await orderStoreGatewayUrls(resolveStoreGatewayUrlList(gatewayBaseUrl));
        if (urls.length === 0) return false;

        const { getGatewayAuthToken } = await import('../utils/gatewayToken');
        const token = getGatewayAuthToken(tenantId);
        const payload = this.buildPayload(tenantId, messages);
        for (const base of urls) {
            try {
                const res = await fetchWithTimeout(
                    `${base}/api/v1/chat`,
                    {
                        method: 'POST',
                        cache: 'no-store',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'X-Ezpw-Gateway-Token': token } : {}),
                        },
                        body: JSON.stringify(payload),
                    },
                    DEFAULT_LAN_FETCH_TIMEOUT_MS
                );
                if (res.ok) return true;
            } catch (error) {
                console.warn('[ChatMirror] gateway publish failed:', base, error);
            }
        }
        return false;
    }
}

export const chatMirrorService = new ChatMirrorService();
