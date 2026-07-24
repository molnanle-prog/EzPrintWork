import { Job } from '../types';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { storage } from './firebase';
import { isIncomingJobNewer } from '../utils/jobRevision';
import { applyIncomingJobVisibilityClears, mergeJobVisibilityFields } from '../utils/jobVisibilitySync';
import {
    ARCHIVE_FILE_NAME,
    ARCHIVE_README_NAME,
    ARCHIVE_USE_DEFAULT_KEY,
    DEFAULT_ARCHIVE_FOLDER_NAME,
    getArchiveRootPath,
    isNasOrNetworkPath,
    pendingArchiveKey,
    sleep,
    getEffectiveArchiveRootPath,
    hasCompanyArchiveRootConfigured,
    setCompanyArchiveRootOverride,
} from '../utils/archiveStorage';
import { readLastKnownArchiveRootPath } from '../utils/lastKnownTenantPlan';

const ARCHIVE_VERSION = 1;
const WRITE_RETRY_DELAYS_MS = [0, 1200, 3000];

interface JobArchiveFile {
    version: number;
    tenantId: string;
    updatedAt: string;
    jobs: Job[];
}

export interface ArchiveWriteResult {
    success: boolean;
    path?: string;
    count: number;
    usedShadow?: boolean;
    pendingRemaining?: number;
}

export class JobArchiveService {
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

