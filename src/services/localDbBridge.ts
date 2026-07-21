import { Job, Client } from '../types';

export type LocalDbBundle = {
    jobs: Job[];
    clients: Client[];
    settings: Record<string, unknown> | null;
    jobCount: number;
    quotes: unknown[];
    papers: unknown[];
    leaves: unknown[];
    instructions: unknown[];
};

export type AuxLocalCollection = 'quotes' | 'papers' | 'leaves' | 'instructions';

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
            return {
                jobs: [],
                clients: [],
                settings: null,
                jobCount: 0,
                quotes: [],
                papers: [],
                leaves: [],
                instructions: [],
            };
        }
        const res = await api.localDbLoad(tenantId);
        if (!res?.success) {
            return {
                jobs: [],
                clients: [],
                settings: null,
                jobCount: 0,
                quotes: [],
                papers: [],
                leaves: [],
                instructions: [],
            };
        }
        return {
            jobs: (res.jobs || []) as Job[],
            clients: (res.clients || []) as Client[],
            settings: (res.settings as Record<string, unknown>) || null,
            jobCount: res.jobCount || 0,
            quotes: res.quotes || [],
            papers: res.papers || [],
            leaves: res.leaves || [],
            instructions: res.instructions || [],
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

    async saveAuxCollection(
        tenantId: string,
        collection: AuxLocalCollection,
        items: unknown[]
    ): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbSaveAux) return false;
        const res = await api.localDbSaveAux(tenantId, collection, items);
        return !!res?.success;
    },

    async upsertAuxEntity(
        tenantId: string,
        collection: AuxLocalCollection,
        entity: unknown
    ): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbUpsertAux) return false;
        const res = await api.localDbUpsertAux(tenantId, collection, entity);
        return !!res?.success;
    },

    async deleteAuxEntity(
        tenantId: string,
        collection: AuxLocalCollection,
        id: string
    ): Promise<boolean> {
        const api = electronApi();
        if (!api?.localDbDeleteAux) return false;
        const res = await api.localDbDeleteAux(tenantId, collection, id);
        return !!res?.success;
    },
};
