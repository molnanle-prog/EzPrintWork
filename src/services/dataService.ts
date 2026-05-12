import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
    query, onSnapshot, addDoc
} from 'firebase/firestore';
import { db as firestore, auth } from './firebase';
import { 
    Job, Staff, Quote, AdminInstruction, JobTypeDefinition, CompanyInfo, 
    JobStatusDefinition, AppUser, Tenant, Client, PaperStock, StaffLeave, PricingConfig, ChatMessage,
    Priority, PaymentStatus
} from '../types';

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

export const calculateEstimate = (specs: any, config: PricingConfig) => {
    const qtyStr = specs.quantity?.toString().replace(/[^0-9]/g, '') || '0';
    const qty = parseInt(qtyStr) || 0;
    if (qty === 0) return { paperCost: 0, printCost: 0, processingCost: 0, totalCost: 0, recommendedPrice: 0 };
    
    // Simplified but functional calculation
    const base = config.baseLaborCost || 10000;
    const paper = qty * 15; // Sample
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
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const mdStr = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const solarHolidays: Record<string, string> = {
        '01-01': '신정', '03-01': '삼일절', '05-05': '어린이날', '06-06': '현충일',
        '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절',
    };
    if (solarHolidays[mdStr]) return solarHolidays[mdStr];

    const specificHolidays: Record<string, string> = {
        '2024-02-09': '설날 연휴', '2024-02-10': '설날', '2024-09-17': '추석',
        '2025-01-29': '설날', '2025-10-06': '추석',
        '2026-02-17': '설날', '2026-09-25': '추석',
    };
    return specificHolidays[dateStr] || null;
};

const INITIAL_STATUS_DEFINITIONS: JobStatusDefinition[] = [
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
        paperTypes: ['스노우지(일반)', '반누보(수입지)', '휘라레', '스타드림', '크라프트지', '엑스트라매트', '마시멜로우', '띤또레또', '팝셋', '키칼라', '빌리지'],
        paperWeights: ['216g', '250g', '300g', '350g', '400g']
    }
];

export class DataService {
    private tenantId: string | null = null;
    private data: Record<string, any[]> = {};
    private listeners: (() => void)[] = [];
    private unsubscribers: (() => void)[] = [];

    async init() {
        // Compatibility with old call
        return Promise.resolve();
    }

    setTenant(tenantId: string) {
        if (this.tenantId === tenantId) return;
        this.tenantId = tenantId;
        this.clearListeners();
        this.startSyncing();
    }

    private clearListeners() {
        this.unsubscribers.forEach(unsub => unsub());
        this.unsubscribers = [];
        this.data = {};
    }

