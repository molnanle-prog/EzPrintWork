import { 
    Job, Staff, Quote, AdminInstruction, JobTypeDefinition, CompanyInfo, 
    JobStatusDefinition, Tenant, Client, PaperStock, StaffLeave, PricingConfig, ChatMessage,
    NasConfig, JoinRequest
} from '../types';
import { storage } from './storageAdapter';
import { toast } from 'sonner';

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

const INITIAL_PROCESSING_DEFINITIONS = [
    '유광코팅', '무광코팅', '오시', '미싱', '타공', '귀도리', '접지', '무선제본', '중철제본', '스프링제본', 
    '금박', '은박', '적박', '청박', '먹박', '홀로그램박', '형압', '양면테이프', '도무송(톰슨)', '미싱(절취선)', 
    '넘버링', 'UV부분코팅', '에폭시', '슬라이딩제본', '하드커버'
];

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
        paperTypes: ['스노우지', '아트지', '반누보(수입)', '휘라레', '스타드림(펄)', '컨셉트(펄)', '랑데뷰', '유포지(방수)', '크라프트지', '특수지'],
        paperWeights: ['200g', '216g', '240g', '250g', '300g', '350g'],
        processings: ['유광코팅', '무광코팅', '오시', '미싱', '타공', '귀도리', '금박', '은박', '형압', '도무송(톰슨)', '에폭시']
    },
    {
        name: '스티커',
        sizes: ['사각형(재단)', '원형(도무송)', '사각형(도무송)', '자유형(도무송)', '롤스티커', '규격외'],
        paperTypes: ['아트지(일반)', '모조지(글쓰기용)', '크라프트지', '유포지(방수)', '은광데드롱', '투명데드롱', '모조지(모조스티커)', '리무버블'],
        paperWeights: ['75g', '80g', '90g', '150g', '기본무게'],
        processings: ['유광코팅', '무광코팅', '귀도리', '도무송(톰슨)']
    },
    {
        name: '전단지/리플렛',
        sizes: ['A4(210x297)', 'A5(148x210)', 'A3(297x420)', 'B5(182x257)', 'B4(257x364)', '3단접지 규격', '규격외'],
        paperTypes: ['아트지', '스노우지', '모조지', '랑데뷰', '반누보', '수입지'],
        paperWeights: ['80g', '100g', '120g', '150g', '180g', '220g', '250g'],
        processings: ['유광코팅', '무광코팅', '오시', '미싱', '접지', '금박', '은박']
    },
    {
        name: '카탈로그/브로셔',
        sizes: ['A4(세로)', 'A4(가로)', 'A5(세로)', 'B5(세로)', '190x260mm', '규격외'],
        paperTypes: ['아트지', '스노우지', '랑데뷰', '반누보', '몽블랑', '모조지'],
        paperWeights: ['내지100g/표지250g', '내지120g/표지250g', '내지150g/표지300g', '80g', '100g', '120g', '150g', '180g', '250g', '300g'],
        processings: ['유광코팅', '무광코팅', '오시', '접지', '무선제본', '중철제본', '스프링제본', '금박', '은박', '에폭시']
    },
    {
        name: '책자',
        sizes: ['A4(210x297)', 'B5(182x257)', 'A5(148x210)', '190x260mm(사륙배판)', '규격외'],
        paperTypes: ['모조지(백색)', '모조지(미색)', '아트지', '스노우지', '표지용 레자크지', '표지용 특수지'],
        paperWeights: ['표지150g/내지80g', '표지180g/내지80g', '표지250g/내지80g', '표지250g/내지100g', '70g', '80g', '100g', '120g', '150g', '180g', '250g'],
        processings: ['유광코팅', '무광코팅', '오시', '접지', '무선제본', '중철제본', '스프링제본', '금박', '은박', '에폭시']
    },
    {
        name: '봉투',
        sizes: ['소봉투(220x105)', '대봉투(A4용/330x245)', '중봉투(260x190)', '자켓봉투', '규격외'],
        paperTypes: ['모조지(백색)', '크라프트지(갈색)', '체크레자', '줄레자', '밍크지', '특수레자'],
        paperWeights: ['100g', '120g', '150g', '180g'],
        processings: ['양면테이프', '넘버링']
    },
    {
        name: '서식지/NCR(양식지)',
        sizes: ['A4', 'A5', 'B5', 'B6', '규격외'],
        paperTypes: ['모조지(단식)', 'NCR(2단 상-하)', 'NCR(3단 상-중-하)', '색상선택(백/황/청/홍)'],
        paperWeights: ['70g', '80g', 'NCR 상지(45g)', 'NCR 중지(50g)', 'NCR 하지(50g)'],
        processings: ['미싱(절취선)', '넘버링', '미싱']
    },
    {
        name: '현수막/배너',
        sizes: ['500x90cm(길거리용)', '90x180cm(실외배너)', '60x180cm(실내배너)', '사용자지정(규격외)'],
        paperTypes: ['현수막천', 'PET지(배너)', '텐트천', '부직포', '유포지 실사'],
        paperWeights: ['기본 규격 무게', '실사 출력용'],
        processings: ['타공', '미싱', '양면테이프']
    },
    {
        name: '쇼핑백/종이가방',
        sizes: ['소형(220x120x250)', '중형(320x110x330)', '대형(440x120x400)', '규격외'],
        paperTypes: ['스노우지', '아트지', '모조지', '크라프트지', '수입지'],
        paperWeights: ['120g', '150g', '180g', '200g', '250g'],
        processings: ['유광코팅', '무광코팅', '금박', '은박', '형압']
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

    isDbPathConfigured(): boolean {
        if (typeof window === 'undefined') return false;
        const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
        if (!isElectron) return true; // 웹 환경(로컬스토리지 모드)에서는 항시 통과
        return !!localStorage.getItem('ezpw_custom_db_path');
    }

    async checkDirectoryStatus(path: string): Promise<{ success: boolean; error?: string; message?: string }> {
        if (typeof window !== 'undefined') {
            if ((window as any).electron && typeof (window as any).electron.checkDirectoryStatus === 'function') {
                return await (window as any).electron.checkDirectoryStatus(path);
            }
            try {
                const res = await fetch(`http://127.0.0.1:23230/check-directory?path=${encodeURIComponent(path)}`);
                if (res.ok) {
                    return await res.json();
                }
            } catch (e) {
                // helper not running
            }
        }
        return { success: false, error: '데스크톱 앱 도우미 또는 로컬 서버 연결이 비활성화 상태입니다.' };
    }

    async initializeDefaultDataFiles(targetPath: string): Promise<boolean> {
        if (typeof window === 'undefined') return false;
        const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
        const cleaned = this.cleanPath(targetPath);
        const newBasePath = cleaned.endsWith(sep) ? cleaned : `${cleaned}${sep}`;

        const collections = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'settings'];
        
        try {
            const isElectron = !!(window as any).electron;
            if (isElectron) {
                // 먼저 settings.json이 이미 존재하는지 체크
                const settingsPath = `${newBasePath}settings.json`;
                const hasSettings = await (window as any).electron.exists(settingsPath);
                
                if (hasSettings) {
                    console.log("[DataService] Database files already exist. Skipping initialization to preserve existing data.");
                    return true;
                }
                
                // 존재하지 않으면 기본 데이터 파일들 생성
                for (const col of collections) {
                    const filePath = `${newBasePath}${col}.json`;
                    const result = await (window as any).electron.saveFile(filePath, JSON.stringify(this.data[col], null, 2));
                    if (!result.success) {
                        throw new Error(result.error);
                    }
                }
                console.log("[DataService] Successfully initialized default database files.");
            }
            return true;
        } catch (e: any) {
            console.error("[DataService] Failed to initialize default database files:", e);
            return false;
        }
    }

    private cleanPath(path: string): string {
        let target = path.trim();
        while (target.toLowerCase().endsWith('.json')) {
            const sep = target.includes('/') ? '/' : '\\';
            const lastIdx = target.lastIndexOf(sep);
            if (lastIdx > -1) {
                target = target.substring(0, lastIdx);
            } else {
                break;
            }
        }
        return target;
    }

    async init() {
        if (typeof window !== 'undefined') {
            const customDbPath = localStorage.getItem('ezpw_custom_db_path');
            const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';

            if (customDbPath) {
                const cleaned = this.cleanPath(customDbPath);
                this.basePath = cleaned.endsWith(sep) ? cleaned : `${cleaned}${sep}`;
                console.log(`DataService: Loaded database from custom path 📂 -> ${this.basePath}`);
            } else if ((window as any).electron) {
                const docs = await (window as any).electron.getDocumentsPath();
                this.basePath = `${docs}${sep}EzPrintWork_DB${sep}`;
            } else {
                try {
                    const res = await fetch('http://127.0.0.1:23230/get-documents-path');
                    if (res.ok) {
                        const data = await res.json();
                        if (data.path) {
                            this.basePath = `${data.path}${sep}EzPrintWork_DB${sep}`;
                        }
                    }
                } catch (e) {
                    console.log("Local helper server not available for path initialization");
                }
            }
        }
        return Promise.resolve();
    }

    async setCustomBasePath(path: string) {
        if (typeof window !== 'undefined') {
            const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
            const cleaned = this.cleanPath(path);
            this.basePath = cleaned.endsWith(sep) ? cleaned : `${cleaned}${sep}`;
            await this.startSyncing();
        }
    }

    setTenant(tenantId: string) {
        if (this.tenantId === tenantId) return;
        this.tenantId = tenantId;
        this.startSyncing();
    }

    private getFilePath(colName: string) {
        // 경로 구분자(/ 또는 \)가 포함되어 있다면 로컬 디스크/네트워크 경로로 판단하여 웹 헬퍼 환경에서도 항상 .json 확장자를 결합합니다.
        const isDirectoryPath = this.basePath.includes('/') || this.basePath.includes('\\');
        if (typeof window !== 'undefined' && ((window as any).electron || isDirectoryPath)) {
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
        
        const settings = this.data['settings']?.[0];
        if (settings) {
            let currentDefs = settings.productDefinitions?.definitions || [];
            const hasBooklet = currentDefs.some((d: any) => d.name === '책자' || d.name === '무선제본책자');
            
            if (currentDefs.length <= 1 || !hasBooklet) {
                console.log("[DataMigration] Upgrading to rich initial product & processing definitions (including Booklet)...");
                settings.productDefinitions = { definitions: INITIAL_PRODUCT_DEFINITIONS };
                settings.processingDefinitions = { definitions: INITIAL_PROCESSING_DEFINITIONS };
                this.data['settings'] = [settings];
                await this.saveCollection('settings');
            } else {
                let needsUpdate = false;
                const migratedDefs = currentDefs.map((def: any) => {
                    let changed = false;
                    if (def.name === '무선제본책자') {
                        def.name = '책자';
                        def.processings = ['유광코팅', '무광코팅', '오시', '접지', '무선제본', '중철제본', '스프링제본', '금박', '은박', '에폭시'];
                        changed = true;
                    }
                    if (!def.processings || def.processings.length === 0) {
                        const matchingInitial = INITIAL_PRODUCT_DEFINITIONS.find(id => id.name === def.name);
                        if (matchingInitial) {
                            def.processings = matchingInitial.processings;
                            changed = true;
                        }
                    }
                    if (changed) needsUpdate = true;
                    return def;
                });
                
                if (needsUpdate) {
                    console.log("[DataMigration] Adding default processings mapping to existing product definitions...");
                    settings.productDefinitions = { definitions: migratedDefs };
                    this.data['settings'] = [settings];
                    await this.saveCollection('settings');
                }
            }
        }

        // jobs 컬렉션 마이그레이션
        let jobsNeedsUpdate = false;
        const currentJobs = this.data['jobs'] || [];
        const migratedJobs = currentJobs.map((job: any) => {
            let jobChanged = false;
            if (job.type === '무선제본책자') {
                job.type = '책자';
                jobChanged = true;
            }
            
            const migrateSpecs = (specs: any) => {
                if (!specs) return false;
                let changed = false;
                if (!specs.innerPages) {
                    specs.innerPages = [{
                        id: 'inner-1',
                        paperType: specs.paperTypeInner || '모조지(백색)',
                        paperWeight: specs.paperWeightInner || '80g',
                        printColor: specs.printColorInner || '단면 1도(흑백)',
                        pagesCount: '0',
                        hasDivider: false,
                        dividerColor: '',
                        dividerQuantity: ''
                    }];
                    changed = true;
                }
                if (!specs.processingCover) {
                    const coverKeywords = ['코팅', '박', '형압', '에폭시', '하드커버'];
                    const commonKeywords = ['제본'];
                    const currentProcessing = specs.processing || [];
                    
                    const coverProc: string[] = [];
                    const innerProc: string[] = [];
                    const commonProc: string[] = [];

                    currentProcessing.forEach((p: string) => {
                        if (coverKeywords.some(kw => p.includes(kw))) {
                            coverProc.push(p);
                        } else if (commonKeywords.some(kw => p.includes(kw))) {
                            commonProc.push(p);
                        } else {
                            innerProc.push(p);
                        }
                    });

                    specs.processingCover = coverProc;
                    specs.processingInner = innerProc;
                    specs.processing = commonProc;
                    changed = true;
                }
                return changed;
            };

            if (job.specs) {
                if (migrateSpecs(job.specs)) jobChanged = true;
            }

            if (job.subJobs && job.subJobs.length > 0) {
                job.subJobs = job.subJobs.map((sj: any) => {
                    if (sj.type === '무선제본책자') {
                        sj.type = '책자';
                        jobChanged = true;
                    }
                    if (sj.specs) {
                        if (migrateSpecs(sj.specs)) jobChanged = true;
                    }
                    return sj;
                });
            }
            
            if (jobChanged) {
                jobsNeedsUpdate = true;
            }
            return job;
        });

        if (jobsNeedsUpdate) {
            console.log("[DataMigration] Upgrading jobs from '무선제본책자' to '책자' and migrating inner pages...");
            this.data['jobs'] = migratedJobs;
            await this.saveCollection('jobs');
        }

        this.isReady = true;
        this.notify();
    }

    private async saveCollection(colName: string) {
        if (!this.isReady) return;
        
        // 데이터 폴더 미설정 시 Electron 환경에서 파일 저장 차단
        if (typeof window !== 'undefined' && (window as any).electron && !localStorage.getItem('ezpw_custom_db_path')) {
            toast.error("데이터 저장 폴더가 지정되지 않아 읽기 전용 상태입니다. 설정을 완료해 주세요.");
            console.warn(`[DataService] Blocked save for '${colName}' because ezpw_custom_db_path is not configured.`);
            return;
        }

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
    async addLeave(leave: StaffLeave) { await this.addEntity('leaves', leave); }
    async deleteLeave(id: string) { await this.deleteEntity('leaves', id); }

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
    getJobsByMonth(year: number, month: number): Job[] {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const startTs = startDate.getTime();
        const endTs = endDate.getTime();

        return this.getAllJobs().filter(job => {
            const jobStart = new Date(job.createdAt).getTime();
            const jobEnd = new Date(job.dueDate).getTime();
            return jobEnd >= startTs && jobStart <= endTs;
        });
    }
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

    // TypeScript errors bypass / Mock implementations for local JSON DB
    async addMessage(msg: ChatMessage) {
        await this.addEntity('messages', msg);
    }

    searchJobs(q: string): Job[] {
        const query = q.toLowerCase();
        return this.getAllJobs().filter(job => 
            job.title.toLowerCase().includes(query) || 
            job.clientName.toLowerCase().includes(query) || 
            (job.clientPhone && job.clientPhone.toLowerCase().includes(query)) ||
            (job.specs.paperType && job.specs.paperType.toLowerCase().includes(query))
        );
    }

    async listCloudBackups(): Promise<any[]> {
        // Local database does not have cloud backup in this version, return empty list or mock list
        return [];
    }

    async runDailyAutoBackup(force?: boolean): Promise<boolean> {
        return true;
    }

    async restoreFromCloudBackup(name: string): Promise<boolean> {
        return true;
    }

    async deleteCloudBackup(name: string): Promise<boolean> {
        return true;
    }

    async getActionLogs(): Promise<{ success: boolean; data: any[]; error?: string }> {
        // Return empty array for local mock
        return { success: true, data: [] };
    }

    async exportCustomersToCsv(): Promise<{ success: boolean; data: string }> {
        const clients = this.getClients();
        let csv = '\ufeff상호명,담당자,전화번호,이메일\n';
        for (const c of clients) {
            csv += `"${c.name || ''}","${c.contactPerson || ''}","${c.phone || ''}","${c.email || ''}"\n`;
        }
        return { success: true, data: csv };
    }

    getMergedPreview(json: string): { 
        success: boolean; 
        summary: {
            jobs: { current: number; imported: number; merged: number; duplicates: number };
            clients: { current: number; imported: number; merged: number; duplicates: number };
            staff: { current: number; imported: number; merged: number; duplicates: number };
            settings: { productDefs: string[]; mergedProductDefs: string[] };
        };
        mergedData: any;
        error?: string;
    } {
        try {
            const backup = JSON.parse(json);
            if (!backup || typeof backup !== 'object') {
                return { success: false, error: '올바르지 않은 백업 형식입니다.', summary: {} as any, mergedData: null };
            }

            const current = this.data;
            const merged: any = {};
            
            // 1. jobs 병합 (id 기준)
            const curJobs = current.jobs || [];
            const impJobs = backup.jobs || [];
            const mergedJobsMap = new Map();
            curJobs.forEach((j: any) => mergedJobsMap.set(j.id, j));
            let jobDup = 0;
            impJobs.forEach((j: any) => {
                if (mergedJobsMap.has(j.id)) {
                    jobDup++;
                } else {
                    mergedJobsMap.set(j.id, j);
                }
            });
            merged.jobs = Array.from(mergedJobsMap.values());

            // 2. clients 병합 (id 또는 이름 기준)
            const curClients = current.clients || [];
            const impClients = backup.clients || [];
            const mergedClientsMap = new Map();
            curClients.forEach((c: any) => mergedClientsMap.set(c.id || c.name, c));
            let clientDup = 0;
            impClients.forEach((c: any) => {
                const key = c.id || c.name;
                if (mergedClientsMap.has(key)) {
                    clientDup++;
                } else {
                    mergedClientsMap.set(key, c);
                }
            });
            merged.clients = Array.from(mergedClientsMap.values());

            // 3. staff 병합 (id 또는 email 기준)
            const curStaff = current.staff || [];
            const impStaff = backup.staff || [];
            const mergedStaffMap = new Map();
            curStaff.forEach((s: any) => mergedStaffMap.set(s.id || s.email, s));
            let staffDup = 0;
            impStaff.forEach((s: any) => {
                const key = s.id || s.email;
                if (mergedStaffMap.has(key)) {
                    staffDup++;
                } else {
                    mergedStaffMap.set(key, s);
                }
            });
            merged.staff = Array.from(mergedStaffMap.values());

            // 4. settings 병합 (제품 목록, 상태 정의, 후가공 정의)
            const curSettingsObj = current.settings?.[0] || {};
            const impSettingsObj = backup.settings?.[0] || {};
            const mergedSettings = { ...curSettingsObj };

            // 제품 정의 병합 (이름 기준)
            const curProductDefs = curSettingsObj.productDefinitions?.definitions || [];
            const impProductDefs = impSettingsObj.productDefinitions?.definitions || [];
            const mergedProductDefsMap = new Map();
            curProductDefs.forEach((d: any) => mergedProductDefsMap.set(d.name, d));
            impProductDefs.forEach((d: any) => {
                if (!mergedProductDefsMap.has(d.name)) {
                    mergedProductDefsMap.set(d.name, d);
                }
            });
            mergedSettings.productDefinitions = { 
                definitions: Array.from(mergedProductDefsMap.values()) 
            };

            // 후가공 정의 병합
            const curProcDefs = curSettingsObj.processingDefinitions?.definitions || [];
            const impProcDefs = impSettingsObj.processingDefinitions?.definitions || [];
            const mergedProcDefsSet = new Set([...curProcDefs, ...impProcDefs]);
            mergedSettings.processingDefinitions = {
                definitions: Array.from(mergedProcDefsSet)
            };

            // 상태 정의 병합 (key 기준)
            const curStatusDefs = curSettingsObj.statusDefinitions?.definitions || [];
            const impStatusDefs = impSettingsObj.statusDefinitions?.definitions || [];
            const mergedStatusDefsMap = new Map();
            curStatusDefs.forEach((s: any) => mergedStatusDefsMap.set(s.key, s));
            impStatusDefs.forEach((s: any) => {
                if (!mergedStatusDefsMap.has(s.key)) {
                    mergedStatusDefsMap.set(s.key, s);
                }
            });
            mergedSettings.statusDefinitions = {
                definitions: Array.from(mergedStatusDefsMap.values())
            };
            
            // 기타 settings 필드 유지
            mergedSettings.pricing = curSettingsObj.pricing || impSettingsObj.pricing;
            mergedSettings.companyInfo = curSettingsObj.companyInfo || impSettingsObj.companyInfo;
            mergedSettings.roles = curSettingsObj.roles || impSettingsObj.roles;
            mergedSettings.nasConfig = curSettingsObj.nasConfig || impSettingsObj.nasConfig;
            
            merged.settings = [mergedSettings];

            // 5. 기타 컬렉션 병합 (quotes, instructions, messages, leaves, papers)
            const listCollections = ['quotes', 'instructions', 'messages', 'leaves', 'papers'];
            listCollections.forEach(col => {
                const curList = current[col] || [];
                const impList = backup[col] || [];
                const mergedMap = new Map();
                curList.forEach((item: any) => mergedMap.set(item.id, item));
                impList.forEach((item: any) => {
                    if (!mergedMap.has(item.id)) {
                        mergedMap.set(item.id, item);
                    }
                });
                merged[col] = Array.from(mergedMap.values());
            });

            return {
                success: true,
                summary: {
                    jobs: { current: curJobs.length, imported: impJobs.length, merged: merged.jobs.length, duplicates: jobDup },
                    clients: { current: curClients.length, imported: impClients.length, merged: merged.clients.length, duplicates: clientDup },
                    staff: { current: curStaff.length, imported: impStaff.length, merged: merged.staff.length, duplicates: staffDup },
                    settings: { 
                        productDefs: curProductDefs.map((d: any) => d.name), 
                        mergedProductDefs: mergedSettings.productDefinitions.definitions.map((d: any) => d.name) 
                    }
                },
                mergedData: merged
            };
        } catch (e: any) {
            return { success: false, error: `병합 데이터 계산 실패: ${e.message}`, summary: {} as any, mergedData: null };
        }
    }

    async saveImportedData(mergedData: any): Promise<boolean> {
        try {
            const collections = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'settings'];
            for (const col of collections) {
                if (mergedData[col] && Array.isArray(mergedData[col])) {
                    this.data[col] = mergedData[col];
                    await this.saveCollection(col);
                }
            }
            this.notify();
            return true;
        } catch (e) {
            console.error("Failed to save merged data:", e);
            return false;
        }
    }
}

export const db = new DataService();

export const formatJobNumber = (job: { id: string; createdAt: string }) => {
    if (!job) return '';
    let d = new Date(job.createdAt);
    if (isNaN(d.getTime())) {
        const numId = parseInt(job.id);
        d = isNaN(numId) ? new Date() : new Date(numId);
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    
    let suffix = '001';
    if (job.id) {
        const digits = job.id.replace(/[^0-9]/g, '');
        if (digits.length >= 3) {
            suffix = digits.slice(-3);
        } else {
            let hash = 0;
            for (let i = 0; i < job.id.length; i++) {
                hash = job.id.charCodeAt(i) + ((hash << 5) - hash);
            }
            suffix = String(Math.abs(hash) % 1000).padStart(3, '0');
        }
    }
    return `${yyyy}${mm}${dd}${hh}${min}-${suffix}`;
};
