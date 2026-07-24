import { Job, JobStatusDefinition, KanbanLayoutConfig, Staff, Client } from '../types';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { storage } from './firebase';
import { filterJobsForOperationalBoard } from '../utils/jobDisplayFilters';
import { mergeTombstoneLists } from '../utils/jobTombstones';
import { isJobPinnedToManagementCard } from '../utils/managementCard';
import { isJobBoardHidden } from '../utils/jobBoardVisibility';
import {
    ARCHIVE_USE_DEFAULT_KEY,
    DEFAULT_ARCHIVE_FOLDER_NAME,
    getArchiveRootPath,
    getEffectiveArchiveRootPath,
    hasCompanyArchiveRootConfigured,
    setCompanyArchiveRootOverride,
} from '../utils/archiveStorage';
import { readLastKnownArchiveRootPath } from '../utils/lastKnownTenantPlan';
import { fetchWithTimeout, DEFAULT_LAN_FETCH_TIMEOUT_MS } from '../utils/fetchWithTimeout';
import {
    normalizeGatewayBase,
    orderStoreGatewayUrls,
    resolveStoreGatewayUrlList,
    type StoreGatewayInput,
} from '../utils/storeGatewayUrls';

const MIRROR_VERSION = 1;
const SITUATION_FILE_NAME = 'situation-mirror.json';
const WRITE_RETRY_DELAYS_MS = [0, 1200, 3000];
/** Storage 폴백 — LAN 성공 시 대기하지 않도록 별도 상한 */
const STORAGE_FETCH_TIMEOUT_MS = 8000;

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
    /** 삭제된 job ID — 다른 PC·웹·태블릿에 삭제 전파 */
    deletedJobs?: { id: string; deletedAt: string }[];
    /** 삭제된 거래처 ID — 합치기/삭제 롤백 방지 */
    deletedClients?: { id: string; deletedAt: string }[];
    clients?: Client[];
    settings?: Record<string, unknown>;
    staff?: SituationStaffSnapshot[];
}

export type GatewayMirrorStatus = 'ok' | 'unauthorized' | 'unreachable' | 'empty' | 'idle';

export class SituationMirrorService {
    /** 웹 LAN 게이트웨이 마지막 결과 — dataService 백오프/배너용 */
    private lastGatewayStatus: GatewayMirrorStatus = 'idle';

    getLastGatewayStatus(): GatewayMirrorStatus {
        return this.lastGatewayStatus;
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
        return `tenants/${tenantId}/mirror/${SITUATION_FILE_NAME}`;
    }

