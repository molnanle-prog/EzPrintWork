import { 
    Job, Staff, Quote, AdminInstruction, JobTypeDefinition, CompanyInfo, 
    JobStatusDefinition, Tenant, Client, PaperStock, StaffLeave, PricingConfig, ChatMessage,
    NasConfig, JoinRequest
} from '../types';
import { storage } from './storageAdapter';

// --- Utility Functions (From Original) ---
export const formatPhoneNumber = (value: string) => {
    if (!value) return '';
    const clean = value.replace(/[^0-9]/g, '');
    if (clean.startsWith('02')) {
        if (clean.length <= 2) return clean;
        if (clean.length <= 5) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
        if (clean.length <= 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
        return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6)}`;
    } else {
        if (clean.length <= 3) return clean;
        if (clean.length <= 6) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
        if (clean.length <= 10) return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
        return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
    }
};

export const formatBusinessNumber = (value: string) => {
    if (!value) return '';
    const clean = value.replace(/[^0-9]/g, '').slice(0, 10);
    if (clean.length <= 3) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
    return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5)}`;
};

export const getErrorMessage = (error: any): string => {
    let message = '알 수 없는 오류가 발생했습니다.';
    if (error instanceof Error) message = error.message;
    else if (typeof error === 'string') message = error;
    return message;
};

export interface EstimateResult {
    paperCost: number;
    printCost: number;
    processingCost: number;
    totalCost: number;
    recommendedPrice: number;
    subtotal?: number;
    tax?: number;
    total?: number;
    details?: any[];
}

export const calculateEstimate = (specs: any, config: PricingConfig): EstimateResult => {
    const qtyStr = specs.quantity?.toString().replace(/[^0-9]/g, '') || '0';
    const qty = parseInt(qtyStr) || 0;
    if (qty === 0) return { paperCost: 0, printCost: 0, processingCost: 0, totalCost: 0, recommendedPrice: 0 };
    
    const base = config.baseLaborCost || 10000;
    const paper = qty * 15;
    const print = qty * (config.printColorCost || 50);
    const totalCost = base + paper + print;
    return { 
        paperCost: paper, 
        printCost: print, 
        processingCost: 0, 
        totalCost, 
        recommendedPrice: totalCost * (config.marginRate || 1.6) 
    };
};

export const getHolidayName = (date: Date): string | null => {
    // Basic holiday implementation
    return null; 
};

const INITIAL_PROCESSING_DEFINITIONS = ['유광코팅', '무광코팅', '오시', '미싱', '타공', '귀도리', '접지', '무선제본', '중철제본', '스프링제본', '박가공', '형압', '양면테이프', '도무송', '미싱(절취선)', '넘버링'];

const INITIAL_STATUS_DEFINITIONS: JobStatusDefinition[] = [
    { key: 'QUOTE', label: '견적' },
    { key: 'RECEIVED', label: '접수' },
    { key: 'DESIGN', label: '디자인' },
    { key: 'PRINTING', label: '인쇄' },
    { key: 'POST_PROCESSING', label: '후가공' },
    { key: 'DELIVERY', label: '납품/완료' }
];

const INITIAL_PRODUCT_DEFINITIONS: JobTypeDefinition[] = [
    {
        name: '명함',
        sizes: ['90x50mm(기본)', '86x52mm(신용카드)', '85x55mm', '90x55mm', '규격외'],
        paperTypes: ['스노우지(일반)', '반누보(수입지)'],
        paperWeights: ['216g', '250g', '300g']
    }
];

export class DataService {
    private tenantId: string | null = null;
    private basePath: string = 'EzPrintWork_DB_'; // Default for web
    private data: Record<string, any[]> = {
        'jobs': [],
        'staff': [
            { id: 'dev-admin', name: '관리자(Dev)', role: 'admin', active: true, email: 'admin@ezprint.work', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin', extensionNumber: '101' }
        ],
        'clients': [],
        'quotes': [],
        'instructions': [],
        'messages': [],
        'leaves': [],
        'papers': [],
        'settings': [{
            productDefinitions: { definitions: INITIAL_PRODUCT_DEFINITIONS },
            statusDefinitions: { definitions: INITIAL_STATUS_DEFINITIONS },
            processingDefinitions: { definitions: INITIAL_PROCESSING_DEFINITIONS },
            pricing: { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 },
            companyInfo: { name: 'EzPrintWork' },
            roles: { roles: ["관리자", "디자이너", "인쇄기장", "후가공", "배송", "실장", "부장", "과장", "대리", "사원"] },
            nasConfig: { isEnabled: false, path: '' }
        }]
    };
    
    private listeners: (() => void)[] = [];
    private syncStatus: 'synced' | 'disconnected' | 'error' = 'disconnected';
    private isReady = false;

    getSyncStatus() { return this.syncStatus; }

    async init() {
        if (typeof window !== 'undefined' && (window as any).electron) {
            const docs = await (window as any).electron.getDocumentsPath();
            const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
            this.basePath = `${docs}${sep}EzPrintWork_DB${sep}`;
        }
        return Promise.resolve();
    }

    setTenant(tenantId: string) {
        if (this.tenantId === tenantId) return;
        this.tenantId = tenantId;
        this.startSyncing();
    }

    private getFilePath(colName: string) {
        if (typeof window !== 'undefined' && (window as any).electron) {
            return `${this.basePath}${colName}.json`;
        }
        return `${this.basePath}${colName}`;
    }

    private async startSyncing() {
        if (!this.tenantId) return;
        this.syncStatus = 'synced';
        
        const collections = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'settings'];
        
        for (const col of collections) {
            const res = await storage.load<any[]>(this.getFilePath(col));
            if (res.success && res.data) {
                this.data[col] = res.data;
            }
        }
        
        this.isReady = true;
        this.notify();
    }

