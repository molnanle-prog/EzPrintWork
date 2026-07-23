import { 
    Job, Staff, Quote, AdminInstruction, JobTypeDefinition, CompanyInfo, 
    JobStatusDefinition, KanbanLayoutConfig, Tenant, Client, PaperStock, StaffLeave, PricingConfig, ChatMessage,
    JoinRequest, ProductProcessingSets, QuoteTemplateSettings
} from '../types';
import { normalizeKanbanLayoutConfig, normalizeStatusDefinition } from '../utils/kanbanLayout';
import { toast } from 'sonner';
import { 
    collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch,
    query, where, limit, getDocs, getDoc, updateDoc, getDocFromCache, getDocFromServer,
    deleteField
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db as firestore, auth, storage } from './firebase';
import { signOut } from 'firebase/auth';
import { jobArchiveService } from './jobArchiveService';
import { situationMirrorService } from './situationMirrorService';
import { chatMirrorService, mergeChatMessages } from './chatMirrorService';
import { presenceSessionService } from './presenceSessionService';
import { localDbBridge } from './localDbBridge';
import {
    auxCollectionMirrorService,
    AUX_COLLECTION_NAMES,
    mergeAuxItemsById,
    type AuxCollectionName,
} from './auxCollectionMirrorService';
import { refreshLocalGateway } from './gatewayBridge';
import {
    collectStoreGatewayUrlsFromSettings,
    normalizeStoreGatewayUrls,
    orderStoreGatewayUrls,
} from '../utils/storeGatewayUrls';
import type { SituationMirrorPayload } from './situationMirrorService';
import {
    applyArchiveRootFromSettings,
    clearCompanyArchiveRootOverride,
    getArchiveRootPath,
    getEffectiveArchiveRootPath,
    getTenantArchiveRootFromSettings,
    isDriveLetterPath,
    isNasOrNetworkPath,
    isUncPath,
    resolveArchivePathToUnc,
    setArchiveRootPath,
    setCompanyArchiveRootOverride,
    TENANT_ARCHIVE_ROOT_SETTINGS_KEY,
} from '../utils/archiveStorage';
import {
    readLastKnownArchiveRootPath,
    readLastKnownTenantPlan,
    saveLastKnownArchiveRootPath,
} from '../utils/lastKnownTenantPlan';
import { buildQuoteFromJob, findQuoteForJob, isSameQuotePayload } from '../utils/quoteJobSync';
import { resolvePrepaidOnJobUpdate, sumClientPrepaidBalances, normalizePrepaidBalance, appendPrepaidLedger, removeAndRecalculatePrepaidLedger, canDeletePrepaidLedgerEntry } from '../utils/prepaidBalance';
import { isManagementCardExpired, shouldShowInManagementCards } from '../utils/managementCard';
import { isStandaloneDocumentPreviewRoute } from '../utils/documentPreviewRoutes';
import { formatJobNumber } from '../utils/jobNumber';
import { filterJobsForOperationalBoard } from '../utils/jobDisplayFilters';
import {
    filterJobsByTombstones,
    isJobTombstoned,
    loadJobTombstoneMap,
    saveJobTombstoneMap,
    tombstoneMapToPayload,
    type JobTombstone,
} from '../utils/jobTombstones';
import {
    clientTombstoneMapToPayload,
    clientTimestampMs,
    filterClientsByTombstones,
    isClientTombstoned,
    loadClientTombstoneMap,
    saveClientTombstoneMap,
    type ClientTombstone,
} from '../utils/clientTombstones';
import { isIncomingClientNewer, nextClientRev } from '../utils/clientRevision';
import {
    applyAuxTombstonesFromList,
    auxTombstoneMapToPayload,
    filterAuxItemsByTombstones,
    loadAuxTombstoneMap,
    saveAuxTombstoneMap,
} from '../utils/auxTombstones';
import {
    applyIncomingJobVisibilityClears,
    jobVisibilityClearPatch,
    stripClearedJobVisibilityFields,
    mergeJobVisibilityFields,
    JOB_VISIBILITY_CLEAR_FIELDS,
} from '../utils/jobVisibilitySync';
import { isIncomingJobNewer, nextJobRev } from '../utils/jobRevision';
import { staffCountToPlanCode, tierToPaymentStatus, PlanTier, AD_TIER_MAX, countActiveStaffSeats } from '../utils/planLimits';
import { filterJobTitleOptions, normalizeStaffRecord, isReservedStaffAuthRole } from '../utils/adminAccess';
import { APP_VERSION } from '../utils/autoUpdate';
// --- Utility Functions (From Original) ---
export const isValidPhoneNumber = (value: string): boolean => {
    const digits = (value || '').replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 11;
};

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
    const code = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    const webGatewayMessages: Record<string, string> = {
        'web-readonly-jobs':
            '웹(태블릿/휴대폰)은 조회 전용입니다. 작업 수정은 매장 PC 앱에서 진행해 주세요.',
        'web-gateway-batch-save-failed':
            '매장 PC에 저장하지 못했습니다. 매장 PC 앱이 켜져 있고 인터넷에 연결되어 있는지 확인해 주세요.',
        'web-gateway-job-save-failed':
            '매장 PC에 저장하지 못했습니다. 매장 PC 앱이 켜져 있고 인터넷에 연결되어 있는지 확인해 주세요.',
        'web-gateway-job-add-failed':
            '매장 PC에 저장하지 못했습니다. 매장 PC 앱이 켜져 있고 인터넷에 연결되어 있는지 확인해 주세요.',
    };
    if (code && webGatewayMessages[code]) return webGatewayMessages[code];

    let message = '알 수 없는 오류가 발생했습니다.';
    if (error instanceof Error) message = error.message;
    else if (typeof error === 'string') message = error;
    return message;
};

/** Firestore는 undefined 필드를 허용하지 않음 — 저장 전 제거 */
export const stripUndefinedForFirestore = <T>(value: T): T => {
    if (value === undefined) return value;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
        return value.map((item) => stripUndefinedForFirestore(item)) as T;
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (val === undefined) continue;
        out[key] = stripUndefinedForFirestore(val);
    }
    return out as T;
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
    { key: 'DELIVERY', label: '납품' },
    { key: 'COMPLETED', label: '완료' },
];

/** 로그인 직후 동기화 — 소량·필수 데이터만 (읽기 비용 절감) */
const CORE_STARTUP_COLLECTIONS = ['staff', 'clients', 'settings'] as const;
/** 화면 진입 시에만 구독 — quotes 등 (messages는 NAS 채팅 미러) */
const LAZY_SYNC_COLLECTIONS = ['quotes', 'leaves', 'papers', 'instructions'] as const;
const ARCHIVED_JOB_STATUSES = ['COMPLETED', 'CANCELED'] as const;
const OUTSTANDING_PAYMENT_STATUSES = ['결제대기', '일부결제', '후불결제'] as const;
/** 칸반 완료 칸: 결제완료 건은 최근 N일만 실시간 구독 */
const KANBAN_RECENT_PAID_COMPLETED_DAYS = 4;
/** Firestore 운영 데이터는 최근 1년(365일)만 유지 */
const HOT_WINDOW_DAYS = 365;
const LIVE_MIRROR_PUSH_DEBOUNCE_MS = 250;
const APP_MIRROR_POLL_MS = 1000;
const WEB_MIRROR_POLL_MS = 2000;

/** 표지/내지 통합 평량(예: 표지150g/내지80g) — 표지·내지 분리 UI 이후 제외 */
const COMBINED_PAPER_WEIGHT_PATTERN = /\/|표지.*내지|내지.*표지/i;

export const BOOKLET_SINGLE_PAPER_WEIGHTS = [
    '70g', '80g', '100g', '120g', '150g', '180g', '200g', '250g', '300g',
] as const;

export function sanitizeBookletPaperWeights(weights: string[] | undefined): string[] {
    const singles = (weights ?? []).filter((w) => w && !COMBINED_PAPER_WEIGHT_PATTERN.test(w));
    const merged = [...new Set([...singles, ...BOOKLET_SINGLE_PAPER_WEIGHTS])];
    return merged.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
    });
}

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
        name: '카탈로그',
        sizes: ['A4(세로)', 'A4(가로)', 'A5(세로)', 'B5(세로)', '190x260mm', '규격외'],
        paperTypes: ['아트지', '스노우지', '랑데뷰', '반누보', '몽블랑', '모조지'],
        paperWeights: [...BOOKLET_SINGLE_PAPER_WEIGHTS],
        processings: ['접지', '중철제본', '스프링제본', '오시'],
        processingsCover: ['유광코팅', '무광코팅', '금박', '은박', '에폭시'],
        processingsInner: ['유광코팅', '무광코팅', '오시', '미싱']
    },
    {
        name: '책자',
        sizes: ['A4(210x297)', 'B5(182x257)', 'A5(148x210)', '190x260mm(사륙배판)', '규격외'],
        paperTypes: ['모조지(백색)', '모조지(미색)', '아트지', '스노우지', '표지용 레자크지', '표지용 특수지'],
        paperWeights: [...BOOKLET_SINGLE_PAPER_WEIGHTS],
        processings: ['무선제본', '중철제본', '스프링제본', '접지', '오시'],
        processingsCover: ['유광코팅', '무광코팅', '금박', '은박', '에폭시', '형압'],
        processingsInner: ['유광코팅', '무광코팅', '오시', '미싱']
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
        name: '실사',
        sizes: [
            '배너(소) 450x1200mm',
            '배너(중) 600x1800mm',
            '배너(대) 900x1800mm',
            '거리광고대 6000x700mm',
            '규격외',
        ],
        paperTypes: ['현수막천', 'PET지(배너)', '텐트천', '부직포', '유포지 실사'],
        paperWeights: ['기본 규격 무게', '실사 출력용'],
        processings: ['타공', '미싱', '양면테이프'],
    },
    {
        name: '쇼핑백/종이가방',
        sizes: ['소형(220x120x250)', '중형(320x110x330)', '대형(440x120x400)', '규격외'],
        paperTypes: ['스노우지', '아트지', '모조지', '크라프트지', '수입지'],
        paperWeights: ['120g', '150g', '180g', '200g', '250g'],
        processings: ['유광코팅', '무광코팅', '금박', '은박', '형압']
    }
];

const LEGACY_CATALOG_TYPE_NAMES = ['카탈로그/브로셔', '카탈로그/책자', '카달로그/책자', '카달로그/브로셔'];
/** 작업(jobs) type 레거시 보정용 — 해당 품목명이 마스터에 없을 때만 적용 */
const LEGACY_JOB_SIGNAGE_TYPE_NAMES = ['현수막/배너', '현수막'];

const DEFAULT_STAFF_ROLES = ['관리자', '디자이너', '인쇄기장', '후가공', '배송', '실장', '부장', '과장', '대리', '사원'];

/** 사용자가 저장한 목록이 있으면 그대로 사용 (삭제 반영). 없을 때만 기본값 */
function mergeStringListField(user: string[] | undefined, defaults: string[] | undefined): string[] {
    if (user !== undefined) return [...user];
    if (!defaults?.length) return [];
    return [...defaults];
}

/** 기본값 + 사용자 값 합집합 (실사 등 기본 고정용). 기본을 앞에 두고 사용자 추가분만 이어 붙임 */
function unionStringLists(...lists: Array<string[] | undefined>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const list of lists) {
        for (const raw of list || []) {
            const value = String(raw || '').trim();
            if (!value || seen.has(value)) continue;
            seen.add(value);
            out.push(value);
        }
    }
    return out;
}

function stringArraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
    const left = a || [];
    const right = b || [];
    if (left.length !== right.length) return false;
    return left.every((v, i) => v === right[i]);
}

function mergeProductDefinition(template: JobTypeDefinition, source: JobTypeDefinition, name: string): JobTypeDefinition {
    // 실사: 비어 있거나 '규격외/기본'만 있어도 INITIAL 기본 옵션을 항상 다시 채움 (사용자 추가분 유지)
    if (name === '실사') {
        return {
            ...template,
            ...source,
            name,
            sizes: unionStringLists(template.sizes, source.sizes),
            paperTypes: unionStringLists(template.paperTypes, source.paperTypes),
            paperWeights: unionStringLists(template.paperWeights, source.paperWeights),
            processings: unionStringLists(template.processings, source.processings),
            processingsCover: mergeStringListField(source.processingsCover, template.processingsCover),
            processingsInner: mergeStringListField(source.processingsInner, template.processingsInner),
        };
    }
    return {
        ...template,
        ...source,
        name,
        sizes: mergeStringListField(source.sizes, template.sizes),
        paperTypes: mergeStringListField(source.paperTypes, template.paperTypes),
        paperWeights: mergeStringListField(source.paperWeights, template.paperWeights),
        processings: mergeStringListField(source.processings, template.processings),
        processingsCover: mergeStringListField(source.processingsCover, template.processingsCover),
        processingsInner: mergeStringListField(source.processingsInner, template.processingsInner),
    };
}

function productDefinitionFieldsEqual(a: JobTypeDefinition, b: JobTypeDefinition): boolean {
    return (
        stringArraysEqual(a.sizes, b.sizes) &&
        stringArraysEqual(a.paperTypes, b.paperTypes) &&
        stringArraysEqual(a.paperWeights, b.paperWeights) &&
        stringArraysEqual(a.processings, b.processings) &&
        stringArraysEqual(a.processingsCover, b.processingsCover) &&
        stringArraysEqual(a.processingsInner, b.processingsInner)
    );
}

/** 저장된 품목 정의 + INITIAL 신규 항목 자동 병합 */
export function mergeAllProductDefinitionsWithInitial(
    definitions: JobTypeDefinition[]
): { definitions: JobTypeDefinition[]; changed: boolean } {
    const { definitions: normalized, changed: normChanged } = normalizeProductDefinitions(definitions);
    let changed = normChanged;
    const byName = new Map(normalized.map((d) => [d.name, d]));
    const result: JobTypeDefinition[] = [];

    for (const template of INITIAL_PRODUCT_DEFINITIONS) {
        const existing = byName.get(template.name);
        if (existing) {
            const merged = mergeProductDefinition(template, existing, template.name);
            if (!productDefinitionFieldsEqual(merged, existing)) changed = true;
            result.push(merged);
            byName.delete(template.name);
        }
        // 삭제된 기본 품목은 merge로 되살리지 않음 (신규 테넌트는 INITIAL 전체로 초기화)
    }

    for (const custom of byName.values()) {
        result.push(custom);
    }

    return { definitions: result, changed };
}

export function mergeProcessingDefinitionsWithInitial(
    definitions: string[]
): { definitions: string[]; changed: boolean } {
    const merged = mergeStringListField(definitions, INITIAL_PROCESSING_DEFINITIONS);
    return { definitions: merged, changed: !stringArraysEqual(merged, definitions) };
}

export function mergeStatusDefinitionsWithInitial(
    definitions: JobStatusDefinition[],
    removedKeys?: Iterable<string>
): { definitions: JobStatusDefinition[]; changed: boolean } {
    const removed = removedKeys ? new Set(removedKeys) : new Set<string>();
    const byKey = new Map(definitions.map((d) => [d.key, d]));
    let changed = false;
    const result: JobStatusDefinition[] = [...definitions];

    for (const template of INITIAL_STATUS_DEFINITIONS) {
        if (!byKey.has(template.key) && !removed.has(template.key)) {
            result.push({ ...template });
            changed = true;
        }
    }

    return { definitions: result, changed };
}

export function mergeRolesWithInitial(roles: string[]): { roles: string[]; changed: boolean } {
    const sanitized = filterJobTitleOptions(roles);
    const merged = filterJobTitleOptions(mergeStringListField(sanitized, DEFAULT_STAFF_ROLES));
    const changed = !stringArraysEqual(merged, roles);
    return { roles: merged, changed };
}

function splitLegacyBookletProcessings(all: string[]): ProductProcessingSets {
    const coverKeywords = ['코팅', '박', '형압', '에폭시', '하드커버'];
    const commonKeywords = ['제본', '접지'];
    const common: string[] = [];
    const cover: string[] = [];
    const inner: string[] = [];

    all.forEach((p) => {
        if (coverKeywords.some((kw) => p.includes(kw))) {
            cover.push(p);
        } else if (commonKeywords.some((kw) => p.includes(kw))) {
            common.push(p);
        } else {
            inner.push(p);
        }
    });

    return { common, cover, inner };
}

function resolveBookletProcessingSets(def: JobTypeDefinition | undefined, typeName: string): ProductProcessingSets {
    const initial = INITIAL_PRODUCT_DEFINITIONS.find((d) => d.name === typeName);

    if (def?.processingsCover?.length || def?.processingsInner?.length) {
        return {
            common: def.processings || [],
            cover: def.processingsCover || [],
            inner: def.processingsInner || [],
        };
    }

    if (def?.processings?.length) {
        return splitLegacyBookletProcessings(def.processings);
    }

    if (initial?.processingsCover?.length || initial?.processingsInner?.length) {
        return {
            common: initial.processings || [],
            cover: initial.processingsCover || [],
            inner: initial.processingsInner || [],
        };
    }

    if (initial?.processings?.length) {
        return splitLegacyBookletProcessings(initial.processings);
    }

    return { common: [], cover: [], inner: [] };
}

/** 품목명 자동 변경/합치기 없음 — 사용자가 등록한 이름 그대로 유지. 책자·카탈로그 평량만 정리 */
export function normalizeProductDefinitions(definitions: JobTypeDefinition[]): { definitions: JobTypeDefinition[]; changed: boolean } {
    let changed = false;
    const sanitized = definitions.map((def) => {
        if (!isBookletProductType(def.name)) return def;
        const paperWeights = sanitizeBookletPaperWeights(def.paperWeights);
        if (stringArraysEqual(paperWeights, def.paperWeights)) return def;
        changed = true;
        return { ...def, paperWeights };
    });
    return { definitions: sanitized, changed };
}

