import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, 
    query, onSnapshot, addDoc, writeBatch
} from 'firebase/firestore';
import { db as firestore, auth, storage } from './firebase';
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject, getMetadata } from 'firebase/storage';
import { 
    Job, Staff, Quote, AdminInstruction, JobTypeDefinition, CompanyInfo, 
    JobStatusDefinition, AppUser, Tenant, Client, PaperStock, StaffLeave, PricingConfig, ChatMessage,
    Priority, PaymentStatus, NasConfig, JoinRequest
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
    
    // Filter out technical Firestore path-like messages
    if (message.includes('update: projects/') || message.includes('PERMISSION_DENIED')) {
        return '데이터를 저장할 수 없습니다. 권한이 없거나 네트워크가 불안정합니다.';
    }
    
    return message;
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
    },
    {
        name: '전단지',
        sizes: ['A4 (210x297)', 'A5 (148x210)', 'A3 (297x420)', 'B4 (257x364)', 'B5 (182x257)', '규격외'],
        paperTypes: ['아트지', '스노우지', '모조지'],
        paperWeights: ['80g', '100g', '120g', '150g', '180g', '250g']
    },
    {
        name: '스티커',
        sizes: ['90x55mm', '원형 50mm', '원형 40mm', '사각 50x50mm', '규격외'],
        paperTypes: ['강접 아트지', '모조지', '유포지', '투명데드롱', '은광데드롱', '크라프트지'],
        paperWeights: ['일반', '강접']
    },
    {
        name: '봉투',
        sizes: ['대봉투 (245x330)', '중봉투 (175x235)', '소봉투 (220x105)', '체크봉투'],
        paperTypes: ['모조지(백색)', '체크레자크', '줄레자크', '탄트지', '밍크지'],
        paperWeights: ['100g', '120g', '150g']
    },
    {
        name: '현수막',
        sizes: ['500x90cm', '400x70cm', '60x180cm (배너)', '규격외'],
        paperTypes: ['현수막천', '부직포', '망사천', 'PET (배너)', '합성지(유포)'],
        paperWeights: ['일반']
    },
    {
        name: '카탈로그/책자',
        sizes: ['A4 (210x297)', 'A5 (148x210)', 'B5 (182x257)', '규격외'],
        paperTypes: ['아트지', '스노우지', '모조지', '랑데뷰', '아르떼'],
        paperWeights: ['80g', '100g', '120g', '150g', '180g', '200g', '250g']
    }
];

export class DataService {
    private tenantId: string | null = null;
    private data: Record<string, any[]> = {
        'jobs': [],
        'staff': [
            { id: 'dev-admin', name: '관리자(Dev)', role: 'admin', active: true, email: 'admin@ezprint.work', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin', extensionNumber: '101' },
            { id: 'dev-designer', name: '디자이너(Dev)', role: 'designer', active: true, email: 'design@ezprint.work', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=design', extensionNumber: '102' }
        ],
        'clients': [],
        'quotes': [],
        'instructions': [
            { id: '1', content: 'EzPrintWork Cloud 개발 모드에 오신 것을 환영합니다.', date: new Date().toISOString(), important: true }
        ],
        'messages': [],
        'leaves': [],
        'papers': []
    };
    private listeners: (() => void)[] = [];
    private unsubscribers: (() => void)[] = [];
    private syncStatus: 'synced' | 'disconnected' | 'error' = 'disconnected';
    private loadedCollections = new Set<string>();
    private hasRunAutoBackupThisSession = false;

    getSyncStatus() { return this.syncStatus; }

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
        this.syncStatus = 'synced';
        this.loadedCollections.clear();
        this.hasRunAutoBackupThisSession = false;
        const collectionNames = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'requests'];
        collectionNames.forEach(colName => {
            const path = `tenants/${this.tenantId}/${colName}`;
            const unsub = onSnapshot(query(collection(firestore, path)), (snapshot) => {
                this.data[colName] = snapshot.docs.map(doc => ({ ...doc.data() as any, id: doc.id }));
                this.loadedCollections.add(colName);
                this.checkInitialLoadAndBackup();
                this.notify();
            }, (error) => {
                console.warn(`[DataService] Sync restricted for ${colName}:`, error.message);
                // Don't set global error if it's just a permission issue on one collection
                if (error.code !== 'permission-denied') {
                    this.syncStatus = 'error';
                }
                this.notify();
            });
            this.unsubscribers.push(unsub);
        });
        
        const settingsPath = `tenants/${this.tenantId}/settings`;
        const settingNames = ['productDefinitions', 'statusDefinitions', 'pricing', 'companyInfo', 'smsConfig', 'roles', 'nasConfig'];
        settingNames.forEach(setting => {
            const unsub = onSnapshot(doc(firestore, settingsPath, setting), (snap) => {
                if (snap.exists()) this.data[setting] = [snap.data()];
                this.loadedCollections.add(setting);
                this.checkInitialLoadAndBackup();
                this.notify();
            }, (error) => {
                console.error(`Sync error for ${setting}:`, error);
                this.syncStatus = 'error';
                this.notify();
            });
            this.unsubscribers.push(unsub);
        });
    }