    private async saveCollection(colName: string) {
        if (!this.isReady) return;
        await storage.save(this.getFilePath(colName), this.data[colName]);
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    private notify() { this.listeners.forEach(l => l()); }

    // --- SaaS Methods ---
    async createTenant(name: string, ownerUid: string, businessNumber?: string, joinCode?: string): Promise<string> {
        return 'local-tenant';
    }
    async searchTenants(nameQuery: string): Promise<Tenant[]> { return []; }

    // --- CRUD Methods (Local JSON Based) ---
    private generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    private async addEntity(col: string, entity: any) {
        const id = entity.id || this.generateId();
        const newEntity = { ...entity, id, createdAt: entity.createdAt || new Date().toISOString() };
        this.data[col] = [...(this.data[col] || []), newEntity];
        await this.saveCollection(col);
        this.notify();
    }

    private async updateEntity(col: string, id: string, entity: any) {
        const list = this.data[col] || [];
        const index = list.findIndex(e => e.id === id);
        if (index > -1) {
            list[index] = { ...list[index], ...entity };
            this.data[col] = [...list];
            await this.saveCollection(col);
            this.notify();
        }
    }

    private async deleteEntity(col: string, id: string) {
        const list = this.data[col] || [];
        this.data[col] = list.filter(e => e.id !== id);
        await this.saveCollection(col);
        this.notify();
    }

    private async updateSetting(name: string, data: any) {
        const settings = this.data['settings'][0] || {};
        settings[name] = data;
        this.data['settings'] = [settings];
        await this.saveCollection('settings');
        this.notify();
    }

    // --- Public Business Methods ---
    async addJob(job: Job) { await this.addEntity('jobs', job); }
    async updateJob(job: Job) { const { id, ...data } = job; await this.updateEntity('jobs', id!, data); }
    async deleteJob(id: string) { await this.deleteEntity('jobs', id); }
    
    async saveJobs(jobs: Job[]) {
        for (const job of jobs) {
            if (job.id) {
                const { id, ...data } = job;
                await this.updateEntity('jobs', id, data);
            }
        }
    }

    async addStaff(staff: Staff) { await this.addEntity('staff', staff); }
    async updateStaff(staff: Staff) { const { id, ...data } = staff; await this.updateEntity('staff', id, data); }
    async updateStaffLastReadMsgId(staffId: string, lastReadMsgId: string) { await this.updateEntity('staff', staffId, { lastReadMsgId }); }
    async deleteStaff(id: string) { await this.updateEntity('staff', id, { isDeleted: true, active: false }); }
    
    getJoinRequests(): JoinRequest[] { return []; }
    async submitJoinRequest(tenantId: string, request: Partial<JoinRequest>) {}
    async approveJoinRequest(request: JoinRequest) {}
    async rejectJoinRequest(requestId: string) {}

    async addClient(client: Client) { await this.addEntity('clients', client); }
    async updateClient(client: Client) { const { id, ...data } = client; await this.updateEntity('clients', id, data); }
    async deleteClient(id: string) { await this.deleteEntity('clients', id); }

    async addQuote(quote: Quote) { await this.addEntity('quotes', quote); }
    async updateQuote(quote: Quote) { const { id, ...data } = quote; await this.updateEntity('quotes', id, data); }
    async deleteQuote(id: string) { await this.deleteEntity('quotes', id); }
    
    async upgradeTenantPlan(tenantId: string, plan: 'free' | 'pro') {}

    async addInstruction(inst: Partial<AdminInstruction>) { await this.addEntity('instructions', inst); }
    async deleteInstruction(id: string) { await this.deleteEntity('instructions', id); }

    async uploadThumbnail(jobId: string, file: Blob | File): Promise<string> { return ''; }
    async saveOriginalToNas(fileName: string, content: string | ArrayBuffer): Promise<string | null> { return null; }
    
    async saveNasConfig(config: NasConfig) { await this.updateSetting('nasConfig', config); }
    async saveCompanyInfo(info: CompanyInfo) { await this.updateSetting('companyInfo', info); }
    async savePricingConfig(config: PricingConfig) { await this.updateSetting('pricing', config); }
    async saveProductDefinitions(definitions: JobTypeDefinition[]) { await this.updateSetting('productDefinitions', { definitions }); }
    async saveStatusDefinitions(definitions: JobStatusDefinition[]) { await this.updateSetting('statusDefinitions', { definitions }); }
    async saveSmsConfig(config: any) { await this.updateSetting('smsConfig', config); }
    async saveRoles(roles: string[]) { await this.updateSetting('roles', { roles }); }
    async addRole(role: string) {
        const roles = this.getRoles();
        if (!roles.includes(role)) {
            await this.saveRoles([...roles, role]);
        }
    }
    async deleteRole(role: string) {
        const roles = this.getRoles().filter(r => r !== role);
        await this.saveRoles(roles);
    }
    async deleteJobType(name: string) {
        const definitions = this.getProductDefinitions().filter(d => d.name !== name);
        await this.saveProductDefinitions(definitions);
    }
    async addJobType(jobType: JobTypeDefinition) {
        const definitions = [...this.getProductDefinitions(), jobType];
        await this.saveProductDefinitions(definitions);
    }
    async registerProductOption(typeName: string, optionType: string, value: string) {
        const definitions = this.getProductDefinitions();
        const defIdx = definitions.findIndex(d => d.name === typeName);
        if (defIdx === -1) return;
        const def = { ...definitions[defIdx] };
        const options = (def as any)[optionType] as string[];
        if (options && !options.includes(value)) {
            (def as any)[optionType] = [...options, value];
            const newDefinitions = [...definitions];
            newDefinitions[defIdx] = def;
            await this.saveProductDefinitions(newDefinitions);
        }
    }
    async addPaper(paper: Partial<PaperStock>) { await this.addEntity('papers', paper); }
    async deletePaper(id: string) { await this.deleteEntity('papers', id); }

    async importData(json: string): Promise<boolean> {
        try {
            const backup = JSON.parse(json);
            if (!backup || typeof backup !== 'object') return false;
            
            const collections = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'settings'];
            for (const col of collections) {
                if (backup[col] && Array.isArray(backup[col])) {
                    this.data[col] = backup[col];
                    await this.saveCollection(col);
                }
            }
            this.notify();
            return true;
        } catch (e) {
            console.error("Failed to import data:", e);
            return false;
        }
    }
    exportData(): string { return JSON.stringify(this.data); }