export function isBookletProductType(typeName: string): boolean {
    if (!typeName) return false;
    if (typeName.includes('책자')) return true;
    if (typeName.includes('카탈로그') || typeName.includes('카달로그')) return true;
    return LEGACY_CATALOG_TYPE_NAMES.some(name => typeName === name);
}

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
    private syncPulseUnsub: (() => void) | null = null;
    private configPollTimer: ReturnType<typeof setInterval> | null = null;
    private lastPublishedGatewayUrls: string[] = [];
    private quotesBootstrappedForTenant: string | null = null;
    private settingsMergePersisting = false;
    private quotesBootstrapInProgress = false;
    private lastWriteErrorToastAt = 0;
    private lastWriteErrorToastKey = '';
    /** LicenseFlow 버전 표용 — NAS 모드 포함 tenant 활동 보고 쓰로틀 */
    private lastTenantActivityAt = 0;
    private static readonly TENANT_ACTIVITY_MIN_INTERVAL_MS = 2 * 60 * 1000;
    private syncUserRole: 'admin' | 'staff' | 'superadmin' | null = null;
    /** jobs 핫 캐시 — 로그인 1회 pull + pulse 시 변경분만 getDoc */
    private operationalJobs: Job[] = [];
    private kanbanCompletedJobs: Job[] = [];
    private supplementaryJobs: Job[] = [];
    private activeLazyCollections = new Set<string>();
    private lazyCollectionsLoaded = new Set<string>();
    private calendarMonthsLoaded = new Set<string>();
    private clientHistoryLoaded = new Set<string>();
    private paymentJobsWanted = false;
    private paymentJobsLoaded = false;
    /** 원격 pulse echo 방지 — 본인이 쓴 직후 스냅샷 1회 무시 */
    private localPulseMarkers = new Map<string, string>();
    private lastAppliedJobRevAt: string | null = null;
    private lastAppliedStaffAt: string | null = null;
    private lastAppliedClientsAt: string | null = null;
    private lastAppliedMessagesAt: string | null = null;
    private lastAppliedSettingsAt: string | null = null;
    private lastLocalJobWriteAt = 0;
    private pulseHandling = false;
    private liveMirrorPushTimer: ReturnType<typeof setTimeout> | null = null;
    /** Auth에서 주입 — 상품/후가공 저장 권한 */
    private sessionCanManageProductProcessing = false;
    private lastProductProcessingFingerprint: string | null = null;
    private cloudDegraded = false;
    private localOperationalReady = false;
    private lastNasMirrorAt: string | null = null;
    /** 웹·태블릿 — 이 기기가 미러를 실제로 받은 시각 */
    private lastMirrorReceivedAt: string | null = null;
    private webMirrorReady = false;
    private lastNasArchiveAt: string | null = null;
    private nasPollTimer: ReturnType<typeof setInterval> | null = null;
    private archivedJobs: Job[] = [];
    private archiveLoaded = false;
    private archiveInitializing = false;
    /** NAS/Storage 미러에서 받은 회사명 — settings.companyInfo 미동기화 시 견적서 공급자 폴백 */
    private mirrorCompanyName: string | null = null;
    /** 삭제된 job ID — 미러·다른 PC·웹에 전파해 중복 복원 방지 */
    private jobTombstones = new Map<string, number>();
    /** 삭제된 거래처 ID — 합치기/삭제 롤백 방지 */
    private clientTombstones = new Map<string, number>();
    /** 견적·용지·휴가·지시 삭제 tombstone */
    private auxTombstones: Record<AuxCollectionName, Map<string, number>> = {
        quotes: new Map(),
        papers: new Map(),
        leaves: new Map(),
        instructions: new Map(),
    };
    /** 회사 NAS 헬스 — 실패 시 전원 동일하게 쓰기 차단 */
    private companyNasHealthy: boolean | null = null;
    private companyNasHealthError: string | null = null;
    private companyNasHealthPath: string | null = null;
    /** 관리자가 경로를 바꾼 뒤 직원에게 ‘지금 연결’ 유도 */
    private pendingArchiveReconnect = false;
    private pendingArchiveReconnectPath: string | null = null;
    private lastAppliedArchiveRootPath: string | null = null;
    private lastAppliedArchiveRootAt: string | null = null;
    private archiveReconnectInProgress = false;
    /** 짧은 NAS 끊김 유예 — 이 시간 지나야 전원 작업 잠금 */
    private static readonly NAS_GRACE_MS = 45_000;
    private static readonly NAS_MONITOR_MS = 12_000;
    private nasUnhealthySince: number | null = null;
    private nasHealthMonitorTimer: ReturnType<typeof setInterval> | null = null;
    /** local = PC→NAS 직접, gateway = 허브 PC LAN(같은 NAS 파일) */
    private companyNasChannel: 'local' | 'gateway' | null = null;

    getSyncStatus() { return this.syncStatus; }
    getLastSyncError() { return this.lastSyncError; }
    isCloudDegraded() { return this.cloudDegraded; }
    hasLocalOperationalData() { return this.localOperationalReady; }
    /** Electron — 업무 DB는 SQLite, Firestore는 회원·직원만 */
    isLocalPrimaryMode(): boolean {
        return this.getIsElectron() && localDbBridge.isAvailable();
    }

    /** 브라우저(웹·태블릿·PC 웹) — jobs는 NAS 미러(게이트웨이/Storage)만, Firestore jobs 미사용 */
    isWebMirrorMode(): boolean {
        return !this.getIsElectron();
    }

    /**
     * Firestore 클라우드 저장 가능 여부.
     * - jobs / clients: Firestore 저장 금지 (NAS·로컬 SQLite — 대량 데이터 비용·한도 방지)
     * - 웹: 설정·마스터는 관리자만 저장
     */
    private canPersistToCloud(col?: string): boolean {
        if (!this.tenantId) return false;
        // 업무 데이터 — Firestore 저장 금지 (NAS·로컬)
        if (
            col === 'jobs' ||
            col === 'clients' ||
            col === 'messages' ||
            col === 'quotes' ||
            col === 'papers' ||
            col === 'leaves' ||
            col === 'instructions'
        ) {
            return false;
        }
        if (!this.isWebMirrorMode()) return true;
        return this.isSyncAdmin();
    }

    /** Firestore tenants/.../jobs 컬렉션 접근 금지 여부 */
    private isFirestoreJobsForbidden(): boolean {
        return this.isLocalPrimaryMode() || this.isWebMirrorMode() || this.getIsElectron();
    }

    setSyncUserRole(role: 'admin' | 'staff' | 'superadmin' | null) {
        this.syncUserRole = role;
    }

    getTenantId(): string | null {
        return this.tenantId;
    }

    /** Firestore에 저장된 회사 공통 NAS 경로 (관리자 설정 → 전 PC 강제) */
    getTenantArchiveRootPath(): string | null {
        return getTenantArchiveRootFromSettings(this.getSettingsObj());
    }

    private pathsEqualIgnoreSlash(a: string | null | undefined, b: string | null | undefined): boolean {
        const na = String(a || '').replace(/[\\/]+$/, '').toLowerCase();
        const nb = String(b || '').replace(/[\\/]+$/, '').toLowerCase();
        return na === nb;
    }

    private enforceCompanyArchiveRoot(): boolean {
        const settingsPath = getTenantArchiveRootFromSettings(this.getSettingsObj())?.trim() || null;
        const current = this.lastAppliedArchiveRootPath;

        // 다른 PC(관리자)가 경로를 바꾼 경우 — 즉시 전환하지 않고 재연결 유도
        // (새 빈 폴더를 자동 poll 하면 로컬이 비는 사고 방지)
        if (
            settingsPath &&
            current &&
            !this.pathsEqualIgnoreSlash(settingsPath, current) &&
            !this.isLocalPulse('settingsAt', this.lastAppliedSettingsAt)
        ) {
            this.pendingArchiveReconnect = true;
            this.pendingArchiveReconnectPath = settingsPath;
            this.notify();
            return false;
        }

        const applied = applyArchiveRootFromSettings(this.getSettingsObj());
        const next = getEffectiveArchiveRootPath()?.trim() || null;
        if (next) {
            this.lastAppliedArchiveRootPath = next;
            if (this.tenantId) {
                saveLastKnownArchiveRootPath(this.tenantId, next);
            }
        }
        if (applied) {
            void this.refreshStoreGateway();
        }
        return applied;
    }

    /** Firestore settings 실패 시 — 직전 정상 회사 경로만 복원 (빈 경로로 덮지 않음) */
    private restoreArchiveRootFromLastKnown(): boolean {
        if (!this.tenantId) return false;
        const knownPath = readLastKnownArchiveRootPath(this.tenantId);
        if (!knownPath) return false;
        const current = getEffectiveArchiveRootPath()?.trim() || null;
        if (current && this.pathsEqualIgnoreSlash(current, knownPath)) {
            this.lastAppliedArchiveRootPath = current;
            return true;
        }
        const changed = setCompanyArchiveRootOverride(knownPath);
        this.lastAppliedArchiveRootPath = knownPath;
        console.warn(
            `[DataService] settings 미수신 → last-known NAS 경로 복원: ${knownPath}`
        );
        if (changed) void this.refreshStoreGateway();
        return true;
    }

    getCompanyNasHealth(): {
        healthy: boolean | null;
        path: string | null;
        error: string | null;
        pendingReconnect: boolean;
        pendingPath: string | null;
        channel: 'local' | 'gateway' | null;
        inGrace: boolean;
    } {
        return {
            healthy: this.companyNasHealthy,
            path: this.companyNasHealthPath || getEffectiveArchiveRootPath(),
            error: this.companyNasHealthError,
            pendingReconnect: this.pendingArchiveReconnect,
            pendingPath: this.pendingArchiveReconnectPath,
            channel: this.companyNasChannel,
            inGrace: this.nasUnhealthySince != null && this.companyNasHealthy !== false,
        };
    }

    /** 회사 NAS 경로가 지정된 Electron에서만 — 미확인/실패·재연결 대기 시 운영 쓰기 금지 */
    private shouldBlockOperationalNasWrite(): boolean {
        if (!this.getIsElectron()) return false;
        const companyPath = getTenantArchiveRootFromSettings(this.getSettingsObj());
        if (!companyPath?.trim() && !getEffectiveArchiveRootPath()) return false;
        if (this.pendingArchiveReconnect) return true;
        if (this.companyNasHealthy === false) return true;
        return false;
    }

    /** 경로 재연결 전 — 업무 데이터 쓰기 막고 전원 동일 상태 유지 */
    private isOperationalCollection(col: string): boolean {
        return (
            col === 'jobs' ||
            col === 'clients' ||
            col === 'messages' ||
            col === 'quotes' ||
            col === 'papers' ||
            col === 'leaves' ||
            col === 'instructions'
        );
    }

    private assertOperationalWriteAllowed(col: string): void {
        if (!this.isOperationalCollection(col)) return;
        if (!this.getIsElectron()) return;
        if (this.pendingArchiveReconnect) {
            throw new Error(
                '회사 NAS 경로가 변경되었습니다. 상단의 「지금 연결」을 누른 뒤에만 작업할 수 있습니다.'
            );
        }
        if (this.companyNasHealthy === false) {
            throw new Error(
                '회사 NAS에 연결되지 않았습니다. 「지금 연결」 후 작업을 진행해 주세요.'
            );
        }
    }

    /** UI — 경로 재연결 대기 중에는 작업 불가 */
    isOperationalWorkLocked(): boolean {
        return this.getIsElectron() && (this.pendingArchiveReconnect || this.companyNasHealthy === false);
    }

    private stopNasHealthMonitor() {
        if (this.nasHealthMonitorTimer) {
            clearInterval(this.nasHealthMonitorTimer);
            this.nasHealthMonitorTimer = null;
        }
    }

    private startNasHealthMonitor() {
        this.stopNasHealthMonitor();
        if (!this.getIsElectron()) return;
        this.nasHealthMonitorTimer = setInterval(() => {
            void this.checkCompanyNasHealth(false);
        }, DataService.NAS_MONITOR_MS);
    }

    private markCompanyNasOk(channel: 'local' | 'gateway', path: string | null) {
        const wasLocked = this.companyNasHealthy === false;
        this.companyNasHealthy = true;
        this.companyNasHealthError = null;
        this.companyNasHealthPath = path;
        this.companyNasChannel = channel;
        this.nasUnhealthySince = null;
        this.notify();
        if (wasLocked && !this.pendingArchiveReconnect) {
            void this.pollNasOperationalSync();
            void this.hydrateMessagesFromMirror();
            toast.success(
                channel === 'gateway'
                    ? '사내 게이트웨이로 NAS에 다시 연결되었습니다.'
                    : '회사 NAS 연결이 복구되었습니다.'
            );
        }
    }

    private markCompanyNasFail(error: string, path: string | null): boolean {
        const now = Date.now();
        if (this.nasUnhealthySince == null) this.nasUnhealthySince = now;
        this.companyNasHealthPath = path;
        this.companyNasHealthError = error;
        const elapsed = now - this.nasUnhealthySince;
        if (elapsed < DataService.NAS_GRACE_MS) {
            // 짧은 끊김 — 아직 잠금하지 않음 (재시도 중)
            if (this.companyNasHealthy !== false) {
                this.companyNasHealthy = true;
            }
            this.notify();
            return true;
        }
        const newlyLocked = this.companyNasHealthy !== false;
        this.companyNasHealthy = false;
        this.companyNasChannel = null;
        this.notify();
        if (newlyLocked) {
            toast.error(
                '회사 NAS·게이트웨이 연결이 불안정합니다. 연결될 때까지 작업이 잠깁니다. (전원 동일)',
                { duration: 9000 }
            );
        }
        return false;
    }

    async checkCompanyNasHealth(forceWriteProbe = false): Promise<boolean> {
        if (!this.getIsElectron() || !this.tenantId) {
            this.companyNasHealthy = null;
            return true;
        }
        void forceWriteProbe;

        // Z: 등 매핑 드라이브로 저장된 회사 경로 → UNC 자동 교정(관리자)
        try {
            await this.maybeCorrectDriveLetterArchiveRoot();
        } catch (e) {
            console.warn('[DataService] maybeCorrectDriveLetterArchiveRoot:', e);
        }

        let path = getEffectiveArchiveRootPath()?.trim() || null;
        // 게이트웨이/헬스 직전 — 로컬에 매핑이 있으면 UNC로 풀어 접근·비교
        if (path && isDriveLetterPath(path)) {
            try {
                const resolved = await resolveArchivePathToUnc(path);
                if (resolved.ok && isUncPath(resolved.path)) {
                    path = resolved.path;
                    setCompanyArchiveRootOverride(path);
                }
            } catch { /* keep original */ }
        }
        this.companyNasHealthPath = path;
        if (!path) {
            const configured = !!getTenantArchiveRootFromSettings(this.getSettingsObj());
            if (!configured) {
                this.companyNasHealthy = null;
                this.companyNasHealthError = null;
                this.nasUnhealthySince = null;
                this.notify();
                return true;
            }
            return this.markCompanyNasFail('회사 NAS 경로를 적용하지 못했습니다.', null);
        }

        // 1) PC → NAS 직접
        try {
            const probe = await jobArchiveService.ensureArchiveFolderReady(this.tenantId);
            if (probe.ok) {
                this.markCompanyNasOk('local', path);
                return true;
            }
        } catch (e) {
            console.warn('[DataService] local NAS probe failed:', e);
        }

        // 2) 허브 PC 게이트웨이 — 회사 archiveRootPath 와 같은 폴더만 허용
        const gw = this.getStoreGatewayUrls();
        if (gw.length > 0) {
            try {
                const { isStoreGatewayServingCompanyPath } = await import('./gatewayBridge');
                const servesCompany = await isStoreGatewayServingCompanyPath(gw, path, this.tenantId);
                if (servesCompany) {
                    const mirror = await situationMirrorService.readViaGatewayOnly(this.tenantId, gw);
                    if (mirror) {
                        this.markCompanyNasOk('gateway', path);
                        return true;
                    }
                } else if (await (await import('./gatewayBridge')).isStoreGatewayReachable(gw, this.tenantId)) {
                    console.warn(
                        '[DataService] gateway reachable but archiveRoot ≠ company path — ignored to prevent split'
                    );
                }
            } catch (e) {
                console.warn('[DataService] gateway NAS probe failed:', e);
            }
        }

        return this.markCompanyNasFail(
            gw.length > 0
                ? 'NAS 직접 연결과 회사경로 게이트웨이 모두 실패했습니다.'
                : 'NAS 폴더 접근 실패 (게이트웨이 URL 없음)',
            path
        );
    }

    /** 경로 변경 알림에서 ‘지금 연결’ — 회사 경로 재적용 + 미러 재로드 */
    async reconnectCompanyArchiveRoot(): Promise<{ ok: boolean; error?: string }> {
        if (this.archiveReconnectInProgress) {
            return { ok: false, error: '이미 연결 중입니다.' };
        }
        this.archiveReconnectInProgress = true;
        try {
            await this.pullCollectionDocs('settings');
            const target =
                this.pendingArchiveReconnectPath ||
                getTenantArchiveRootFromSettings(this.getSettingsObj())?.trim() ||
                null;
            if (!target) {
                return { ok: false, error: '회사 NAS 경로가 없습니다. 관리자에게 문의하세요.' };
            }
            setCompanyArchiveRootOverride(target);
            this.lastAppliedArchiveRootPath = target;
            const healthy = await this.checkCompanyNasHealth(true);
            if (!healthy) {
                return {
                    ok: false,
                    error:
                        this.companyNasHealthError ||
                        'NAS에 연결할 수 없습니다. Z: 드라이브·공유 폴더를 확인해 주세요.',
                };
            }
            await this.pollNasOperationalSync();
            await this.hydrateMessagesFromMirror();
            void this.refreshStoreGateway();
            this.pendingArchiveReconnect = false;
            this.pendingArchiveReconnectPath = null;
            this.notify();
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        } finally {
            this.archiveReconnectInProgress = false;
        }
    }

    /** Firestore settings — 웹·태블릿 NAS/LAN 조회 (다중 NIC·WiFi URL) */
    getStoreGatewayUrls(): string[] {
        return collectStoreGatewayUrlsFromSettings(this.getSettingsObj());
    }

    /** 서브넷 매칭 우선 정렬된 LAN URL 목록 */
    async getOrderedStoreGatewayUrls(): Promise<string[]> {
        return orderStoreGatewayUrls(this.getStoreGatewayUrls());
    }

    /** Firestore settings.main.storeGatewayUrl — 대표 URL (구버전 호환) */
    getStoreGatewayUrl(): string | null {
        return this.getStoreGatewayUrls()[0] ?? null;
    }

    hasWebMirrorData() {
        return this.webMirrorReady;
    }

    /** 웹 조회용 — 마지막 NAS/미러 동기화 시각(ISO) */
    getLastNasMirrorAt(): string | null {
        return this.lastNasMirrorAt;
    }

    getLastMirrorReceivedAt(): string | null {
        return this.lastMirrorReceivedAt;
    }

    isWebViewOnly(): boolean {
        return !this.getIsElectron();
    }

    private async fetchWebMirrorPayload(): Promise<SituationMirrorPayload | null> {
        if (!this.tenantId || this.getIsElectron()) return null;
        const gatewayUrls = await this.getOrderedStoreGatewayUrls();
        return situationMirrorService.readRemoteMirror(this.tenantId, gatewayUrls);
    }

    private applyMirrorPayload(situation: SituationMirrorPayload): boolean {
        let applied = false;
        if (situation.deletedJobs?.length) {
            this.applyJobTombstonesFromMirror(situation.deletedJobs);
            applied = true;
        }
        if (situation.jobs?.length) {
            const merged = this.mergeJobsByUpdatedAt(this.getAllJobs(), situation.jobs);
            this.applyImportedJobs(merged);
            applied = true;
        } else if (situation.deletedJobs?.length) {
            this.purgeTombstonedJobsFromCaches();
            applied = true;
        }
        if (situation.deletedClients?.length) {
            this.applyClientTombstonesFromMirror(situation.deletedClients);
            applied = true;
        }
        if (Array.isArray(situation.clients)) {
            this.data['clients'] = this.mergeClientsById(
                (this.data['clients'] || []) as Client[],
                situation.clients as Client[]
            );
            applied = true;
        } else if (situation.deletedClients?.length) {
            this.purgeTombstonedClientsFromCache();
            applied = true;
        }
        if (situation.settings && typeof situation.settings === 'object') {
            this.mergeSettingsFromMirror(
                situation.settings as Record<string, unknown>,
                situation.companyName,
                situation.updatedAt
            );
            applied = true;
        } else if (situation.companyName) {
            this.mirrorCompanyName = situation.companyName;
            applied = true;
        }
        if (situation.updatedAt) {
            this.lastNasMirrorAt = situation.updatedAt;
            this.lastNasArchiveAt = situation.updatedAt;
        }
        if (applied) {
            this.lastMirrorReceivedAt = new Date().toISOString();
            this.notify();
        }
        return applied;
    }

    private async hydrateWebMirrorInBackground(): Promise<void> {
        if (!this.tenantId || this.getIsElectron()) return;
        const ok = await this.tryHydrateFromWebMirror(1);
        if (ok) {
            this.webMirrorReady = true;
            this.isReady = true;
            this.notify();
            return;
        }
        void this.retryWebMirrorHydrateInBackground();
    }

    private async tryHydrateFromWebMirror(maxAttempts = 1): Promise<boolean> {
        if (!this.tenantId || this.getIsElectron()) return false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const situation = await this.fetchWebMirrorPayload();
                if (!situation) {
                    if (attempt < maxAttempts - 1) {
                        await new Promise((r) => setTimeout(r, 1500));
                    }
                    continue;
                }
                const ok = this.applyMirrorPayload(situation);
                if (ok) {
                    this.webMirrorReady = true;
                    return true;
                }
                if (attempt < maxAttempts - 1) {
                    await new Promise((r) => setTimeout(r, 1500));
                }
            } catch {
                if (attempt < maxAttempts - 1) {
                    await new Promise((r) => setTimeout(r, 1500));
                }
            }
        }
        return false;
    }

    private async retryWebMirrorHydrateInBackground(): Promise<void> {
        if (!this.tenantId || this.getIsElectron()) return;
        for (let i = 0; i < 5; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            if (!this.tenantId || this.getIsElectron()) return;
            if (this.getAllJobs().length > 0) return;
            const ok = await this.tryHydrateFromWebMirror(1);
            if (ok) {
                this.isReady = true;
                this.syncStatus = 'synced';
                this.notify();
                return;
            }
        }
    }


    private isSyncAdmin(): boolean {
        return this.syncUserRole === 'admin' || this.syncUserRole === 'superadmin';
    }

    /** users/{uid}.tenantId 서버 확인 후 동기화 — permission-denied 레이스 방지 */
    async setTenantWhenReady(tenantId: string, uid?: string): Promise<boolean> {
        const effectiveUid = uid || auth.currentUser?.uid;
        if (!effectiveUid) {
            console.warn('[DataService] setTenantWhenReady: Firebase Auth 없음 — 동기화 보류');
            return false;
        }
        if (this.tenantId === tenantId && this.syncStatus === 'synced') return true;

        /** 서버 응답을 한 번이라도 받음 (소속 불일치 판별용) */
        let sawServerProfile = false;

        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                const userSnap = await getDocFromServer(doc(firestore, 'users', effectiveUid));
                sawServerProfile = true;
                const profileTenant = userSnap.data()?.tenantId;
                if (userSnap.exists() && profileTenant === tenantId) {
                    await this.waitForAuthToken();
                    this.setTenant(tenantId);
                    return true;
                }
            } catch (e) {
                console.warn('[DataService] setTenantWhenReady 재시도', attempt + 1, e);
            }
            await new Promise((r) => setTimeout(r, 250));
        }

        // 서버가 프로필을 돌려줬는데 소속이 다름/없음 → 로컬 폴백 금지 (잘못된 테넌트 기동 방지)
        if (sawServerProfile) {
            console.warn(
                '[DataService] setTenantWhenReady: 서버 프로필 소속 불일치 — 동기화 보류'
            );
            this.lastSyncError = 'profile-tenant-mismatch';
            this.syncStatus = 'disconnected';
            this.notify();
            return false;
        }

        // 전 시도가 네트워크/일시 오류 — 직전 정상 스냅샷·로컬 DB만으로 업무 기동
        const known = readLastKnownTenantPlan(tenantId);
        const uidMatches =
            !known?.uid || known.uid === effectiveUid || known.user?.uid === effectiveUid;
        let hasLocalData = false;
        if (this.getIsElectron() && localDbBridge.isAvailable()) {
            try {
                const bundle = await localDbBridge.loadTenant(tenantId);
                hasLocalData =
                    bundle.jobCount > 0 ||
                    bundle.clients.length > 0 ||
                    !!bundle.settings;
            } catch {
                /* ignore */
            }
        }
        if (uidMatches && ((known?.tenantId === tenantId && !!known.paymentStatus) || hasLocalData)) {
            console.warn(
                '[DataService] setTenantWhenReady: 네트워크 장애 — last-known/로컬로 기동 (cloudDegraded 가능)'
            );
            await this.waitForAuthToken();
            this.setTenant(tenantId);
            return true;
        }

        console.warn('[DataService] setTenantWhenReady: 프로필 미확인 — 동기화 시작 보류(데이터 손실 방지)');
        this.lastSyncError = 'profile-not-ready';
        this.syncStatus = 'disconnected';
        this.notify();
        return false;
    }

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
        this.jobTombstones = loadJobTombstoneMap(tenantId);
        this.clientTombstones = loadClientTombstoneMap(tenantId);
        this.auxTombstones = {
            quotes: loadAuxTombstoneMap(tenantId, 'quotes'),
            papers: loadAuxTombstoneMap(tenantId, 'papers'),
            leaves: loadAuxTombstoneMap(tenantId, 'leaves'),
            instructions: loadAuxTombstoneMap(tenantId, 'instructions'),
        };
        this.mirrorCompanyName = null;
        this.lastSyncError = null;
        this.quotesBootstrappedForTenant = null;
        this.operationalJobs = [];
        this.kanbanCompletedJobs = [];
        this.supplementaryJobs = [];
        this.calendarMonthsLoaded.clear();
        this.clientHistoryLoaded.clear();
        this.paymentJobsWanted = false;
        this.paymentJobsLoaded = false;
        this.lazyCollectionsLoaded.clear();
        this.localPulseMarkers.clear();
        this.lastAppliedJobRevAt = null;
        this.lastAppliedStaffAt = null;
        this.lastAppliedClientsAt = null;
        this.lastAppliedMessagesAt = null;
        this.lastAppliedSettingsAt = null;
        this.cloudDegraded = false;
        this.localOperationalReady = false;
        this.webMirrorReady = false;
        this.lastNasMirrorAt = null;
        this.lastMirrorReceivedAt = null;
        this.lastNasArchiveAt = null;
        this.companyNasHealthy = null;
        this.companyNasHealthError = null;
        this.companyNasHealthPath = null;
        this.pendingArchiveReconnect = false;
        this.pendingArchiveReconnectPath = null;
        this.lastAppliedArchiveRootPath = null;
        this.lastAppliedArchiveRootAt = null;
        this.nasUnhealthySince = null;
        this.companyNasChannel = null;
        clearCompanyArchiveRootOverride();
        this.stopNasMirrorPolling();
        this.stopNasHealthMonitor();
        this.archivedJobs = [];
        this.archiveLoaded = false;
        this.archiveInitializing = false;
        this.stopSyncPulse();
        this.startSyncing();
    }

    /** 로그아웃·세션 만료 — 동기화 중단 및 테넌트 연결 해제 */
    clearSession() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.unsubscribeList.forEach((unsub) => unsub());
        this.unsubscribeList = [];
        this.stopSyncPulse();
        this.stopNasMirrorPolling();
        this.stopNasHealthMonitor();
        this.stopPaymentJobsSync();

        this.tenantId = null;
        this.syncUserRole = null;
        this.lastSyncError = null;
        this.syncStatus = 'disconnected';
        this.isReady = false;
        this.cloudDegraded = false;
        this.localOperationalReady = false;
        this.webMirrorReady = false;
        this.quotesBootstrappedForTenant = null;
        this.settingsMergePersisting = false;
        this.quotesBootstrapInProgress = false;
        this.operationalJobs = [];
        this.kanbanCompletedJobs = [];
        this.supplementaryJobs = [];
        this.calendarMonthsLoaded.clear();
        this.clientHistoryLoaded.clear();
        this.paymentJobsWanted = false;
        this.paymentJobsLoaded = false;
        this.lazyCollectionsLoaded.clear();
        this.localPulseMarkers.clear();
        this.lastNasMirrorAt = null;
        this.lastMirrorReceivedAt = null;
        this.lastNasArchiveAt = null;
        this.companyNasHealthy = null;
        this.companyNasHealthError = null;
        this.companyNasHealthPath = null;
        this.pendingArchiveReconnect = false;
        this.pendingArchiveReconnectPath = null;
        this.lastAppliedArchiveRootPath = null;
        this.lastAppliedArchiveRootAt = null;
        this.nasUnhealthySince = null;
        this.companyNasChannel = null;
        clearCompanyArchiveRootOverride();
        this.rebuildMergedJobs();
        this.notify();
    }

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

        for (const key of ['productDefinitions', 'statusDefinitions', 'processingDefinitions', 'pricing', 'roles', 'quoteTemplate', 'kanbanLayout'] as const) {
            const fragment = docs.find(d => d.id === key);
            if (!fragment) continue;
            if (key === 'kanbanLayout') {
                const { id: _id, splitPairs, ...rest } = fragment;
                main.kanbanLayout = splitPairs ? { splitPairs, ...rest } : (fragment.kanbanLayout ?? fragment);
            } else {
                main[key] = fragment[key] ?? fragment;
            }
        }

        return main;
    }

    /** 앱/웹 기동 시 저장 설정 + 새 버전 기본값 자동 병합 (사용자 항목 유지, 신규만 추가) */
    private applySettingsDefaultsMerge(settingsObj: Record<string, any>): boolean {
        let changed = false;

        const rawDefs = settingsObj?.productDefinitions?.definitions;
        if (rawDefs?.length) {
            const { definitions: mergedDefs, changed: defsChanged } = mergeAllProductDefinitionsWithInitial(rawDefs);
            if (defsChanged) {
                settingsObj.productDefinitions = { definitions: mergedDefs };
                changed = true;
            }
        }

        const rawProc = settingsObj?.processingDefinitions?.definitions;
        if (!rawProc?.length && !settingsObj?.processingDefinitions) {
            settingsObj.processingDefinitions = { definitions: [...INITIAL_PROCESSING_DEFINITIONS] };
            changed = true;
        }

        const rawStatus = settingsObj?.statusDefinitions?.definitions;
        if (!rawStatus?.length && !settingsObj?.statusDefinitions) {
            settingsObj.statusDefinitions = { definitions: [...INITIAL_STATUS_DEFINITIONS] };
            changed = true;
        }

        const rawRoles = settingsObj?.roles?.roles;
        if (rawRoles?.length) {
            const { roles: mergedRoles, changed: rolesChanged } = mergeRolesWithInitial(rawRoles);
            if (rolesChanged) {
                settingsObj.roles = { roles: mergedRoles };
                changed = true;
            }
        }

        if (!settingsObj?.kanbanLayout?.splitPairs?.length) {
            settingsObj.kanbanLayout = normalizeKanbanLayoutConfig(settingsObj.kanbanLayout);
            // 메모리 기본값만 — Firestore에 기본 레이아웃 강제 저장하지 않음 (사용자 설정 덮어쓰기 방지)
        }

        return changed;
    }

    private async persistSettingsDefaultsMerge(settingsObj: Record<string, any>): Promise<void> {
        if (this.settingsMergePersisting) return;
        this.settingsMergePersisting = true;

        this.data['settings'] = [settingsObj];
        this.notify();

        if (!this.tenantId) {
            this.settingsMergePersisting = false;
            return;
        }

        // 웹 일반 직원 — 메모리 병합만. 관리자는 Firestore 저장 허용
        if (this.isWebMirrorMode() && !this.isSyncAdmin()) {
            this.settingsMergePersisting = false;
            return;
        }

        try {
            // 업무 마스터 설정은 NAS SSOT — Firestore에 status/roles 재주입 금지
            if (!this.isWebMirrorMode()) {
                void this.flushLiveMirrorPushNow();
            }
            console.log('[DataService] Settings merged with app defaults (user data preserved).');
        } catch (err) {
            console.error('[DataService] Failed to persist merged settings:', err);
        } finally {
            this.settingsMergePersisting = false;
        }
    }

    private getHotWindowCutoffDate(): Date {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - HOT_WINDOW_DAYS);
        return cutoff;
    }

    private getJobActivityDate(job: Job): Date {
        const candidates = [job.completedAt, (job as any).updatedAt, job.dueDate, job.createdAt]
            .filter(Boolean)
            .map((v) => new Date(v as string))
            .filter((d) => Number.isFinite(d.getTime()));
        if (candidates.length === 0) return new Date(job.createdAt);
        return new Date(Math.max(...candidates.map((d) => d.getTime())));
    }

    private isArchiveCandidate(job: Job): boolean {
        if (!ARCHIVED_JOB_STATUSES.includes(job.status as (typeof ARCHIVED_JOB_STATUSES)[number])) {
            return false;
        }
        const activityAt = this.getJobActivityDate(job);
        return activityAt.getTime() < this.getHotWindowCutoffDate().getTime();
    }

    private rebuildArchiveMergedJobs() {
        const map = new Map<string, Job>();
        for (const job of this.archivedJobs) map.set(job.id, job);
        for (const job of (this.data['jobs'] || [])) map.set(job.id, job as Job);
        this.data['jobs'] = Array.from(map.values());
    }

    private isJobInHotCache(id: string): boolean {
        return (
            this.operationalJobs.some((j) => j.id === id) ||
            this.kanbanCompletedJobs.some((j) => j.id === id) ||
            this.supplementaryJobs.some((j) => j.id === id)
        );
    }

    private isArchivedOnlyJob(id: string): boolean {
        return this.archivedJobs.some((j) => j.id === id) && !this.isJobInHotCache(id);
    }

    private async loadArchivedJobs(): Promise<void> {
        if (!this.tenantId) {
            this.archivedJobs = [];
            this.archiveLoaded = true;
            return;
        }
        try {
            this.archivedJobs = await jobArchiveService.readArchivedJobs(this.tenantId);
        } catch (error) {
            console.warn('[DataService] archived jobs load failed:', error);
            this.archivedJobs = [];
        } finally {
            this.archiveLoaded = true;
            this.rebuildArchiveMergedJobs();
        }
    }

    private async runHotColdArchival(): Promise<void> {
        if (!this.tenantId || !this.getIsElectron() || !this.isSyncAdmin()) return;
        // 로컬·NAS 전용 모드 — Firestore jobs 레거시 아카이브 스킵
        if (this.isLocalPrimaryMode() || this.isFirestoreJobsForbidden()) return;
        const dayKey = new Date().toISOString().split('T')[0];
        const markerKey = `ezpw_archive_last_run_${this.tenantId}`;
        if (localStorage.getItem(markerKey) === dayKey) return;

        const jobsCol = collection(firestore, 'tenants', this.tenantId, 'jobs');
        const cutoffIso = this.getHotWindowCutoffDate().toISOString();
        const legacyQuery = query(
            jobsCol,
            where('status', 'in', [...ARCHIVED_JOB_STATUSES]),
            where('createdAt', '<=', cutoffIso)
        );
        const snapshot = await getDocs(legacyQuery);
        const candidates: Job[] = [];
        snapshot.forEach((docSnap) => {
            candidates.push({ ...(docSnap.data() as Job), id: docSnap.id });
        });
        const toArchive = candidates.filter((job) => this.isArchiveCandidate(job));
        if (toArchive.length === 0) {
            localStorage.setItem(markerKey, dayKey);
            return;
        }

        const writeResult = await jobArchiveService.appendJobs(this.tenantId, toArchive);
        if (!writeResult.success) {
            console.warn(
                '[DataService] archive skipped — Firestore 유지 (NAS/Storage 미러 반영 전에는 삭제하지 않음)'
            );
            return;
        }

        const quoteIds = new Set<string>();
        for (const job of toArchive) {
            if (job.linkedQuoteId) quoteIds.add(job.linkedQuoteId);
        }

        for (let index = 0; index < toArchive.length; index += 400) {
            const chunk = toArchive.slice(index, index + 400);
            const batch = writeBatch(firestore);
            for (const job of chunk) {
                batch.delete(doc(firestore, 'tenants', this.tenantId, 'jobs', job.id));
            }
            await batch.commit();
        }

        for (const quoteId of quoteIds) {
            try {
                await deleteDoc(doc(firestore, 'tenants', this.tenantId, 'quotes', quoteId));
            } catch {
                // 견적은 없을 수도 있어 무시
            }
        }

        localStorage.setItem(markerKey, dayKey);
        await this.loadArchivedJobs();
    }

    private async initializeArchiveLayer(): Promise<void> {
        if (this.archiveInitializing) return;
        this.archiveInitializing = true;
        try {
            await this.loadArchivedJobs();
            if (this.tenantId && this.getIsElectron() && this.isSyncAdmin()) {
                await jobArchiveService.flushPendingQueue(this.tenantId);
                await this.runHotColdArchival();
                await this.loadArchivedJobs();
            }
        } catch (error) {
            console.warn('[DataService] archive initialization failed:', error);
        } finally {
            this.archiveInitializing = false;
            this.notify();
        }
    }

    /** 웹/태블릿·검색 화면 — 콜드(1년+) 이력 로드 보장 */
    async ensureColdArchiveLoaded(): Promise<void> {
        if (this.archiveLoaded) return;
        await this.loadArchivedJobs();
        this.notify();
    }

    /**
     * 검색 전용 — 거래처·제목 등 부분 일치만 소량 조회 (1년 전체 일괄 로드 금지).
     */
    private async fetchJobsBySearchQuery(q: string): Promise<Job[]> {
        if (!this.tenantId) return [];
        const trimmed = q.trim();
        if (trimmed.length < 2) return [];

        if (this.isFirestoreJobsForbidden()) {
            await this.ensureColdArchiveLoaded();
            const needle = trimmed.toLowerCase();
            const map = new Map<string, Job>();
            for (const job of this.getAllJobs()) {
                if (!job?.id) continue;
                const hay = `${job.title || ''} ${job.clientName || ''} ${job.contactPerson || ''}`.toLowerCase();
                if (hay.includes(needle)) map.set(job.id, job);
            }
            const results = Array.from(map.values()).slice(0, 80);
            if (results.length > 0) {
                this.mergeSupplementaryJobs(results, () => false);
                this.notify();
            }
            return results;
        }

        const jobsCol = collection(firestore, 'tenants', this.tenantId, 'jobs');
        const hotCutoffIso = this.getHotWindowCutoffDate().toISOString();
        const map = new Map<string, Job>();
        const upper = trimmed + '\uf8ff';

        const runQuery = async (field: 'clientName' | 'title' | 'contactPerson', cap: number) => {
            try {
                const snap = await getDocs(
                    query(
                        jobsCol,
                        where('createdAt', '>=', hotCutoffIso),
                        where(field, '>=', trimmed),
                        where(field, '<=', upper),
                        limit(cap)
                    )
                );
                snap.forEach((docSnap) => {
                    map.set(docSnap.id, { ...docSnap.data(), id: docSnap.id } as Job);
                });
            } catch (error) {
                console.warn(`[DataService] search query failed (${field}):`, error);
            }
        };

        await Promise.all([
            runQuery('clientName', 30),
            runQuery('title', 30),
            runQuery('contactPerson', 20),
        ]);

        const results = Array.from(map.values());
        if (results.length > 0) {
            this.mergeSupplementaryJobs(results, () => false);
            this.notify();
        }
        return results;
    }

    /** @deprecated 1년 일괄 로드는 읽기 한도를 급증시킴 — fetchJobsBySearchQuery 사용 */
    async ensureSearchableHotJobsLoaded(): Promise<void> {
        return;
    }

    private rebuildMergedJobs() {
        const map = new Map<string, Job>();
        // supplementary → kanban → operational 순: 운영 중 작업(operational)이 최우선
        for (const job of [...this.supplementaryJobs, ...this.kanbanCompletedJobs, ...this.operationalJobs]) {
            map.set(job.id, job);
        }
        this.data['jobs'] = Array.from(map.values());
        this.rebuildArchiveMergedJobs();
    }

    private placeJobInLocalCache(job: Job) {
        this.operationalJobs = this.operationalJobs.filter((j) => j.id !== job.id);
        this.kanbanCompletedJobs = this.kanbanCompletedJobs.filter((j) => j.id !== job.id);
        this.supplementaryJobs = this.supplementaryJobs.filter((j) => j.id !== job.id);

        if (!ARCHIVED_JOB_STATUSES.includes(job.status as (typeof ARCHIVED_JOB_STATUSES)[number])) {
            this.operationalJobs.push(job);
            return;
        }

        // 취소 작업 — 칸반·상황판에는 안 보이지만 작업 내역·NAS 보관에 유지
        if (job.status === 'CANCELED') {
            this.supplementaryJobs.push(job);
            return;
        }

        if (job.status !== 'COMPLETED') return;

        if (OUTSTANDING_PAYMENT_STATUSES.includes(job.paymentStatus as (typeof OUTSTANDING_PAYMENT_STATUSES)[number])) {
            this.supplementaryJobs.push(job);
            return;
        }

        if (job.paymentStatus === '결제완료') {
            const completedAt = job.completedAt ? new Date(job.completedAt) : new Date(job.createdAt);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - KANBAN_RECENT_PAID_COMPLETED_DAYS);
            if (completedAt.getTime() >= cutoff.getTime()) {
                this.kanbanCompletedJobs.push(job);
            } else {
                // 오래된 결제완료도 작업 내역용으로 유지 (아카이브 병합 전 유실 방지)
                this.supplementaryJobs.push(job);
            }
        }
    }

    private removeJobFromLocalCache(id: string) {
        this.operationalJobs = this.operationalJobs.filter((j) => j.id !== id);
        this.kanbanCompletedJobs = this.kanbanCompletedJobs.filter((j) => j.id !== id);
        this.supplementaryJobs = this.supplementaryJobs.filter((j) => j.id !== id);
        this.rebuildMergedJobs();
    }

    private finishSessionPull() {
        this.syncStatus = 'synced';
        if (this.getIsElectron()) {
            this.runDailyAutoBackup().catch((err) => console.error('Auto backup error:', err));
        }
        void this.initializeArchiveLayer();
        this.updateTenantActivity().catch(() => {});
        void this.restoreActiveLazyPulls();
        if (this.paymentJobsWanted) void this.ensurePaymentJobsSync();
        void this.maybeBootstrapQuotes();
        void this.pushLiveMirrors();
        this.notify();
    }

    /** NAS + Storage 즉시 미러 — Firestore 읽기 없음 */
    private scheduleLiveMirrorPush() {
        if (!this.tenantId) return;
        if (this.liveMirrorPushTimer) clearTimeout(this.liveMirrorPushTimer);
        this.liveMirrorPushTimer = setTimeout(() => {
            this.liveMirrorPushTimer = null;
            void this.pushLiveMirrors();
        }, LIVE_MIRROR_PUSH_DEBOUNCE_MS);
    }

    /** NAS + Storage 즉시 미러 — true면 회사 공유 저장 성공
     *  publishProductProcessing: 관리자가 상품/후가공을 저장할 때만 true
     */
    async pushLiveMirrors(options?: { publishProductProcessing?: boolean }): Promise<boolean> {
        if (!this.tenantId || this.isWebMirrorMode()) return false;
        if (this.shouldBlockOperationalNasWrite()) {
            console.warn('[DataService] live mirror push blocked — company NAS not ready/reconnect pending');
            return false;
        }
        const tenantId = this.tenantId;
        const publishProductProcessing = !!options?.publishProductProcessing;
        // NAS에 통째 덮어쓰기 금지 — 다른 PC의 더 최신(관리카드 내리기 등)이 유실됨
        let jobs = this.getAllJobs();
        try {
            const nasSnap = await jobArchiveService.readNasArchiveSnapshot(tenantId);
            if (nasSnap?.jobs?.length) {
                const merged = this.mergeJobsByUpdatedAt(nasSnap.jobs, jobs);
                const changed =
                    merged.length !== jobs.length ||
                    merged.some((j) => {
                        const local = jobs.find((x) => x.id === j.id);
                        if (!local) return true;
                        return (
                            this.jobTimestampMs(j) !== this.jobTimestampMs(local) ||
                            !!j.managementCardPinnedAt !== !!local.managementCardPinnedAt ||
                            !!j.boardHiddenAt !== !!local.boardHiddenAt
                        );
                    });
                jobs = merged;
                if (changed) {
                    this.applyImportedJobs(jobs);
                    if (this.isLocalPrimaryMode()) {
                        await this.persistAllToLocalDb().catch((err) =>
                            console.warn('[DataService] local db after NAS merge failed:', err)
                        );
                    }
                    this.notify();
                }
            }
        } catch (e) {
            console.warn('[DataService] NAS merge-before-push skipped:', e);
        }
        const staff = (this.data['staff'] || []) as Staff[];
        let clients = (this.data['clients'] || []) as Client[];
        const localSettingsSnapshot = { ...this.getSettingsObj() };
        let settings = { ...localSettingsSnapshot };
        // 다른 PC LWW + 상품/후가공은 관리자 게시가 아니면 NAS 값 강제 유지
        // 거래처: NAS와 merge-before-push + tombstone (stale PC가 삭제를 되돌리지 못하게)
        try {
            const nasSituation = await situationMirrorService.read(tenantId, true);
            if (nasSituation?.deletedClients?.length) {
                this.applyClientTombstonesFromMirror(nasSituation.deletedClients);
            }
            if (Array.isArray(nasSituation?.clients)) {
                const mergedClients = this.mergeClientsById(
                    nasSituation.clients as Client[],
                    clients
                );
                const clientsChanged =
                    mergedClients.length !== clients.length ||
                    mergedClients.some((c) => {
                        const local = clients.find((x) => x.id === c.id);
                        if (!local) return true;
                        return (
                            (c.rev || 0) !== (local.rev || 0) ||
                            (c.updatedAt || '') !== (local.updatedAt || '')
                        );
                    });
                clients = mergedClients;
                if (clientsChanged) {
                    this.data['clients'] = clients;
                    if (this.isLocalPrimaryMode()) {
                        await this.persistAllToLocalDb().catch((err) =>
                            console.warn('[DataService] local db after clients NAS merge failed:', err)
                        );
                    }
                    this.notify();
                }
            }
            if (nasSituation?.settings && typeof nasSituation.settings === 'object') {
                const nasSettings = nasSituation.settings as Record<string, unknown>;
                settings = this.mergeNasMasterSettingsForPush(settings, nasSettings);
                if (publishProductProcessing) {
                    // 관리자 상품/후가공 저장: 로컬 게시 의도를 NAS 병합 결과에 강제 반영
                    const localMeta = this.getSettingsMetaMap(localSettingsSnapshot);
                    const outMeta = this.getSettingsMetaMap(settings);
                    const nowIso = new Date().toISOString();
                    for (const key of DataService.PRODUCT_PROCESSING_SETTINGS) {
                        if (localSettingsSnapshot[key] !== undefined && localSettingsSnapshot[key] !== null) {
                            settings[key] = localSettingsSnapshot[key];
                            outMeta[key] = localMeta[key] || { updatedAt: nowIso };
                        }
                    }
                    settings.settingsMeta = outMeta;
                } else {
                    for (const key of DataService.PRODUCT_PROCESSING_SETTINGS) {
                        if (nasSettings[key] !== undefined && nasSettings[key] !== null) {
                            settings[key] = nasSettings[key];
                        }
                    }
                    const nasMeta = this.getSettingsMetaMap(nasSettings);
                    const outMeta = this.getSettingsMetaMap(settings);
                    for (const key of DataService.PRODUCT_PROCESSING_SETTINGS) {
                        if (nasMeta[key]) outMeta[key] = nasMeta[key];
                    }
                    settings.settingsMeta = outMeta;
                }
            }
        } catch (e) {
            console.warn('[DataService] settings/clients merge-before-push skipped:', e);
        }
        let archiveOk = false;
        let situationOk = false;
        let mirrorUpdatedAt: string | null = null;

        try {
            archiveOk = await jobArchiveService.syncLiveJobsMirror(tenantId, jobs);
            if (!archiveOk) {
                const gw = await this.getTrustedStoreGatewayUrl();
                if (gw) {
                    const { postJobsPartialViaGateway } = await import('./gatewayBridge');
                    const partial = await postJobsPartialViaGateway(gw, tenantId, jobs);
                    archiveOk = partial.ok;
                    if (archiveOk) this.companyNasChannel = 'gateway';
                }
            } else {
                this.companyNasChannel = 'local';
            }
        } catch (e) {
            console.warn('[DataService] live jobs mirror failed:', e);
        }

        try {
            const presenceFile = await presenceSessionService.read(tenantId, this.getStoreGatewayUrls());
            const presenceByUid = presenceFile?.sessions || {};
            const staffWithPresence = staff.map((s) => {
                const row = s as Staff & { uid?: string; isOnline?: boolean; online?: boolean; lastActive?: string };
                const uid = row.uid || row.id;
                const p = uid ? presenceByUid[uid] : null;
                if (!p) return row;
                return {
                    ...row,
                    isOnline: p.isOnline,
                    online: p.online,
                    lastActive: p.lastActive,
                };
            });
            const payload = situationMirrorService.buildPayload(tenantId, {
                jobs,
                clients: filterClientsByTombstones(clients, this.clientTombstones),
                settings,
                companyName: this.getCompanyInfo()?.name,
                kanbanLayout: this.getSettingsObj()?.kanbanLayout,
                statusDefinitions: this.getStatusDefinitions(),
                staff: staffWithPresence,
                deletedJobs: tombstoneMapToPayload(this.jobTombstones),
                deletedClients: clientTombstoneMapToPayload(this.clientTombstones),
            });
            mirrorUpdatedAt = payload.updatedAt;
            situationOk = await situationMirrorService.publish(tenantId, payload);
            if (!situationOk) {
                const gw = await this.getTrustedStoreGatewayUrl();
                if (gw) {
                    situationOk = await situationMirrorService.publishViaGateway(tenantId, payload, gw);
                    if (situationOk) this.companyNasChannel = 'gateway';
                }
            } else {
                this.companyNasChannel = 'local';
            }
        } catch (e) {
            console.warn('[DataService] situation mirror failed:', e);
        }

        const published = archiveOk || situationOk;
        if (published && mirrorUpdatedAt) {
            this.lastNasMirrorAt = mirrorUpdatedAt;
            // archive 파일 updatedAt 과 혼동하지 않도록 archive 마커는 성공 시에만 맞춤
            if (archiveOk) {
                try {
                    const snap = await jobArchiveService.readNasArchiveSnapshot(tenantId);
                    if (snap?.updatedAt) this.lastNasArchiveAt = snap.updatedAt;
                    else this.lastNasArchiveAt = mirrorUpdatedAt;
                } catch {
                    this.lastNasArchiveAt = mirrorUpdatedAt;
                }
            }
        }

        void this.refreshStoreGateway();
        return published;
    }

    private async refreshStoreGateway() {
        if (!this.getIsElectron() || !this.tenantId) return;
        // 회사 경로만 게이트웨이에 바인딩 — 다른 폴더 서비스 금지
        const root =
            getTenantArchiveRootFromSettings(this.getSettingsObj())?.trim() ||
            getEffectiveArchiveRootPath() ||
            null;
        if (!root) {
            await refreshLocalGateway(null, this.tenantId);
            return;
        }
        const info = await refreshLocalGateway(root, this.tenantId);
        const lanUrls = normalizeStoreGatewayUrls(info?.lanUrls || []);
        if (lanUrls.length === 0) return;
        // 게이트웨이가 회사 경로를 서비스할 때만 Firestore에 허브 URL 게시
        if (info?.archiveRoot && !this.pathsEqualIgnoreSlash(info.archiveRoot, root)) {
            console.warn('[DataService] skip storeGatewayUrl publish — gateway root ≠ company path');
            return;
        }

        const currentUrls = this.getStoreGatewayUrls();
        const urlsChanged =
            lanUrls.length !== currentUrls.length ||
            lanUrls.some((url, index) => url !== currentUrls[index]);

        if (urlsChanged) {
            this.lastPublishedGatewayUrls = lanUrls;
            await this.saveStoreGatewayUrls(lanUrls).catch((e) =>
                console.warn('[DataService] auto storeGatewayUrl save failed:', e)
            );
        } else if (
            lanUrls.length !== this.lastPublishedGatewayUrls.length ||
            lanUrls.some((url, index) => url !== this.lastPublishedGatewayUrls[index])
        ) {
            this.lastPublishedGatewayUrls = lanUrls;
        }
    }

    /** 회사 NAS 경로를 서비스하는 게이트웨이만 반환 (불일치면 null) */
    private async getTrustedStoreGatewayUrl(): Promise<string | null> {
        const gw = this.getStoreGatewayUrls();
        const companyPath =
            getTenantArchiveRootFromSettings(this.getSettingsObj())?.trim() ||
            getEffectiveArchiveRootPath();
        if (gw.length === 0 || !companyPath) return null;
        const { resolveTrustedStoreGatewayUrl } = await import('./gatewayBridge');
        return resolveTrustedStoreGatewayUrl(gw, companyPath, this.tenantId);
    }

    private stopNasMirrorPolling() {
        if (this.nasPollTimer) {
            clearInterval(this.nasPollTimer);
            this.nasPollTimer = null;
        }
    }

    private applyImportedJobs(jobs: Job[]) {
        this.operationalJobs = [];
        this.kanbanCompletedJobs = [];
        this.supplementaryJobs = [];
        for (const job of this.handleJobsMigrationInMemory(jobs)) {
            this.placeJobInLocalCache(job);
        }
        this.rebuildMergedJobs();
    }

    private async loadLocalPrimaryData(): Promise<boolean> {
        if (!this.tenantId || !this.isLocalPrimaryMode()) return false;
        const bundle = await localDbBridge.loadTenant(this.tenantId);
        const hasAux =
            (bundle.quotes?.length || 0) > 0 ||
            (bundle.papers?.length || 0) > 0 ||
            (bundle.leaves?.length || 0) > 0 ||
            (bundle.instructions?.length || 0) > 0;
        const hasData =
            bundle.jobCount > 0 || bundle.clients.length > 0 || !!bundle.settings || hasAux;
        if (!hasData) return false;

        if (bundle.jobs.length > 0) {
            const filtered = filterJobsByTombstones(
                bundle.jobs,
                this.jobTombstones,
                (job) => this.jobTimestampMs(job)
            );
            this.applyImportedJobs(filtered);
        }
        if (bundle.clients.length > 0) this.data['clients'] = bundle.clients;
        if (bundle.settings) {
            this.data['settings'] = [bundle.settings];
            this.applySettingsDefaultsMerge(bundle.settings);
        }
        if (bundle.quotes?.length) this.data['quotes'] = bundle.quotes;
        if (bundle.papers?.length) this.data['papers'] = bundle.papers;
        if (bundle.leaves?.length) this.data['leaves'] = bundle.leaves;
        if (bundle.instructions?.length) this.data['instructions'] = bundle.instructions;
        this.notify();
        return true;
    }

    private async persistAllToLocalDb(): Promise<void> {
        if (!this.tenantId || !this.isLocalPrimaryMode()) return;
        const okJobs = await localDbBridge.saveJobs(this.tenantId, this.getAllJobs());
        const okClients = await localDbBridge.saveClients(this.tenantId, (this.data['clients'] || []) as Client[]);
        const okSettings = await localDbBridge.saveSettings(this.tenantId, this.getSettingsObj());
        const okQuotes = await localDbBridge.saveAuxCollection(
            this.tenantId,
            'quotes',
            (this.data['quotes'] || []) as unknown[]
        );
        const okPapers = await localDbBridge.saveAuxCollection(
            this.tenantId,
            'papers',
            (this.data['papers'] || []) as unknown[]
        );
        const okLeaves = await localDbBridge.saveAuxCollection(
            this.tenantId,
            'leaves',
            (this.data['leaves'] || []) as unknown[]
        );
        const okInstructions = await localDbBridge.saveAuxCollection(
            this.tenantId,
            'instructions',
            (this.data['instructions'] || []) as unknown[]
        );
        if (
            !okJobs ||
            !okClients ||
            !okSettings ||
            !okQuotes ||
            !okPapers ||
            !okLeaves ||
            !okInstructions
        ) {
            throw new Error('local-db-full-save-failed');
        }
    }

    private async tryHydrateFromMirrors(): Promise<boolean> {
        if (!this.tenantId) return false;
        if (!this.getIsElectron()) {
            return this.tryHydrateFromWebMirror();
        }
        try {
            const situation = await situationMirrorService.readFromNas(this.tenantId);
            if (situation && this.applyMirrorPayload(situation)) {
                return true;
            }
        } catch {
            // ignore
        }
        try {
            const archived = (await jobArchiveService.readNasArchiveSnapshot(this.tenantId))?.jobs || [];
            if (archived.length > 0) {
                const filtered = filterJobsByTombstones(
                    archived,
                    this.jobTombstones,
                    (job) => this.jobTimestampMs(job)
                );
                this.applyImportedJobs(filtered);
                this.notify();
                return true;
            }
        } catch {
            // ignore
        }
        return false;
    }

    private async pullOperationalCloudData() {
        if (!this.tenantId) return;
        // settings만 상시 클라우드. clients는 Firestore에 상시 두지 않음 (대량 → NAS/로컬)
        await this.pullCollectionDocs('settings');

        if (this.isLocalPrimaryMode()) {
            // 로컬 SQLite에 거래처가 비어 있을 때만 예전 Firestore 데이터를 1회 이관
            if (((this.data['clients'] || []) as Client[]).length === 0) {
                try {
                    await this.pullCollectionDocs('clients');
                    console.log('[DataService] legacy Firestore clients imported for local/NAS migration');
                } catch (e) {
                    console.warn('[DataService] legacy clients cloud pull skipped:', e);
                }
            }
            await this.pullJobsHot();
            return;
        }

        const fromMirror = await this.tryHydrateFromWebMirror();
        if (!fromMirror) {
            console.warn('[DataService] web NAS mirror hydrate failed — Firestore jobs/clients skipped');
        }
    }

    private startNasMirrorPolling() {
        if (!this.tenantId) return;
        this.stopNasMirrorPolling();
        const pollMs = this.getIsElectron() ? APP_MIRROR_POLL_MS : WEB_MIRROR_POLL_MS;
        this.nasPollTimer = window.setInterval(() => {
            void this.pollNasOperationalSync();
        }, pollMs);
        void this.pollNasOperationalSync();
    }

    private jobTimestampMs(job: Job): number {
        const row = job as Job & { updatedAt?: string };
        const raw = row.updatedAt || job.createdAt;
        if (!raw) return 0;
        const ms = new Date(raw).getTime();
        return Number.isFinite(ms) ? ms : 0;
    }

    /** 업무 마스터 설정 — NAS situation-mirror SSOT (Firestore 저장·pull 덮어쓰기 금지) */
    private static readonly NAS_MASTER_SETTINGS = [
        'productDefinitions',
        'processingDefinitions',
        'statusDefinitions',
        'kanbanLayout',
        'pricing',
        'roles',
        'companyInfo',
        'smsConfig',
        'quoteTemplate',
    ] as const;

    /** 상품·후가공만 — 작업 push로 절대 덮지 않음, 관리자 저장 시에만 게시 */
    private static readonly PRODUCT_PROCESSING_SETTINGS = [
        'productDefinitions',
        'processingDefinitions',
    ] as const;

    setSessionCapabilities(caps: { canManageProductProcessing?: boolean }) {
        if (typeof caps.canManageProductProcessing === 'boolean') {
            this.sessionCanManageProductProcessing = caps.canManageProductProcessing;
        }
    }

    private isProductProcessingSetting(name: string): boolean {
        return (DataService.PRODUCT_PROCESSING_SETTINGS as readonly string[]).includes(name);
    }

    /** Firestore/클라우드 전용 — NAS 미러로 덮지 않음 (경로·게이트웨이 등) */
    private static readonly MIRROR_PROTECTED_SETTINGS = [
        'archiveRootPath',
        'storeGatewayUrl',
        'storeGatewayUrls',
        'tenantArchiveRootPath',
    ] as const;

    private isNasMasterSetting(name: string): boolean {
        return (DataService.NAS_MASTER_SETTINGS as readonly string[]).includes(name);
    }

    private getSettingsMetaMap(settings: Record<string, unknown>): Record<string, { updatedAt?: string }> {
        const raw = settings.settingsMeta;
        if (!raw || typeof raw !== 'object') return {};
        return { ...(raw as Record<string, { updatedAt?: string }>) };
    }

    private settingsKeyUpdatedAtMs(settings: Record<string, unknown>, key: string): number {
        const stamp = this.getSettingsMetaMap(settings)[key]?.updatedAt;
        if (!stamp) return 0;
        const ms = Date.parse(stamp);
        return Number.isFinite(ms) ? ms : 0;
    }

    /**
     * 작업 저장 push가 다른 PC의 옛 후가공/상품 설정으로 NAS를 덮지 않도록
     * settingsMeta(키별 updatedAt) LWW 병합.
     */
    private mergeNasMasterSettingsForPush(
        local: Record<string, unknown>,
        nas: Record<string, unknown>
    ): Record<string, unknown> {
        const result: Record<string, unknown> = { ...local };
        const localMeta = this.getSettingsMetaMap(local);
        const nasMeta = this.getSettingsMetaMap(nas);
        const outMeta: Record<string, { updatedAt?: string }> = { ...nasMeta, ...localMeta };

        for (const key of DataService.NAS_MASTER_SETTINGS) {
            const lTs = this.settingsKeyUpdatedAtMs(local, key);
            const nTs = this.settingsKeyUpdatedAtMs(nas, key);
            if (nTs > lTs && nas[key] !== undefined && nas[key] !== null) {
                result[key] = nas[key];
                if (nasMeta[key]) outMeta[key] = nasMeta[key];
            } else if (lTs > nTs && local[key] !== undefined) {
                result[key] = local[key];
                if (localMeta[key]) outMeta[key] = localMeta[key];
            } else if (lTs === 0 && nTs === 0) {
                // 메타 없음(레거시): 로컬 값이 있으면 유지 — 빈 로컬만 NAS로 채움
                if (local[key] === undefined || local[key] === null) {
                    if (nas[key] !== undefined && nas[key] !== null) result[key] = nas[key];
                } else {
                    result[key] = local[key];
                }
            } else {
                result[key] = local[key] !== undefined ? local[key] : nas[key];
                if (localMeta[key]) outMeta[key] = localMeta[key];
            }
        }
        result.settingsMeta = outMeta;
        return result;
    }

    private mergeSettingsFromMirror(
        incoming: Record<string, unknown>,
        mirrorCompanyName?: string,
        mirrorUpdatedAt?: string
    ): void {
        if (mirrorCompanyName?.trim()) {
            this.mirrorCompanyName = mirrorCompanyName.trim();
        }
        const current = this.getSettingsObj();
        const incomingCompany = (incoming.companyInfo as Record<string, unknown> | undefined) || {};
        const currentCompany = (current.companyInfo as Record<string, unknown> | undefined) || {};
        const merged: Record<string, unknown> = { ...current };
        const curMeta = this.getSettingsMetaMap(current);
        const inMeta = this.getSettingsMetaMap(incoming);
        const outMeta: Record<string, { updatedAt?: string }> = { ...curMeta };
        const mirrorFallbackTs = mirrorUpdatedAt && Date.parse(mirrorUpdatedAt) ? mirrorUpdatedAt : undefined;

        for (const [key, value] of Object.entries(incoming)) {
            if (key === 'settingsMeta') continue;
            if ((DataService.MIRROR_PROTECTED_SETTINGS as readonly string[]).includes(key)) {
                if (current[key] === undefined || current[key] === null) {
                    merged[key] = value;
                }
            } else if (this.isProductProcessingSetting(key)) {
                // 상품·후가공 — NAS SSOT이지만, 로컬이 더 최신이면 유지
                // (저장 직후 폴이 옛 NAS로 덮어 ‘추가는 안 되고 삭제만 된다’ 현상 방지)
                if (value === undefined || value === null) continue;
                const curTs = this.settingsKeyUpdatedAtMs(current, key);
                let inTs = this.settingsKeyUpdatedAtMs(incoming, key);
                if (inTs === 0 && mirrorFallbackTs) {
                    inTs = Date.parse(mirrorFallbackTs) || 0;
                }
                if (inTs > curTs || curTs === 0) {
                    merged[key] = value;
                    outMeta[key] =
                        inMeta[key] ||
                        (mirrorFallbackTs
                            ? { updatedAt: mirrorFallbackTs }
                            : { updatedAt: new Date().toISOString() });
                }
                // else: 로컬(방금 추가/수정)이 더 최신 — 유지
            } else if (this.isNasMasterSetting(key)) {
                if (value === undefined || value === null) continue;
                const curTs = this.settingsKeyUpdatedAtMs(current, key);
                let inTs = this.settingsKeyUpdatedAtMs(incoming, key);
                // 미러에 키 메타가 없으면 situation.updatedAt으로 보조 (레거시 NAS)
                if (inTs === 0 && mirrorFallbackTs) {
                    inTs = Date.parse(mirrorFallbackTs) || 0;
                }
                if (inTs > curTs || curTs === 0) {
                    merged[key] = value;
                    outMeta[key] = inMeta[key] || (mirrorFallbackTs ? { updatedAt: mirrorFallbackTs } : { updatedAt: new Date().toISOString() });
                }
                // else: 로컬이 더 최신 — 유지
            } else {
                merged[key] = value;
            }
        }
        for (const [k, v] of Object.entries(inMeta)) {
            const curTs = Date.parse(outMeta[k]?.updatedAt || '') || 0;
            const inTs = Date.parse(v?.updatedAt || '') || 0;
            if (inTs > curTs) outMeta[k] = v;
        }
        merged.settingsMeta = outMeta;
        merged.companyInfo = {
            ...this.extractLegacyCompanyFields(current),
            ...this.extractLegacyCompanyFields(incoming),
            ...currentCompany,
            ...incomingCompany,
            name:
                (incomingCompany.name as string | undefined)?.trim() ||
                (currentCompany.name as string | undefined)?.trim() ||
                this.mirrorCompanyName ||
                (current.name as string | undefined)?.trim() ||
                'EzPrintWork',
        };
        this.data['settings'] = [merged];
        this.applySettingsDefaultsMerge(merged);
        this.emitProductProcessingSyncNotice(current, merged);
    }

    private productProcessingFingerprint(settings: Record<string, unknown>): string {
        try {
            return JSON.stringify({
                product: settings.productDefinitions ?? null,
                processing: settings.processingDefinitions ?? null,
            });
        } catch {
            return '';
        }
    }

    /** 다른 PC에서 상품/후가공이 바뀌면 안내 — 동일 데이터 유지 */
    private emitProductProcessingSyncNotice(
        before: Record<string, unknown>,
        after: Record<string, unknown>
    ): void {
        const prev = this.productProcessingFingerprint(before);
        const next = this.productProcessingFingerprint(after);
        if (!next || prev === next) {
            this.lastProductProcessingFingerprint = next || this.lastProductProcessingFingerprint;
            return;
        }
        const isFirst = this.lastProductProcessingFingerprint === null;
        this.lastProductProcessingFingerprint = next;
        if (isFirst || !prev) return;
        if (typeof window === 'undefined') return;
        window.dispatchEvent(
            new CustomEvent('ezpw-product-processing-updated', {
                detail: {
                    message:
                        '회사 상품/후가공 설정이 갱신되었습니다. 화면이 자동 반영됩니다. 목록이 다르면 NAS 연결을 확인하거나 앱을 다시 시작해 주세요.',
                },
            })
        );
    }

    private extractLegacyCompanyFields(settings: Record<string, unknown>): Partial<CompanyInfo> {
        const fields: (keyof CompanyInfo)[] = [
            'name',
            'ceoName',
            'businessNumber',
            'address',
            'phone',
            'fax',
            'email',
            'bankAccount',
        ];
        const out: Partial<CompanyInfo> = {};
        for (const key of fields) {
            const value = settings[key];
            if (typeof value === 'string' && value.trim()) {
                out[key] = value.trim();
            }
        }
        return out;
    }

    private mergeJobsByUpdatedAt(current: Job[], incoming: Job[]): Job[] {
        const tombstones = this.jobTombstones;
        const map = new Map<string, Job>();
        for (const job of filterJobsByTombstones(current, tombstones, (j) => this.jobTimestampMs(j))) {
            if (job?.id) map.set(job.id, job);
        }
        for (const job of incoming) {
            if (!job?.id) continue;
            if (isJobTombstoned(job.id, tombstones, this.jobTimestampMs(job))) {
                continue;
            }
            const prev = map.get(job.id);
            if (!prev) {
                map.set(job.id, job);
                continue;
            }
            const useIncoming = isIncomingJobNewer(job, prev);
            let merged: Job;
            if (useIncoming) {
                merged = applyIncomingJobVisibilityClears(
                    { ...prev, ...job } as Record<string, unknown>,
                    job as unknown as Record<string, unknown>
                ) as Job;
            } else {
                merged = { ...prev };
            }
            map.set(job.id, mergeJobVisibilityFields(merged, prev, job));
        }
        return Array.from(map.values());
    }

    private recordJobTombstone(jobId: string): void {
        if (!this.tenantId || !jobId) return;
        this.jobTombstones.set(jobId, Date.now());
        saveJobTombstoneMap(this.tenantId, this.jobTombstones);
    }

    private applyJobTombstonesFromMirror(list: JobTombstone[]): void {
        if (!list?.length) return;
        let changed = false;
        for (const row of list) {
            if (!row?.id || !row.deletedAt) continue;
            const ms = Date.parse(row.deletedAt);
            if (!Number.isFinite(ms)) continue;
            const prev = this.jobTombstones.get(row.id) || 0;
            if (ms > prev) {
                this.jobTombstones.set(row.id, ms);
                changed = true;
            }
        }
        if (changed) {
            if (this.tenantId) saveJobTombstoneMap(this.tenantId, this.jobTombstones);
            this.purgeTombstonedJobsFromCaches();
        }
    }

    private purgeTombstonedJobsFromCaches(): void {
        const filter = (jobs: Job[]) =>
            filterJobsByTombstones(jobs, this.jobTombstones, (j) => this.jobTimestampMs(j));
        this.operationalJobs = filter(this.operationalJobs);
        this.kanbanCompletedJobs = filter(this.kanbanCompletedJobs);
        this.supplementaryJobs = filter(this.supplementaryJobs);
        this.archivedJobs = filter(this.archivedJobs);
        this.rebuildMergedJobs();
        this.rebuildArchiveMergedJobs();
    }

    private applySituationMirrorMeta(situation: {
        clients?: Client[];
        deletedClients?: ClientTombstone[];
        settings?: Record<string, unknown>;
        updatedAt?: string;
        companyName?: string;
    }) {
        if (situation.deletedClients?.length) {
            this.applyClientTombstonesFromMirror(situation.deletedClients);
        }
        if (Array.isArray(situation.clients)) {
            // 통째 교체 금지 — 로컬 신규 유지 + tombstone으로 삭제 유지
            this.data['clients'] = this.mergeClientsById(
                (this.data['clients'] || []) as Client[],
                situation.clients as Client[]
            );
        } else if (situation.deletedClients?.length) {
            this.purgeTombstonedClientsFromCache();
        }
        if (situation.settings && typeof situation.settings === 'object') {
            this.mergeSettingsFromMirror(
                situation.settings as Record<string, unknown>,
                situation.companyName,
                situation.updatedAt
            );
        } else if (situation.companyName?.trim()) {
            this.mirrorCompanyName = situation.companyName.trim();
        }
    }

    private recordClientTombstone(clientId: string): void {
        if (!this.tenantId || !clientId) return;
        this.clientTombstones.set(clientId, Date.now());
        saveClientTombstoneMap(this.tenantId, this.clientTombstones);
    }

    private applyClientTombstonesFromMirror(list: ClientTombstone[]): void {
        if (!list?.length) return;
        let changed = false;
        for (const row of list) {
            if (!row?.id || !row.deletedAt) continue;
            const ms = Date.parse(row.deletedAt);
            if (!Number.isFinite(ms)) continue;
            const prev = this.clientTombstones.get(row.id) || 0;
            if (ms > prev) {
                this.clientTombstones.set(row.id, ms);
                changed = true;
            }
        }
        if (changed) {
            if (this.tenantId) saveClientTombstoneMap(this.tenantId, this.clientTombstones);
            this.purgeTombstonedClientsFromCache();
        }
    }

    private purgeTombstonedClientsFromCache(): void {
        const current = (this.data['clients'] || []) as Client[];
        this.data['clients'] = filterClientsByTombstones(current, this.clientTombstones);
    }

    private nextClientOrder(): number {
        const clients = (this.data['clients'] || []) as Client[];
        let max = -1;
        for (const c of clients) {
            if (typeof c.order === 'number' && Number.isFinite(c.order) && c.order > max) {
                max = c.order;
            }
        }
        return max + 1;
    }

    private enrichClientFields(base: Client, overlay: Client): Client {
        return {
            ...base,
            ...overlay,
            name: (overlay.name || base.name || '').trim() || base.name,
            contactPerson: overlay.contactPerson?.trim() ? overlay.contactPerson : base.contactPerson,
            phone: overlay.phone?.trim() ? overlay.phone : base.phone,
            email: overlay.email?.trim() ? overlay.email : base.email,
            address: overlay.address?.trim() ? overlay.address : base.address,
            note: overlay.note?.trim() ? overlay.note : base.note,
            businessRegistrationNumber:
                overlay.businessRegistrationNumber?.trim()
                    ? overlay.businessRegistrationNumber
                    : base.businessRegistrationNumber,
            contacts:
                overlay.contacts?.length &&
                overlay.contacts.some((x) => x.name?.trim() || x.phone?.trim())
                    ? overlay.contacts
                    : base.contacts || [],
            sendSmsOnComplete:
                overlay.sendSmsOnComplete !== undefined
                    ? overlay.sendSmsOnComplete
                    : base.sendSmsOnComplete,
            customSmsNumber: overlay.customSmsNumber?.trim()
                ? overlay.customSmsNumber
                : base.customSmsNumber,
            prepaidBalance: overlay.prepaidBalance ?? base.prepaidBalance,
            prepaidLedger:
                overlay.prepaidLedger && overlay.prepaidLedger.length > 0
                    ? overlay.prepaidLedger
                    : base.prepaidLedger,
            rev: overlay.rev ?? base.rev,
            updatedAt: overlay.updatedAt || base.updatedAt,
            createdAt: overlay.createdAt || base.createdAt,
            order: overlay.order ?? base.order,
        };
    }

    /** 거래처 id 병합 — tombstone 제외 + rev/시각 LWW + 빈 필드 보강 */
    private mergeClientsById(current: Client[], incoming: Client[]): Client[] {
        const tombstones = this.clientTombstones;
        const map = new Map<string, Client>();

        const put = (c: Client) => {
            if (!c?.id) return;
            if (isClientTombstoned(c.id, tombstones, clientTimestampMs(c))) return;
            const prev = map.get(c.id);
            if (!prev) {
                map.set(c.id, { ...c });
                return;
            }
            if (isIncomingClientNewer(c, prev)) {
                map.set(c.id, this.enrichClientFields(prev, c));
            } else {
                map.set(c.id, this.enrichClientFields(c, prev));
            }
        };

        for (const c of current) put(c);
        for (const c of incoming) put(c);
        return Array.from(map.values()).sort((a, b) => {
            const oa = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
            const ob = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
            if (oa !== ob) return oa - ob;
            return (a.name || '').localeCompare(b.name || '', 'ko');
        });
    }

    private applySituationMirrorJobsPartial(jobs: Job[]) {
        if (!jobs.length) return;
        const current = this.getAllJobs();
        const incoming = this.handleJobsMigrationInMemory(jobs).filter((job) => !!job?.id);
        const incomingById = new Map<string, Job>();
        for (const job of incoming) incomingById.set(job.id!, job);

        // 보드에 보이는 범위 — 미러에서 빠진 보드 작업 수렴용
        // 관리카드/숨김 작업도 incoming에 있으면 반드시 머지(내리기 동기화)
        const boardIds = new Set(
            filterJobsForOperationalBoard(current, { includeStatusKeys: ['QUOTE'] })
                .map((job) => job.id)
                .filter(Boolean)
        );

        const mergeOne = (local: Job, mirrored: Job): Job => {
            const useIncoming = isIncomingJobNewer(mirrored, local);
            let merged: Job;
            if (useIncoming) {
                merged = applyIncomingJobVisibilityClears(
                    { ...local, ...mirrored } as Record<string, unknown>,
                    mirrored as unknown as Record<string, unknown>
                ) as Job;
            } else {
                merged = { ...local };
            }
            return mergeJobVisibilityFields(merged, local, mirrored);
        };

        const next: Job[] = [];
        for (const job of current) {
            if (!job?.id) continue;
            if (isJobTombstoned(job.id, this.jobTombstones, this.jobTimestampMs(job))) {
                continue;
            }
            const mirrored = incomingById.get(job.id);
            if (mirrored) {
                next.push(mergeOne(job, mirrored));
                incomingById.delete(job.id);
                continue;
            }
            if (!boardIds.has(job.id)) {
                // 관리카드 등 — 미러에 없어도 로컬 유지(다른 PC가 아직 안 올린 경우)
                next.push(job);
                continue;
            }
            // boardIds에 있고 mirrored에 없으면 원격에서 빠진 것으로 간주하고 제거(수렴 목적)
        }

        for (const mirrored of incomingById.values()) {
            if (!isJobTombstoned(mirrored.id, this.jobTombstones, this.jobTimestampMs(mirrored))) {
                next.push(mirrored);
            }
        }

        this.applyImportedJobs(next);
    }

    private async pollNasOperationalSync() {
        if (!this.tenantId || document.visibilityState !== 'visible') return;
        try {
            let changed = false;
            let mergedJobs: Job[] | null = null;

            const takeJobs = () => mergedJobs ?? this.getAllJobs();

            const archiveSnap = this.getIsElectron()
                ? await jobArchiveService.readNasArchiveSnapshot(this.tenantId)
                : null;

            if (
                archiveSnap?.updatedAt &&
                archiveSnap.updatedAt !== this.lastNasArchiveAt
            ) {
                this.lastNasArchiveAt = archiveSnap.updatedAt;
                if (archiveSnap.jobs.length > 0) {
                    mergedJobs = this.mergeJobsByUpdatedAt(takeJobs(), archiveSnap.jobs);
                    changed = true;
                }
            }

            const situation = this.getIsElectron()
                ? (await situationMirrorService.readFromNas(this.tenantId)) ||
                  (await (async () => {
                      const gw = await this.getTrustedStoreGatewayUrl();
                      return gw
                          ? situationMirrorService.readViaGatewayOnly(this.tenantId!, gw)
                          : null;
                  })())
                : await this.fetchWebMirrorPayload();

            if (situation?.updatedAt && situation.updatedAt !== this.lastNasMirrorAt) {
                this.lastNasMirrorAt = situation.updatedAt;

                if (situation.deletedJobs?.length) {
                    this.applyJobTombstonesFromMirror(situation.deletedJobs);
                    changed = true;
                }

                if (
                    Array.isArray(situation.clients) ||
                    (situation.deletedClients?.length || 0) > 0 ||
                    (situation.settings && Object.keys(situation.settings).length > 0)
                ) {
                    this.applySituationMirrorMeta(situation);
                    changed = true;
                }

                if (changed && !this.getIsElectron()) {
                    this.webMirrorReady = true;
                }
            }

            // 관리카드·보드숨김 — 미러 updatedAt이 같아도 매 폴링마다 병합
            // (직원 PC가 칸반만 옮겨 rev가 높으면 핀을 놓치는 문제 방지)
            if (situation?.jobs?.length) {
                mergedJobs = this.mergeJobsByUpdatedAt(takeJobs(), situation.jobs);
                changed = true;
            }

            if (mergedJobs) {
                this.applyImportedJobs(mergedJobs);
            }

            if (changed) {
                if (!this.getIsElectron()) {
                    this.lastMirrorReceivedAt = new Date().toISOString();
                }
                if (this.isLocalPrimaryMode()) {
                    await this.persistAllToLocalDb().catch((e) =>
                        console.warn('[DataService] local db sync after NAS poll failed:', e)
                    );
                }
                this.notify();
            }

            // 사내 채팅은 별도 NAS 파일
            if (await this.pollChatMirror()) {
                this.notify();
            }

            // 견적·용지·휴가·지시 — 별도 NAS JSON
            let auxChanged = false;
            for (const col of AUX_COLLECTION_NAMES) {
                const before = JSON.stringify(this.data[col] || []);
                await this.hydrateAuxCollectionFromNas(col);
                if (JSON.stringify(this.data[col] || []) !== before) auxChanged = true;
            }
            if (auxChanged) this.notify();
        } catch (e) {
            console.warn('[DataService] NAS operational poll skipped:', e);
        }
    }

    private isLocalOperationalCollection(col: string): boolean {
        return (
            col === 'jobs' ||
            col === 'clients' ||
            col === 'quotes' ||
            col === 'papers' ||
            col === 'leaves' ||
            col === 'instructions'
        );
    }

    private isAuxCollection(col: string): col is AuxCollectionName {
        return (AUX_COLLECTION_NAMES as readonly string[]).includes(col);
    }

    private async persistToLocalCollection(col: string, entity: any) {
        if (!this.tenantId || !this.isLocalPrimaryMode()) return;
        if (col === 'jobs') {
            const ok = await localDbBridge.upsertJob(this.tenantId, entity as Job);
            if (!ok) throw new Error('local-db-job-upsert-failed');
        } else if (col === 'clients') {
            const ok = await localDbBridge.upsertClient(this.tenantId, entity);
            if (!ok) throw new Error('local-db-client-upsert-failed');
        } else if (this.isAuxCollection(col)) {
            const ok = await localDbBridge.upsertAuxEntity(this.tenantId, col, entity);
            if (!ok) throw new Error(`local-db-${col}-upsert-failed`);
        }
    }

    private async persistAuxCollectionToNas(col: AuxCollectionName): Promise<boolean> {
        if (!this.tenantId) return false;
        const items = ((this.data[col] || []) as Array<Record<string, unknown>>).filter((r) => !!r?.id);
        const deletedItems = auxTombstoneMapToPayload(this.auxTombstones[col]);
        return auxCollectionMirrorService.publish(this.tenantId, col, items, deletedItems);
    }

    private recordAuxTombstone(col: AuxCollectionName, id: string): void {
        if (!this.tenantId || !id) return;
        this.auxTombstones[col].set(id, Date.now());
        saveAuxTombstoneMap(this.tenantId, col, this.auxTombstones[col]);
    }

    private stopSyncPulse() {
        if (this.syncPulseUnsub) {
            this.syncPulseUnsub();
            this.syncPulseUnsub = null;
        }
        if (this.configPollTimer) {
            clearInterval(this.configPollTimer);
            this.configPollTimer = null;
        }
    }

    /** 로컬/웹 — Firestore onSnapshot pulse 대신 staff/settings 저빈도 폴링 */
    private startConfigPolling() {
        if (this.configPollTimer) {
            clearInterval(this.configPollTimer);
            this.configPollTimer = null;
        }
        const tick = async () => {
            if (!this.tenantId) return;
            try {
                await this.pullCollectionDocs('staff');
                await this.pullCollectionDocs('settings');
                this.notify();
            } catch (e) {
                console.warn('[DataService] config poll failed:', e);
            }
        };
        this.configPollTimer = setInterval(() => void tick(), 3 * 60_000);
    }

    private stopAllLazySync() {
        this.activeLazyCollections.clear();
        this.lazyCollectionsLoaded.clear();
    }

    private stopPaymentJobsSync() {
        this.paymentJobsLoaded = false;
    }

    private async restoreActiveLazyPulls() {
        for (const col of this.activeLazyCollections) {
            await this.pullLazyCollection(col, true);
        }
    }

    private getSyncPulseRef() {
        return doc(firestore, 'tenants', this.tenantId!, 'sync', 'pulse');
    }

    private markLocalPulse(field: string, at: string) {
        this.localPulseMarkers.set(field, at);
        window.setTimeout(() => {
            if (this.localPulseMarkers.get(field) === at) {
                this.localPulseMarkers.delete(field);
            }
        }, 2500);
    }

    private isLocalPulse(field: string, at?: string | null): boolean {
        if (!at) return false;
        return this.localPulseMarkers.get(field) === at;
    }

    private async bumpSyncPulse(patch: Record<string, unknown>) {
        if (!this.tenantId || (this.isWebMirrorMode() && !this.isSyncAdmin())) return;
        // 로컬/웹 — 업무 동기화는 NAS 폴링. Firestore pulse는 staff/settings 등 저빈도만 유지
        if (this.isLocalPrimaryMode() || this.isWebMirrorMode()) {
            const allowed = ['staffAt', 'settingsAt', 'archiveRootAt', 'quotesAt', 'leavesAt', 'papersAt', 'instructionsAt'];
            const filtered: Record<string, unknown> = {};
            for (const key of allowed) {
                if (key in patch) filtered[key] = patch[key];
            }
            if (Object.keys(filtered).length === 0) return;
            patch = filtered;
        }
        if (this.isLocalPrimaryMode() && ('jobsAt' in patch || 'jobRev' in patch || 'jobBatchRev' in patch)) {
            return;
        }
        const now = new Date().toISOString();
        const payload: Record<string, unknown> = { ...patch, pulseAt: now };
        for (const key of ['jobsAt', 'staffAt', 'clientsAt', 'settingsAt', 'quotesAt', 'messagesAt', 'leavesAt', 'papersAt', 'instructionsAt', 'mirrorAt', 'archiveRootAt'] as const) {
            if (key in patch) this.markLocalPulse(key, String(patch[key]));
        }
        if (patch.jobRev && typeof patch.jobRev === 'object' && patch.jobRev !== null && 'at' in (patch.jobRev as object)) {
            this.markLocalPulse('jobRev', String((patch.jobRev as { at: string }).at));
        }
        if (patch.jobBatchRev && typeof patch.jobBatchRev === 'object' && patch.jobBatchRev !== null && 'at' in (patch.jobBatchRev as object)) {
            this.markLocalPulse('jobRev', String((patch.jobBatchRev as { at: string }).at));
        }
        try {
            await setDoc(this.getSyncPulseRef(), stripUndefinedForFirestore(payload), { merge: true });
        } catch (e) {
            console.warn('[DataService] sync pulse bump failed:', e);
        }
    }

    private async bumpMirrorSyncPulse() {
        // NAS 폴링(1~2초)이 이미 대체 — Firestore mirrorAt 쓰기 제거
        return;
    }

    private async bumpJobSyncPulse(jobId: string, op: 'upsert' | 'delete') {
        const now = new Date().toISOString();
        this.lastLocalJobWriteAt = Date.now();
        await this.bumpSyncPulse({
            jobsAt: now,
            jobRev: { id: jobId, op, at: now },
        });
    }

    private async bumpJobBatchSyncPulse(jobIds: string[]) {
        if (jobIds.length === 0) return;
        const now = new Date().toISOString();
        this.lastLocalJobWriteAt = Date.now();
        if (jobIds.length === 1) {
            await this.bumpJobSyncPulse(jobIds[0], 'upsert');
            return;
        }
        await this.bumpSyncPulse({
            jobsAt: now,
            jobBatchRev: { ids: jobIds, op: 'upsert', at: now },
        });
    }

    private async pullCollectionDocs(colName: string) {
        if (!this.tenantId) return;
        const colRef = collection(firestore, 'tenants', this.tenantId, colName);
        const snap = await getDocs(colRef);
        const list: any[] = [];
        snap.forEach((docSnap) => list.push({ ...docSnap.data(), id: docSnap.id }));
        this.handleCollectionData(colName, list);

        if (colName === 'staff') {
            this.scheduleStaffDedupe();
            const companyName = this.getCompanyInfo()?.name?.trim();
            const isChuncheonTenant =
                this.tenantId === 'tenant-or73mu1cz' || companyName === '춘천인쇄';
            if (isChuncheonTenant) {
                const originalLength = this.data['staff'].length;
                this.data['staff'] = this.data['staff'].filter((s: any) => s.id !== 'dev-admin');
                if (this.data['staff'].length !== originalLength) {
                    try {
                        await deleteDoc(doc(firestore, 'tenants', this.tenantId, 'staff', 'dev-admin'));
                    } catch (e) {
                        console.error('Failed to delete dev-admin from Firestore:', e);
                    }
                }
            }
        }
    }

    private async pullJoinRequests() {
        if (!this.tenantId) return;
        try {
            const snap = await getDocs(collection(firestore, 'tenants', this.tenantId, 'joinRequests'));
            const list: JoinRequest[] = [];
            snap.forEach((docSnap) => list.push({ ...docSnap.data(), id: docSnap.id } as JoinRequest));
            this.data['joinRequests'] = list;
        } catch (err) {
            console.warn('[DataService] joinRequests pull skipped:', err);
            this.data['joinRequests'] = [];
        }
    }

    private buildJobsHotQueries(jobsCol: ReturnType<typeof collection>) {
        const recentPaidCutoff = new Date();
        recentPaidCutoff.setDate(recentPaidCutoff.getDate() - KANBAN_RECENT_PAID_COMPLETED_DAYS);
        const recentPaidCutoffIso = recentPaidCutoff.toISOString();
        const hotCutoffIso = this.getHotWindowCutoffDate().toISOString();
        return {
            operationalQuery: query(jobsCol, where('status', 'not-in', [...ARCHIVED_JOB_STATUSES])),
            outstandingCompletedQuery: query(
                jobsCol,
                where('status', '==', 'COMPLETED'),
                where('paymentStatus', 'in', [...OUTSTANDING_PAYMENT_STATUSES]),
                where('createdAt', '>=', hotCutoffIso)
            ),
            recentPaidCompletedQuery: query(
                jobsCol,
                where('status', '==', 'COMPLETED'),
                where('paymentStatus', '==', '결제완료'),
                where('completedAt', '>=', recentPaidCutoffIso),
                where('createdAt', '>=', hotCutoffIso)
            ),
        };
    }

    private applyJobsHotPull(
        operational: Job[],
        outstanding: Job[],
        recentPaid: Job[]
    ) {
        this.operationalJobs = this.handleJobsMigrationInMemory(operational);
        this.kanbanCompletedJobs = this.handleJobsMigrationInMemory(recentPaid);
        this.mergeSupplementaryJobs(this.handleJobsMigrationInMemory(outstanding), (job) =>
            job.status === 'COMPLETED' &&
            OUTSTANDING_PAYMENT_STATUSES.includes(job.paymentStatus as typeof OUTSTANDING_PAYMENT_STATUSES[number])
        );
        this.rebuildMergedJobs();
    }

    private async pullJobsHot() {
        if (!this.tenantId) return;
        const jobsCol = collection(firestore, 'tenants', this.tenantId, 'jobs');
        const { operationalQuery, outstandingCompletedQuery, recentPaidCompletedQuery } =
            this.buildJobsHotQueries(jobsCol);

        try {
            const [opSnap, outSnap, paidSnap] = await Promise.all([
                getDocs(operationalQuery),
                getDocs(outstandingCompletedQuery),
                getDocs(recentPaidCompletedQuery),
            ]);
            const toList = (snap: typeof opSnap) => {
                const list: Job[] = [];
                snap.forEach((docSnap) => list.push({ ...docSnap.data(), id: docSnap.id } as Job));
                return list;
            };
            this.applyJobsHotPull(toList(opSnap), toList(outSnap), toList(paidSnap));
            this.purgeTombstonedJobsFromCaches();
            this.notify();
        } catch (error) {
            console.error('[DataService] jobs hot pull failed:', error);
            this.lastSyncError = (error as any)?.code || 'jobs-pull-failed';
            throw error;
        }
    }

    private async pullSessionData() {
        if (!this.tenantId) return;
        await this.pullCollectionDocs('staff');
        await this.pullJoinRequests();
        if (!this.isLocalPrimaryMode()) {
            await this.pullOperationalCloudData();
        }
    }

    private async applyRemoteJobDoc(jobId: string) {
        if (!this.tenantId) return;
        const snap = await getDoc(doc(firestore, 'tenants', this.tenantId, 'jobs', jobId));
        if (!snap.exists()) {
            this.removeJobFromLocalCache(jobId);
            this.notify();
            return;
        }
        const [job] = this.handleJobsMigrationInMemory([{ ...snap.data(), id: snap.id } as Job]);
        this.placeJobInLocalCache(job);
        this.rebuildMergedJobs();
        this.notify();
    }

    private async handleSyncPulse(data: Record<string, unknown> | undefined) {
        if (!this.tenantId || !data || this.pulseHandling) return;
        this.pulseHandling = true;
        try {
            const mirrorAt = data.mirrorAt as string | undefined;
            if (mirrorAt && mirrorAt !== this.lastNasMirrorAt && !this.isLocalPulse('mirrorAt', mirrorAt)) {
                await this.pollNasOperationalSync();
            }

            const jobRev = data.jobRev as { id?: string; op?: string; at?: string } | undefined;
            if (jobRev?.id && jobRev.at && jobRev.at !== this.lastAppliedJobRevAt) {
                if (!this.isLocalPulse('jobRev', jobRev.at)) {
                    this.lastAppliedJobRevAt = jobRev.at;
                    const before = this.lastNasMirrorAt;
                    await this.pollNasOperationalSync();
                    const mirrorApplied = before !== this.lastNasMirrorAt;
                    if (!mirrorApplied && !this.isLocalPrimaryMode() && !this.isWebMirrorMode()) {
                        if (jobRev.op === 'delete') {
                            this.removeJobFromLocalCache(jobRev.id);
                            this.notify();
                        } else {
                            await this.applyRemoteJobDoc(jobRev.id);
                        }
                    }
                    if (this.paymentJobsWanted) void this.pullPaymentJobs();
                }
            }

            const jobBatchRev = data.jobBatchRev as { ids?: string[]; at?: string } | undefined;
            if (jobBatchRev?.ids?.length && jobBatchRev.at && jobBatchRev.at !== this.lastAppliedJobRevAt) {
                if (!this.isLocalPulse('jobRev', jobBatchRev.at)) {
                    this.lastAppliedJobRevAt = jobBatchRev.at;
                    const before = this.lastNasMirrorAt;
                    await this.pollNasOperationalSync();
                    const mirrorApplied = before !== this.lastNasMirrorAt;
                    if (!mirrorApplied && !this.isLocalPrimaryMode() && !this.isWebMirrorMode()) {
                        for (const id of jobBatchRev.ids) {
                            await this.applyRemoteJobDoc(id);
                        }
                    }
                    if (this.paymentJobsWanted) void this.pullPaymentJobs();
                }
            }

            const staffAt = data.staffAt as string | undefined;
            if (staffAt && staffAt !== this.lastAppliedStaffAt && !this.isLocalPulse('staffAt', staffAt)) {
                this.lastAppliedStaffAt = staffAt;
                await this.pullCollectionDocs('staff');
                this.notify();
            }

            const clientsAt = data.clientsAt as string | undefined;
            if (clientsAt && clientsAt !== this.lastAppliedClientsAt && !this.isLocalPulse('clientsAt', clientsAt)) {
                this.lastAppliedClientsAt = clientsAt;
                // 거래처는 Firestore가 아니라 NAS 미러에서 동기화
                if (this.isLocalPrimaryMode() || this.isWebMirrorMode()) {
                    await this.pollNasOperationalSync();
                }
                this.notify();
            }

            const messagesAt = data.messagesAt as string | undefined;
            if (messagesAt && messagesAt !== this.lastAppliedMessagesAt && !this.isLocalPulse('messagesAt', messagesAt)) {
                this.lastAppliedMessagesAt = messagesAt;
                if (await this.pollChatMirror()) this.notify();
            }

            const settingsAt = data.settingsAt as string | undefined;
            const archiveRootAt = data.archiveRootAt as string | undefined;
            const settingsChanged =
                !!settingsAt &&
                settingsAt !== this.lastAppliedSettingsAt &&
                !this.isLocalPulse('settingsAt', settingsAt);
            const archiveRootChanged =
                !!archiveRootAt &&
                archiveRootAt !== this.lastAppliedArchiveRootAt &&
                !this.isLocalPulse('archiveRootAt', archiveRootAt);
            if (settingsChanged || archiveRootChanged) {
                if (settingsAt) this.lastAppliedSettingsAt = settingsAt;
                if (archiveRootAt) this.lastAppliedArchiveRootAt = archiveRootAt;
                await this.pullCollectionDocs('settings');
                this.notify();
            }

            for (const col of LAZY_SYNC_COLLECTIONS) {
                const key = `${col}At` as const;
                const at = data[key] as string | undefined;
                if (!at || !this.activeLazyCollections.has(col) || this.isLocalPulse(key, at)) continue;
                await this.pullLazyCollection(col, true);
            }
        } catch (e) {
            console.warn('[DataService] sync pulse handle failed:', e);
        } finally {
            this.pulseHandling = false;
        }
    }

    private subscribeSyncPulse() {
        if (!this.tenantId) return;
        this.stopSyncPulse();
        // 로컬 SQLite / 웹 미러 — 업무는 NAS 폴링, 설정·직원은 3분 폴링 (Firestore pulse 제거)
        if (this.isLocalPrimaryMode() || this.isWebMirrorMode()) {
            this.startConfigPolling();
            return;
        }
        this.syncPulseUnsub = onSnapshot(
            this.getSyncPulseRef(),
            (snap) => {
                void this.handleSyncPulse(snap.data() as Record<string, unknown> | undefined);
            },
            (err) => console.warn('[DataService] sync pulse listener failed:', err)
        );
    }

    private async pullLazyCollection(colName: string, force = false) {
        if (!this.tenantId) return;
        if (!force && this.lazyCollectionsLoaded.has(colName)) return;

        if (this.isAuxCollection(colName)) {
            await this.hydrateAuxCollectionFromNas(colName);
            this.lazyCollectionsLoaded.add(colName);
            this.activeLazyCollections.add(colName);
            this.notify();
            return;
        }

        await this.pullCollectionDocs(colName);
        this.lazyCollectionsLoaded.add(colName);
        this.activeLazyCollections.add(colName);
        this.notify();
    }

    private async hydrateAuxCollectionFromNas(col: AuxCollectionName): Promise<void> {
        if (!this.tenantId) return;
        try {
            const payload = await auxCollectionMirrorService.readBest(
                this.tenantId,
                col,
                this.getStoreGatewayUrls()
            );
            if (!payload) return;
            if (payload.deletedItems?.length) {
                if (applyAuxTombstonesFromList(this.auxTombstones[col], payload.deletedItems)) {
                    saveAuxTombstoneMap(this.tenantId, col, this.auxTombstones[col]);
                }
            }
            if (!payload.items) return;
            const current = (this.data[col] || []) as Array<Record<string, unknown>>;
            const merged = filterAuxItemsByTombstones(
                mergeAuxItemsById(current, payload.items as Array<Record<string, unknown>>),
                this.auxTombstones[col]
            );
            this.data[col] = merged;
            if (this.isLocalPrimaryMode()) {
                await localDbBridge.saveAuxCollection(this.tenantId, col, merged).catch(() => false);
            }
        } catch (e) {
            console.warn(`[DataService] aux hydrate ${col} failed:`, e);
        }
    }

    /**
     * 1회: Firestore quotes/papers/leaves/instructions → NAS+SQLite 이관 후 Firestore 비우기
     * 플래그 settings.nasMigratedAuxAt (로컬+settings/main 메타만)
     */
    private async migrateAuxCollectionsFromFirestoreIfNeeded(): Promise<void> {
        if (!this.tenantId || !this.isLocalPrimaryMode()) return;
        const settings = this.getSettingsObj();
        if (settings.nasMigratedAuxAt) return;
        if (this.shouldBlockOperationalNasWrite()) {
            console.warn('[DataService] aux migration deferred — NAS not ready');
            return;
        }

        try {
            for (const col of AUX_COLLECTION_NAMES) {
                const colRef = collection(firestore, 'tenants', this.tenantId, col);
                const snap = await getDocs(colRef);
                const incoming: Array<Record<string, unknown>> = [];
                snap.forEach((docSnap) => {
                    incoming.push({ ...docSnap.data(), id: docSnap.id });
                });
                if (incoming.length === 0) continue;

                const current = (this.data[col] || []) as Array<Record<string, unknown>>;
                const merged = mergeAuxItemsById(current, incoming);
                this.data[col] = merged;
                await localDbBridge.saveAuxCollection(this.tenantId, col, merged);
                const ok = await auxCollectionMirrorService.publish(this.tenantId, col, merged);
                if (!ok) {
                    console.warn(`[DataService] aux migration NAS publish failed (${col}) — abort purge`);
                    this.notify();
                    return;
                }
            }

            // NAS 반영 성공 후 Firestore 문서 삭제
            for (const col of AUX_COLLECTION_NAMES) {
                const colRef = collection(firestore, 'tenants', this.tenantId, col);
                const snap = await getDocs(colRef);
                const ids: string[] = [];
                snap.forEach((d) => ids.push(d.id));
                for (let i = 0; i < ids.length; i += 400) {
                    const chunk = ids.slice(i, i + 400);
                    const batch = writeBatch(firestore);
                    for (const id of chunk) {
                        batch.delete(doc(firestore, 'tenants', this.tenantId!, col, id));
                    }
                    await batch.commit();
                }
            }

            const migratedAt = new Date().toISOString();
            const nextSettings = { ...this.getSettingsObj(), nasMigratedAuxAt: migratedAt };
            this.data['settings'] = [nextSettings];
            await localDbBridge.saveSettings(this.tenantId, nextSettings);
            void this.flushLiveMirrorPushNow();

            // 다른 PC가 재이관하지 않도록 메타 플래그만 Firestore에 남김
            try {
                const mainRef = doc(firestore, 'tenants', this.tenantId, 'settings', 'main');
                await setDoc(mainRef, { nasMigratedAuxAt: migratedAt }, { merge: true });
            } catch (e) {
                console.warn('[DataService] nasMigratedAuxAt cloud flag write skipped:', e);
            }

            this.notify();
            console.log('[DataService] aux collections migrated to NAS and purged from Firestore');
            toast.success('견적·용지·휴가·지시 데이터를 회사 NAS로 옮기고 클라우드에서 정리했습니다.', {
                duration: 6000,
            });
        } catch (e) {
            console.warn('[DataService] aux Firestore→NAS migration failed:', e);
        }
    }

    private async pullPaymentJobs() {
        if (!this.tenantId) return;
        if (this.isLocalPrimaryMode() || this.isWebMirrorMode()) {
            const hotCutoff = this.getHotWindowCutoffDate();
            const outstanding = this.getAllJobs().filter((job) =>
                OUTSTANDING_PAYMENT_STATUSES.includes(
                    job.paymentStatus as typeof OUTSTANDING_PAYMENT_STATUSES[number]
                )
            );
            const paid = this.getAllJobs().filter((job) => {
                if (job.status !== 'COMPLETED' || job.paymentStatus !== '결제완료') return false;
                const created = new Date(job.createdAt);
                return created.getTime() >= hotCutoff.getTime();
            });
            this.mergeSupplementaryJobs(outstanding, (job) =>
                OUTSTANDING_PAYMENT_STATUSES.includes(
                    job.paymentStatus as typeof OUTSTANDING_PAYMENT_STATUSES[number]
                )
            );
            this.mergeSupplementaryJobs(paid, (job) =>
                job.status === 'COMPLETED' && job.paymentStatus === '결제완료'
            );
            this.paymentJobsLoaded = true;
            this.notify();
            return;
        }
        const jobsCol = collection(firestore, 'tenants', this.tenantId, 'jobs');
        const hotCutoffIso = this.getHotWindowCutoffDate().toISOString();
        const paymentQuery = query(
            jobsCol,
            where('paymentStatus', 'in', [...OUTSTANDING_PAYMENT_STATUSES])
        );
        const completedPaidHotQuery = query(
            jobsCol,
            where('status', '==', 'COMPLETED'),
            where('paymentStatus', '==', '결제완료'),
            where('createdAt', '>=', hotCutoffIso)
        );
        try {
            const [outSnap, paidSnap] = await Promise.all([
                getDocs(paymentQuery),
                getDocs(completedPaidHotQuery),
            ]);
            const outstanding: Job[] = [];
            const paid: Job[] = [];
            outSnap.forEach((docSnap) =>
                outstanding.push({ ...docSnap.data(), id: docSnap.id } as Job)
            );
            paidSnap.forEach((docSnap) => paid.push({ ...docSnap.data(), id: docSnap.id } as Job));
            this.mergeSupplementaryJobs(outstanding, (job) =>
                OUTSTANDING_PAYMENT_STATUSES.includes(
                    job.paymentStatus as typeof OUTSTANDING_PAYMENT_STATUSES[number]
                )
            );
            this.mergeSupplementaryJobs(paid, (job) =>
                job.status === 'COMPLETED' && job.paymentStatus === '결제완료'
            );
            this.paymentJobsLoaded = true;
            this.notify();
        } catch (err) {
            console.warn('[ensurePaymentJobsSync] pull skipped:', err);
        }
    }

    private handleCollectionData(colName: string, list: any[]) {
        if (colName === 'settings') {
            // Firestore settings pull이 상품·후가공(NAS SSOT)을 옛값으로 덮지 않도록 보존
            const prev = this.getSettingsObj();
            const preservedNasMaster: Record<string, unknown> = {};
            for (const key of DataService.NAS_MASTER_SETTINGS) {
                if (prev[key] !== undefined && prev[key] !== null) {
                    preservedNasMaster[key] = prev[key];
                }
            }

            if (list.length === 0) {
                this.data['settings'] = [this.getDefaultSettings('EzPrintWork')];
            } else {
                this.data['settings'] = [this.mergeSettingsDocs(list)];
            }

            const settingsObj = this.data['settings']?.[0];
            if (settingsObj) {
                Object.assign(settingsObj, preservedNasMaster);
                this.enforceCompanyArchiveRoot();
            }
            if (settingsObj && this.applySettingsDefaultsMerge(settingsObj)) {
                this.persistSettingsDefaultsMerge(settingsObj).catch((err) =>
                    console.error('[DataService] Settings defaults merge failed:', err)
                );
            }
            return;
        }

        this.data[colName] = list;
    }

    /** 메모리만 — 런타임 마이그레이션 쓰기는 읽기·쓰기 폭증 유발로 비활성화 */
    private handleJobsMigrationInMemory(currentJobs: any[]): any[] {
        // 동일 품목명이 마스터에 있으면 그대로 두고, 없을 때만 옛 이름 → 기본명으로 표시 보정
        const productNames = new Set(this.getProductDefinitions().map((d) => d.name));
        return currentJobs.map((job: any) => {
            if (job.type === '무선제본책자' && !productNames.has(job.type)) job.type = '책자';
            if (LEGACY_CATALOG_TYPE_NAMES.includes(job.type) && !productNames.has(job.type)) job.type = '카탈로그';
            if (LEGACY_JOB_SIGNAGE_TYPE_NAMES.includes(job.type) && !productNames.has(job.type)) job.type = '실사';
            // specs/subJobs 레거시는 화면 표시용 메모리 정규화만 (Firestore 미쓰기)
            return job;
        });
    }

    /** @deprecated handleJobsMigrationInMemory 사용 */
    private async handleJobsMigrationAndPersist(currentJobs: any[]): Promise<any[]> {
        return this.handleJobsMigrationInMemory(currentJobs);
    }

    private mergeSupplementaryJobs(incoming: Job[], replacePredicate: (job: Job) => boolean) {
        const kept = this.supplementaryJobs.filter((job) => !replacePredicate(job));
        const map = new Map<string, Job>();
        for (const job of kept) map.set(job.id, job);
        for (const job of incoming) map.set(job.id, job);
        this.supplementaryJobs = Array.from(map.values());
        this.rebuildMergedJobs();
    }

    /** 견적서 화면·미리보기 진입 시 호출 — 1회 pull */
    ensureQuotesSync() {
        void this.pullLazyCollection('quotes');
    }

    /** 채팅 위젯 마운트 시 호출 — NAS/게이트웨이/Storage */
    ensureMessagesSync() {
        void this.hydrateMessagesFromMirror();
    }

    private chatMigratedKey(): string {
        return `ezpw_chat_nas_migrated_${this.tenantId || 'x'}`;
    }

    private async hydrateMessagesFromMirror(): Promise<void> {
        if (!this.tenantId) return;
        try {
            const payload = this.getIsElectron()
                ? await chatMirrorService.readFromNas()
                : await chatMirrorService.readRemote(this.tenantId, this.getStoreGatewayUrls());

            if (payload?.messages?.length) {
                this.data['messages'] = mergeChatMessages(
                    (this.data['messages'] || []) as ChatMessage[],
                    payload.messages
                );
                this.notify();
            }

            // 로컬/미러가 비어 있고 아직 이관 안 했으면 Firestore → NAS 1회
            if (
                ((this.data['messages'] || []) as ChatMessage[]).length === 0 &&
                localStorage.getItem(this.chatMigratedKey()) !== '1'
            ) {
                await this.migrateMessagesFromFirestoreOnce();
            }
        } catch (e) {
            console.warn('[DataService] chat mirror hydrate failed:', e);
        }
    }

    private async migrateMessagesFromFirestoreOnce(): Promise<void> {
        if (!this.tenantId) return;
        try {
            await this.pullCollectionDocs('messages');
            const msgs = (this.data['messages'] || []) as ChatMessage[];
            if (msgs.length > 0) {
                const ok = await this.persistMessagesToNas(msgs);
                if (ok) {
                    console.log(`[DataService] migrated ${msgs.length} chat messages Firestore → NAS`);
                }
            }
            localStorage.setItem(this.chatMigratedKey(), '1');
        } catch (e) {
            console.warn('[DataService] chat Firestore migration skipped:', e);
            // 권한 등으로 실패해도 반복 시도 폭주 방지 — 다음 세션에 재시도 가능하도록 플래그는 안 함
        }
    }

    private async persistMessagesToNas(messages: ChatMessage[]): Promise<boolean> {
        if (!this.tenantId) return false;
        if (this.getIsElectron() && this.shouldBlockOperationalNasWrite()) {
            return false;
        }
        const list = mergeChatMessages([], messages);

        if (this.getIsElectron()) {
            let ok = await chatMirrorService.publish(this.tenantId, list);
            if (!ok) {
                const gw = await this.getTrustedStoreGatewayUrl();
                if (gw) {
                    ok = await chatMirrorService.publishViaGateway(this.tenantId, list, gw);
                    if (ok) this.companyNasChannel = 'gateway';
                }
            } else {
                this.companyNasChannel = 'local';
            }
            if (ok) await this.bumpMirrorSyncPulse();
            return ok;
        }

        // 웹: 매장 PC 게이트웨이 우선, 실패 시 Storage
        const viaGw = await chatMirrorService.publishViaGateway(
            this.tenantId,
            list,
            this.getStoreGatewayUrls()
        );
        if (viaGw) {
            await this.bumpMirrorSyncPulse();
            return true;
        }
        const ok = await chatMirrorService.publish(this.tenantId, list);
        if (ok) await this.bumpMirrorSyncPulse();
        return ok;
    }

    private async pollChatMirror(): Promise<boolean> {
        if (!this.tenantId) return false;
        try {
            let payload = this.getIsElectron()
                ? await chatMirrorService.readFromNas()
                : await chatMirrorService.readRemote(this.tenantId, this.getStoreGatewayUrls());
            if (!payload?.messages && this.getIsElectron()) {
                const gw = await this.getTrustedStoreGatewayUrl();
                if (gw) {
                    payload = await chatMirrorService.readViaGatewayOnly(this.tenantId, gw);
                }
            }
            if (!payload?.messages) return false;

            const merged = mergeChatMessages(
                (this.data['messages'] || []) as ChatMessage[],
                payload.messages
            );
            const prevLen = ((this.data['messages'] || []) as ChatMessage[]).length;
            const changed =
                merged.length !== prevLen ||
                merged[merged.length - 1]?.id !==
                    ((this.data['messages'] || []) as ChatMessage[])[prevLen - 1]?.id;
            if (changed) {
                this.data['messages'] = merged;
                return true;
            }
        } catch (e) {
            console.warn('[DataService] chat poll failed:', e);
        }
        return false;
    }

    /** 캘린더·휴가 화면 진입 시 호출 */
    ensureLeavesSync() {
        void this.pullLazyCollection('leaves');
    }

    /** 용지 관리 화면 진입 시 호출 */
    ensurePapersSync() {
        void this.pullLazyCollection('papers');
    }

    /** 상황판 진입 시 호출 */
    ensureInstructionsSync() {
        void this.pullLazyCollection('instructions');
    }

    private monthCacheKey(year: number, month: number) {
        return `${year}-${month}`;
    }

    /** 캘린더 월 이동 시 — 해당 월±1 완료 작업만 추가 로드 (읽기 최소화) */
    async ensureCalendarJobsSync(year: number, month: number) {
        if (!this.tenantId) return;
        // 로컬/웹 미러 모드 — Firestore jobs 금지, NAS·SQLite만 사용
        if (this.isFirestoreJobsForbidden()) return;

        const monthsToLoad: { year: number; month: number }[] = [];
        for (const offset of [-1, 0, 1]) {
            const d = new Date(year, month + offset, 1);
            const key = this.monthCacheKey(d.getFullYear(), d.getMonth());
            if (!this.calendarMonthsLoaded.has(key)) {
                monthsToLoad.push({ year: d.getFullYear(), month: d.getMonth() });
            }
        }
        if (monthsToLoad.length === 0) return;

        const jobsCol = collection(firestore, 'tenants', this.tenantId, 'jobs');
        const loaded: Job[] = [];
        const hotCutoffIso = this.getHotWindowCutoffDate().toISOString();

        for (const { year: y, month: m } of monthsToLoad) {
            const startIso = new Date(y, m, 1).toISOString().split('T')[0];
            const endIso = new Date(y, m + 1, 0).toISOString().split('T')[0];
            const monthQuery = query(
                jobsCol,
                where('status', '==', 'COMPLETED'),
                where('createdAt', '>=', hotCutoffIso),
                where('dueDate', '>=', startIso),
                where('dueDate', '<=', endIso)
            );
            try {
                const snap = await getDocs(monthQuery);
                snap.forEach((docSnap) => {
                    loaded.push({ ...docSnap.data(), id: docSnap.id } as Job);
                });
                this.calendarMonthsLoaded.add(this.monthCacheKey(y, m));
            } catch (e) {
                console.warn('[ensureCalendarJobsSync] month load failed', y, m, e);
            }
        }

        if (loaded.length > 0) {
            this.mergeSupplementaryJobs(loaded, () => false);
            this.notify();
        }
    }

    /** 미수금 관리 — 화면 진입 시 1회 pull, 이후 jobs pulse로 갱신 */
    ensurePaymentJobsSync() {
        if (!this.tenantId) return;
        this.paymentJobsWanted = true;
        if (this.paymentJobsLoaded) return;
        void this.pullPaymentJobs();
    }

    /** 작업 상세 — 동일 고객 과거 작업 (필요 시 1회 조회) */
    async ensureClientHistoryJobs(clientName: string) {
        if (!this.tenantId || !clientName.trim()) return;
        const key = clientName.trim();
        if (this.clientHistoryLoaded.has(key)) return;

        if (this.isLocalPrimaryMode() || this.isWebMirrorMode()) {
            this.clientHistoryLoaded.add(key);
            return;
        }

        const jobsCol = collection(firestore, 'tenants', this.tenantId, 'jobs');
        const hotCutoffIso = this.getHotWindowCutoffDate().toISOString();
        const clientQuery = query(
            jobsCol,
            where('clientName', '==', key),
            where('createdAt', '>=', hotCutoffIso)
        );
        try {
            const snap = await getDocs(clientQuery);
            const loaded: Job[] = [];
            snap.forEach((docSnap) => {
                loaded.push({ ...docSnap.data(), id: docSnap.id } as Job);
            });
            this.clientHistoryLoaded.add(key);
            if (loaded.length > 0) {
                this.mergeSupplementaryJobs(loaded, () => false);
                this.notify();
            }
        } catch (e) {
            console.warn('[ensureClientHistoryJobs] failed:', key, e);
        }
    }

    private async waitForAuthToken(): Promise<boolean> {
        const user = auth.currentUser;
        if (!user) return false;
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                await user.getIdToken(attempt > 0);
                return true;
            } catch (e) {
                console.warn('[DataService] auth token wait retry', attempt + 1, e);
                await new Promise((r) => setTimeout(r, 250));
            }
        }
        return false;
    }

    /** staff·settings — Electron 로컬 DB가 있어도 staff는 Firestore SSOT라 반드시 재시도 */
    private async pullCloudConfigDocs(softFail: boolean): Promise<void> {
        try {
            await this.pullCollectionDocs('staff');
            await this.pullCollectionDocs('settings');
            this.enforceCompanyArchiveRoot();
        } catch (error) {
            if (!softFail) throw error;
            console.warn('[DataService] cloud staff/settings pull skipped (local fallback):', error);
            // soft-fail 시에도 직원 목록은 NAS/SQLite에 없으므로 별도 재시도
            try {
                await this.pullCollectionDocs('staff');
            } catch (staffErr) {
                console.warn('[DataService] staff retry after soft-fail also failed:', staffErr);
            }
            try {
                await this.pullCollectionDocs('settings');
                this.enforceCompanyArchiveRoot();
            } catch (settingsErr) {
                console.warn('[DataService] settings retry after soft-fail also failed:', settingsErr);
                // settings 실패 시에도 직전 회사 NAS 경로는 유지
                this.restoreArchiveRootFromLastKnown();
            }
        }

        // soft-fail 후에도 경로가 비면 last-known 복원
        if (!getEffectiveArchiveRootPath()?.trim()) {
            this.restoreArchiveRootFromLastKnown();
        }

        // 직원이 비어 있으면 한 번 더 (일시 permission/네트워크)
        if (((this.data['staff'] || []) as Staff[]).length === 0) {
            try {
                await this.pullCollectionDocs('staff');
            } catch (emptyRetryErr) {
                console.warn('[DataService] staff empty-retry failed:', emptyRetryErr);
            }
        }

        await this.ensureCompanyInfoFromCloud().catch((e) =>
            console.warn('[DataService] companyInfo refresh skipped:', e)
        );
    }

    private isCompanyInfoIncomplete(info: CompanyInfo): boolean {
        const name = info.name?.trim();
        if (!name || name === 'EzPrintWork') return true;
        return !(info.ceoName || info.businessNumber || info.phone || info.address || info.bankAccount);
    }

    /** 견적서·거래명세서 공급자 — Firestore companyInfo 조각 직접 보강 */
    private async ensureCompanyInfoFromCloud(): Promise<void> {
        if (!this.tenantId) return;
        const current = this.getCompanyInfo();
        if (!this.isCompanyInfoIncomplete(current)) return;

        const settingsCol = collection(firestore, 'tenants', this.tenantId, 'settings');
        const docs: { id: string; [key: string]: unknown }[] = [];
        const existing = this.getSettingsObj();

        if (Object.keys(existing).length > 0) {
            docs.push({ id: 'main', ...existing });
        }

        try {
            const companySnap = await getDoc(doc(settingsCol, 'companyInfo'));
            if (companySnap.exists()) {
                docs.push({ id: 'companyInfo', ...companySnap.data() });
            }
        } catch (e) {
            console.warn('[DataService] companyInfo doc fetch failed:', e);
        }

        if (docs.length === 0) {
            try {
                const mainSnap = await getDoc(doc(settingsCol, 'main'));
                if (mainSnap.exists()) {
                    docs.push({ id: 'main', ...mainSnap.data() });
                }
            } catch (e) {
                console.warn('[DataService] settings/main fetch failed:', e);
            }
        }

        if (docs.length > 0) {
            this.data['settings'] = [this.mergeSettingsDocs(docs)];
            this.notify();
        }
    }

    /** 견적 미리보기·인쇄 — 공급자 정보 확보 (팝업·직원 세션) */
    async ensureCompanyInfoForDocuments(): Promise<CompanyInfo> {
        const cachedName = this.mirrorCompanyName;
        await this.ensureCompanyInfoFromCloud();

        if (this.isCompanyInfoIncomplete(this.getCompanyInfo())) {
            try {
                await this.fetchWebMirrorPayload().then((mirror) => {
                    if (!mirror) return;
                    if (mirror.settings && typeof mirror.settings === 'object') {
                        this.mergeSettingsFromMirror(
                            mirror.settings as Record<string, unknown>,
                            mirror.companyName,
                            mirror.updatedAt
                        );
                    } else if (mirror.companyName) {
                        this.mirrorCompanyName = mirror.companyName;
                    }
                });
            } catch {
                /* ignore */
            }
        }

        const info = this.getCompanyInfo();
        if (cachedName && this.isCompanyInfoIncomplete(info)) {
            return { ...info, name: cachedName };
        }
        return info;
    }

    private async tryRecoverFromLocalOrMirror(): Promise<boolean> {
        if (this.isLocalPrimaryMode()) {
            try {
                const loaded = await this.loadLocalPrimaryData();
                if (loaded) {
                    this.localOperationalReady = true;
                    return true;
                }
            } catch (e) {
                console.warn('[DataService] local DB recovery failed:', e);
            }
        }
        return this.tryHydrateFromMirrors();
    }

    private enterCloudDegradedMode(message: string) {
        this.cloudDegraded = true;
        this.syncStatus = 'synced';
        this.isReady = true;
        this.restoreArchiveRootFromLastKnown();
        this.startNasMirrorPolling();
        this.finishSessionPull();
        toast.warning(message, { duration: 6000 });
        this.notify();
    }

    private async startSyncing() {
        if (!this.tenantId) return;

        if (!auth.currentUser) {
            this.lastSyncError = 'auth-not-ready';
            this.syncStatus = 'disconnected';
            this.notify();
            this.scheduleReconnect();
            return;
        }

        this.unsubscribeList.forEach((unsub) => unsub());
        this.unsubscribeList = [];
        this.stopSyncPulse();
        this.stopNasMirrorPolling();

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.stopPaymentJobsSync();
        this.cloudDegraded = false;
        this.localOperationalReady = false;
        this.webMirrorReady = false;
        this.lastSyncError = null;
        this.syncStatus = 'connecting';
        this.operationalJobs = [];
        this.kanbanCompletedJobs = [];
        this.supplementaryJobs = [];
        this.rebuildMergedJobs();
        this.notify();

        const localPrimary = this.isLocalPrimaryMode();

        // 테넌트 전환 직후 override가 비워지므로, 클라우드 전에 last-known 경로 선적용
        this.restoreArchiveRootFromLastKnown();

        const authReady = await this.waitForAuthToken();
        if (!authReady) {
            if (localPrimary) {
                try {
                    const loaded = await this.loadLocalPrimaryData();
                    if (loaded) {
                        this.localOperationalReady = true;
                        this.enterCloudDegradedMode(
                            '인증 일시 불가 — 로컬 데이터로 계속 운영합니다.'
                        );
                        this.scheduleReconnect();
                        return;
                    }
                } catch (e) {
                    console.warn('[DataService] local bootstrap without auth failed:', e);
                }
            }
            this.lastSyncError = 'auth-not-ready';
            this.syncStatus = 'disconnected';
            this.notify();
            this.scheduleReconnect();
            return;
        }

        if (localPrimary) {
            try {
                const loaded = await this.loadLocalPrimaryData();
                if (loaded) this.localOperationalReady = true;
            } catch (e) {
                console.warn('[DataService] local DB preload failed:', e);
            }
        }

        try {
            await this.pullCloudConfigDocs(localPrimary && this.localOperationalReady);

            if (localPrimary && this.localOperationalReady) {
                this.syncStatus = 'synced';
                this.isReady = true;
                this.notify();
                await this.pollNasOperationalSync();
            }

            await this.pullJoinRequests();
            this.subscribeSyncPulse();

            if (!localPrimary) {
                // 웹·태블릿 — Firebase 설정만 받으면 연결됨 표시, 미러는 백그라운드
                this.isReady = true;
                this.syncStatus = 'synced';
                this.notify();
                this.startNasMirrorPolling();
                void this.hydrateWebMirrorInBackground();
            } else if (!this.localOperationalReady) {
                try {
                    await this.pullOperationalCloudData();
                    await this.persistAllToLocalDb();
                    this.localOperationalReady = true;
                } catch (migErr) {
                    console.warn('[DataService] cloud migration pull failed, trying mirrors:', migErr);
                    const hydrated = await this.tryHydrateFromMirrors();
                    if (hydrated) {
                        await this.persistAllToLocalDb();
                        this.localOperationalReady = true;
                    } else {
                        throw migErr;
                    }
                }
            }

            if (localPrimary) {
                this.startNasMirrorPolling();
                void this.migrateAuxCollectionsFromFirestoreIfNeeded();
            }

            // 사내 채팅 NAS 미러 초기 로드
            void this.hydrateMessagesFromMirror();

            // 회사 NAS 헬스체크 — 실패 시 전원 동일하게 쓰기 차단 (유예 후 잠금, 게이트웨이 보조)
            if (this.getIsElectron()) {
                void this.checkCompanyNasHealth(true).then((ok) => {
                    if (!ok && getTenantArchiveRootFromSettings(this.getSettingsObj())) {
                        toast.error(
                            '회사 NAS에 연결하지 못했습니다. 경로·Z:·사내 게이트웨이를 확인하세요.',
                            { duration: 10000 }
                        );
                    }
                });
                this.startNasHealthMonitor();
            }

            if (!localPrimary && !this.webMirrorReady && this.getAllJobs().length === 0) {
                // hydrateWebMirrorInBackground 가 처리 — 여기서는 게이트웨이 URL 없을 때만 안내
                const gateway = this.getStoreGatewayUrls();
                if (gateway.length === 0) {
                    toast.warning(
                        '웹/태블릿은 매장 PC NAS 연동이 필요합니다. 관리자 PC에서 NAS 경로 저장 후, 같은 Wi‑Fi에서 접속해 주세요.',
                        { duration: 8000 }
                    );
                }
            }

            if (localPrimary || !this.isReady) {
                this.isReady = true;
            }
            if (localPrimary) {
                this.syncStatus = 'synced';
            }
            this.finishSessionPull();
        } catch (error: any) {
            console.error('[DataService] session sync failed:', error);
            const code = error?.code || 'pull-failed';
            this.lastSyncError = code;

            const recoverableCodes = ['resource-exhausted', 'unavailable', 'pull-failed', 'permission-denied', 'auth-not-ready'];

            if (this.localOperationalReady && recoverableCodes.includes(code)) {
                this.enterCloudDegradedMode('클라우드 일시 불가 — 로컬 데이터로 계속 운영합니다.');
                return;
            }

            if (!this.localOperationalReady && recoverableCodes.includes(code)) {
                const recovered = await this.tryRecoverFromLocalOrMirror();
                if (recovered) {
                    this.localOperationalReady = true;
                    this.enterCloudDegradedMode(
                        code === 'permission-denied'
                            ? '클라우드 권한 문제 — 로컬·미러로 계속 운영합니다. 복구 후 자동 재동기화됩니다.'
                            : '클라우드 일시 불가 — 저장된 로컬·미러로 계속 운영합니다.'
                    );
                    return;
                }
            }

            if (!this.localOperationalReady && (code === 'resource-exhausted' || code === 'unavailable')) {
                const hydrated = await this.tryHydrateFromMirrors();
                if (hydrated) {
                    this.localOperationalReady = true;
                    this.enterCloudDegradedMode('클라우드 일시 불가 — 저장된 미러로 계속 운영합니다.');
                    return;
                }
            }

            this.syncStatus = 'disconnected';
            this.notify();
            if (code === 'unavailable' || code === 'permission-denied' || code === 'auth-not-ready') {
                this.scheduleReconnect();
            }
        }
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
    async createTenant(
        name: string,
        ownerUid: string,
        businessNumber?: string,
        joinCode?: string,
        initialStaffCount = 3,
        ownerPhone?: string
    ): Promise<string> {
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
        const ownerPhoneFormatted = formatPhoneNumber(String(ownerPhone || '').trim());
        if (!ownerPhoneFormatted || !isValidPhoneNumber(ownerPhoneFormatted)) {
            throw new Error('관리자 연락처를 올바르게 입력해주세요. (예: 010-1234-5678)');
        }

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
            ownerPhone: ownerPhoneFormatted,
            contactPhone: ownerPhoneFormatted,
        };

        const defaultSettings = this.getDefaultSettings(name.trim());
        if (businessNumber?.trim()) {
            defaultSettings.companyInfo.businessNumber = businessNumber.trim();
        }
        defaultSettings.companyInfo.phone = ownerPhoneFormatted;

        const batch = writeBatch(firestore);
        batch.set(tenantRef, {
            ...tenantData,
            paymentStatus,
            maxStaff: Math.min(staffCount, 3),
            lastActiveAt: now,
            appVersion: APP_VERSION,
            lastAppVersion: APP_VERSION,
        });
        batch.set(doc(firestore, 'users', ownerUid), {
            uid: ownerUid,
            id: ownerUid,
            email: ownerEmail,
            displayName: ownerName,
            name: ownerName,
            photoURL: user.photoURL || '',
            avatarUrl: user.photoURL || '',
            contactInfo: ownerPhoneFormatted,
            tenantId,
            role: 'admin',
            createdAt: now,
        }, { merge: true });
        await batch.commit();

        // 2단계: users에 tenantId 반영 후 staff/settings 생성 (동일 배치 시 rules에서 isMember 미충족)
        const batch2 = writeBatch(firestore);
        batch2.set(doc(firestore, 'tenants', tenantId, 'settings', 'main'), defaultSettings);
        batch2.set(doc(firestore, 'tenants', tenantId, 'staff', ownerUid), {
            id: ownerUid,
            uid: ownerUid,
            name: ownerName,
            role: '관리자',
            phone: ownerPhoneFormatted,
            avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ownerName)}`,
            active: true,
            email: ownerEmail,
            loginId: ownerEmail.toLowerCase(),
            joinDate: now,
        });
        await batch2.commit();
        this.setTenant(tenantId);
        return tenantId;
    }

    async searchTenants(nameQuery: string): Promise<Tenant[]> {
        try {
            return await this.searchTenantsOnce(nameQuery);
        } catch (error: any) {
            if (error?.code !== 'permission-denied' || !auth.currentUser) {
                throw error;
            }
            // 로그아웃 직후 Firebase 세션만 남으면 회사 검색이 막힘 — 1회 정리 후 재시도
            console.warn('[searchTenants] permission-denied with stale auth — signing out and retrying');
            try {
                await signOut(auth);
                this.clearSession();
                await new Promise((r) => setTimeout(r, 300));
            } catch (signOutErr) {
                console.warn('[searchTenants] signOut before retry failed:', signOutErr);
            }
            return this.searchTenantsOnce(nameQuery);
        }
    }

    private async searchTenantsOnce(nameQuery: string): Promise<Tenant[]> {
        const term = nameQuery.trim();
        if (!term) return [];

        const mapTenant = (d: any) => ({ id: d.id, ...d.data() } as Tenant);
        const tenantsCol = collection(firestore, 'tenants');
        const lower = term.toLowerCase();
        const dedupeById = (rows: Tenant[]) => {
            const seen = new Set<string>();
            return rows.filter((t) => {
                if (!t.id || seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
        };

        // 1) 정확히 일치
        const exactSnap = await getDocs(
            query(tenantsCol, where('name', '==', term), limit(10))
        );
        if (!exactSnap.empty) {
            return dedupeById(exactSnap.docs.map(mapTenant));
        }

        // 2) 접두사 검색 — "상록" → "상록인쇄" 등
        try {
            const prefixSnap = await getDocs(
                query(
                    tenantsCol,
                    where('name', '>=', term),
                    where('name', '<=', term + '\uf8ff'),
                    limit(25)
                )
            );
            const prefixMatches = dedupeById(prefixSnap.docs.map(mapTenant)).filter((t) =>
                (t.name || '').toLowerCase().includes(lower)
            );
            if (prefixMatches.length > 0) {
                return prefixMatches;
            }
        } catch (e) {
            console.warn('[searchTenants] prefix query failed:', e);
        }

        // 3) 폴백 — includes 부분 일치 (소규모 테넌트 목록)
        const snap = await getDocs(query(tenantsCol, limit(50)));
        return dedupeById(snap.docs.map(mapTenant)).filter((t) =>
            (t.name || '').toLowerCase().includes(lower)
        );
    }

    // --- CRUD Methods (Local JSON Based) ---
    private generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    async updateTenantActivity() {
        // NAS/로컬 우선에서도 버전·활동만 Firestore에 보고 (작업·거래처는 미포함)
        if (!this.tenantId || !this.isSyncAdmin()) return;
        const now = Date.now();
        if (now - this.lastTenantActivityAt < DataService.TENANT_ACTIVITY_MIN_INTERVAL_MS) return;
        this.lastTenantActivityAt = now;

        try {
            const companyName = this.getCompanyInfo().name || 'EzPrintWork';
            const jobsCount = this.data['jobs']?.length || 0;
            const staffCount = this.data['staff']?.filter(s => s.active && !s.isDeleted).length || 0;
            const clientsCount = this.data['clients']?.length || 0;
            let reportVersion = APP_VERSION;
            try {
                if (typeof window !== 'undefined' && window.electron?.getAppVersion) {
                    const installed = await window.electron.getAppVersion();
                    if (installed?.trim()) reportVersion = installed.trim().replace(/^v/i, '');
                }
            } catch {
                /* APP_VERSION fallback */
            }

            const tenantDocRef = doc(firestore, 'tenants', this.tenantId);
            await setDoc(tenantDocRef, {
                companyName,
                lastActiveAt: new Date().toISOString(),
                appVersion: reportVersion,
                lastAppVersion: reportVersion,
                stats: {
                    jobsCount,
                    staffCount,
                    clientsCount,
                    appVersion: reportVersion,
                }
            }, { merge: true });
        } catch (e) {
            console.error("[LicenseMonitor] Failed to update tenant activity:", e);
            // 실패 시 쓰로틀 해제해 다음 기회에 재시도
            this.lastTenantActivityAt = 0;
        }
    }

    private notifyFirestoreWriteError(action: string, e: any) {
        const code = e?.code || '';
        const key = code || action;
        const now = Date.now();
        if (key === this.lastWriteErrorToastKey && now - this.lastWriteErrorToastAt < 8000) {
            return;
        }
        this.lastWriteErrorToastKey = key;
        this.lastWriteErrorToastAt = now;

        if (code === 'resource-exhausted') {
            toast.error('Firebase 저장 한도가 초과되었습니다. 잠시 후 다시 시도해 주세요.');
        } else if (code === 'permission-denied') {
            toast.error('저장 권한이 없습니다. 다시 로그인해 주세요.');
        } else {
            toast.error(`${action} 저장 실패: ${getErrorMessage(e)}`);
        }
    }

    private async addEntity(col: string, entity: any) {
        this.assertOperationalWriteAllowed(col);
        const id = entity.id || this.generateId();
        const now = new Date().toISOString();
        const newEntity = {
            ...entity,
            id,
            createdAt: entity.createdAt || now,
            ...(col === 'jobs' ? { updatedAt: entity.updatedAt || now, rev: entity.rev ?? 1 } : {}),
            ...(col === 'clients'
                ? {
                      updatedAt: entity.updatedAt || now,
                      rev: entity.rev ?? 1,
                      order:
                          typeof entity.order === 'number' && Number.isFinite(entity.order)
                              ? entity.order
                              : this.nextClientOrder(),
                  }
                : {}),
        };

        if (col === 'jobs') {
            this.placeJobInLocalCache(newEntity as Job);
            this.rebuildMergedJobs();
        } else {
            this.data[col] = [...(this.data[col] || []).filter((e) => e.id !== id), newEntity];
        }
        this.notify();
        
        if (this.tenantId) {
            if (this.isLocalPrimaryMode() && this.isLocalOperationalCollection(col)) {
                await this.persistToLocalCollection(col, newEntity);
                if (col === 'clients') {
                    // 거래처 자동 등록은 NAS에 바로 반영해야 미러 폴링에 덮이지 않음
                    this.flushLiveMirrorPushNow();
                } else if (this.isAuxCollection(col)) {
                    const ok = await this.persistAuxCollectionToNas(col);
                    if (!ok) {
                        throw new Error(
                            '회사 NAS에 저장하지 못했습니다. NAS 경로·연결을 확인한 뒤 다시 시도해 주세요.'
                        );
                    }
                } else {
                    this.scheduleLiveMirrorPush();
                }
                this.updateTenantActivity().catch(() => {});
                return;
            }
            // 사내 채팅 — Firestore 금지, NAS chat-messages.json
            if (col === 'messages') {
                if (!newEntity.senderId && auth.currentUser) {
                    newEntity.senderId = auth.currentUser.uid;
                    this.data[col] = [...(this.data[col] || []).filter((e: any) => e.id !== newEntity.id), newEntity];
                    this.notify();
                }
                const ok = await this.persistMessagesToNas((this.data['messages'] || []) as ChatMessage[]);
                if (!ok) {
                    throw new Error(
                        '채팅 저장에 실패했습니다. 매장 PC NAS 경로·사내망 연결을 확인해 주세요.'
                    );
                }
                this.updateTenantActivity().catch(() => {});
                return;
            }
            if (col === 'jobs' && this.isWebMirrorMode()) {
                throw new Error('web-readonly-jobs');
            }
            if (!this.canPersistToCloud(col)) {
                if (col === 'clients') {
                    throw new Error(
                        '거래처는 매장 PC의 NAS/로컬 저장소에만 저장됩니다. PC 앱에서 작업·거래처를 등록해 주세요.'
                    );
                }
                if (this.isAuxCollection(col)) {
                    throw new Error(
                        '견적·용지·휴가·지시는 매장 PC 앱에서 회사 NAS에 저장됩니다. PC 앱에서 수정해 주세요.'
                    );
                }
                return;
            }
            try {
                const docRef = doc(firestore, 'tenants', this.tenantId, col, id);
                await setDoc(docRef, stripUndefinedForFirestore(newEntity));
                if (col === 'jobs') {
                    await this.bumpJobSyncPulse(id, 'upsert');
                } else {
                    const pulseField = this.collectionPulseField(col);
                    if (pulseField) await this.bumpSyncPulse({ [pulseField]: now });
                }
            } catch (e) {
                console.error(`[Firestore addEntity Error] Failed to upload ${col}/${id}:`, e);
                this.notifyFirestoreWriteError('데이터', e);
                throw e;
            }
        }
        
        this.updateTenantActivity().catch(() => {});
        if (col === 'jobs') this.scheduleLiveMirrorPush();
    }

    private patchLocalEntity(col: string, id: string, entity: any): any | null {
        if (col === 'jobs') {
            const existing = this.getAllJobs().find((j) => j.id === id);
            if (!existing) return null;
            const updated = stripClearedJobVisibilityFields({
                ...existing,
                ...entity,
                updatedAt: new Date().toISOString(),
                rev: nextJobRev(existing),
            } as Job);
            // null 클리어는 NAS JSON에 남겨 다른 PC 머지 롤백 방지
            for (const key of JOB_VISIBILITY_CLEAR_FIELDS) {
                if (entity[key] === null) {
                    (updated as any)[key] = null;
                }
            }
            this.placeJobInLocalCache(updated);
            this.rebuildMergedJobs();
            return updated;
        }

        const list = this.data[col] || [];
        const index = list.findIndex((e) => e.id === id);
        if (index === -1) return null;

        const existing = list[index];
        const updated =
            col === 'clients'
                ? {
                      ...existing,
                      ...entity,
                      updatedAt: new Date().toISOString(),
                      rev: nextClientRev(existing),
                      order:
                          typeof entity.order === 'number' && Number.isFinite(entity.order)
                              ? entity.order
                              : existing.order,
                  }
                : { ...existing, ...entity, updatedAt: new Date().toISOString() };
        list[index] = updated;
        this.data[col] = [...list];
        return updated;
    }

    private collectionPulseField(col: string): string | null {
        const map: Record<string, string> = {
            staff: 'staffAt',
            clients: 'clientsAt',
            settings: 'settingsAt',
            quotes: 'quotesAt',
            messages: 'messagesAt',
            leaves: 'leavesAt',
            papers: 'papersAt',
            instructions: 'instructionsAt',
            joinRequests: 'joinRequestsAt',
        };
        return map[col] ?? null;
    }

    private async persistEntity(col: string, id: string, updated: any, options?: { skipPulse?: boolean }) {
        if (this.tenantId && this.isLocalPrimaryMode() && this.isLocalOperationalCollection(col)) {
            await this.persistToLocalCollection(col, updated);
            if (col === 'clients') {
                this.flushLiveMirrorPushNow();
            } else if (this.isAuxCollection(col)) {
                const ok = await this.persistAuxCollectionToNas(col);
                if (!ok) {
                    throw new Error(
                        '회사 NAS에 저장하지 못했습니다. NAS 경로·연결을 확인한 뒤 다시 시도해 주세요.'
                    );
                }
            } else {
                this.scheduleLiveMirrorPush();
            }
            this.updateTenantActivity().catch(() => {});
            return;
        }
        if (col === 'jobs' && this.tenantId && this.isWebMirrorMode()) {
            throw new Error('web-readonly-jobs');
        }
        if (!this.canPersistToCloud(col)) {
            if (col === 'clients') {
                throw new Error(
                    '거래처는 매장 PC의 NAS/로컬 저장소에만 저장됩니다. PC 앱에서 작업·거래처를 등록해 주세요.'
                );
            }
            if (this.isAuxCollection(col)) {
                throw new Error(
                    '견적·용지·휴가·지시는 매장 PC 앱에서 회사 NAS에 저장됩니다. PC 앱에서 수정해 주세요.'
                );
            }
            return;
        }
        if (this.tenantId) {
            try {
                const docRef = doc(firestore, 'tenants', this.tenantId, col, id);
                await setDoc(docRef, stripUndefinedForFirestore(updated), { merge: true });
                if (!options?.skipPulse) {
                    if (col === 'jobs') {
                        await this.bumpJobSyncPulse(id, 'upsert');
                    } else {
                        const pulseField = this.collectionPulseField(col);
                        if (pulseField) {
                            await this.bumpSyncPulse({ [pulseField]: new Date().toISOString() });
                        }
                    }
                }
            } catch (e) {
                console.error(`[Firestore updateEntity Error] Failed to update ${col}/${id}:`, e);
                this.notifyFirestoreWriteError('데이터', e);
                throw e;
            }
        }

        this.updateTenantActivity().catch(() => {});
        if (col === 'jobs') this.scheduleLiveMirrorPush();
    }

    private async updateEntity(col: string, id: string, entity: any) {
        this.assertOperationalWriteAllowed(col);
        if (col === 'jobs' && this.isArchivedOnlyJob(id)) {
            const existing = this.archivedJobs.find((j) => j.id === id);
            if (!existing || !this.tenantId) return;
            const updated = {
                ...existing,
                ...entity,
                updatedAt: new Date().toISOString(),
                rev: nextJobRev(existing),
            } as Job;
            const ok = await jobArchiveService.upsertArchivedJob(this.tenantId, updated);
            if (!ok) throw new Error('보관 이력 업데이트에 실패했습니다.');
            this.archivedJobs = this.archivedJobs.map((j) => (j.id === id ? updated : j));
            this.rebuildArchiveMergedJobs();
            this.notify();
            return;
        }

        const updated = this.patchLocalEntity(col, id, entity);
        if (!updated) return;

        this.notify();

        try {
            await this.persistEntity(col, id, updated);
        } catch (e) {
            throw e;
        }
    }

    private async purgeJobFromArchiveLayers(jobId: string): Promise<void> {
        if (!this.tenantId || !jobId) return;
        this.archivedJobs = this.archivedJobs.filter((j) => j.id !== jobId);
        try {
            await jobArchiveService.removeArchivedJob(this.tenantId, jobId);
        } catch (e) {
            console.warn('[DataService] archive job purge failed:', e);
        }
    }

    private flushLiveMirrorPushNow(options?: { publishProductProcessing?: boolean }): Promise<boolean> {
        if (this.liveMirrorPushTimer) {
            clearTimeout(this.liveMirrorPushTimer);
            this.liveMirrorPushTimer = null;
        }
        return this.pushLiveMirrors(options);
    }

    /** 칸반 → 관리카드로 올리기 (회사 공통 — 칸반에서 자동 숨김) */
    async pinJobToManagementCard(jobId: string) {
        const target = this.getAllJobs().find((job) => job.id === jobId);
        if (!target) return;
        const pinnedAt = new Date().toISOString();
        await this.updateEntity('jobs', jobId, {
            managementCardPinnedAt: pinnedAt,
            boardHiddenAt: pinnedAt,
            boardHiddenReason: 'management_card',
        });
        const ok = await this.flushLiveMirrorPushNow();
        if (!ok) {
            throw new Error(
                '관리카드로 올렸지만 회사 NAS에 반영되지 않았습니다. NAS 경로·연결을 확인한 뒤 다시 시도해 주세요.'
            );
        }
    }

    /** 관리카드 → 칸반으로 내리기 (회사 공통) */
    async unpinJobFromManagementCard(jobId: string) {
        const target = this.getAllJobs().find((job) => job.id === jobId);
        if (!target) return;
        const restoreKanban = target.boardHiddenReason === 'management_card';
        await this.updateEntity('jobs', jobId, {
            ...jobVisibilityClearPatch(['managementCardPinnedAt']),
            ...(restoreKanban
                ? jobVisibilityClearPatch(['boardHiddenAt', 'boardHiddenBy', 'boardHiddenReason'])
                : {}),
        });
        const ok = await this.flushLiveMirrorPushNow();
        if (!ok) {
            throw new Error(
                '칸반으로 내렸지만 회사 NAS에 반영되지 않았습니다. NAS 경로·연결을 확인한 뒤 다시 시도해 주세요.'
            );
        }
    }

    private async deleteEntity(col: string, id: string) {
        this.assertOperationalWriteAllowed(col);
        if (col === 'jobs') {
            this.recordJobTombstone(id);
            await this.purgeJobFromArchiveLayers(id);
        }
        if (col === 'clients') {
            this.recordClientTombstone(id);
        }
        if (this.isAuxCollection(col)) {
            this.recordAuxTombstone(col, id);
        }

        if (col === 'jobs' && this.isArchivedOnlyJob(id)) {
            if (!this.tenantId) return;
            const ok = await jobArchiveService.removeArchivedJob(this.tenantId, id);
            if (!ok) throw new Error('보관 이력 삭제에 실패했습니다.');
            this.archivedJobs = this.archivedJobs.filter((j) => j.id !== id);
            this.rebuildArchiveMergedJobs();
            this.notify();
            if (col === 'jobs') this.flushLiveMirrorPushNow();
            return;
        }

        const previous =
            col === 'jobs'
                ? this.getAllJobs()
                : this.data[col] || [];

        if (col === 'jobs') {
            this.removeJobFromLocalCache(id);
        } else {
            this.data[col] = (this.data[col] || []).filter((e) => e.id !== id);
        }
        this.notify();
        
        if (this.tenantId) {
            if (this.isLocalPrimaryMode() && col === 'jobs') {
                const ok = await localDbBridge.deleteJob(this.tenantId, id);
                if (!ok) throw new Error('local-db-job-delete-failed');
                try {
                    const docRef = doc(firestore, 'tenants', this.tenantId, col, id);
                    await deleteDoc(docRef);
                    await this.bumpJobSyncPulse(id, 'delete');
                } catch (e) {
                    console.warn('[DataService] best-effort Firestore job delete:', e);
                }
                this.flushLiveMirrorPushNow();
                this.updateTenantActivity().catch(() => {});
                return;
            }
            if (this.isLocalPrimaryMode() && col === 'clients') {
                const ok = await localDbBridge.deleteClient(this.tenantId, id);
                if (!ok) throw new Error('local-db-client-delete-failed');
                this.flushLiveMirrorPushNow();
                return;
            }
            if (this.isLocalPrimaryMode() && this.isAuxCollection(col)) {
                const okLocal = await localDbBridge.deleteAuxEntity(this.tenantId, col, id);
                if (!okLocal) throw new Error(`local-db-${col}-delete-failed`);
                const okNas = await this.persistAuxCollectionToNas(col);
                if (!okNas) {
                    throw new Error(
                        '회사 NAS에 삭제를 반영하지 못했습니다. NAS 경로·연결을 확인해 주세요.'
                    );
                }
                this.updateTenantActivity().catch(() => {});
                return;
            }
            if (col === 'messages') {
                const ok = await this.persistMessagesToNas((this.data['messages'] || []) as ChatMessage[]);
                if (!ok) {
                    throw new Error('채팅 삭제 반영에 실패했습니다. NAS 연결을 확인해 주세요.');
                }
                this.updateTenantActivity().catch(() => {});
                return;
            }
            if (col === 'jobs' && this.isWebMirrorMode()) {
                throw new Error('web-readonly-jobs');
            }
            if (!this.canPersistToCloud(col)) {
                if (col === 'jobs') {
                    this.flushLiveMirrorPushNow();
                    this.updateTenantActivity().catch(() => {});
                }
                return;
            }
            try {
                const docRef = doc(firestore, 'tenants', this.tenantId, col, id);
                await deleteDoc(docRef);
                if (col === 'jobs') {
                    await this.bumpJobSyncPulse(id, 'delete');
                } else {
                    const pulseField = this.collectionPulseField(col);
                    if (pulseField) {
                        await this.bumpSyncPulse({ [pulseField]: new Date().toISOString() });
                    }
                }
            } catch (e) {
                if (col === 'jobs') {
                    this.operationalJobs = [];
                    this.kanbanCompletedJobs = [];
                    this.supplementaryJobs = [];
                    for (const job of previous as Job[]) {
                        this.placeJobInLocalCache(job);
                    }
                    this.rebuildMergedJobs();
                } else {
                    this.data[col] = previous;
                }
                this.notify();
                console.error(`[Firestore deleteEntity Error] Failed to delete ${col}/${id}:`, e);
                this.notifyFirestoreWriteError('삭제', e);
                throw e;
            }
        }
        
        this.updateTenantActivity().catch(() => {});
        if (col === 'jobs') this.flushLiveMirrorPushNow();
    }

    private static readonly SETTINGS_FRAGMENT_IDS = [
        'productDefinitions',
        'statusDefinitions',
        'processingDefinitions',
        'pricing',
        'roles',
        'kanbanLayout',
    ] as const;

    /** 직원도 저장 가능 — settings/main 병합 시 rules 거부되므로 조각 문서만 씀
     *  (상품·후가공은 NAS SSOT라 목록에서 제외) */
    private static readonly STAFF_SAFE_FRAGMENT_SETTINGS = [] as const;

    /** mergeSettingsDocs가 settings/{name} 조각 문서를 우선하므로, 저장 시 조각에도 동기화 */
    private buildSettingFragmentPayload(name: string, data: any): Record<string, unknown> {
        if (name === 'roles') return { roles: data.roles };
        if (name === 'productDefinitions' || name === 'statusDefinitions' || name === 'processingDefinitions') {
            return { definitions: data.definitions };
        }
        return data;
    }

    private async updateSetting(name: string, data: any) {
        if (this.isProductProcessingSetting(name) && !this.sessionCanManageProductProcessing) {
            throw new Error(
                '상품·후가공 설정은 메인/사내 관리자만 변경할 수 있습니다.'
            );
        }

        const settings = this.data['settings']?.[0] || {};
        settings[name] = data;
        if (this.isNasMasterSetting(name)) {
            const meta = this.getSettingsMetaMap(settings);
            meta[name] = { updatedAt: new Date().toISOString() };
            settings.settingsMeta = meta;
        }
        this.data['settings'] = [settings];
        this.notify();

        // 상품·후가공: NAS(+로컬 SQLite)만 — Firestore 조각 저장 금지 (옛 클라우드값이 롤백하던 원인)
        if (this.isNasMasterSetting(name)) {
            if (this.isWebMirrorMode()) {
                throw new Error(
                    '상품/후가공은 매장 PC 앱에서 회사 NAS에 저장됩니다. PC 앱에서 수정해 주세요.'
                );
            }
            if (this.tenantId && this.isLocalPrimaryMode()) {
                await localDbBridge.saveSettings(this.tenantId, settings);
            }
            const ok = await this.flushLiveMirrorPushNow({
                publishProductProcessing: this.isProductProcessingSetting(name),
            });
            if (!ok) {
                throw new Error(
                    '회사 NAS에 저장하지 못했습니다. NAS 경로·연결을 확인한 뒤 다시 시도해 주세요.'
                );
            }
            this.updateTenantActivity().catch(() => {});
            return;
        }
        
        if (this.tenantId && this.isLocalPrimaryMode()) {
            await localDbBridge.saveSettings(this.tenantId, settings);
            void this.flushLiveMirrorPushNow();
            return;
        }

        if (!this.canPersistToCloud()) {
            return;
        }
        
        if (this.tenantId) {
            try {
                const isStaffSafeFragment = (DataService.STAFF_SAFE_FRAGMENT_SETTINGS as readonly string[]).includes(name);

                if (isStaffSafeFragment) {
                    const fragmentRef = doc(firestore, 'tenants', this.tenantId, 'settings', name);
                    await setDoc(
                        fragmentRef,
                        stripUndefinedForFirestore(this.buildSettingFragmentPayload(name, data)),
                        { merge: true }
                    );
                } else {
                    const mainRef = doc(firestore, 'tenants', this.tenantId, 'settings', 'main');
                    await setDoc(mainRef, stripUndefinedForFirestore({ [name]: data }), { merge: true });

                    if ((DataService.SETTINGS_FRAGMENT_IDS as readonly string[]).includes(name)) {
                        const fragmentRef = doc(firestore, 'tenants', this.tenantId, 'settings', name);
                        await setDoc(
                            fragmentRef,
                            stripUndefinedForFirestore(this.buildSettingFragmentPayload(name, data)),
                            { merge: true }
                        );
                    }

                    if (name === 'companyInfo') {
                        const companyRef = doc(firestore, 'tenants', this.tenantId, 'settings', 'companyInfo');
                        await setDoc(companyRef, stripUndefinedForFirestore(data), { merge: true });
                    }
                }
            } catch (e) {
                console.error(`[Firestore updateSetting Error] Failed to update settings:`, e);
                this.notifyFirestoreWriteError('설정', e);
                throw e;
            }
            await this.bumpSyncPulse({ settingsAt: new Date().toISOString() });
        }

        if (!this.isWebMirrorMode()) {
            void this.flushLiveMirrorPushNow();
        }
        
        this.updateTenantActivity().catch(() => {});
    }

    // --- Public Business Methods ---
    async addJob(job: Job) {
        await this.addEntity('jobs', job);
        this.ensureQuotesSync();
        await this.ensureQuoteForJob(job);
    }
    async updateJob(job: Job) {
        const oldJob = this.getAllJobs().find((row) => row.id === job.id);
        let jobToSave = job;

        if (oldJob) {
            const prepaidResult = resolvePrepaidOnJobUpdate(oldJob, job, this.getClients());
            jobToSave = prepaidResult.job;

            for (const clientUpdate of prepaidResult.clientUpdates) {
                const client = this.getClients().find((row) => row.id === clientUpdate.clientId);
                if (!client) continue;
                const ledger = clientUpdate.ledgerEntry
                    ? appendPrepaidLedger(client, clientUpdate.ledgerEntry)
                    : client.prepaidLedger;
                await this.updateClient({
                    ...client,
                    prepaidBalance: clientUpdate.prepaidBalance,
                    prepaidLedger: ledger,
                });
            }

            if (prepaidResult.warning) {
                toast.warning(prepaidResult.warning, { duration: 6000 });
            } else if (prepaidResult.notice) {
                toast.success(prepaidResult.notice, { duration: 5000 });
            }

            const prepaidDelta = (prepaidResult.job.prepaidAppliedAmount || 0) - (oldJob.prepaidAppliedAmount || 0);
            if (prepaidDelta !== 0) {
                const history = [...(jobToSave.history || [])];
                history.push({
                    timestamp: new Date().toISOString(),
                    staffId: 'system',
                    action: prepaidDelta > 0 ? '선불 차감' : '선불 복구',
                    details:
                        prepaidDelta > 0
                            ? `선불 ${prepaidDelta.toLocaleString()}원 차감 (잔액 반영)`
                            : `선불 ${Math.abs(prepaidDelta).toLocaleString()}원 복구`,
                });
                jobToSave = { ...jobToSave, history };
            }
        }

        const { id, ...data } = jobToSave;
        await this.updateEntity('jobs', id!, data);
        const savedJob = this.getAllJobs().find((j) => j.id === id) || jobToSave;

        // 취소 건은 NAS 보관(jobs-archive)에도 병합해 작업 내역에서 유실되지 않게 함
        if (savedJob.status === 'CANCELED' && this.tenantId && savedJob.id) {
            try {
                await jobArchiveService.upsertArchivedJob(this.tenantId, savedJob);
                const idx = this.archivedJobs.findIndex((j) => j.id === savedJob.id);
                if (idx >= 0) this.archivedJobs[idx] = savedJob;
                else this.archivedJobs = [...this.archivedJobs, savedJob];
                this.rebuildArchiveMergedJobs();
                this.notify();
            } catch (e) {
                console.warn('[updateJob] canceled job archive upsert failed:', e);
            }
        }

        try {
            await this.syncQuoteFromJob(jobToSave);
        } catch (e) {
            console.error('[updateJob] quote sync failed (job saved):', e);
        }
    }
    async hideJobFromBoard(jobId: string, staffId?: string) {
        const target = this.getAllJobs().find((job) => job.id === jobId);
        if (!target) return;
        await this.updateEntity('jobs', jobId, {
            boardHiddenAt: new Date().toISOString(),
            boardHiddenBy: staffId || 'system',
            boardHiddenReason: 'manual',
        });
    }
    async unhideJobFromBoard(jobId: string) {
        const target = this.getAllJobs().find((job) => job.id === jobId);
        if (!target) return;
        const restoreFromManagementCard = target.boardHiddenReason === 'management_card';
        await this.updateEntity('jobs', jobId, {
            ...jobVisibilityClearPatch(['boardHiddenAt', 'boardHiddenBy', 'boardHiddenReason']),
            ...(restoreFromManagementCard
                ? jobVisibilityClearPatch(['managementCardPinnedAt'])
                : {}),
        });
    }

    /** 별표로 고정된 작업 목록 */
    getManagementCardJobs(): Job[] {
        return this.getAllJobs()
            .filter((job) => shouldShowInManagementCards(job))
            .sort(
                (a, b) =>
                    new Date(b.managementCardPinnedAt || 0).getTime() -
                    new Date(a.managementCardPinnedAt || 0).getTime()
            );
    }

    /** 완료·취소 등 관리카드 대상이 아닌 고정만 정리 (모달 열 때 1회) */
    async cleanupExpiredManagementCardPins(): Promise<void> {
        const expired = this.getAllJobs().filter(
            (job) => job.managementCardPinnedAt && isManagementCardExpired(job)
        );
        await Promise.all(expired.map((job) => this.unpinJobFromManagementCard(job.id)));
    }

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
        if (this.isWebMirrorMode()) {
            throw new Error('web-readonly-jobs');
        }

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
            updates.map(({ id, updated }) =>
                this.persistEntity('jobs', id, updated, { skipPulse: true })
            )
        );

        await this.bumpJobBatchSyncPulse(updates.map((u) => u.id));
        this.scheduleLiveMirrorPush();

        await Promise.all(
            updates.map(async ({ updated }) => {
                try {
                    await this.syncQuoteFromJob(updated);
                } catch (e) {
                    console.error('[saveJobsPartial] quote sync failed (jobs saved):', e);
                }
            })
        );
    }

    /** 직원 저장 — Firestore에 평문 password 쓰지 않음 (Firebase Auth만) */
    private stripStaffPasswordForPersist(staff: Staff): Staff {
        const { password: _pw, ...rest } = staff as Staff & { password?: string };
        return rest as Staff;
    }

    async addStaff(staff: Staff) {
        const cleaned = this.stripStaffPasswordForPersist(staff);
        // 동일 uid/loginId 문서가 있으면 신규 생성 대신 기존 문서 갱신 (중복·이력 staffId 분기 방지)
        const existing = (this.data['staff'] || []) as Staff[];
        const uid = cleaned.uid?.trim() || (cleaned.id && cleaned.id.length > 20 ? cleaned.id : '');
        const loginNorm = cleaned.loginId?.trim().toLowerCase() || '';
        const match =
            existing.find(
                (s) =>
                    !s.isDeleted &&
                    ((uid && (s.uid === uid || s.id === uid)) ||
                        (loginNorm && s.loginId?.trim().toLowerCase() === loginNorm))
            ) || null;
        if (match) {
            await this.updateStaff({
                ...match,
                ...cleaned,
                id: match.id,
                uid: cleaned.uid || match.uid || uid || match.id,
                name:
                    cleaned.name && cleaned.name.trim()
                        ? cleaned.name
                        : match.name,
            });
            return;
        }
        await this.addEntity('staff', cleaned);
    }
    async updateStaff(staff: Staff) {
        const cleaned = this.stripStaffPasswordForPersist(staff);
        const { id, ...data } = cleaned;
        await this.updateEntity('staff', id, data);
        // 기존 평문 password 필드 제거 (Auth만 사용)
        if (this.tenantId && this.canPersistToCloud('staff')) {
            try {
                await updateDoc(doc(firestore, 'tenants', this.tenantId, 'staff', id), {
                    password: deleteField(),
                });
            } catch (e) {
                console.warn('[updateStaff] plaintext password clear skipped:', e);
            }
        }
    }
    async updateStaffLastReadMsgId(staffId: string, lastReadMsgId: string) { await this.updateEntity('staff', staffId, { lastReadMsgId }); }
    async deleteStaff(id: string) {
        const staffList = (this.data['staff'] || []) as Staff[];
        const staff = staffList.find((s: Staff) => s.id === id);
        await this.updateEntity('staff', id, { isDeleted: true, active: false });
        const uid = staff?.uid || (staff?.id && staff.id.length > 20 ? staff.id : undefined);
        if (uid) {
            // 같은 uid를 쓰는 다른 활성 staff가 남아 있으면 users 비활성화 금지 (중복 정리 시 로그인 차단 방지)
            const stillLinked = staffList.some(
                (s) =>
                    s.id !== id &&
                    !s.isDeleted &&
                    s.active !== false &&
                    (s.uid === uid || s.id === uid)
            );
            if (stillLinked) {
                return;
            }
            try {
                await setDoc(doc(firestore, 'users', uid), {
                    active: false,
                    deactivatedAt: new Date().toISOString(),
                }, { merge: true });
            } catch (e) {
                console.warn('[deleteStaff] users 문서 비활성화 실패:', e);
            }
        }
    }

    /** loginId·이름·uid 기준 중복 staff soft-delete (관리자 전용) */
    private staffDedupeTimer: ReturnType<typeof setTimeout> | null = null;
    scheduleStaffDedupe() {
        if (!this.tenantId || !this.isSyncAdmin()) return;
        if (this.staffDedupeTimer) clearTimeout(this.staffDedupeTimer);
        this.staffDedupeTimer = setTimeout(() => {
            this.staffDedupeTimer = null;
            void this.dedupeStaffDuplicates();
        }, 800);
    }

    async dedupeStaffDuplicates(): Promise<number> {
        if (!this.tenantId || !this.isSyncAdmin()) return 0;

        const { isPlaceholderStaffName, scoreStaffRecord } = await import('../utils/staffMatch');

        const score = (s: Staff) => {
            // 실명·연락처가 풍부한 문서를 우선 — id===uid 빈 껍데기는 낮은 점수
            let n = scoreStaffRecord(s);
            if (s.id === s.uid && isPlaceholderStaffName(s.name)) n -= 40;
            return n;
        };

        /** loginId/uid 그룹에서 점수 낮은 쪽 제거 (보호 예외 없이 — 빈 중복 제거가 목적) */
        const markDuplicates = (groups: Map<string, Staff[]>, toRemove: Set<string>) => {
            for (const group of groups.values()) {
                if (group.length <= 1) continue;
                const sorted = [...group].sort(
                    (a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id))
                );
                const keeper = sorted[0];
                sorted.slice(1).forEach((s) => {
                    // keeper와 동일 문서가 아니면 제거. 실명이 서로 다르고 둘 다 실명이면 보존
                    if (
                        !isPlaceholderStaffName(s.name) &&
                        !isPlaceholderStaffName(keeper.name) &&
                        s.name.trim() !== keeper.name.trim() &&
                        s.loginId &&
                        keeper.loginId &&
                        s.loginId.toLowerCase() !== keeper.loginId.toLowerCase()
                    ) {
                        return;
                    }
                    toRemove.add(s.id);
                });
            }
        };

        const rows = (this.data['staff'] || []).filter((s: Staff) => !s.isDeleted) as Staff[];
        const toRemove = new Set<string>();

        const byLogin = new Map<string, Staff[]>();
        for (const s of rows) {
            const key = s.loginId?.trim().toLowerCase();
            if (!key) continue;
            if (!byLogin.has(key)) byLogin.set(key, []);
            byLogin.get(key)!.push(s);
        }
        markDuplicates(byLogin, toRemove);

        const byUid = new Map<string, Staff[]>();
        for (const s of rows) {
            if (toRemove.has(s.id)) continue;
            const key = s.uid?.trim();
            if (!key) continue;
            if (!byUid.has(key)) byUid.set(key, []);
            byUid.get(key)!.push(s);
        }
        markDuplicates(byUid, toRemove);

        // 이름만 같은 서로 다른 직원은 삭제하지 않음 (byName 제거)

        // keeper에 uid가 없고 loser에만 있으면 keeper로 uid를 옮긴 뒤 loser 삭제
        let removed = 0;
        for (const id of toRemove) {
            const target = rows.find((s) => s.id === id);
            if (!target) continue;
            try {
                // 삭제 전에 같은 uid/login 그룹 keeper에 uid 연결 보강
                const uidKey = target.uid?.trim();
                if (uidKey) {
                    const peers = rows.filter(
                        (s) => !toRemove.has(s.id) && s.uid === uidKey && s.id !== id
                    );
                    const keeper = peers.sort((a, b) => score(b) - score(a))[0];
                    if (keeper && !keeper.uid) {
                        await this.updateStaff({ ...keeper, uid: uidKey });
                    }
                }
                await this.deleteStaff(id);
                removed += 1;
            } catch (e) {
                console.warn('[dedupeStaffDuplicates] failed:', id, e);
            }
        }
        if (removed > 0) {
            console.log(`[dedupeStaffDuplicates] removed ${removed} duplicate staff record(s)`);
        }
        return removed;
    }
    
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

    /**
     * 거래처 합치기 — job/quote 재매핑 + primary 저장 + secondary tombstone을
     * 한 사이클에 끝내고 미러를 1회만 flush (중간 stale push로 secondary 부활 방지)
     */
    async applyClientMerge(params: {
        mergedClient: Client;
        secondaryId: string;
        secondaryName: string;
        primaryName: string;
    }): Promise<void> {
        this.assertOperationalWriteAllowed('clients');
        if (this.isWebMirrorMode()) {
            throw new Error('거래처 합치기는 매장 PC 앱에서만 가능합니다.');
        }
        const { mergedClient, secondaryId, secondaryName, primaryName } = params;
        if (!mergedClient?.id || !secondaryId) {
            throw new Error('합칠 거래처 정보가 올바르지 않습니다.');
        }

        this.recordClientTombstone(secondaryId);

        const now = new Date().toISOString();
        const jobUpdates: Job[] = [];
        for (const job of this.getAllJobs()) {
            if ((job.clientName || '').trim() !== secondaryName.trim()) continue;
            const existing = job;
            jobUpdates.push({
                ...existing,
                clientName: primaryName,
                updatedAt: now,
                rev: nextJobRev(existing),
            });
        }
        for (const updated of jobUpdates) {
            this.placeJobInLocalCache(updated);
        }
        if (jobUpdates.length) this.rebuildMergedJobs();

        const quotes = (this.data['quotes'] || []) as Quote[];
        let quotesChanged = false;
        this.data['quotes'] = quotes.map((q) => {
            if ((q.clientName || '').trim() !== secondaryName.trim()) return q;
            quotesChanged = true;
            return { ...q, clientName: primaryName, updatedAt: now };
        });

        const existingPrimary =
            ((this.data['clients'] || []) as Client[]).find((c) => c.id === mergedClient.id) ||
            mergedClient;
        const primarySaved: Client = {
            ...existingPrimary,
            ...mergedClient,
            updatedAt: now,
            rev: nextClientRev(existingPrimary),
            order:
                typeof mergedClient.order === 'number'
                    ? mergedClient.order
                    : existingPrimary.order ?? this.nextClientOrder(),
        };
        this.data['clients'] = filterClientsByTombstones(
            [
                ...((this.data['clients'] || []) as Client[]).filter(
                    (c) => c.id !== secondaryId && c.id !== primarySaved.id
                ),
                primarySaved,
            ],
            this.clientTombstones
        );

        this.notify();

        if (this.tenantId && this.isLocalPrimaryMode()) {
            for (const job of jobUpdates) {
                await this.persistToLocalCollection('jobs', job);
            }
            await this.persistToLocalCollection('clients', primarySaved);
            const okDel = await localDbBridge.deleteClient(this.tenantId, secondaryId);
            if (!okDel) throw new Error('local-db-client-delete-failed');
            if (quotesChanged) {
                await localDbBridge
                    .saveAuxCollection(this.tenantId, 'quotes', this.data['quotes'] || [])
                    .catch(() => false);
                const okQuotes = await this.persistAuxCollectionToNas('quotes');
                if (!okQuotes) {
                    throw new Error(
                        '회사 NAS에 견적 거래처명 반영에 실패했습니다. NAS 연결을 확인해 주세요.'
                    );
                }
            }
        }

        const ok = await this.flushLiveMirrorPushNow();
        if (!ok) {
            throw new Error(
                '거래처 합치기가 회사 NAS에 반영되지 않았습니다. NAS 경로·연결을 확인한 뒤 다시 시도해 주세요.'
            );
        }
        this.updateTenantActivity().catch(() => {});
    }

    /** 거래처 선불(예치) 추가 입금 */
    async addClientPrepaidDeposit(
        clientId: string,
        amount: number,
        staffId?: string,
        note?: string
    ): Promise<void> {
        const client = this.getClients().find((row) => row.id === clientId);
        if (!client) return;
        const deposit = Math.max(0, Math.round(amount));
        if (deposit <= 0) return;

        const newBalance = normalizePrepaidBalance(client.prepaidBalance) + deposit;
        const ledger = appendPrepaidLedger(client, {
            timestamp: new Date().toISOString(),
            type: 'deposit',
            amount: deposit,
            balanceAfter: newBalance,
            staffId: staffId || 'system',
            note: note?.trim() || '선불 추가 입금',
        });

        await this.updateClient({ ...client, prepaidBalance: newBalance, prepaidLedger: ledger });
    }

    /** 선불 이력 삭제 (입금·조정만 — 잔액 재계산) */
    async deleteClientPrepaidLedgerEntry(clientId: string, entryId: string): Promise<void> {
        const client = this.getClients().find((row) => row.id === clientId);
        if (!client) throw new Error('거래처를 찾을 수 없습니다.');

        const entry = (client.prepaidLedger || []).find((row) => row.id === entryId);
        if (!entry) throw new Error('선불 이력을 찾을 수 없습니다.');
        if (!canDeletePrepaidLedgerEntry(entry)) {
            throw new Error('작업 연동 차감·복구 내역은 삭제할 수 없습니다. 작업 결제 상태에서 조정해 주세요.');
        }

        const result = removeAndRecalculatePrepaidLedger(client, entryId);
        if (!result) throw new Error('선불 이력을 찾을 수 없습니다.');

        await this.updateClient({
            ...client,
            prepaidBalance: result.prepaidBalance,
            prepaidLedger: result.ledger,
        });
    }
    async deleteClient(id: string) { await this.deleteEntity('clients', id); }

    async addQuote(quote: Quote) { await this.addEntity('quotes', quote); }
    async updateQuote(quote: Quote) { const { id, ...data } = quote; await this.updateEntity('quotes', id, data); }
    async deleteQuote(id: string) { await this.deleteEntity('quotes', id); }

    getQuoteByJobId(jobId: string): Quote | undefined {
        return (this.data['quotes'] || []).find((q: Quote) => q.jobId === jobId);
    }

    async ensureQuoteForJob(job: Job): Promise<string> {
        const existing = findQuoteForJob(this.getQuotes(), job);
        if (existing) {
            await this.syncQuoteFromJob(job, existing);
            return existing.id;
        }

        const quote = buildQuoteFromJob(job);
        await this.addQuote(quote);

        if (job.id && job.linkedQuoteId !== quote.id) {
            await this.updateEntity('jobs', job.id, { linkedQuoteId: quote.id });
        }
        return quote.id;
    }

    async syncQuoteFromJob(job: Job, existingQuote?: Quote) {
        if (!job.id) return;
        const existing = existingQuote || findQuoteForJob(this.getQuotes(), job);
        const merged = buildQuoteFromJob(job, existing);

        if (existing) {
            if (isSameQuotePayload(existing, merged)) {
                return;
            }
            await this.updateQuote(merged);
            return;
        }

        await this.addQuote(merged);
        if (job.linkedQuoteId !== merged.id) {
            await this.updateEntity('jobs', job.id, { linkedQuoteId: merged.id });
        }
    }

    /** 관리자 1회 — 누락 견적만 생성 (throttle, 실패해도 기존 데이터 유지) */
    private async maybeBootstrapQuotes() {
        if (!this.tenantId || isStandaloneDocumentPreviewRoute() || this.isWebMirrorMode()) return;
        if (!this.isSyncAdmin()) return;
        if (this.quotesBootstrappedForTenant === this.tenantId) return;
        if (this.quotesBootstrapInProgress) return;

        this.quotesBootstrapInProgress = true;
        try {
            this.ensureQuotesSync();
            await new Promise((r) => setTimeout(r, 400));
            await this.bootstrapQuotesFromJobs();
            this.quotesBootstrappedForTenant = this.tenantId;
        } catch (e) {
            console.error('[maybeBootstrapQuotes] failed:', e);
        } finally {
            this.quotesBootstrapInProgress = false;
        }
    }

    /** 최초 동기화 완료 후 — 기존 작업에 견적 문서 보장 (미리보기 새 창·직원 세션 제외) */
    private async bootstrapQuotesFromJobs() {
        if (isStandaloneDocumentPreviewRoute() || !this.isSyncAdmin()) return;

        const jobs = this.getAllJobs();
        const BATCH = 5;
        const DELAY_MS = 300;

        for (let i = 0; i < jobs.length; i += BATCH) {
            const batch = jobs.slice(i, i + BATCH);
            await Promise.all(
                batch.map(async (job) => {
                    try {
                        await this.ensureQuoteForJob(job);
                    } catch (e) {
                        console.warn('[bootstrapQuotesFromJobs] skipped job', job.id, e);
                    }
                })
            );
            if (i + BATCH < jobs.length) {
                await new Promise((r) => setTimeout(r, DELAY_MS));
            }
        }
    }

    getQuoteTemplate(): QuoteTemplateSettings {
        return this.getSettingsObj()['quoteTemplate'] || { headerHeightMm: 17 };
    }

    async saveQuoteTemplate(template: QuoteTemplateSettings) {
        await this.updateSetting('quoteTemplate', template);
    }

    /** 매장 NAS 경로 — Firestore settings에 저장해 모든 PC가 동일 UNC 경로 사용 */
    async saveArchiveRootPath(archiveRootPath: string): Promise<void> {
        const raw = archiveRootPath?.trim();
        if (!raw) return;

        const resolved = await resolveArchivePathToUnc(raw);
        if (!resolved.ok) {
            throw new Error(resolved.error || 'NAS 경로를 UNC로 변환하지 못했습니다.');
        }
        // NAS/네트워크로 쓰는 경로(D~Z 매핑)만 UNC 강제 — C: 로컬 기본 폴더는 허용
        if (isNasOrNetworkPath(raw) || isNasOrNetworkPath(resolved.path)) {
            if (!isUncPath(resolved.path)) {
                throw new Error(
                    resolved.error ||
                        '회사 NAS는 네트워크 절대경로(\\\\서버\\공유)로만 저장할 수 있습니다.'
                );
            }
        }

        const path = resolved.path;
        setArchiveRootPath(path);
        setCompanyArchiveRootOverride(path);
        this.lastAppliedArchiveRootPath = path;
        this.pendingArchiveReconnect = false;
        this.pendingArchiveReconnectPath = null;
        const settings = this.getSettingsObj();
        settings[TENANT_ARCHIVE_ROOT_SETTINGS_KEY] = path;
        this.data['settings'] = [settings];
        this.notify();

        if (this.tenantId && this.isLocalPrimaryMode()) {
            await localDbBridge.saveSettings(this.tenantId, settings);
        }

        if (this.tenantId) {
            try {
                const now = new Date().toISOString();
                await setDoc(
                    doc(firestore, 'tenants', this.tenantId, 'settings', 'main'),
                    stripUndefinedForFirestore({ [TENANT_ARCHIVE_ROOT_SETTINGS_KEY]: path }),
                    { merge: true }
                );
                await this.bumpSyncPulse({
                    settingsAt: now,
                    archiveRootAt: now,
                });
            } catch (e) {
                console.warn('[DataService] archive root path cloud save failed:', e);
            }
        }

        void this.checkCompanyNasHealth(true);
        void this.refreshStoreGateway();
    }

    /** Firestore에 Z: 등 드라이브 경로가 남아 있으면 Electron 관리자 PC에서 UNC로 1회 교정 */
    private archiveUncCorrectAttempted = false;
    async maybeCorrectDriveLetterArchiveRoot(): Promise<string | null> {
        if (this.archiveUncCorrectAttempted) return null;
        if (!this.getIsElectron() || !this.tenantId || !this.isSyncAdmin()) return null;
        const current = getTenantArchiveRootFromSettings(this.getSettingsObj())?.trim() || null;
        if (!current || !isDriveLetterPath(current) || !isNasOrNetworkPath(current)) return null;

        this.archiveUncCorrectAttempted = true;
        try {
            const resolved = await resolveArchivePathToUnc(current);
            if (!resolved.ok || !isUncPath(resolved.path)) {
                console.warn('[DataService] archive Z:→UNC auto-correct skipped:', resolved.error);
                return null;
            }
            if (this.pathsEqualIgnoreSlash(current, resolved.path)) return null;
            await this.saveArchiveRootPath(resolved.path);
            console.log(`[DataService] archive root auto-corrected: ${current} → ${resolved.path}`);
            toast.success('회사 NAS 경로를 네트워크 절대경로(UNC)로 교정했습니다.', {
                description: resolved.path,
                duration: 8000,
            });
            return resolved.path;
        } catch (e) {
            console.warn('[DataService] archive UNC auto-correct failed:', e);
            return null;
        }
    }

    /** 사내 웹/태블릿 — LAN 게이트웨이 URL 목록 (Storage 폴백 전 우선) */
    async saveStoreGatewayUrls(storeGatewayUrls: string[]): Promise<void> {
        const urls = normalizeStoreGatewayUrls(storeGatewayUrls);
        if (urls.length === 0) return;

        const settings = this.getSettingsObj();
        settings.storeGatewayUrls = urls;
        settings.storeGatewayUrl = urls[0];
        this.data['settings'] = [settings];
        this.notify();

        if (this.tenantId && this.isLocalPrimaryMode()) {
            await localDbBridge.saveSettings(this.tenantId, settings);
        }

        if (this.tenantId) {
            try {
                await setDoc(
                    doc(firestore, 'tenants', this.tenantId, 'settings', 'main'),
                    stripUndefinedForFirestore({
                        storeGatewayUrl: urls[0],
                        storeGatewayUrls: urls,
                    }),
                    { merge: true }
                );
                await this.bumpSyncPulse({ settingsAt: new Date().toISOString() });
            } catch (e) {
                console.warn('[DataService] store gateway url save failed:', e);
            }
        }
    }

    /** @deprecated saveStoreGatewayUrls 사용 */
    async saveStoreGatewayUrl(storeGatewayUrl: string): Promise<void> {
        const url = storeGatewayUrl?.trim();
        if (!url) return;
        const existing = this.getStoreGatewayUrls().filter((item) => item !== url);
        await this.saveStoreGatewayUrls([url, ...existing]);
    }

    async uploadQuoteHeaderImage(file: File): Promise<string> {
        if (!this.tenantId) throw new Error('테넌트 정보가 없습니다.');
        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
        const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png';
        const objectPath = `tenants/${this.tenantId}/quote-header.${safeExt}`;
        const storageRef = ref(storage, objectPath);
        await uploadBytes(storageRef, file);
        return getDownloadURL(storageRef);
    }
    
    async upgradeTenantPlan(tenantId: string, plan: 'free' | 'pro', staffCount?: number) {
        const active = countActiveStaffSeats(this.data['staff'] || []);
        if (plan === 'pro') {
            const count = Math.max(1, staffCount ?? active);
            await this.updateTenantPlanSettings(tenantId, { staffCount: count, tier: 'paid' });
        } else {
            const count = Math.min(Math.max(1, staffCount ?? active), AD_TIER_MAX);
            await this.updateTenantPlanSettings(tenantId, { staffCount: count, tier: 'ad' });
        }
    }

    /** 인원 수 + 플랜 유형을 Firestore tenants 문서에 반영 (gift는 개발자 관리 도구 전용) */
    async updateTenantPlanSettings(
        tenantId: string,
        options: { staffCount: number; tier: PlanTier }
    ) {
        if (options.tier === 'gift') {
            throw new Error('무료(선물) 플랜은 개발자 관리 도구에서만 설정할 수 있습니다.');
        }
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
    async saveCompanyInfo(info: CompanyInfo) {
        await this.updateSetting('companyInfo', info);
        const bn = String(info.businessNumber || '').trim();
        if (this.tenantId && bn) {
            await setDoc(
                doc(firestore, 'tenants', this.tenantId),
                { businessNumber: bn },
                { merge: true }
            );
        }
    }
    async savePricingConfig(config: PricingConfig) { await this.updateSetting('pricing', config); }
    async saveProductDefinitions(definitions: JobTypeDefinition[]) { await this.updateSetting('productDefinitions', { definitions }); }
    async saveStatusDefinitions(definitions: JobStatusDefinition[], removedKeys?: string[]) {
        const existing = this.getSettingsObj()['statusDefinitions'];
        const payload = {
            definitions,
            removedKeys: removedKeys ?? existing?.removedKeys ?? [],
        };
        await this.updateSetting('statusDefinitions', payload);
    }
    async saveKanbanLayoutConfig(config: KanbanLayoutConfig) {
        await this.updateSetting('kanbanLayout', config);
    }
    /** 단계 + 칸반 레이아웃을 한 번에 저장 (NAS/로컬 SSOT — Firestore 우회 금지) */
    async saveStatusDefinitionsAndKanbanLayout(
        definitions: JobStatusDefinition[],
        layout: KanbanLayoutConfig,
        removedKeys?: string[]
    ) {
        const existing = this.getSettingsObj()['statusDefinitions'];
        await this.updateSetting('statusDefinitions', {
            definitions,
            removedKeys: removedKeys ?? existing?.removedKeys ?? [],
        });
        await this.updateSetting('kanbanLayout', layout);
    }
    async saveSmsConfig(config: any) { await this.updateSetting('smsConfig', config); }
    async saveRoles(roles: string[]) { await this.updateSetting('roles', { roles }); }
    async addRole(role: string) {
        if (isReservedStaffAuthRole(role)) return;
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

            // 2. Firestore 업로드 (업무 데이터 제외 — NAS·로컬 전용)
            if (this.tenantId) {
                const cloudCollections = collections.filter(
                    (c) =>
                        c !== 'jobs' &&
                        c !== 'clients' &&
                        c !== 'messages' &&
                        c !== 'quotes' &&
                        c !== 'papers' &&
                        c !== 'leaves' &&
                        c !== 'instructions'
                );
                for (const col of cloudCollections) {
                    if (backup[col] && Array.isArray(backup[col])) {
                        const promises = backup[col].map(async (item: any) => {
                            const docId = col === 'settings' ? 'main' : (item.id || this.generateId());
                            const docRef = doc(firestore, 'tenants', this.tenantId!, col, docId);
                            return setDoc(docRef, item);
                        });
                        await Promise.all(promises);
                    }
                }
                if (this.isLocalPrimaryMode()) {
                    await this.persistAllToLocalDb().catch((e) =>
                        console.warn('[importData] local db persist failed:', e)
                    );
                    this.flushLiveMirrorPushNow();
                } else if (Array.isArray(backup.jobs)) {
                    this.applyImportedJobs(backup.jobs);
                    this.flushLiveMirrorPushNow();
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
    getActiveJobs(): Job[] {
        return this.getAllJobs().filter(
            (j) =>
                j.status !== 'COMPLETED' &&
                j.status !== 'CANCELED' &&
                j.status !== 'QUOTE'
        );
    }
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
    getStaff(): Staff[] {
        return ((this.data['staff'] || []) as Staff[]).map(normalizeStaffRecord);
    }
    getClients(): Client[] {
        const list = (this.data['clients'] || []) as Client[];
        return [...list].sort((a, b) => {
            const oa = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
            const ob = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
            if (oa !== ob) return oa - ob;
            return (a.name || '').localeCompare(b.name || '', 'ko');
        });
    }
    getTotalPrepaidBalance(): number {
        return sumClientPrepaidBalances(this.getClients());
    }
    getQuotes(): Quote[] { return (this.data['quotes'] || []) as Quote[]; }
    getInstructions(): AdminInstruction[] { return (this.data['instructions'] || []) as AdminInstruction[]; }
    getMessages(): ChatMessage[] { return (this.data['messages'] || []) as ChatMessage[]; }
    getLeaves(): StaffLeave[] { return (this.data['leaves'] || []) as StaffLeave[]; }
    getPapers(): PaperStock[] { return (this.data['papers'] || []) as PaperStock[]; }

    getStatusDefinitionRemovedKeys(): string[] {
        return this.getSettingsObj()['statusDefinitions']?.removedKeys ?? [];
    }

    getStatusDefinitions(): JobStatusDefinition[] {
        const settings = this.getSettingsObj()['statusDefinitions'];
        const raw = settings?.definitions;
        const removedKeys = settings?.removedKeys ?? [];
        const base = raw?.length
            ? raw.map((s: JobStatusDefinition) => ({ ...s, isVisible: s.isVisible !== false }))
            : INITIAL_STATUS_DEFINITIONS.map((s) => ({ ...s, isVisible: s.isVisible !== false }));
        const { definitions } = mergeStatusDefinitionsWithInitial(base, removedKeys);
        return definitions.map((s) => normalizeStatusDefinition(s));
    }
    getKanbanLayoutConfig(): KanbanLayoutConfig {
        return normalizeKanbanLayoutConfig(this.getSettingsObj()['kanbanLayout']);
    }
    getProductDefinitions(): JobTypeDefinition[] {
        const raw = this.getSettingsObj()['productDefinitions']?.definitions || INITIAL_PRODUCT_DEFINITIONS;
        return mergeAllProductDefinitionsWithInitial(raw).definitions.map((def) => {
            if (!isBookletProductType(def.name)) return def;
            const paperWeights = sanitizeBookletPaperWeights(def.paperWeights);
            if (stringArraysEqual(paperWeights, def.paperWeights)) return def;
            return { ...def, paperWeights };
        });
    }
    /** 품목별로 상품 관리에서 선택한 후가공만 반환 (일반 품목용) */
    getProductProcessings(typeName: string): string[] {
        if (isBookletProductType(typeName)) {
            return this.getProductProcessingSets(typeName).common;
        }
        const def = this.getProductDefinitions().find(d => d.name === typeName);
        if (def?.processings && def.processings.length > 0) {
            return def.processings;
        }
        if (def && def.processings === undefined) {
            const initial = INITIAL_PRODUCT_DEFINITIONS.find(d => d.name === typeName);
            if (initial?.processings?.length) return initial.processings;
        }
        return [];
    }
    /** 책자·카탈로그 품목의 공통/표지/내지 후가공 목록 */
    getProductProcessingSets(typeName: string): ProductProcessingSets {
        if (!isBookletProductType(typeName)) {
            const def = this.getProductDefinitions().find((d) => d.name === typeName);
            if (def?.processings?.length) {
                return { common: def.processings, cover: [], inner: [] };
            }
            if (def && def.processings === undefined) {
                const initial = INITIAL_PRODUCT_DEFINITIONS.find((d) => d.name === typeName);
                if (initial?.processings?.length) {
                    return { common: initial.processings, cover: [], inner: [] };
                }
            }
            return { common: [], cover: [], inner: [] };
        }
        const def = this.getProductDefinitions().find((d) => d.name === typeName);
        return resolveBookletProcessingSets(def, typeName);
    }
    getProcessingDefinitions(): string[] {
        const raw = this.getSettingsObj()['processingDefinitions']?.definitions;
        if (!raw?.length) return [...INITIAL_PROCESSING_DEFINITIONS];
        // 저장된 목록 그대로 사용 — 삭제한 후가공을 INITIAL 병합으로 되살리지 않음
        return [...raw];
    }
    async saveProcessingDefinitions(definitions: string[]) { await this.updateSetting('processingDefinitions', { definitions }); }

    /** 삭제된 칸반 단계에 있던 작업을 다른 단계로 이동 */
    async migrateJobsFromStatus(fromKey: string, toKey: string): Promise<number> {
        const jobs = this.getAllJobs().filter((j) => j.status === fromKey);
        for (const job of jobs) {
            await this.updateJob({ ...job, status: toKey });
        }
        return jobs.length;
    }
    async restoreProductDefaults() { await this.saveProductDefinitions(INITIAL_PRODUCT_DEFINITIONS); }
    getJobTypes(): string[] { return this.getProductDefinitions().map(d => d.name); }
    getPricingConfig(): PricingConfig { return this.getSettingsObj()['pricing'] || { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 }; }
    getCompanyInfo(): CompanyInfo {
        const settings = this.getSettingsObj();
        const fromFragment: Partial<CompanyInfo> =
            (settings.companyInfo as CompanyInfo | undefined) || {};
        const fromLegacy = this.extractLegacyCompanyFields(settings);
        const merged: CompanyInfo = {
            ...fromLegacy,
            ...fromFragment,
            name:
                fromFragment.name?.trim() ||
                fromLegacy.name?.trim() ||
                this.mirrorCompanyName?.trim() ||
                (settings.name as string | undefined)?.trim() ||
                'EzPrintWork',
        };
        return merged;
    }
    getSmsConfig() { return this.getSettingsObj()['smsConfig'] || {}; }
    getRoles(): string[] {
        const raw = this.getSettingsObj()['roles']?.roles;
        if (!raw?.length) return DEFAULT_STAFF_ROLES;
        return mergeRolesWithInitial(raw).roles;
    }

    // Search Helpers
    searchClients(q: string, limit = 12): Client[] {
        const t = q.trim().toLowerCase();
        if (!t) return [];

        return this.getClients()
            .filter((c) => {
                if (c.name.toLowerCase().includes(t)) return true;
                if (c.contactPerson?.toLowerCase().includes(t)) return true;
                if (c.phone?.includes(t)) return true;
                if (c.businessRegistrationNumber?.includes(t)) return true;
                if (c.contacts?.some((contact) =>
                    contact.name?.toLowerCase().includes(t) ||
                    contact.phone?.includes(t)
                )) return true;
                return false;
            })
            .slice(0, limit);
    }

    getJobsByClient(clientName: string): Job[] {
        return this.getAllJobs().filter(j => j.clientName === clientName);
    }

    // TypeScript errors bypass / Mock implementations for local JSON DB
    async addMessage(msg: ChatMessage) {
        await this.addEntity('messages', msg);
    }

    searchJobs(q: string): Job[] {
        const queryText = q.trim().toLowerCase();
        if (!queryText) return [];
        const digitsOnly = queryText.replace(/\D/g, '');

        return this.getAllJobs().filter((job) => {
            const fields = [
                job.title,
                job.clientName,
                job.clientPhone,
                job.contactPerson,
                job.id,
                formatJobNumber(job),
                job.specs?.paperType,
                job.specs?.size,
                job.specs?.quantity,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            if (fields.includes(queryText)) return true;
            if (digitsOnly.length >= 4) {
                const phoneDigits = (job.clientPhone || '').replace(/\D/g, '');
                if (phoneDigits.includes(digitsOnly)) return true;
            }
            return false;
        });
    }

    /** 칸반에 없어도 최근 1년·아카이브 작업까지 포함해 검색 */
    async searchJobsAsync(q: string): Promise<Job[]> {
        const queryText = q.trim();
        if (queryText.length < 2) return [];

        if (this.isLocalPrimaryMode()) {
            await this.ensureColdArchiveLoaded();
        } else {
            await Promise.all([this.ensureColdArchiveLoaded(), this.fetchJobsBySearchQuery(queryText)]);
        }

        const hits = this.searchJobs(queryText);
        return hits.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
                definitions: mergeAllProductDefinitionsWithInitial(
                    Array.from(mergedProductDefsMap.values())
                ).definitions,
            };

            // 후가공 정의 병합 (합집합 + 앱 기본값)
            const curProcDefs = curSettingsObj.processingDefinitions?.definitions || [];
            const impProcDefs = impSettingsObj.processingDefinitions?.definitions || [];
            const procUnion = mergeStringListField(
                mergeStringListField(curProcDefs, impProcDefs),
                INITIAL_PROCESSING_DEFINITIONS
            );
            mergedSettings.processingDefinitions = {
                definitions: procUnion,
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

            // 2. Firestore 일괄 업로드 (jobs/clients/messages 제외)
            if (this.tenantId) {
                const cloudCollections = collections.filter(
                    (c) => c !== 'jobs' && c !== 'clients' && c !== 'messages'
                );
                for (const col of cloudCollections) {
                    if (mergedData[col] && Array.isArray(mergedData[col])) {
                        const promises = mergedData[col].map(async (item: any) => {
                            const docId = col === 'settings' ? 'main' : (item.id || this.generateId());
                            const docRef = doc(firestore, 'tenants', this.tenantId!, col, docId);
                            return setDoc(docRef, item);
                        });
                        await Promise.all(promises);
                    }
                }
                if (this.isLocalPrimaryMode()) {
                    await this.persistAllToLocalDb().catch((e) =>
                        console.warn('[saveImportedData] local db persist failed:', e)
                    );
                    this.flushLiveMirrorPushNow();
                } else if (Array.isArray(mergedData.jobs)) {
                    this.applyImportedJobs(mergedData.jobs);
                    this.flushLiveMirrorPushNow();
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

export { formatJobNumber } from '../utils/jobNumber';
