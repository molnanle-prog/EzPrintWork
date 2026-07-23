/**
 * 견적·용지·휴가·지시 — NAS JSON SSOT (Firestore 미사용)
 * 파일: quotes-live.json / papers-live.json / leaves-live.json / instructions-live.json
 */
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
import {
    filterAuxItemsByTombstones,
    mergeAuxTombstoneLists,
    type AuxTombstone,
} from '../utils/auxTombstones';

export type AuxCollectionName = 'quotes' | 'papers' | 'leaves' | 'instructions';

export const AUX_COLLECTION_FILES: Record<AuxCollectionName, string> = {
    quotes: 'quotes-live.json',
    papers: 'papers-live.json',
    leaves: 'leaves-live.json',
    instructions: 'instructions-live.json',
};

export const AUX_COLLECTION_NAMES: AuxCollectionName[] = [
    'quotes',
    'papers',
    'leaves',
    'instructions',
];

const AUX_VERSION = 1;
const WRITE_RETRY_DELAYS_MS = [0, 1200, 3000];
const STORAGE_FETCH_TIMEOUT_MS = 8000;

export interface AuxMirrorPayload {
    version: number;
    tenantId: string;
    collection: AuxCollectionName;
    updatedAt: string;
    items: Array<{ id: string; [key: string]: unknown }>;
    /** 삭제된 항목 — union merge로 되살아나는 것 방지 */
    deletedItems?: AuxTombstone[];
}

function entityTime(row: Record<string, unknown>): number {
    const raw = String(row.updatedAt || row.createdAt || row.timestamp || '');
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : 0;
}

export function mergeAuxItemsById(
    current: Array<Record<string, unknown>>,
    incoming: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of current) {
        if (row?.id) map.set(String(row.id), row);
    }
    for (const row of incoming) {
        if (!row?.id) continue;
        const id = String(row.id);
        const prev = map.get(id);
        if (!prev) {
            map.set(id, row);
            continue;
        }
        map.set(id, entityTime(row) >= entityTime(prev) ? { ...prev, ...row } : prev);
    }
    return Array.from(map.values());
}

class AuxCollectionMirrorService {
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

    private storageObjectPath(tenantId: string, collection: AuxCollectionName) {
        return `tenants/${tenantId}/mirror/${AUX_COLLECTION_FILES[collection]}`;
    }