    private startSyncing() {
        if (!this.tenantId) return;
        const collectionNames = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers'];
        collectionNames.forEach(colName => {
            const path = `tenants/${this.tenantId}/${colName}`;
            const unsub = onSnapshot(query(collection(firestore, path)), (snapshot) => {
                this.data[colName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.notify();
            });
            this.unsubscribers.push(unsub);
        });
        
        const settingsPath = `tenants/${this.tenantId}/settings`;
        ['productDefinitions', 'statusDefinitions', 'pricing', 'companyInfo', 'smsConfig', 'roles'].forEach(setting => {
            const unsub = onSnapshot(doc(firestore, settingsPath, setting), (snap) => {
                if (snap.exists()) this.data[setting] = [snap.data()];
                this.notify();
            });
            this.unsubscribers.push(unsub);
        });
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    private notify() { this.listeners.forEach(l => l()); }

    // --- SaaS Methods ---
    async createTenant(name: string, ownerUid: string): Promise<string> {
        const tenantRef = doc(collection(firestore, 'tenants'));
        const tenantId = tenantRef.id;
        await setDoc(tenantRef, { id: tenantId, name, ownerId: ownerUid, plan: 'free', createdAt: new Date().toISOString() });
        await updateDoc(doc(firestore, 'users', ownerUid), { tenantId, role: 'admin' });
        const settingsRef = (s: string) => doc(firestore, `tenants/${tenantId}/settings`, s);
        await setDoc(settingsRef('statusDefinitions'), { definitions: INITIAL_STATUS_DEFINITIONS });
        await setDoc(settingsRef('productDefinitions'), { definitions: INITIAL_PRODUCT_DEFINITIONS });
        await setDoc(settingsRef('pricing'), { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 });
        await setDoc(settingsRef('roles'), { roles: ["관리자", "디자이너", "인쇄기장", "후가공", "배송"] });
        return tenantId;
    }

    // --- CRUD Methods (Cloud Based) ---
    private async addEntity(col: string, entity: any) {
        if (!this.tenantId) return;
        await addDoc(collection(firestore, `tenants/${this.tenantId}/${col}`), { ...entity, createdAt: entity.createdAt || new Date().toISOString() });
    }
    private async updateEntity(col: string, id: string, entity: any) {
        if (!this.tenantId) return;
        await updateDoc(doc(firestore, `tenants/${this.tenantId}/${col}/${id}`), entity);
    }
    private async deleteEntity(col: string, id: string) {
        if (!this.tenantId) return;
        await deleteDoc(doc(firestore, `tenants/${this.tenantId}/${col}/${id}`));
    }
    private async updateSetting(name: string, data: any) {
        if (!this.tenantId) return;
        await setDoc(doc(firestore, `tenants/${this.tenantId}/settings/${name}`), data);
    }

    // --- Public Business Methods (Mapped to Cloud) ---
    async addJob(job: Job) { await this.addEntity('jobs', job); }
    async updateJob(job: Job) { const { id, ...data } = job; await this.updateEntity('jobs', id!, data); }
    async deleteJob(id: string) { await this.deleteEntity('jobs', id); }
    async saveJobs(jobs: Job[]) { /* Bulk save not recommended in cloud, use single updates */ }

    async addStaff(staff: Staff) { await this.addEntity('staff', staff); }
    async updateStaff(staff: Staff) { const { id, ...data } = staff; await this.updateEntity('staff', id, data); }
    async deleteStaff(id: string) { await this.updateEntity('staff', id, { isDeleted: true, active: false }); }

    async addClient(client: Client) { await this.addEntity('clients', client); }
    async updateClient(client: Client) { const { id, ...data } = client; await this.updateEntity('clients', id, data); }
    async deleteClient(id: string) { await this.deleteEntity('clients', id); }

    async addQuote(quote: Quote) { await this.addEntity('quotes', quote); }
    async updateQuote(quote: Quote) { const { id, ...data } = quote; await this.updateEntity('quotes', id, data); }
    async deleteQuote(id: string) { await this.deleteEntity('quotes', id); }

    // --- Getters (Real-time data access) ---
    getAllJobs(): Job[] { return (this.data['jobs'] || []) as Job[]; }
    getActiveJobs(): Job[] { return this.getAllJobs().filter(j => j.status !== 'DELIVERY'); }
    getStaff(): Staff[] { return (this.data['staff'] || []) as Staff[]; }
    getClients(): Client[] { return (this.data['clients'] || []) as Client[]; }
    getQuotes(): Quote[] { return (this.data['quotes'] || []) as Quote[]; }
    getInstructions(): AdminInstruction[] { return (this.data['instructions'] || []) as AdminInstruction[]; }
    getMessages(): ChatMessage[] { return (this.data['messages'] || []) as ChatMessage[]; }
    getLeaves(): StaffLeave[] { return (this.data['leaves'] || []) as StaffLeave[]; }
    getPapers(): PaperStock[] { return (this.data['papers'] || []) as PaperStock[]; }

    getStatusDefinitions(): JobStatusDefinition[] { return (this.data['statusDefinitions']?.[0]?.definitions || INITIAL_STATUS_DEFINITIONS) as JobStatusDefinition[]; }
    getProductDefinitions(): JobTypeDefinition[] { return (this.data['productDefinitions']?.[0]?.definitions || INITIAL_PRODUCT_DEFINITIONS) as JobTypeDefinition[]; }
    getJobTypes(): string[] { return this.getProductDefinitions().map(d => d.name); }
    getPricingConfig(): PricingConfig { return (this.data['pricing']?.[0] || { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 }) as PricingConfig; }
    getCompanyInfo(): CompanyInfo { return (this.data['companyInfo']?.[0] || { name: 'EzPrintWork' }) as CompanyInfo; }
    getSmsConfig() { return this.data['smsConfig']?.[0] || {}; }
    getRoles(): string[] { return this.data['roles']?.[0]?.roles || ["관리자", "디자이너", "인쇄기장"]; }

    // Search Helpers
    searchClients(q: string): Client[] {
        const t = q.toLowerCase();
        return this.getClients().filter(c => c.name.toLowerCase().includes(t) || c.contactPerson.toLowerCase().includes(t));
    }
}

export const db = new DataService();