    async resolveArchiveRoot(tenantId?: string | null): Promise<string | null> {
        if (!this.isElectron()) return null;

        const effective = getEffectiveArchiveRootPath();
        if (effective?.trim()) {
            const trimmed = effective.trim();
            return trimmed.endsWith(this.getSep()) ? trimmed : `${trimmed}${this.getSep()}`;
        }

        // 회사 경로가 settings에만 있고 override 전이면 last-known 복원 (문서 폴더로 갈라지지 않게)
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

    async getArchiveFilePath(tenantId: string): Promise<string | null> {
        const root = await this.resolveArchiveRoot(tenantId);
        if (!root) return null;
        return this.joinPath(root, ARCHIVE_FILE_NAME);
    }

    private async getShadowFilePath(tenantId: string): Promise<string | null> {
        if (!this.isElectron()) return null;
        try {
            const userData = await window.electron.getUserDataPath?.();
            if (!userData) return null;
            return this.joinPath(this.joinPath(userData, 'archive-shadow'), ARCHIVE_FILE_NAME);
        } catch {
            return null;
        }
    }

    private storageObjectPath(tenantId: string) {
        return `tenants/${tenantId}/archive/${ARCHIVE_FILE_NAME}`;
    }

    private parseArchiveJson(raw: string): Job[] {
        const parsed = JSON.parse(raw) as Partial<JobArchiveFile>;
        if (!Array.isArray(parsed.jobs)) return [];
        return parsed.jobs as Job[];
    }

    private mergeJobs(existing: Job[], incoming: Job[]): Job[] {
        const map = new Map<string, Job>();
        for (const job of existing) {
            if (job?.id) map.set(job.id, job);
        }
        for (const job of incoming) {
            if (!job?.id) continue;
            const prev = map.get(job.id);
            if (!prev) {
                map.set(job.id, job);
                continue;
            }
            // rev(리비전) 우선 비교 — PC 간 시스템 시계가 달라도(clock skew) 정확한 선후 판단
            if (isIncomingJobNewer(job, prev)) {
                const merged = applyIncomingJobVisibilityClears(
                    { ...prev, ...job } as unknown as Record<string, unknown>,
                    job as unknown as Record<string, unknown>
                ) as unknown as Job;
                map.set(job.id, mergeJobVisibilityFields(merged, prev, job));
            } else {
                map.set(job.id, mergeJobVisibilityFields({ ...prev }, prev, job));
            }
        }
        return Array.from(map.values());
    }

    private buildPayload(tenantId: string, jobs: Job[]): JobArchiveFile {
        return {
            version: ARCHIVE_VERSION,
            tenantId,
            updatedAt: new Date().toISOString(),
            jobs,
        };
    }

    private getPendingJobs(tenantId: string): Job[] {
        try {
            const raw = localStorage.getItem(pendingArchiveKey(tenantId));
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    private setPendingJobs(tenantId: string, jobs: Job[]) {
        if (jobs.length === 0) {
            localStorage.removeItem(pendingArchiveKey(tenantId));
            return;
        }
        localStorage.setItem(pendingArchiveKey(tenantId), JSON.stringify(jobs));
    }

    private async readFileWithRetry(filePath: string): Promise<string | null> {
        if (!this.isElectron()) return null;
        for (let attempt = 0; attempt < WRITE_RETRY_DELAYS_MS.length; attempt++) {
            if (attempt > 0) await sleep(WRITE_RETRY_DELAYS_MS[attempt]);
            const result = await window.electron.readFile(filePath);
            if (result?.success && result.data) return result.data;
        }
        return null;
    }

    private async writeFileWithRetry(filePath: string, content: string): Promise<boolean> {
        if (!this.isElectron()) return false;
        for (let attempt = 0; attempt < WRITE_RETRY_DELAYS_MS.length; attempt++) {
            if (attempt > 0) await sleep(WRITE_RETRY_DELAYS_MS[attempt]);
            const result = await window.electron.saveFile(filePath, content);
            if (result?.success) return true;
        }
        return false;
    }

    async ensureArchiveFolderReady(tenantId: string): Promise<{ ok: boolean; path?: string; error?: string }> {
        const root = await this.resolveArchiveRoot();
        if (!root || !this.isElectron()) {
            return { ok: false, error: 'Electron 환경이 아닙니다.' };
        }

        const readmePath = this.joinPath(root, ARCHIVE_README_NAME);
        const archivePath = this.joinPath(root, ARCHIVE_FILE_NAME);
        const readme = [
            'EzPrintWork 작업 백업 폴더',
            '',
            '작업이 저장될 때마다 이 폴더에 즉시 백업됩니다.',
                    `- 상황판(외부 웹용): situation-mirror.json`,
                    `- 접속/세션: presence-sessions.json`,
                    `- 사내 채팅: chat-messages.json`,
            `- 전체 작업 이력: ${ARCHIVE_FILE_NAME}`,
            '',
            '※ 이 폴더에 다른 파일을 넣지 마세요. 앱이 관리합니다.',
        ].join('\n');

        await window.electron.saveFile(readmePath, readme);

        const status = await window.electron.checkDirectoryStatus?.(root.replace(/[\\/]$/, ''));
        if (status && !status.success) {
            return { ok: false, path: root, error: status.error || '폴더 접근 실패' };
        }

        const emptyPayload = this.buildPayload(tenantId, []);
        const exists = await window.electron.exists?.(archivePath);
        if (!exists) {
            const created = await this.writeFileWithRetry(
                archivePath,
                JSON.stringify(emptyPayload, null, 2)
            );
            if (!created) {
                return { ok: false, path: root, error: '보관 파일 생성에 실패했습니다.' };
            }
        }

        return { ok: true, path: root };
    }

    async readLocalArchivedJobs(tenantId: string): Promise<Job[]> {
        if (!tenantId || !this.isElectron()) return [];
        const archivePath = await this.getArchiveFilePath(tenantId);
        if (!archivePath) return [];

        const primaryRaw = await this.readFileWithRetry(archivePath);
        if (primaryRaw) {
            try {
                return this.parseArchiveJson(primaryRaw);
            } catch (error) {
                console.warn('[JobArchiveService] local archive parse failed:', error);
            }
        }

        const shadowPath = await this.getShadowFilePath(tenantId);
        if (!shadowPath) return [];
        const shadowRaw = await this.readFileWithRetry(shadowPath);
        if (!shadowRaw) return [];
        try {
            return this.parseArchiveJson(shadowRaw);
        } catch {
            return [];
        }
    }

    async readStorageMirrorJobs(tenantId: string): Promise<Job[]> {
        if (!tenantId) return [];
        try {
            const storageRef = ref(storage, this.storageObjectPath(tenantId));
            const bytes = await getBytes(storageRef);
            const raw = new TextDecoder().decode(bytes);
            return this.parseArchiveJson(raw);
        } catch (error) {
            console.warn('[JobArchiveService] storage mirror read skipped:', error);
            return [];
        }
    }

    /**
     * 1년 초과 이력 조회 — 회사(tenant) 공통.
     * 관리자/직원, PC/웹/태블릿 모두 Firebase Storage 미러를 동일하게 읽습니다.
     * PC/NAS 로컬 파일은 회사 백업용이며, 미러가 없을 때만 관리자 PC 폴백으로 사용합니다.
     */
    /** Electron — NAS가 단일 원본. Storage는 웹 폴백용 */
    async readArchivedJobs(tenantId: string): Promise<Job[]> {
        if (this.isElectron()) {
            const local = await this.readLocalArchivedJobs(tenantId);
            if (local.length > 0) return local;
        }
        const remote = await this.readStorageMirrorJobs(tenantId);
        if (remote.length > 0) return remote;
        return this.readLocalArchivedJobs(tenantId);
    }

    /** PC 간 동기화 — NAS jobs-archive.json (Storage 미사용) */
    async readNasArchiveSnapshot(tenantId: string): Promise<{ jobs: Job[]; updatedAt: string | null } | null> {
        if (!tenantId || !this.isElectron()) return null;

        const tryParse = (raw: string | null) => {
            if (!raw) return null;
            try {
                const parsed = JSON.parse(raw) as Partial<JobArchiveFile>;
                return {
                    jobs: Array.isArray(parsed.jobs) ? (parsed.jobs as Job[]) : [],
                    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
                };
            } catch {
                return null;
            }
        };

        const archivePath = await this.getArchiveFilePath(tenantId);
        if (archivePath) {
            const primary = tryParse(await this.readFileWithRetry(archivePath));
            if (primary) return primary;
        }

        const shadowPath = await this.getShadowFilePath(tenantId);
        if (shadowPath) {
            return tryParse(await this.readFileWithRetry(shadowPath));
        }
        return null;
    }

    private async uploadStorageMirror(tenantId: string, jobs: Job[]): Promise<boolean> {
        try {
            const payload = JSON.stringify(this.buildPayload(tenantId, jobs));
            const blob = new Blob([payload], { type: 'application/json' });
            const storageRef = ref(storage, this.storageObjectPath(tenantId));
            await uploadBytes(storageRef, blob, { contentType: 'application/json' });
            return true;
        } catch (error) {
            console.warn('[JobArchiveService] storage mirror upload failed:', error);
            return false;
        }
    }

    private async persistArchiveSnapshot(
        tenantId: string,
        jobs: Job[]
    ): Promise<{ success: boolean; usedShadow?: boolean }> {
        if (!tenantId) return { success: false };

        let usedShadow = false;
        if (this.isElectron()) {
            const archivePath = await this.getArchiveFilePath(tenantId);
            if (!archivePath) return { success: false };
            const content = JSON.stringify(this.buildPayload(tenantId, jobs), null, 2);

            let wrote = await this.writeFileWithRetry(archivePath, content);
            if (!wrote) {
                const shadowPath = await this.getShadowFilePath(tenantId);
                if (shadowPath) {
                    wrote = await this.writeFileWithRetry(shadowPath, content);
                    usedShadow = wrote;
                }
            }
            if (!wrote) return { success: false };
            void this.uploadStorageMirror(tenantId, jobs);
            return { success: true, usedShadow };
        }

        const uploaded = await this.uploadStorageMirror(tenantId, jobs);
        return { success: uploaded, usedShadow: false };
    }

    async upsertArchivedJob(tenantId: string, job: Job): Promise<boolean> {
        if (!tenantId || !job?.id) return false;
        const current = await this.readArchivedJobs(tenantId);
        const next = this.mergeJobs(current, [job]);
        const persisted = await this.persistArchiveSnapshot(tenantId, next);
        return persisted.success;
    }

    async removeArchivedJob(tenantId: string, jobId: string): Promise<boolean> {
        if (!tenantId || !jobId) return false;
        const current = await this.readArchivedJobs(tenantId);
        const filtered = current.filter((j) => j.id !== jobId);
        const persisted = await this.persistArchiveSnapshot(tenantId, filtered);
        return persisted.success;
    }

    async appendJobs(tenantId: string, jobsToAppend: Job[]): Promise<ArchiveWriteResult> {
        if (!tenantId) return { success: false, count: 0 };

        const pending = this.getPendingJobs(tenantId);
        const batch = jobsToAppend.length > 0
            ? this.mergeJobs(pending, jobsToAppend)
            : pending;
        if (batch.length === 0) return { success: false, count: 0 };

        if (!this.isElectron()) {
            const remote = await this.readStorageMirrorJobs(tenantId);
            const merged = this.mergeJobs(remote, batch);
            const uploaded = await this.uploadStorageMirror(tenantId, merged);
            if (!uploaded) {
                this.setPendingJobs(tenantId, batch);
                return { success: false, count: 0, pendingRemaining: batch.length };
            }
            this.setPendingJobs(tenantId, []);
            return { success: true, count: batch.length };
        }

        const existing = await this.readLocalArchivedJobs(tenantId);
        const merged = this.mergeJobs(existing, batch);
        const persisted = await this.persistArchiveSnapshot(tenantId, merged);
        if (!persisted.success) {
            this.setPendingJobs(tenantId, batch);
            return { success: false, count: 0, pendingRemaining: batch.length };
        }

        this.setPendingJobs(tenantId, []);
        return {
            success: true,
            path: persisted.usedShadow ? '(로컬 임시 저장)' : (await this.getArchiveFilePath(tenantId)) || undefined,
            count: jobsToAppend.length,
            usedShadow: persisted.usedShadow,
        };
    }

    async flushPendingQueue(tenantId: string): Promise<number> {
        const pending = this.getPendingJobs(tenantId);
        if (pending.length === 0) return 0;
        const result = await this.appendJobs(tenantId, []);
        if (result.success) return pending.length;
        return 0;
    }

    /**
     * 매장 PC — 작업 저장 시 NAS/Storage에 전체 작업 즉시 미러 (1년 대기 없음).
     * Firestore 읽기 없음, 쓰기만 Storage/NAS.
     */
    async syncLiveJobsMirror(tenantId: string, jobs: Job[]): Promise<boolean> {
        if (!tenantId) return false;
        const result = await this.persistArchiveSnapshot(tenantId, jobs);
        return result.success;
    }

    /** 웹→Firestore 릴레이 — 매장 PC가 NAS jobs-archive에 부분 반영 */
    async mergePartialJobsToNas(tenantId: string, partialJobs: Job[]): Promise<boolean> {
        if (!tenantId || partialJobs.length === 0 || !this.isElectron()) return false;
        const existing = await this.readLocalArchivedJobs(tenantId);
        const merged = this.mergeJobs(existing, partialJobs);
        const result = await this.persistArchiveSnapshot(tenantId, merged);
        return result.success;
    }

    /**
     * NAS/아카이브 경로 이전 — 핵심 운영 파일을 oldRoot → newRoot 로 복사.
     * 대상에 파일이 이미 있으면 덮어쓰지 않음(기존 데이터 보호).
     */
    async migrateOperationalFiles(
        oldRoot: string,
        newRoot: string
    ): Promise<{ ok: boolean; copied: string[]; skipped: string[]; error?: string; sameLocation?: boolean }> {
        const copied: string[] = [];
        const skipped: string[] = [];
        if (!this.isElectron() || !oldRoot?.trim() || !newRoot?.trim()) {
            return { ok: false, copied, skipped, error: '경로 이전이 가능한 환경이 아닙니다.' };
        }
        if (oldRoot.replace(/[\\/]+$/, '') === newRoot.replace(/[\\/]+$/, '')) {
            return { ok: true, copied, skipped, sameLocation: true };
        }

        // Z: 와 \\server\share 가 동일 물리 경로면 복사 없이 성공 (경로 문자열만 바꾸면 됨)
        try {
            const { archivePathsSamePhysicalLocation } = await import('../utils/archiveStorage');
            if (await archivePathsSamePhysicalLocation(oldRoot, newRoot)) {
                return { ok: true, copied, skipped, sameLocation: true };
            }
        } catch {
            /* fall through to copy */
        }

        const fileNames = [
            ARCHIVE_FILE_NAME,
            'situation-mirror.json',
            'chat-messages.json',
            ARCHIVE_README_NAME,
        ];

        try {
            const status = await window.electron.checkDirectoryStatus?.(newRoot.replace(/[\\/]$/, ''));
            if (status && !status.success) {
                return { ok: false, copied, skipped, error: status.error || '새 폴더 접근 실패' };
            }

            for (const name of fileNames) {
                const from = this.joinPath(oldRoot, name);
                const to = this.joinPath(newRoot, name);
                const srcExists = await window.electron.exists?.(from);
                if (!srcExists) {
                    skipped.push(`${name} (원본 없음)`);
                    continue;
                }
                const destExists = await window.electron.exists?.(to);
                if (destExists) {
                    skipped.push(`${name} (대상에 이미 있음)`);
                    continue;
                }
                const read = await window.electron.readFile(from);
                if (!read?.success || read.data == null) {
                    return {
                        ok: false,
                        copied,
                        skipped,
                        error: `${name} 읽기 실패: ${read?.error || 'unknown'}`,
                    };
                }
                const write = await window.electron.saveFile(to, read.data);
                if (!write?.success) {
                    return {
                        ok: false,
                        copied,
                        skipped,
                        error: `${name} 쓰기 실패: ${write?.error || 'unknown'}`,
                    };
                }
                copied.push(name);
            }
            return { ok: true, copied, skipped };
        } catch (e: unknown) {
            return {
                ok: false,
                copied,
                skipped,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    isConfiguredNasPath(): boolean {
        const root = getArchiveRootPath();
        return !!root && isNasOrNetworkPath(root);
    }
}

export const jobArchiveService = new JobArchiveService();
