import { 
    Job, Staff, Quote, AdminInstruction, JobTypeDefinition, CompanyInfo, 
    JobStatusDefinition, Tenant, Client, PaperStock, StaffLeave, PricingConfig, ChatMessage,
    JoinRequest
} from '../types';
import { toast } from 'sonner';
import { 
    collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch,
    query, where, limit, getDocs, getDoc, updateDoc, getDocFromCache, getDocFromServer
} from 'firebase/firestore';
import { db as firestore, auth } from './firebase';
import { staffCountToPlanCode, tierToPaymentStatus, PlanTier } from '../utils/planLimits';
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
            roles: { roles: ["관리자", "디자이너", "인쇄기장", "후가공", "배송", "실장", "부장", "과장", "대리", "사원"] }
        }],
        'joinRequests': []
    };

    private listeners: (() => void)[] = [];
    private syncStatus: 'synced' | 'connecting' | 'disconnected' = 'disconnected';
    private lastSyncError: string | null = null;
    private reconnectTimer: any = null;
    private isReady = false;
    private unsubscribeList: (() => void)[] = [];
    private joinRequestsUnsub: (() => void) | null = null;

    getSyncStatus() { return this.syncStatus; }
    getLastSyncError() { return this.lastSyncError; }

    getIsElectron(): boolean {
        return typeof window !== 'undefined' && !!(window as any).electron;
    }

    /** 업무 데이터는 항상 Firestore(SaaS)만 사용 */
    isSaasOnlyMode(): boolean { return true; }

    /** @deprecated NAS/dbPath 제거 — 항상 false */
    isDbPathConfigured(): boolean { return false; }

    async init() { return Promise.resolve(); }

    setTenant(tenantId: string) {
        if (this.tenantId === tenantId) return;
        this.tenantId = tenantId;
        this.lastSyncError = null;
        this.startSyncing();
    }

    /** 분산된 settings/* 문서를 메모리에서 하나로 합침 (Firestore 추가 쓰기 없음) */
    private mergeSettingsDocs(docs: { id: string; [key: string]: any }[]): Record<string, any> {
        const main: Record<string, any> = {};
        const companyDoc = docs.find(d => d.id === 'companyInfo');
        const mainDoc = docs.find(d => d.id === 'main');

        if (mainDoc) {
            const { id: _id, ...rest } = mainDoc;
            Object.assign(main, rest);
        }

        if (companyDoc) {
            const { id: _id, ...ci } = companyDoc;
            main.companyInfo = { ...(main.companyInfo || {}), ...ci };
        } else if (!main.companyInfo && main.name) {
            main.companyInfo = {
                name: main.name,
                phone: main.phone,
                fax: main.fax,
                email: main.email,
                ceoName: main.ceoName,
                businessNumber: main.businessNumber,
                bankAccount: main.bankAccount,
                address: main.address,
            };
        }

        for (const key of ['productDefinitions', 'statusDefinitions', 'processingDefinitions', 'pricing', 'roles'] as const) {
            const fragment = docs.find(d => d.id === key);
            if (!fragment) continue;
            main[key] = fragment[key] ?? fragment;
        }

        return main;
    }

    private async startSyncing() {
        if (!this.tenantId) return;

        this.unsubscribeList.forEach(unsub => unsub());
        this.unsubscribeList = [];
        if (this.joinRequestsUnsub) {
            this.joinRequestsUnsub();
            this.joinRequestsUnsub = null;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        const collections = ['jobs', 'staff', 'clients', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'settings'];

        this.syncStatus = 'connecting';
        this.notify();

        let loadedCount = 0;
        collections.forEach(colName => {
            const colRef = collection(firestore, 'tenants', this.tenantId!, colName);
            const unsub = onSnapshot(colRef, async (snapshot) => {
                const list: any[] = [];
                snapshot.forEach(docSnap => {
                    list.push({ ...docSnap.data(), id: docSnap.id });
                });

                if (colName === 'settings') {
                    if (list.length === 0) {
                        const defaultSettings = this.data['settings']?.[0] || {
                            productDefinitions: { definitions: INITIAL_PRODUCT_DEFINITIONS },
                            statusDefinitions: { definitions: INITIAL_STATUS_DEFINITIONS },
                            processingDefinitions: { definitions: INITIAL_PROCESSING_DEFINITIONS },
                            pricing: { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 },
                            companyInfo: { name: 'EzPrintWork' },
                            roles: { roles: ["관리자", "디자이너", "인쇄기장", "후가공", "배송", "실장", "부장", "과장", "대리", "사원"] }
                        };
                        const docId = 'main';
                        await setDoc(doc(firestore, 'tenants', this.tenantId!, 'settings', docId), defaultSettings);
                    } else if (list.length === 1 && list[0].id === 'main' && list[0].companyInfo) {
                        this.data['settings'] = list;
                    } else {
                        this.data['settings'] = [this.mergeSettingsDocs(list)];
                    }
                } else {
                    this.data[colName] = list;
                }

                // 춘천인쇄 데이터 접근 시 임의 관리자(dev-admin) 계정 자동 삭제
                if (colName === 'staff') {
                    const hasChuncheon = this.data['staff']?.some((s: any) => s.companyName === '춘천인쇄');
                    if (hasChuncheon) {
                        const originalLength = this.data['staff'].length;
                        this.data['staff'] = this.data['staff'].filter((s: any) => s.id !== 'dev-admin');
                        if (this.data['staff'].length !== originalLength) {
                            console.log("[DataService] Chuncheon Print database accessed: Automatically deleted 'dev-admin' account.");
                            try {
                                await deleteDoc(doc(firestore, 'tenants', this.tenantId!, 'staff', 'dev-admin'));
                            } catch (e) {
                                console.error("Failed to delete dev-admin from Firestore:", e);
                            }
                        }
                    }
                }

                // 데이터 정비: jobs 스키마 보정 (메모리만, 변경된 job만 Firestore에 1건씩 저장)
                if (colName === 'jobs') {
                    const currentJobs = this.data['jobs'] || [];
                    const jobsToWrite: any[] = [];
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

                        if (job.specs && migrateSpecs(job.specs)) jobChanged = true;

                        if (job.subJobs && job.subJobs.length > 0) {
                            job.subJobs = job.subJobs.map((sj: any) => {
                                if (sj.type === '무선제본책자') {
                                    sj.type = '책자';
                                    jobChanged = true;
                                }
                                if (sj.specs && migrateSpecs(sj.specs)) jobChanged = true;
                                return sj;
                            });
                        }
                        
                        if (jobChanged) jobsToWrite.push(job);
                        return job;
                    });

                    this.data['jobs'] = migratedJobs;
                    if (jobsToWrite.length > 0) {
                        await Promise.all(jobsToWrite.map(job =>
                            setDoc(doc(firestore, 'tenants', this.tenantId!, 'jobs', job.id), job)
                        ));
                    }
                }

                loadedCount++;
                if (loadedCount >= collections.length) {
                    this.syncStatus = 'synced';
                    if (this.getIsElectron()) {
                        this.runDailyAutoBackup().catch(err => console.error("Auto backup error:", err));
                    }
                    this.updateTenantActivity().catch(() => {});
                }
                this.notify();
            }, (error: any) => {
                console.error(`[Firestore Sync Error] onSnapshot failed for ${colName}:`, error);
                const code = error?.code || 'unknown';
                this.lastSyncError = code;
                if (code === 'unavailable') {
                    this.scheduleReconnect();
                } else {
                    this.syncStatus = 'disconnected';
                }
                this.notify();
            });

            this.unsubscribeList.push(unsub);
        });

        this.subscribeJoinRequests();
        this.isReady = true;
        this.notify();
    }

    private subscribeJoinRequests() {
        if (!this.tenantId) return;
        if (this.joinRequestsUnsub) {
            this.joinRequestsUnsub();
            this.joinRequestsUnsub = null;
        }
        const colRef = collection(firestore, 'tenants', this.tenantId, 'joinRequests');
        this.joinRequestsUnsub = onSnapshot(colRef, (snapshot) => {
            const list: JoinRequest[] = [];
            snapshot.forEach(docSnap => {
                list.push({ ...docSnap.data(), id: docSnap.id } as JoinRequest);
            });
            this.data['joinRequests'] = list;
            this.notify();
        }, (err) => {
            console.warn('[DataService] joinRequests subscription skipped:', err);
            this.data['joinRequests'] = [];
        });
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter(l => l !== listener); };
    }

    private notify() { this.listeners.forEach(l => l()); }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            console.log("[DataService] Attempting to reconnect database...");
            await this.startSyncing();
        }, 5000);
    }

    private getDefaultSettings(companyName: string) {
        return {
            productDefinitions: { definitions: INITIAL_PRODUCT_DEFINITIONS },
            statusDefinitions: { definitions: INITIAL_STATUS_DEFINITIONS },
            processingDefinitions: { definitions: INITIAL_PROCESSING_DEFINITIONS },
            pricing: { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 },
            companyInfo: { name: companyName, businessNumber: '' },
            roles: { roles: ["관리자", "디자이너", "인쇄기장", "후가공", "배송", "실장", "부장", "과장", "대리", "사원"] }
        };
    }

    // --- SaaS Methods ---
    async createTenant(name: string, ownerUid: string, businessNumber?: string, joinCode?: string, initialStaffCount = 3): Promise<string> {
        const user = auth.currentUser;
        if (!user || user.uid !== ownerUid) {
            throw new Error('로그인된 대표 계정이 필요합니다.');
        }
        if (!name.trim()) throw new Error('회사명을 입력해주세요.');
        if (!joinCode?.trim() || joinCode.trim().length < 6) {
            throw new Error('회사 입장 코드는 6자 이상이어야 합니다.');
        }

        const tenantRef = doc(collection(firestore, 'tenants'));
        const tenantId = tenantRef.id;
        const now = new Date().toISOString();
        const ownerName = user.displayName || user.email?.split('@')[0] || '대표';
        const ownerEmail = user.email || '';

        const staffCount = Math.max(1, Math.min(999, initialStaffCount));
        const plan = staffCountToPlanCode(Math.min(staffCount, 3), 'ad');
        const paymentStatus = tierToPaymentStatus('ad');

        const tenantData: Tenant = {
            id: tenantId,
            name: name.trim(),
            ownerId: ownerUid,
            plan: plan as Tenant['plan'],
            createdAt: now,
            businessNumber: businessNumber?.trim() || '',
            joinCode: joinCode.trim(),
        };

        const defaultSettings = this.getDefaultSettings(name.trim());
        if (businessNumber?.trim()) {
            defaultSettings.companyInfo.businessNumber = businessNumber.trim();
        }

        const batch = writeBatch(firestore);
        batch.set(tenantRef, {
            ...tenantData,
            paymentStatus,
            maxStaff: Math.min(staffCount, 3),
            lastActiveAt: now,
        });
        batch.set(doc(firestore, 'users', ownerUid), {
            uid: ownerUid,
            id: ownerUid,
            email: ownerEmail,
            displayName: ownerName,
            name: ownerName,
            photoURL: user.photoURL || '',
            tenantId,
            role: 'admin',
            createdAt: now,
        }, { merge: true });
        batch.set(doc(firestore, 'tenants', tenantId, 'settings', 'main'), defaultSettings);
        batch.set(doc(firestore, 'tenants', tenantId, 'staff', ownerUid), {
            id: ownerUid,
            uid: ownerUid,
            name: ownerName,
            role: '관리자',
            phone: '',
            avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ownerName)}`,
            active: true,
            email: ownerEmail,
            loginId: ownerEmail.toLowerCase(),
            password: '',
            joinDate: now,
        });

        await batch.commit();
        this.setTenant(tenantId);
        return tenantId;
    }

    async searchTenants(nameQuery: string): Promise<Tenant[]> {
        const term = nameQuery.trim();
        if (!term) return [];

        const mapTenant = (d: any) => ({ id: d.id, ...d.data() } as Tenant);

        const exactSnap = await getDocs(
            query(collection(firestore, 'tenants'), where('name', '==', term), limit(10))
        );
        if (!exactSnap.empty) {
            return exactSnap.docs.map(mapTenant);
        }

        const snap = await getDocs(query(collection(firestore, 'tenants'), limit(50)));
        const lower = term.toLowerCase();
        return snap.docs
            .map(mapTenant)
            .filter(t => (t.name || '').toLowerCase().includes(lower));
    }

    // --- CRUD Methods (Local JSON Based) ---
    private generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    async updateTenantActivity() {
        if (!this.tenantId) return;
        try {
            const companyName = this.getCompanyInfo().name || 'EzPrintWork';
            const jobsCount = this.data['jobs']?.length || 0;
            const staffCount = this.data['staff']?.filter(s => s.active && !s.isDeleted).length || 0;
            const clientsCount = this.data['clients']?.length || 0;
            
            const tenantDocRef = doc(firestore, 'tenants', this.tenantId);
            await setDoc(tenantDocRef, {
                companyName,
                lastActiveAt: new Date().toISOString(),
                stats: {
                    jobsCount,
                    staffCount,
                    clientsCount
                }
            }, { merge: true });
        } catch (e) {
            console.error("[LicenseMonitor] Failed to update tenant activity:", e);
        }
    }

    private notifyFirestoreWriteError(action: string, e: any) {
        const code = e?.code || '';
        if (code === 'resource-exhausted') {
            toast.error('Firebase 저장 한도가 초과되었습니다. 잠시 후 다시 시도해 주세요.');
        } else if (code === 'permission-denied') {
            toast.error('저장 권한이 없습니다. 다시 로그인해 주세요.');
        } else {
            toast.error(`${action} 저장 실패: ${getErrorMessage(e)}`);
        }
    }

    private async addEntity(col: string, entity: any) {
        const id = entity.id || this.generateId();
        const newEntity = { ...entity, id, createdAt: entity.createdAt || new Date().toISOString() };
        
        this.data[col] = [...(this.data[col] || []).filter(e => e.id !== id), newEntity];
        this.notify();
        
        if (this.tenantId) {
            try {
                if (col === 'messages' && !newEntity.senderId && auth.currentUser) {
                    newEntity.senderId = auth.currentUser.uid;
                }
                const docRef = doc(firestore, 'tenants', this.tenantId, col, id);
                await setDoc(docRef, newEntity);
            } catch (e) {
                console.error(`[Firestore addEntity Error] Failed to upload ${col}/${id}:`, e);
                this.notifyFirestoreWriteError('데이터', e);
            }
        }
        
        this.updateTenantActivity().catch(() => {});
    }

    private patchLocalEntity(col: string, id: string, entity: any): any | null {
        const list = this.data[col] || [];
        const index = list.findIndex(e => e.id === id);
        if (index === -1) return null;

        const updated = { ...list[index], ...entity, updatedAt: new Date().toISOString() };
        list[index] = updated;
        this.data[col] = [...list];
        return updated;
    }

    private async persistEntity(col: string, id: string, updated: any) {
        if (this.tenantId) {
            try {
                const docRef = doc(firestore, 'tenants', this.tenantId, col, id);
                await setDoc(docRef, updated, { merge: true });
            } catch (e) {
                console.error(`[Firestore updateEntity Error] Failed to update ${col}/${id}:`, e);
                this.notifyFirestoreWriteError('데이터', e);
                throw e;
            }
        }

        this.updateTenantActivity().catch(() => {});
    }

    private async updateEntity(col: string, id: string, entity: any) {
        const updated = this.patchLocalEntity(col, id, entity);
        if (!updated) return;

        this.notify();

        try {
            await this.persistEntity(col, id, updated);
        } catch {
            // persistEntity already logged the error
        }
    }

    private async deleteEntity(col: string, id: string) {
        const list = this.data[col] || [];
        this.data[col] = list.filter(e => e.id !== id);
        this.notify();
        
        if (this.tenantId) {
            try {
                const docRef = doc(firestore, 'tenants', this.tenantId, col, id);
                await deleteDoc(docRef);
            } catch (e) {
                console.error(`[Firestore deleteEntity Error] Failed to delete ${col}/${id}:`, e);
                this.notifyFirestoreWriteError('삭제', e);
            }
        }
        
        this.updateTenantActivity().catch(() => {});
    }

    private async updateSetting(name: string, data: any) {
        const settings = this.data['settings']?.[0] || {};
        settings[name] = data;
        this.data['settings'] = [settings];
        this.notify();
        
        if (this.tenantId) {
            try {
                const docRef = doc(firestore, 'tenants', this.tenantId, 'settings', 'main');
                await setDoc(docRef, settings, { merge: true });
            } catch (e) {
                console.error(`[Firestore updateSetting Error] Failed to update settings:`, e);
                this.notifyFirestoreWriteError('설정', e);
            }
        }
        
        this.updateTenantActivity().catch(() => {});
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

    applyLocalJobUpdates(jobs: Job[]) {
        let changed = false;
        for (const job of jobs) {
            if (!job.id) continue;
            const { id, ...data } = job;
            const updated = this.patchLocalEntity('jobs', id, data);
            if (updated) changed = true;
        }
        if (changed) this.notify();
    }

    async saveJobsPartial(jobs: Job[]) {
        const updates: { id: string; updated: Job }[] = [];

        for (const job of jobs) {
            if (!job.id) continue;
            const { id, ...data } = job;
            const updated = this.patchLocalEntity('jobs', id, data);
            if (updated) updates.push({ id, updated });
        }

        if (updates.length === 0) return;

        this.notify();

        await Promise.all(
            updates.map(({ id, updated }) => this.persistEntity('jobs', id, updated))
        );
    }

    async addStaff(staff: Staff) { await this.addEntity('staff', staff); }
    async updateStaff(staff: Staff) { const { id, ...data } = staff; await this.updateEntity('staff', id, data); }
    async updateStaffLastReadMsgId(staffId: string, lastReadMsgId: string) { await this.updateEntity('staff', staffId, { lastReadMsgId }); }
    async deleteStaff(id: string) { await this.updateEntity('staff', id, { isDeleted: true, active: false }); }
    
    getJoinRequests(): JoinRequest[] {
        return (this.data['joinRequests'] || []).filter(
            (r: JoinRequest) => r.status === 'pending'
        );
    }

    async submitJoinRequest(tenantId: string, request: Partial<JoinRequest>) {
        if (!request.userId) throw new Error('사용자 정보가 없습니다.');

        const existing = (this.data['joinRequests'] || []).find(
            (r: JoinRequest) => r.userId === request.userId && r.status === 'pending'
        );
        if (existing) throw new Error('이미 가입 요청이 진행 중입니다.');

        const requestId = this.generateId();
        const joinRequest: JoinRequest = {
            id: requestId,
            userId: request.userId,
            userEmail: request.userEmail || '',
            userName: request.userName || '사용자',
            requestedAt: new Date().toISOString(),
            status: 'pending',
            message: request.message,
        };

        await setDoc(
            doc(firestore, 'tenants', tenantId, 'joinRequests', requestId),
            joinRequest
        );
    }

    async approveJoinRequest(request: JoinRequest) {
        if (!this.tenantId) throw new Error('테넌트 컨텍스트가 없습니다.');

        const now = new Date().toISOString();
        const batch = writeBatch(firestore);

        batch.set(doc(firestore, 'users', request.userId), {
            tenantId: this.tenantId,
            role: 'staff',
            updatedAt: now,
        }, { merge: true });

        batch.set(doc(firestore, 'tenants', this.tenantId, 'staff', request.userId), {
            id: request.userId,
            uid: request.userId,
            name: request.userName,
            role: '사원',
            email: request.userEmail,
            active: true,
            avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(request.userName)}`,
            joinDate: now,
        }, { merge: true });

        batch.set(doc(firestore, 'tenants', this.tenantId, 'joinRequests', request.id), {
            status: 'approved',
            approvedAt: now,
        }, { merge: true });

        await batch.commit();
    }

    async rejectJoinRequest(requestId: string) {
        if (!this.tenantId) throw new Error('테넌트 컨텍스트가 없습니다.');
        await updateDoc(doc(firestore, 'tenants', this.tenantId, 'joinRequests', requestId), {
            status: 'rejected',
            rejectedAt: new Date().toISOString(),
        });
    }

    async addClient(client: Client) { await this.addEntity('clients', client); }
    async updateClient(client: Client) { const { id, ...data } = client; await this.updateEntity('clients', id, data); }
    async deleteClient(id: string) { await this.deleteEntity('clients', id); }

    async addQuote(quote: Quote) { await this.addEntity('quotes', quote); }
    async updateQuote(quote: Quote) { const { id, ...data } = quote; await this.updateEntity('quotes', id, data); }
    async deleteQuote(id: string) { await this.deleteEntity('quotes', id); }
    
    async upgradeTenantPlan(tenantId: string, plan: 'free' | 'pro', staffCount?: number) {
        if (plan === 'pro') {
            const active =
                1 + this.data['staff']?.filter((s: any) => !s.isDeleted && s.active !== false).length || 0;
            const count = Math.max(1, staffCount ?? active);
            await this.updateTenantPlanSettings(tenantId, { staffCount: count, tier: 'paid' });
        } else {
            await this.updateTenantPlanSettings(tenantId, { staffCount: 3, tier: 'ad' });
        }
    }

    /** 인원 수 + 무료/유료(PRO) 플랜을 Firestore tenants 문서에 반영 */
    async updateTenantPlanSettings(
        tenantId: string,
        options: { staffCount: number; tier: PlanTier }
    ) {
        const tier = options.tier;
        const staffCount = tier === 'ad'
            ? Math.min(Math.max(1, options.staffCount), 3)
            : Math.max(1, Math.min(999, options.staffCount));
        const plan = staffCountToPlanCode(staffCount, tier);
        const paymentStatus = tierToPaymentStatus(tier);

        await setDoc(
            doc(firestore, 'tenants', tenantId),
            {
                plan,
                paymentStatus,
                maxStaff: staffCount,
                updatedAt: new Date().toISOString(),
            },
            { merge: true }
        );
    }

    async addInstruction(inst: Partial<AdminInstruction>) { await this.addEntity('instructions', inst); }
    async deleteInstruction(id: string) { await this.deleteEntity('instructions', id); }

    async uploadThumbnail(jobId: string, file: Blob | File): Promise<string> { return ''; }
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
            
            // 1. 메모리에 백업 데이터 적재
            for (const col of collections) {
                if (backup[col] && Array.isArray(backup[col])) {
                    this.data[col] = backup[col];
                }
            }

            // 2. Firestore에 전체 업로드
            if (this.tenantId) {
                for (const col of collections) {
                    if (backup[col] && Array.isArray(backup[col])) {
                        const promises = backup[col].map(async (item: any) => {
                            const docId = col === 'settings' ? 'main' : (item.id || this.generateId());
                            const docRef = doc(firestore, 'tenants', this.tenantId!, col, docId);
                            return setDoc(docRef, item);
                        });
                        await Promise.all(promises);
                    }
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
            (job.specs?.paperType && job.specs.paperType.toLowerCase().includes(query))
        );
    }

    async listCloudBackups(): Promise<any[]> {
        if (!this.tenantId) return [];
        try {
            const backupsCol = collection(firestore, 'tenants', this.tenantId, 'backups');
            const snapshot = await getDocs(backupsCol);
            const list: any[] = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                list.push({
                    name: docSnap.id,
                    date: data.date || docSnap.id,
                    size: data.size || 'Unknown'
                });
            });
            list.sort((a, b) => b.name.localeCompare(a.name));
            return list;
        } catch (e) {
            console.error("Failed to list cloud backups:", e);
            return [];
        }
    }

    async runDailyAutoBackup(force?: boolean): Promise<boolean> {
        if (!this.isReady) return false;

        const isElectron = this.getIsElectron();
        if (!isElectron) {
            return false;
        }
        
        const todayStr = new Date().toISOString().split('T')[0];
        const lastBackupDate = localStorage.getItem('ezpw_last_daily_backup_date');
        
        if (!force && lastBackupDate === todayStr) {
            return true;
        }

        const backupData = JSON.stringify(this.data, null, 2);
        const fileName = `ezprint_backup_${todayStr}.json`;
        const sep = navigator.platform.toLowerCase().includes('win') ? '\\' : '/';

        try {
            const customPath = localStorage.getItem('ezpw_local_backup_path');
            let backupDir: string;
            if (customPath) {
                backupDir = customPath.endsWith(sep) ? customPath : `${customPath}${sep}`;
            } else {
                const docs = await (window as any).electron.getDocumentsPath();
                backupDir = `${docs}${sep}EzPrintWork_Backups${sep}`;
            }
            const backupPath = `${backupDir}${fileName}`;
            const result = await (window as any).electron.saveFile(backupPath, backupData);
            if (result.success) {
                localStorage.setItem('ezpw_last_daily_backup_date', todayStr);
                console.log(`[AutoBackup] Local PC backup created: ${backupPath}`);
            }
            return !!result.success;
        } catch (e) {
            console.error("[AutoBackup] Daily backup failed:", e);
            return false;
        }
    }

    async restoreFromCloudBackup(name: string): Promise<boolean> {
        if (!this.tenantId) return false;
        try {
            const docRef = doc(firestore, 'tenants', this.tenantId, 'backups', name);
            const docSnap = await getDocFromCache(docRef).catch(() => getDocFromServer(docRef));
            if (!docSnap.exists()) return false;
            
            const data = docSnap.data();
            if (data && data.payload) {
                return await this.importData(data.payload);
            }
            return false;
        } catch (e) {
            console.error("Failed to restore cloud backup:", e);
            return false;
        }
    }

    async deleteCloudBackup(name: string): Promise<boolean> {
        if (!this.tenantId) return false;
        try {
            const docRef = doc(firestore, 'tenants', this.tenantId, 'backups', name);
            await deleteDoc(docRef);
            return true;
        } catch (e) {
            console.error("Failed to delete cloud backup:", e);
            return false;
        }
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
            
            // 1. 메모리에 병합 데이터 반영
            for (const col of collections) {
                if (mergedData[col] && Array.isArray(mergedData[col])) {
                    this.data[col] = mergedData[col];
                }
            }

            // 2. Firestore에 일괄 업로드
            if (this.tenantId) {
                for (const col of collections) {
                    if (mergedData[col] && Array.isArray(mergedData[col])) {
                        const promises = mergedData[col].map(async (item: any) => {
                            const docId = col === 'settings' ? 'main' : (item.id || this.generateId());
                            const docRef = doc(firestore, 'tenants', this.tenantId!, col, docId);
                            return setDoc(docRef, item);
                        });
                        await Promise.all(promises);
                    }
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
