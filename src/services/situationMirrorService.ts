import { Job, JobStatusDefinition, KanbanLayoutConfig, Staff, Client } from '../types';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { storage } from './firebase';
import { filterJobsForOperationalBoard } from '../utils/jobDisplayFilters';
import {
    ARCHIVE_USE_DEFAULT_KEY,
    DEFAULT_ARCHIVE_FOLDER_NAME,
    getArchiveRootPath,
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
        const custom = getArchiveRootPath();
        if (custom?.trim()) {
            return custom.trim().endsWith(this.getSep()) ? custom.trim() : `${custom.trim()}${this.getSep()}`;
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

    async publish(tenantId: string, payload: SituationMirrorPayload): Promise<boolean> {
        if (!tenantId) return false;
        const content = JSON.stringify(payload, null, 2);

        if (this.isElectron()) {
            const root = await this.resolveMirrorRoot();
            if (root) {
                const localPath = this.joinPath(root, SITUATION_FILE_NAME);
                await this.writeLocalWithRetry(localPath, content);
            }
        }

        try {
            const blob = new Blob([content], { type: 'application/json' });
            await uploadBytes(ref(storage, this.storageObjectPath(tenantId)), blob, {
                contentType: 'application/json',
            });
            return true;
        } catch (error) {
            console.warn('[SituationMirror] storage upload failed:', error);
            return this.isElectron();
        }
    }

    /** 웹·태블릿 외부 보기 — Firebase Storage만 읽음 (Firestore jobs 컬렉션 미사용) */
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

    /** Electron — NAS/로컬 우선 (오프라인) */
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

    async read(tenantId: string, preferLocal = false): Promise<SituationMirrorPayload | null> {
        if (preferLocal && this.isElectron()) {
            const local = await this.readLocal(tenantId);
            if (local) return local;
        }
        const remote = await this.readFromStorage(tenantId);
        if (remote) return remote;
        if (!preferLocal) return this.readLocal(tenantId);
        return null;
    }
}

export const situationMirrorService = new SituationMirrorService();
