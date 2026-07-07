import { Job, Client } from '../types';

export type LocalDbBundle = {
    jobs: Job[];
    clients: Client[];
    settings: Record<string, unknown> | null;
    jobCount: number;
};

function electronApi() {
    return typeof window !== 'undefined' ? window.electron : undefined;
}

export const localDbBridge = {
    isAvailable(): boolean {
        return !!electronApi()?.localDbLoad;
    },

    async loadTenant(tenantId: string): Promise<LocalDbBundle> {
        const api = electronApi();
        if (!api?.localDbLoad) {
            return { jobs: [], clients: [], settings: null, jobCount: 0 };
        }
        const res = await api.localDbLoad(tenantId);
        if (!res?.success) {
            return { jobs: [], clients: [], settings: null, jobCount: 0 };
        }
        return {
            jobs: (res.jobs || []) as Job[],
            clients: (res.clients || []) as Client[],
            settings: (res.settings as Record<string, unknown>) || null,
            jobCount: res.jobCount || 0,
        };
    },

    async saveJobs(tenantId: string, jobs: Job[]): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbSaveJobs) return false;
        const res = await api.localDbSaveJobs(tenantId, jobs);
        return !!res?.success;
    },

    async upsertJob(tenantId: string, job: Job): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbUpsertJob) return false;
        const res = await api.localDbUpsertJob(tenantId, job);
        return !!res?.success;
    },

    async deleteJob(tenantId: string, jobId: string): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbDeleteJob) return false;
        const res = await api.localDbDeleteJob(tenantId, jobId);
        return !!res?.success;
    },

    async saveClients(tenantId: string, clients: Client[]): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbSaveClients) return false;
        const res = await api.localDbSaveClients(tenantId, clients);
        return !!res?.success;
    },

    async upsertClient(tenantId: string, client: Client): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbUpsertClient) return false;
        const res = await api.localDbUpsertClient(tenantId, client);
        return !!res?.success;
    },

    async deleteClient(tenantId: string, clientId: string): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbDeleteClient) return false;
        const res = await api.localDbDeleteClient(tenantId, clientId);
        return !!res?.success;
    },

    async saveSettings(tenantId: string, settings: Record<string, unknown>): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbSaveSettings) return false;
        const res = await api.localDbSaveSettings(tenantId, settings);
        return !!res?.success;
    },
};