    async resolveMirrorRoot(): Promise<string | null> {
        if (!this.isElectron()) return null;
        const effective = getEffectiveArchiveRootPath();
        if (effective?.trim()) {
            const trimmed = effective.trim();
            return trimmed.endsWith(this.getSep()) ? trimmed : `${trimmed}${this.getSep()}`;
        }
        if (hasCompanyArchiveRootConfigured()) return null;
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

    buildPayload(
        tenantId: string,
        collection: AuxCollectionName,
        items: Array<Record<string, unknown>>,
        deletedItems?: AuxTombstone[]
    ): AuxMirrorPayload {
        const tombMap = new Map<string, number>();
        for (const row of deletedItems || []) {
            if (!row?.id || !row.deletedAt) continue;
            const ms = Date.parse(row.deletedAt);
            if (Number.isFinite(ms)) tombMap.set(row.id, ms);
        }
        const cleaned = filterAuxItemsByTombstones(
            mergeAuxItemsById([], items).map((row) => ({
                ...row,
                id: String(row.id),
            })),
            tombMap
        ) as Array<{ id: string; [key: string]: unknown }>;
        return {
            version: AUX_VERSION,
            tenantId,
            collection,
            updatedAt: new Date().toISOString(),
            items: cleaned,
            deletedItems: deletedItems?.length ? deletedItems : undefined,
        };
    }

    async publish(
        tenantId: string,
        collection: AuxCollectionName,
        items: Array<Record<string, unknown>>,
        deletedItems?: AuxTombstone[]
    ): Promise<boolean> {
        if (!tenantId) return false;
        const fileName = AUX_COLLECTION_FILES[collection];

        if (this.isElectron()) {
            let nasOk = false;
            const root = await this.resolveMirrorRoot();
            if (root) {
                const filePath = this.joinPath(root, fileName);
                let existing: Array<Record<string, unknown>> = [];
                let existingDeleted: AuxTombstone[] = [];
                try {
                    const raw = await this.readLocalWithRetry(filePath);
                    if (raw) {
                        const parsed = JSON.parse(raw) as AuxMirrorPayload;
                        if (Array.isArray(parsed?.items)) existing = parsed.items;
                        if (Array.isArray(parsed?.deletedItems)) existingDeleted = parsed.deletedItems;
                    }
                } catch {
                    existing = [];
                }
                const mergedDeleted = mergeAuxTombstoneLists(existingDeleted, deletedItems);
                const tombMap = new Map<string, number>();
                for (const row of mergedDeleted) {
                    const ms = Date.parse(row.deletedAt);
                    if (Number.isFinite(ms)) tombMap.set(row.id, ms);
                }
                // 로컬 items가 권위 — existing union으로 삭제를 되돌리지 않음
                // (NAS에만 남은 id는 로컬에 없을 때만 보강, 단 tombstone이면 제외)
                const localIds = new Set(items.map((r) => String(r?.id || '')).filter(Boolean));
                const extras = existing.filter((r) => {
                    const id = r?.id != null ? String(r.id) : '';
                    return id && !localIds.has(id);
                });
                const merged = filterAuxItemsByTombstones(
                    mergeAuxItemsById(items, extras),
                    tombMap
                );
                const payload = this.buildPayload(tenantId, collection, merged, mergedDeleted);
                const content = JSON.stringify(payload, null, 2);
                nasOk = await this.writeLocalWithRetry(filePath, content);
                if (nasOk) void this.uploadStorageAsync(tenantId, collection, content);
            }
            return nasOk;
        }

        const payload = this.buildPayload(
            tenantId,
            collection,
            items,
            deletedItems?.length ? deletedItems : undefined
        );
        const content = JSON.stringify(payload, null, 2);
        try {
            const blob = new Blob([content], { type: 'application/json' });
            await uploadBytes(ref(storage, this.storageObjectPath(tenantId, collection)), blob, {
                contentType: 'application/json',
            });
            return true;
        } catch (error) {
            console.warn(`[AuxMirror] storage upload failed (${collection}):`, error);
            return false;
        }
    }

    private uploadStorageAsync(
        tenantId: string,
        collection: AuxCollectionName,
        content: string
    ): void {
        void (async () => {
            try {
                const blob = new Blob([content], { type: 'application/json' });
                await uploadBytes(ref(storage, this.storageObjectPath(tenantId, collection)), blob, {
                    contentType: 'application/json',
                });
            } catch (error) {
                console.warn(`[AuxMirror] storage upload failed (${collection}):`, error);
            }
        })();
    }

    async readFromNas(
        tenantId: string,
        collection: AuxCollectionName
    ): Promise<AuxMirrorPayload | null> {
        if (!tenantId || !this.isElectron()) return null;
        const root = await this.resolveMirrorRoot();
        if (!root) return null;
        const filePath = this.joinPath(root, AUX_COLLECTION_FILES[collection]);
        try {
            const raw = await this.readLocalWithRetry(filePath);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as AuxMirrorPayload;
            if (!Array.isArray(parsed?.items)) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    async readViaGateway(
        tenantId: string,
        collection: AuxCollectionName,
        gatewayBaseUrl: StoreGatewayInput
    ): Promise<AuxMirrorPayload | null> {
        if (!tenantId) return null;
        const urls = await orderStoreGatewayUrls(resolveStoreGatewayUrlList(gatewayBaseUrl));
        for (const base of urls) {
            const normalized = normalizeGatewayBase(base);
            if (!normalized) continue;
            try {
                const res = await fetchWithTimeout(
                    `${normalized}/api/v1/aux/${collection}?tenantId=${encodeURIComponent(tenantId)}`,
                    { cache: 'no-store' },
                    DEFAULT_LAN_FETCH_TIMEOUT_MS
                );
                if (!res.ok) continue;
                const parsed = (await res.json()) as AuxMirrorPayload;
                if (Array.isArray(parsed?.items)) return parsed;
            } catch {
                /* try next */
            }
        }
        return null;
    }

    async readFromStorage(
        tenantId: string,
        collection: AuxCollectionName
    ): Promise<AuxMirrorPayload | null> {
        if (!tenantId) return null;
        try {
            const bytes = await Promise.race([
                getBytes(ref(storage, this.storageObjectPath(tenantId, collection))),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), STORAGE_FETCH_TIMEOUT_MS)
                ),
            ]);
            const text = new TextDecoder().decode(bytes);
            const parsed = JSON.parse(text) as AuxMirrorPayload;
            if (Array.isArray(parsed?.items)) return parsed;
        } catch {
            /* ignore */
        }
        return null;
    }

    async readBest(
        tenantId: string,
        collection: AuxCollectionName,
        gatewayBaseUrl?: StoreGatewayInput
    ): Promise<AuxMirrorPayload | null> {
        if (this.isElectron()) {
            const nas = await this.readFromNas(tenantId, collection);
            if (nas) return nas;
        }
        if (gatewayBaseUrl) {
            const gw = await this.readViaGateway(tenantId, collection, gatewayBaseUrl);
            if (gw) return gw;
        }
        return this.readFromStorage(tenantId, collection);
    }
}

export const auxCollectionMirrorService = new AuxCollectionMirrorService();
