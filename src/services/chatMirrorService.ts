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

const CHAT_VERSION = 1;
export const CHAT_FILE_NAME = 'chat-messages.json';
/** 오래된 메시지 자동 정리 — NAS 파일 비대화 방지 */
const MAX_CHAT_MESSAGES = 5000;
const WRITE_RETRY_DELAYS_MS = [0, 1200, 3000];

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
    if (list.length <= MAX_CHAT_MESSAGES) return list;
    return list.slice(list.length - MAX_CHAT_MESSAGES);
}

export class ChatMirrorService {
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

    private async readLocalWithRetry(filePath: string): Promise<string | null> {
        if (!this.isElectron()) return null;
        for (let attempt = 0; attempt < WRITE_RETRY_DELAYS_MS.length; attempt++) {
            if (attempt > 0) await new Promise((r) => setTimeout(r, WRITE_RETRY_DELAYS_MS[attempt]));
            const result = await window.electron.readFile(filePath);
            if (result?.success && result.data) return result.data;
        }
        return null;
    }

    buildPayload(tenantId: string, messages: ChatMessage[]): ChatMirrorPayload {
        return {
            version: CHAT_VERSION,
            tenantId,
            updatedAt: new Date().toISOString(),
            messages: mergeChatMessages([], messages),
        };
    }

    /** Electron: NAS 원본 + Storage 비동기. 웹: Storage 또는 게이트웨이 */
    async publish(tenantId: string, messages: ChatMessage[]): Promise<boolean> {
        if (!tenantId) return false;
        const payload = this.buildPayload(tenantId, messages);
        const content = JSON.stringify(payload, null, 2);

        if (this.isElectron()) {
            let nasOk = false;
            const root = await this.resolveMirrorRoot();
            if (root) {
                nasOk = await this.writeLocalWithRetry(this.joinPath(root, CHAT_FILE_NAME), content);
            }
            void this.uploadStorageAsync(tenantId, content);
            return nasOk;
        }

        try {
            const blob = new Blob([content], { type: 'application/json' });
            await uploadBytes(ref(storage, this.storageObjectPath(tenantId)), blob, {
                contentType: 'application/json',
            });
            return true;
        } catch (error) {
            console.warn('[ChatMirror] storage upload failed:', error);
            return false;
        }
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
        const raw = await this.readLocalWithRetry(this.joinPath(root, CHAT_FILE_NAME));
        if (!raw) return null;
        try {
            return JSON.parse(raw) as ChatMirrorPayload;
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

    async readRemote(tenantId: string, gatewayBaseUrl?: string | null): Promise<ChatMirrorPayload | null> {
        if (!tenantId) return null;

        let gatewayPayload: ChatMirrorPayload | null = null;
        const base = gatewayBaseUrl?.trim().replace(/\/$/, '');
        if (base) {
            try {
                const { deriveStoreGatewayToken } = await import('../utils/gatewayToken');
                const token = deriveStoreGatewayToken(tenantId);
                const res = await fetch(
                    `${base}/api/v1/chat?tenantId=${encodeURIComponent(tenantId)}`,
                    {
                        cache: 'no-store',
                        headers: token ? { 'X-Ezpw-Gateway-Token': token } : {},
                    }
                );
                if (res.ok) {
                    gatewayPayload = (await res.json()) as ChatMirrorPayload;
                }
            } catch (error) {
                console.warn('[ChatMirror] gateway read failed:', error);
            }
        }

        const storagePayload = await this.readFromStorage(tenantId);
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

    /** 웹에서 매장 PC 게이트웨이로 채팅 저장 시도 (LAN) */
    async publishViaGateway(
        tenantId: string,
        messages: ChatMessage[],
        gatewayBaseUrl?: string | null
    ): Promise<boolean> {
        const base = gatewayBaseUrl?.trim().replace(/\/$/, '');
        if (!base || !tenantId) return false;
        try {
            const { deriveStoreGatewayToken } = await import('../utils/gatewayToken');
            const token = deriveStoreGatewayToken(tenantId);
            const payload = this.buildPayload(tenantId, messages);
            const res = await fetch(`${base}/api/v1/chat`, {
                method: 'POST',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'X-Ezpw-Gateway-Token': token } : {}),
                },
                body: JSON.stringify(payload),
            });
            return res.ok;
        } catch (error) {
            console.warn('[ChatMirror] gateway publish failed:', error);
            return false;
        }
    }
}

export const chatMirrorService = new ChatMirrorService();