    // --- Getters (Real-time data access) ---
    getSettingsObj() { return this.data['settings']?.[0] || {}; }
    getNasConfig(): NasConfig { return this.getSettingsObj()['nasConfig'] || { isEnabled: false, path: '' }; }
    getAllJobs(): Job[] { return (this.data['jobs'] || []) as Job[]; }
    getActiveJobs(): Job[] { return this.getAllJobs().filter(j => j.status !== 'DELIVERY' && j.status !== 'CANCELED' && j.status !== 'QUOTE'); }
    getStaff(): Staff[] { return (this.data['staff'] || []) as Staff[]; }
    getClients(): Client[] { return (this.data['clients'] || []) as Client[]; }
    getQuotes(): Quote[] { return (this.data['quotes'] || []) as Quote[]; }
    getInstructions(): AdminInstruction[] { return (this.data['instructions'] || []) as AdminInstruction[]; }
    getMessages(): ChatMessage[] { return (this.data['messages'] || []) as ChatMessage[]; }
    getLeaves(): StaffLeave[] { return (this.data['leaves'] || []) as StaffLeave[]; }
    getPapers(): PaperStock[] { return (this.data['papers'] || []) as PaperStock[]; }

    getStatusDefinitions(): JobStatusDefinition[] {
        return this.getSettingsObj()['statusDefinitions']?.definitions || INITIAL_STATUS_DEFINITIONS;
    }
    getProductDefinitions(): JobTypeDefinition[] { return this.getSettingsObj()['productDefinitions']?.definitions || INITIAL_PRODUCT_DEFINITIONS; }
    getProcessingDefinitions(): string[] { return this.getSettingsObj()['processingDefinitions']?.definitions || INITIAL_PROCESSING_DEFINITIONS; }
    async saveProcessingDefinitions(definitions: string[]) { await this.updateSetting('processingDefinitions', { definitions }); }
    async restoreProductDefaults() { await this.saveProductDefinitions(INITIAL_PRODUCT_DEFINITIONS); }
    getJobTypes(): string[] { return this.getProductDefinitions().map(d => d.name); }
    getPricingConfig(): PricingConfig { return this.getSettingsObj()['pricing'] || { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 }; }
    getCompanyInfo(): CompanyInfo { return this.getSettingsObj()['companyInfo'] || { name: 'EzPrintWork' }; }
    getSmsConfig() { return this.getSettingsObj()['smsConfig'] || {}; }
    getRoles(): string[] { return this.getSettingsObj()['roles']?.roles || ["관리자", "디자이너", "인쇄기장", "후가공", "배송", "실장", "부장", "과장", "대리", "사원"]; }

    // Search Helpers
    searchClients(q: string): Client[] {
        const t = q.toLowerCase();
        return this.getClients().filter(c => c.name.toLowerCase().includes(t) || (c.contactPerson && c.contactPerson.toLowerCase().includes(t)));
    }

    getJobsByClient(clientName: string): Job[] {
        return this.getAllJobs().filter(j => j.clientName === clientName);
    }
}

export const db = new DataService();
