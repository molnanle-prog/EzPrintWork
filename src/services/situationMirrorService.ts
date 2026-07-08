import { Job, JobStatusDefinition, KanbanLayoutConfig, Staff, Client } from '../types';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { storage } from './firebase';
import { filterJobsForOperationalBoard } from '../utils/jobDisplayFilters';
import {
    ARCHIVE_USE_DEFAULT_KEY,
    DEFAULT_ARCHIVE_FOLDER_NAME,
    getArchiveRootPath,
    getEffectiveArchiveRootPath,
    hasCompanyArchiveRootConfigured,
} from '../utils/archiveStorage';

const MIRROR_VERSION = 1;
const SITUATION_FILE_NAME = 'situation-mirror.json';
const WRITE_RETRY_DELAYS_MS = [0, 1200, 3000];

export interface SituationStaffSnapshot {
    id: string;
    name?: string;
    isOnline?: boolean;
    online?: boolean;
    lastActive?: string;
}

export interface SituationMirrorPayload {
    version: number;
    tenantId: string;
    updatedAt: string;
    companyName?: string;
    kanbanLayout?: KanbanLayoutConfig;
    statusDefinitions?: JobStatusDefinition[];
    jobs: Job[];
    clients?: Client[];
    settings?: Record<string, unknown>;
    staff?: SituationStaffSnapshot[];
}

export class SituationMirrorService {
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
        return `tenants/${tenantId}/mirror/${SITUATION_FILE_NAME}`;
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

    buildPayload(
        tenantId: string,
        input: {
            jobs: Job[];
            clients?: Client[];
            settings?: Record<string, unknown>;
            companyName?: string;
            kanbanLayout?: KanbanLayoutConfig;
            statusDefinitions?: JobStatusDefinition[];
            staff?: Staff[];
        }
    ): SituationMirrorPayload {
        const boardJobs = filterJobsForOperationalBoard(input.jobs, {
            includeStatusKeys: ['QUOTE'],
        });
        return {
            version: MIRROR_VERSION,
            tenantId,
            updatedAt: new Date().toISOString(),
            companyName: input.companyName,
            kanbanLayout: input.kanbanLayout,
            statusDefinitions: input.statusDefinitions,
            jobs: boardJobs,
            clients: input.clients || [],
            settings: input.settings || {},
            staff: (input.staff || []).map((s) => {
                const row = s as Staff & { isOnline?: boolean; online?: boolean; lastActive?: string };
                return {
                    id: row.id,
                    name: row.name,
                    isOnline: row.isOnline,
                    online: row.online,
                    lastActive: row.lastActive,
                };
            }),
        };
    }

    /** Electron — NAS 단일 원본. Storage는 웹용 비동기 미러 */
    async publish(tenantId: string, payload: SituationMirrorPayload): Promise<boolean> {
        if (!tenantId) return false;
        const content = JSON.stringify(payload, null, 2);
        let nasOk = false;

        if (this.isElectron()) {
            const root = await this.resolveMirrorRoot();
            if (root) {
                const localPath = this.joinPath(root, SITUATION_FILE_NAME);
                nasOk = await this.writeLocalWithRetry(localPath, content);
            }
            void this.uploadStorageMirrorAsync(tenantId, content);
            return nasOk;
        }

        try {
            const blob = new Blob([content], { type: 'application/json' });
            await uploadBytes(ref(storage, this.storageObjectPath(tenantId)), blob, {
                contentType: 'application/json',
            });
            return true;
        } catch (error) {
            console.warn('[SituationMirror] storage upload failed:', error);
            return false;
        }
    }

    private uploadStorageMirrorAsync(tenantId: string, content: string): void {
        void (async () => {
            try {
                const blob = new Blob([content], { type: 'application/json' });
                await uploadBytes(ref(storage, this.storageObjectPath(tenantId)), blob, {
                    contentType: 'application/json',
                });
            } catch (error) {
                console.warn('[SituationMirror] storage upload failed (non-blocking):', error);
            }
        })();
    }

    /** 웹·태블릿 — Storage 폴백 (매장 PC NAS 직접 접근 불가 시) */
    async readFromStorage(tenantId: string): Promise<SituationMirrorPayload | null> {
        if (!tenantId) return null;
        try {
            const bytes = await getBytes(ref(storage, this.storageObjectPath(tenantId)));
            const raw = new TextDecoder().decode(bytes);
            return JSON.parse(raw) as SituationMirrorPayload;
        } catch (error) {
            console.warn('[SituationMirror] storage read failed:', error);
            return null;
        }
    }

    /** Electron — NAS/공유 폴더만 (PC 간 동기화 원본) */
    async readFromNas(tenantId: string): Promise<SituationMirrorPayload | null> {
        return this.readLocal(tenantId);
    }

    /** Electron — NAS/로컬 파일 */
    async readLocal(tenantId: string): Promise<SituationMirrorPayload | null> {
        if (!tenantId || !this.isElectron()) return null;
        const root = await this.resolveMirrorRoot();
        if (!root) return null;
        const raw = await this.readLocalWithRetry(this.joinPath(root, SITUATION_FILE_NAME));
        if (!raw) return null;
        try {
            return JSON.parse(raw) as SituationMirrorPayload;
        } catch {
            return null;
        }
    }

    /**
     * 외부 웹 — 사내 게이트웨이(LAN) 우선, 없으면 Storage.
     * gatewayBaseUrl 예: http://192.168.0.10:3847
     */
    async readRemoteMirror(tenantId: string, gatewayBaseUrl?: string | null): Promise<SituationMirrorPayload | null> {
        if (!tenantId) return null;

        const base = gatewayBaseUrl?.trim().replace(/\/$/, '');
        if (base) {
            try {
                const res = await fetch(
                    `${base}/api/v1/mirror?tenantId=${encodeURIComponent(tenantId)}`,
                    { cache: 'no-store' }
                );
                if (res.ok) {
                    const data = (await res.json()) as Partial<SituationMirrorPayload> & {
                        jobs?: Job[];
                        updatedAt?: string;
                    };
                    if (data.jobs || data.updatedAt) {
                        return {
                            version: data.version ?? MIRROR_VERSION,
                            tenantId,
                            updatedAt: data.updatedAt || new Date().toISOString(),
                            companyName: data.companyName,
                            kanbanLayout: data.kanbanLayout,
                            statusDefinitions: data.statusDefinitions,
                            jobs: data.jobs || [],
                            clients: data.clients,
                            settings: data.settings,
                            staff: data.staff,
                        };
                    }
                }
            } catch (error) {
                console.warn('[SituationMirror] gateway read failed:', error);
            }
        }

        return this.readFromStorage(tenantId);
    }

    /** @deprecated PC 동기화는 readFromNas 사용. 웹은 readFromStorage / readRemoteMirror */
    async read(tenantId: string, preferLocal = false): Promise<SituationMirrorPayload | null> {
        if (this.isElectron()) {
            if (preferLocal) return this.readFromNas(tenantId);
            const local = await this.readFromNas(tenantId);
            if (local) return local;
            return this.readFromStorage(tenantId);
        }
        return this.readFromStorage(tenantId);
    }
}

export const situationMirrorService = new SituationMirrorService();