    async resolveMirrorRoot(tenantId?: string | null): Promise<string | null> {
        if (!this.isElectron()) return null;

        const effective = getEffectiveArchiveRootPath();
        if (effective?.trim()) {
            const trimmed = effective.trim();
            return trimmed.endsWith(this.getSep()) ? trimmed : `${trimmed}${this.getSep()}`;
        }

        const known = tenantId ? readLastKnownArchiveRootPath(tenantId) : null;
        if (known?.trim()) {
            setCompanyArchiveRootOverride(known.trim());
            const trimmed = known.trim();
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
            deletedJobs?: { id: string; deletedAt: string }[];
            deletedClients?: { id: string; deletedAt: string }[];
        }
    ): SituationMirrorPayload {
        // 칸반 보드 작업 + 관리카드/보드숨김 작업(핀·내리기 동기화용)
        // 외부 상황판은 읽을 때 filterJobsForOperationalBoard 로 다시 걸러야 함
        const boardJobs = filterJobsForOperationalBoard(input.jobs, {
            includeStatusKeys: ['QUOTE'],
        });
        const visibilityJobs = (input.jobs || []).filter(
            (j) => j?.id && (isJobPinnedToManagementCard(j) || isJobBoardHidden(j))
        );
        const byId = new Map<string, Job>();
        for (const job of boardJobs) {
            if (job?.id) byId.set(job.id, job);
        }
        for (const job of visibilityJobs) {
            if (job?.id) byId.set(job.id, job);
        }
        return {
            version: MIRROR_VERSION,
            tenantId,
            updatedAt: new Date().toISOString(),
            companyName: input.companyName,
            kanbanLayout: input.kanbanLayout,
            statusDefinitions: input.statusDefinitions,
            jobs: Array.from(byId.values()),
            deletedJobs: input.deletedJobs?.length ? input.deletedJobs : undefined,
            deletedClients: input.deletedClients?.length ? input.deletedClients : undefined,
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
            const root = await this.resolveMirrorRoot(tenantId);
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

    async readFromStorageWithTimeout(
        tenantId: string,
        timeoutMs = STORAGE_FETCH_TIMEOUT_MS
    ): Promise<SituationMirrorPayload | null> {
        if (!tenantId) return null;
        try {
            return await Promise.race([
                this.readFromStorage(tenantId),
                new Promise<null>((_, reject) => {
                    setTimeout(() => reject(new Error('storage-timeout')), timeoutMs);
                }),
            ]);
        } catch (error) {
            if (error instanceof Error && error.message !== 'storage-timeout') {
                console.warn('[SituationMirror] storage read failed:', error);
            }
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

    private normalizeGatewayPayload(
        tenantId: string,
        data: Partial<SituationMirrorPayload> & { jobs?: Job[]; updatedAt?: string }
    ): SituationMirrorPayload {
        return {
            version: data.version ?? MIRROR_VERSION,
            tenantId,
            updatedAt: data.updatedAt || new Date().toISOString(),
            companyName: data.companyName,
            kanbanLayout: data.kanbanLayout,
            statusDefinitions: data.statusDefinitions,
            jobs: data.jobs || [],
            deletedJobs: data.deletedJobs,
            deletedClients: data.deletedClients,
            clients: data.clients,
            settings: data.settings,
            staff: data.staff,
        };
    }

    private isUsableGatewayPayload(data: Partial<SituationMirrorPayload> | null | undefined): boolean {
        if (!data) return false;
        return !!(
            data.jobs?.length ||
            data.updatedAt ||
            data.deletedJobs?.length ||
            data.deletedClients?.length ||
            data.clients?.length
        );
    }

    private async fetchGatewayMirrorOne(
        tenantId: string,
        gatewayBaseUrl: string
    ): Promise<SituationMirrorPayload | null> {
        const base = normalizeGatewayBase(gatewayBaseUrl);
        if (!base) return null;
        try {
            const { getGatewayAuthToken } = await import('../utils/gatewayToken');
            const token = getGatewayAuthToken(tenantId);
            const res = await fetchWithTimeout(
                `${base}/api/v1/mirror?tenantId=${encodeURIComponent(tenantId)}`,
                {
                    cache: 'no-store',
                    headers: token ? { 'X-Ezpw-Gateway-Token': token } : {},
                },
                DEFAULT_LAN_FETCH_TIMEOUT_MS
            );
            if (res.status === 401 || res.status === 403) {
                this.lastGatewayStatus = 'unauthorized';
                return null;
            }
            if (!res.ok) {
                if (this.lastGatewayStatus !== 'unauthorized') {
                    this.lastGatewayStatus = 'unreachable';
                }
                return null;
            }
            const data = (await res.json()) as Partial<SituationMirrorPayload> & {
                jobs?: Job[];
                updatedAt?: string;
            };
            if (!this.isUsableGatewayPayload(data)) {
                if (this.lastGatewayStatus !== 'unauthorized') {
                    this.lastGatewayStatus = 'empty';
                }
                return null;
            }
            this.lastGatewayStatus = 'ok';
            return this.normalizeGatewayPayload(tenantId, data);
        } catch (error) {
            console.warn('[SituationMirror] gateway read failed:', base, error);
            if (this.lastGatewayStatus !== 'unauthorized') {
                this.lastGatewayStatus = 'unreachable';
            }
            return null;
        }
    }

    private async fetchGatewayMirrorBest(
        tenantId: string,
        gatewayBaseUrl: StoreGatewayInput
    ): Promise<SituationMirrorPayload | null> {
        const urls = await orderStoreGatewayUrls(resolveStoreGatewayUrlList(gatewayBaseUrl));
        if (urls.length === 0) {
            this.lastGatewayStatus = 'empty';
            return null;
        }

        this.lastGatewayStatus = 'idle';
        const results = await Promise.all(urls.map((url) => this.fetchGatewayMirrorOne(tenantId, url)));
        let best: SituationMirrorPayload | null = null;
        for (const payload of results) {
            if (!payload) continue;
            if (
                !best ||
                Date.parse(payload.updatedAt) > Date.parse(best.updatedAt) ||
                (payload.jobs?.length || 0) > (best.jobs?.length || 0)
            ) {
                best = payload;
            }
        }
        if (best) this.lastGatewayStatus = 'ok';
        return best;
    }

    private mergeGatewayAndStoragePayloads(
        gatewayPayload: SituationMirrorPayload | null,
        storagePayload: SituationMirrorPayload | null
    ): SituationMirrorPayload | null {
        const ts = (p: SituationMirrorPayload | null) => Date.parse(p?.updatedAt || '') || 0;
        const jobCount = (p: SituationMirrorPayload | null) => p?.jobs?.length || 0;

        if (gatewayPayload && storagePayload) {
            const gTs = ts(gatewayPayload);
            const sTs = ts(storagePayload);
            const newer = sTs > gTs ? storagePayload : gatewayPayload;
            const older = sTs > gTs ? gatewayPayload : storagePayload;
            const jobs =
                jobCount(newer) > 0
                    ? newer.jobs
                    : jobCount(older) > 0
                      ? older.jobs
                      : [];
            return {
                ...newer,
                jobs,
                deletedJobs: mergeTombstoneLists(newer.deletedJobs, older.deletedJobs),
                updatedAt: sTs >= gTs ? storagePayload.updatedAt : gatewayPayload.updatedAt,
            };
        }

        return gatewayPayload || storagePayload;
    }

    /**
     * LAN 게이트웨이만 (Firebase Storage 혼용 금지 — 회사 일괄 상태 유지).
     * Electron이 NAS 직접 접근 실패 시 허브 PC의 같은 NAS 파일을 읽는다.
     */
    async readViaGatewayOnly(
        tenantId: string,
        gatewayBaseUrl?: StoreGatewayInput
    ): Promise<SituationMirrorPayload | null> {
        if (!tenantId) return null;
        return this.fetchGatewayMirrorBest(tenantId, gatewayBaseUrl);
    }
    async publishViaGateway(
        tenantId: string,
        payload: SituationMirrorPayload,
        gatewayBaseUrl?: StoreGatewayInput
    ): Promise<boolean> {
        if (!tenantId) return false;
        const urls = await orderStoreGatewayUrls(resolveStoreGatewayUrlList(gatewayBaseUrl));
        if (urls.length === 0) return false;

        const { getGatewayAuthToken } = await import('../utils/gatewayToken');
        const token = getGatewayAuthToken(tenantId);
        for (const base of urls) {
            try {
                const res = await fetchWithTimeout(
                    `${base}/api/v1/mirror`,
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
                console.warn('[SituationMirror] gateway publish failed:', base, error);
            }
        }
        return false;
    }

    /**
     * 외부 웹 — LAN 게이트웨이 우선(성공 시 Storage 대기 안 함), 실패 시 Storage 폴백.
     */
    async readRemoteMirror(
        tenantId: string,
        gatewayBaseUrl?: StoreGatewayInput
    ): Promise<SituationMirrorPayload | null> {
        if (!tenantId) return null;

        const gatewayPayload = await this.fetchGatewayMirrorBest(tenantId, gatewayBaseUrl);
        if (gatewayPayload) {
            return gatewayPayload;
        }

        const storagePayload = await this.readFromStorageWithTimeout(tenantId);
        return storagePayload;
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