    private checkInitialLoadAndBackup() {
        if (!this.hasRunAutoBackupThisSession && this.loadedCollections.size >= 10) {
            this.hasRunAutoBackupThisSession = true;
            setTimeout(() => {
                this.runDailyAutoBackup().catch(err => {
                    console.error("[AutoBackup] Session auto backup error:", err);
                });
            }, 5000); // 5 seconds grace period for absolute stabilization
        }
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    private notify() { this.listeners.forEach(l => l()); }

    // --- SaaS Methods ---
    async createTenant(name: string, ownerUid: string, businessNumber?: string, joinCode?: string): Promise<string> {
        const tenantRef = doc(collection(firestore, 'tenants'));
        const tenantId = tenantRef.id;
        await setDoc(tenantRef, { 
            id: tenantId, 
            name, 
            ownerId: ownerUid, 
            plan: 'free', 
            createdAt: new Date().toISOString(),
            businessNumber: businessNumber || '',
            joinCode: joinCode || ''
        });
        await updateDoc(doc(firestore, 'users', ownerUid), { tenantId, role: 'admin' });
        const settingsRef = (s: string) => doc(firestore, `tenants/${tenantId}/settings`, s);
        await setDoc(settingsRef('statusDefinitions'), { definitions: INITIAL_STATUS_DEFINITIONS });
        await setDoc(settingsRef('productDefinitions'), { definitions: INITIAL_PRODUCT_DEFINITIONS });
        await setDoc(settingsRef('pricing'), { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 });
        await setDoc(settingsRef('roles'), { roles: ["관리자", "디자이너", "인쇄기장", "후가공", "배송"] });
        return tenantId;
    }

    async searchTenants(nameQuery: string): Promise<Tenant[]> {
        const q = query(collection(firestore, 'tenants'));
        const snap = await getDocs(q);
        const term = nameQuery.toLowerCase();
        return snap.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Tenant))
            .filter(t => t.name.toLowerCase().includes(term));
    }

    // --- CRUD Methods (Cloud Based) ---
    private async addEntity(col: string, entity: any) {
        if (!this.tenantId) return;
        const id = entity.id || doc(collection(firestore, `tenants/${this.tenantId}/${col}`)).id;
        await setDoc(doc(firestore, `tenants/${this.tenantId}/${col}/${id}`), { 
            ...entity, 
            id,
            createdAt: entity.createdAt || new Date().toISOString() 
        });
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
    async addJob(job: Job) { 
        console.log(`[DataService] Adding new job:`, job);
        await this.addEntity('jobs', job); 
    }
    async updateJob(job: Job) { 
        const { id, ...data } = job; 
        console.log(`[DataService] Updating job: ${id}`, data);
        await this.updateEntity('jobs', id!, data); 
    }
    async deleteJob(id: string) { 
        console.log(`[DataService] Deleting job: ${id}`);
        await this.deleteEntity('jobs', id); 
    }
    async saveJobs(jobs: Job[]) {
        if (!this.tenantId) return;
        
        try {
            const batch = writeBatch(firestore);
            jobs.forEach(job => {
                if (!job.id) return;
                const { id, ...data } = job;
                const jobRef = doc(firestore, `tenants/${this.tenantId}/jobs/${id}`);
                // Use set with merge: true instead of update to avoid "No document to update" errors
                batch.set(jobRef, data, { merge: true });
            });
            await batch.commit();
        } catch (error) {
            console.error("Batch update failed:", error);
            throw error;
        }
    }

    async addStaff(staff: Staff) { 
        await this.addEntity('staff', staff); 
        if (staff.email && this.tenantId) {
            try {
                await setDoc(doc(firestore, 'invitations', staff.email.trim().toLowerCase()), {
                    tenantId: this.tenantId,
                    role: staff.role || 'staff',
                    name: staff.name,
                    staffId: staff.id
                });
            } catch (e) {
                console.error("Error creating invitation:", e);
            }
        }
    }
    async updateStaff(staff: Staff) { 
        const { id, ...data } = staff; 
        await this.updateEntity('staff', id, data); 
        if (staff.email && this.tenantId) {
            try {
                await setDoc(doc(firestore, 'invitations', staff.email.trim().toLowerCase()), {
                    tenantId: this.tenantId,
                    role: staff.role || 'staff',
                    name: staff.name,
                    staffId: staff.id
                });
            } catch (e) {
                console.error("Error updating invitation:", e);
            }
        }
    }
    async deleteStaff(id: string) { 
        const staff = this.getStaff().find(s => s.id === id);
        await this.updateEntity('staff', id, { isDeleted: true, active: false }); 
        if (staff && staff.email) {
            try {
                await deleteDoc(doc(firestore, 'invitations', staff.email.trim().toLowerCase()));
            } catch (e) {
                console.error("Error deleting invitation:", e);
            }
        }
    }
    
    // Join Requests
    getJoinRequests(): JoinRequest[] {
        return (this.data['requests'] || []) as JoinRequest[];
    }

    async submitJoinRequest(tenantId: string, request: Partial<JoinRequest>) {
        await addDoc(collection(firestore, `tenants/${tenantId}/requests`), {
            ...request,
            status: 'pending',
            requestedAt: new Date().toISOString()
        });
    }

    async approveJoinRequest(request: JoinRequest) {
        if (!this.tenantId) return;
        
        // 1. Create Staff record
        const newStaff: Staff = {
            id: request.userId, // Use userId as staff id for linking
            uid: request.userId,
            name: request.userName,
            email: request.userEmail,
            role: '디자이너', // Default role
            active: true,
            joinDate: new Date().toISOString(),
            avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${request.userName}`,
            phone: ''
        };
        await this.addStaff(newStaff);

        // 2. Mark request as approved (or delete it)
        await deleteDoc(doc(firestore, `tenants/${this.tenantId}/requests/${request.id}`));
    }

    async rejectJoinRequest(requestId: string) {
        if (!this.tenantId) return;
        await deleteDoc(doc(firestore, `tenants/${this.tenantId}/requests/${requestId}`));
    }

    async addClient(client: Client) { await this.addEntity('clients', client); }
    async updateClient(client: Client) { const { id, ...data } = client; await this.updateEntity('clients', id, data); }
    async deleteClient(id: string) { await this.deleteEntity('clients', id); }

    async addQuote(quote: Quote) { await this.addEntity('quotes', quote); }
    async updateQuote(quote: Quote) { const { id, ...data } = quote; await this.updateEntity('quotes', id, data); }
    async deleteQuote(id: string) { await this.deleteEntity('quotes', id); }
    
    async upgradeTenantPlan(tenantId: string, plan: 'free' | 'pro') {
        try {
            await updateDoc(doc(firestore, 'tenants', tenantId), { plan });
        } catch (error) {
            console.error("Error upgrading plan:", error);
            throw error;
        }
    }

    async addInstruction(inst: Partial<AdminInstruction>) { await this.addEntity('instructions', inst); }
    async deleteInstruction(id: string) { await this.deleteEntity('instructions', id); }

    // --- Hybrid Storage Methods ---
    async uploadThumbnail(jobId: string, file: Blob | File): Promise<string> {
        if (!this.tenantId) throw new Error("Tenant ID not set");
        const storageRef = ref(storage, `tenants/${this.tenantId}/jobs/${jobId}/thumbnail.jpg`);
        const snapshot = await uploadBytes(storageRef, file);
        return getDownloadURL(snapshot.ref);
    }

    async saveOriginalToNas(fileName: string, content: string | ArrayBuffer): Promise<string | null> {
        if (!window.electron) return null;
        const config = this.getNasConfig();
        if (!config.isEnabled || !config.path) return null;
        
        const isWin = navigator.platform.toLowerCase().includes('win');
        const sep = isWin ? '\\' : '/';
        const fullPath = config.path.endsWith(sep) ? `${config.path}${fileName}` : `${config.path}${sep}${fileName}`;
        
        console.log(`Saving original file ${fileName} to NAS path: ${fullPath}`);
        return fullPath;
    }

    async saveNasConfig(config: NasConfig) {
        // Automatically handle folder paths by appending a default filename if needed
        let finalPath = (config.path || '').trim();
        if (finalPath && !finalPath.toLowerCase().endsWith('.json')) {
            const isWin = finalPath.includes('\\') || navigator.platform.toLowerCase().includes('win');
            const sep = isWin ? '\\' : '/';
            finalPath = finalPath.endsWith(sep) ? `${finalPath}ezpw_shared_database.json` : `${finalPath}${sep}ezpw_shared_database.json`;
        }
        
        const updatedConfig = { ...config, path: finalPath };
        await this.updateSetting('nasConfig', updatedConfig);
    }

    async saveCompanyInfo(info: CompanyInfo) {
        await this.updateSetting('companyInfo', info);
    }

    async savePricingConfig(config: PricingConfig) {
        await this.updateSetting('pricing', config);
    }

    async saveProductDefinitions(definitions: JobTypeDefinition[]) {
        await this.updateSetting('productDefinitions', { definitions });
    }

    async saveStatusDefinitions(definitions: JobStatusDefinition[]) {
        await this.updateSetting('statusDefinitions', { definitions });
    }

    async saveSmsConfig(config: any) {
        await this.updateSetting('smsConfig', config);
    }

    async saveRoles(roles: string[]) {
        await this.updateSetting('roles', { roles });
    }

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

    async addPaper(paper: Partial<PaperStock>) {
        await this.addEntity('papers', paper);
    }

    async deletePaper(id: string) {
        await this.deleteEntity('papers', id);
    }

    async importData(json: string): Promise<boolean> {
        if (!this.tenantId) return false;
        try {
            const backup = JSON.parse(json);
            if (!backup || typeof backup !== 'object') return false;

            const collectionNames = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'requests'];
            const settingNames = ['productDefinitions', 'statusDefinitions', 'pricing', 'companyInfo', 'smsConfig', 'roles', 'nasConfig'];

            // 1. Restore regular collections
            for (const colName of collectionNames) {
                const items = backup[colName];
                if (!Array.isArray(items)) continue;

                // Delete current documents in this collection from firestore first to ensure a clean slate
                const currentSnap = await getDocs(collection(firestore, `tenants/${this.tenantId}/${colName}`));
                const deleteBatch = writeBatch(firestore);
                currentSnap.docs.forEach(doc => {
                    deleteBatch.delete(doc.ref);
                });
                await deleteBatch.commit();

                // Write new documents in chunks of 500 (Firestore batch limit)
                const chunks = [];
                for (let i = 0; i < items.length; i += 500) {
                    chunks.push(items.slice(i, i + 500));
                }

                for (const chunk of chunks) {
                    const writeBatchInstance = writeBatch(firestore);
                    chunk.forEach((item: any) => {
                        if (!item.id) return;
                        const docRef = doc(firestore, `tenants/${this.tenantId}/${colName}/${item.id}`);
                        writeBatchInstance.set(docRef, item);
                    });
                    await writeBatchInstance.commit();
                }
            }

            // 2. Restore settings
            for (const setting of settingNames) {
                const settingDataArray = backup[setting];
                if (!Array.isArray(settingDataArray) || settingDataArray.length === 0) continue;
                const settingData = settingDataArray[0];
                if (settingData) {
                    await setDoc(doc(firestore, `tenants/${this.tenantId}/settings/${setting}`), settingData);
                }
            }

            return true;
        } catch (e) {
            console.error("Failed to import data:", e);
            return false;
        }
    }

    exportData(): string {
        return JSON.stringify(this.data);
    }

    // --- Cloud Backup & Capacity Management ---

    async uploadBackupToCloud(jsonData: string, fileName: string): Promise<string> {
        if (!this.tenantId) throw new Error("Tenant ID is not set");
        const storageRef = ref(storage, `tenants/${this.tenantId}/backups/${fileName}`);
        const blob = new Blob([jsonData], { type: 'application/json' });
        await uploadBytes(storageRef, blob);
        return await getDownloadURL(storageRef);
    }

    async listCloudBackups(): Promise<{ name: string, date: string, size: string }[]> {
        if (!this.tenantId) return [];
        const folderRef = ref(storage, `tenants/${this.tenantId}/backups`);
        try {
            const res = await listAll(folderRef);
            const backups = await Promise.all(res.items.map(async (item) => {
                let sizeStr = '알 수 없음';
                try {
                    const meta = await getMetadata(item);
                    const kb = Math.round(meta.size / 1024);
                    sizeStr = `${kb} KB`;
                } catch (e) {}
                
                return {
                    name: item.name,
                    date: item.name.replace('.json', ''),
                    size: sizeStr
                };
            }));
            
            // Sort chronologically (latest first)
            return backups.sort((a, b) => b.name.localeCompare(a.name));
        } catch (e) {
            console.error("Failed to list cloud backups:", e);
            return [];
        }
    }

    async deleteCloudBackup(fileName: string): Promise<void> {
        if (!this.tenantId) return;
        const fileRef = ref(storage, `tenants/${this.tenantId}/backups/${fileName}`);
        await deleteObject(fileRef);
    }

    async runDailyAutoBackup(force = false): Promise<boolean> {
        if (!this.tenantId) return false;
        
        const todayStr = new Date().toISOString().split('T')[0];
        const lastBackupKey = `ezpw_last_backup_date_${this.tenantId}`;
        const lastBackupDate = localStorage.getItem(lastBackupKey);
        
        if (!force && lastBackupDate === todayStr) {
            console.log(`[AutoBackup] Already backed up today: ${todayStr}`);
            return false;
        }
        
        console.log(`[AutoBackup] Starting daily auto-backup for ${todayStr}...`);
        try {
            const dataStr = this.exportData();
            const fileName = `${todayStr}.json`;
            await this.uploadBackupToCloud(dataStr, fileName);
            localStorage.setItem(lastBackupKey, todayStr);
            
            // Electron Offline Safekeeping
            if (typeof window !== 'undefined' && (window as any).electron) {
                try {
                    const electron = (window as any).electron;
                    const customPath = localStorage.getItem('ezpw_local_backup_path');
                    
                    let localPath = '';
                    const isWin = navigator.platform.toLowerCase().includes('win');
                    const sep = isWin ? '\\' : '/';

                    if (customPath) {
                        localPath = customPath.endsWith(sep) 
                            ? `${customPath}${fileName}` 
                            : `${customPath}${sep}${fileName}`;
                    } else {
                        let docsPath = '';
                        if (typeof electron.getDocumentsPath === 'function') {
                            docsPath = await electron.getDocumentsPath();
                        }
                        if (!docsPath) {
                            docsPath = 'C:\\Users\\CEO\\Documents'; // fallback
                        }
                        localPath = `${docsPath}${sep}EzPrintWork_Backups${sep}${fileName}`;
                    }
                    
                    await electron.saveFile(localPath, dataStr);
                    console.log(`[AutoBackup] Saved local safety copy to: ${localPath}`);
                } catch (localErr) {
                    console.warn("[AutoBackup] Local electron save failed (non-blocking):", localErr);
                }
            }
            
            // Capacity protection: Rolling 30-day window
            const backups = await this.listCloudBackups();
            if (backups.length > 30) {
                const oldBackups = backups.slice(30);
                for (const old of oldBackups) {
                    await this.deleteCloudBackup(old.name);
                    console.log(`[AutoBackup] Pruned old cloud backup: ${old.name}`);
                }
            }
            
            console.log(`[AutoBackup] Daily auto-backup completed successfully!`);
            return true;
        } catch (e) {
            console.error(`[AutoBackup] Daily auto-backup failed:`, e);
            return false;
        }
    }

    async restoreFromCloudBackup(fileName: string): Promise<boolean> {
        if (!this.tenantId) return false;
        try {
            const storageRef = ref(storage, `tenants/${this.tenantId}/backups/${fileName}`);
            const url = await getDownloadURL(storageRef);
            const res = await fetch(url);
            const jsonText = await res.text();
            return await this.importData(jsonText);
        } catch (e) {
            console.error("Failed to restore from cloud backup:", e);
            return false;
        }
    }

    // --- Getters (Real-time data access) ---
    getNasConfig(): NasConfig {
        return (this.data['nasConfig']?.[0] || { isEnabled: false, path: '', status: 'disconnected' }) as NasConfig;
    }
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
    async restoreProductDefaults() {
        if (!this.tenantId) return;
        await this.saveProductDefinitions(INITIAL_PRODUCT_DEFINITIONS);
    }
    getJobTypes(): string[] { return this.getProductDefinitions().map(d => d.name); }
    getPricingConfig(): PricingConfig { return (this.data['pricing']?.[0] || { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 }) as PricingConfig; }
    getCompanyInfo(): CompanyInfo { return (this.data['companyInfo']?.[0] || { name: 'EzPrintWork' }) as CompanyInfo; }
    getSmsConfig() { return this.data['smsConfig']?.[0] || {}; }
    getRoles(): string[] { return this.data['roles']?.[0]?.roles || ["관리자", "디자이너", "인쇄기장"]; }

    // Search Helpers
    searchClients(q: string): Client[] {
        const t = q.toLowerCase();
        return this.getClients().filter(c => c.name.toLowerCase().includes(t) || (c.contactPerson && c.contactPerson.toLowerCase().includes(t)));
    }

    getJobsByClient(clientName: string): Job[] {
        return this.getAllJobs()
            .filter(j => j.clientName === clientName)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    getJobsByMonth(year: number, month: number): Job[] {
        const targetDate = new Date(year, month, 1);
        const targetYear = targetDate.getFullYear();
        const targetMonth = targetDate.getMonth();
        
        return this.getAllJobs().filter(job => {
            const date = new Date(job.dueDate);
            return date.getFullYear() === targetYear && date.getMonth() === targetMonth;
        });
    }

    async addLeave(leave: StaffLeave) { await this.addEntity('leaves', leave); }
    async updateLeave(leave: StaffLeave) { const { id, ...data } = leave; await this.updateEntity('leaves', id, data); }
    async deleteLeave(id: string) { await this.deleteEntity('leaves', id); }
}

export const db = new DataService();
