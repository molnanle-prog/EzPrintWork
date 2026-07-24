
export interface JobStatusDefinition {
  key: string;    // e.g., 'RECEIVED', 'DESIGN' (변경불가 고유값)
  label: string;  // e.g., '접수', '디자인 시안' (사용자 편집 가능)
  isVisible?: boolean; // 칸반 보드 표시 여부 (기본값 true)
}

/** 한 칸(가로 1슬롯) 안에서 위·아래로 쌓는 두 단계 */
export interface KanbanSplitPair {
  topKey: string;
  bottomKey: string;
  splitTopPercent?: number; // 상단 비율 (35~85, 기본 65)
  bottomCompact?: boolean;  // 하단을 견적상자형 컴팩트로 (기본 true)
}

/** 칸반 보드 레이아웃 (관리자 설정) */
export interface KanbanLayoutConfig {
  splitPairs: KanbanSplitPair[];
}

export enum Priority {
  NORMAL = '일반',
  URGENT = '긴급',
  VERY_URGENT = '매우긴급'
}

export type PaymentStatus = '결제대기' | '일부결제' | '후불결제' | '결제완료' | '취소';

export interface InnerPageSpec {
  id: string;
  paperType: string;
  paperWeight: string;
  printColor: string;
  pagesCount: string;
  hasDivider?: boolean;
  dividerColor?: string;
  dividerQuantity?: string;
  isDivider?: boolean;
}

export interface JobSpecs {
  paperType: string;    // 스노우지, 아트지, 모조지 등 (책자일 경우: 표지)
  paperWeight: string;  // 100g, 150g, 250g 등 (책자일 경우: 표지)
  size: string;         // A4, A3, 명함사이즈 등
  quantity: string;     // 500매, 1건 등
  processing: string[]; // 코팅, 접지, 미싱, 귀도리 등 (배열)
  printColor: string;   // 단면 4도, 양면 8도 등 (책자일 경우: 표지)
  memo: string;         // 추가 텍스트 메모
  /** 품목별 메모장 — 긴 내용 + NAS 첨부(이미지/PDF/AI 등) */
  notebook?: JobNotebook;

  // Booklet Specifics (내지)
  paperTypeInner?: string;
  paperWeightInner?: string;
  printColorInner?: string;
  innerPages?: InnerPageSpec[];
  hasCoverWing?: boolean;
  processingCover?: string[];
  processingInner?: string[];
}

/** 품목 메모장 첨부 — 원본 파일 위치(경로)만 저장 (복사하지 않음) */
export interface JobNotebookAttachment {
  id: string;
  fileName: string;
  /** 원본 절대/UNC 경로 */
  filePath: string;
  /** @deprecated 구버전 NAS 복사본 호환용 */
  relativePath?: string;
}

export interface JobNotebook {
  text?: string;
  attachments?: JobNotebookAttachment[];
}

// Sub-item within a job (e.g., Business Card part of a larger order)
export interface JobItem {
  id: string;
  type: string;       // 명함, 전단지...
  specs: JobSpecs;    // Specific specs for this item
  completed?: boolean; // 개별 품목 완료 상태
  /** 종류별 견적 계산기 — 품목별 입력 금액(공급가액) */
  lineQuote?: number;
}

// Generic log for all job changes
export interface JobHistoryLog {
  timestamp: string;
  staffId: string; // Who made the change
  action: string;  // e.g., "상태 변경", "담당자 변경"
  details: string; // e.g., "접수 -> 디자인", "김철수 -> 이영희"
}

export interface Job {
  id: string;
  title: string;
  clientName: string; // 고객사 (상호)
  contactPerson?: string; // 담당자 (고객명)
  clientPhone?: string; 
  description: string; 
  specs: JobSpecs; 
  subJobs?: JobItem[]; 
  status: string; 
  priority: Priority;
  paymentStatus: PaymentStatus; 
  assignedStaffId?: string; 
  assignedStaffIds?: string[]; 
  history?: JobHistoryLog[]; 
  createdAt: string;
  dueDate: string;
  completedAt?: string;
  progress: number;
  type: string; 
  price: number;
  /** 총액이 부가세 포함 금액인지 여부 */
  priceIncludesVat?: boolean;
  linkedQuoteId?: string;
  order: number; 
  filePath?: string; 
  thumbnailUrl?: string;
  /** 보드(칸반/달력/상황판)에서만 숨김. 이력/검색에는 남김 */
  boardHiddenAt?: string | null;
  boardHiddenBy?: string | null;
  /** 보드 숨김 사유 — 관리카드 이동 vs 수동 내리기 구분 */
  boardHiddenReason?: 'management_card' | 'manual' | 'canceled' | null;
  /** 이 작업에 선불로 차감된 금액 */
  prepaidAppliedAmount?: number;
  /** 선수금 외 실제 수납액(현금·카드 등). 미수 = price - prepaidAppliedAmount - paidAmount */
  paidAmount?: number;
  /** 결제 시 선불 차감 사용 (기본 true — false면 별도 수금) */
  usePrepaidForPayment?: boolean;
  /** 관리카드로 올린 시각 — 회사 공통(작업 문서), 개인별 아님 */
  managementCardPinnedAt?: string | null;
  /** 마지막 수정 시각 — 표시/보조 정렬용. PC 간 병합 승패 판단은 rev 우선 */
  updatedAt?: string;
  /**
   * 동기화용 리비전 번호 — 수정마다 +1. 여러 PC가 NAS로 병합할 때
   * 시스템 시계가 서로 달라도(clock skew) 정확한 선후 관계를 보장하기 위함.
   * 값이 없는 옛 데이터는 updatedAt(시각)으로 대체 비교.
   */
  rev?: number;
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  /** 사내 관리자 권한 — 직책(role)과 별도, 뱃지·권한용 */
  isCompanyAdmin?: boolean;
  phone: string;        
  phoneOffice?: string; 
  phoneCompany?: string; 
  extensionNumber?: string; 
  avatarUrl: string;
  active: boolean;
  email: string;
  uid?: string; // Firebase User ID link
  loginId?: string; // Custom login ID
  password?: string; // UI 입력용만 — Firestore staff에는 저장하지 않음 (Firebase Auth)
  joinDate: string;
  isDeleted?: boolean; 
  lastReadMsgId?: string; // Last confirmed message ID in chat widget
}

export interface JoinRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  message?: string;
}

export interface StaffLeave {
  id: string;
  staffId: string;
  type: '연차' | '반차' | '병가' | '기타';
  startDate: string; // ISO Date String
  endDate: string;   // ISO Date String
  reason?: string;
}

export interface QuoteLine {
  id: string;
  subJobId?: string;
  productType: string;
  description: string;
  quantity: string;
  unitPrice: number;
  amount: number;
}

export interface QuoteTemplateSettings {
  /** Firebase Storage URL — 테넌트당 1장, 견적 문서마다 복사하지 않음 */
  headerImageUrl?: string;
  headerHeightMm?: number;
}

export interface Quote {
  id: string;
  jobId?: string;
  /** 연결된 작업 제목 */
  title?: string;
  clientName: string;
  contactPerson?: string;
  clientPhone?: string;
  items: string;
  lines?: QuoteLine[];
  totalAmount: number;
  supplyAmount?: number;
  vatAmount?: number;
  vatIncluded?: boolean;
  discountAmount?: number;
  date: string;
  status: '대기' | '승인' | '거절';
  updatedAt?: string;
  createdAt?: string;
}

export interface AdminInstruction {
  id: string;
  content: string;
  date: string;
  important: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  /** 발신 시점에 저장 — staff.uid 미연동 시에도 이름 표시용 */
  senderName?: string;
  receiverId?: string; 
  content: string;
  timestamp: string;
  type?: 'text' | 'call'; 
}

// --- New Types for Settings ---

export interface ClientContact {
    name: string;
    phone: string;
    email?: string;
    department?: string; 
}

export type PrepaidLedgerType = 'deposit' | 'deduction' | 'restore' | 'adjustment';

export interface PrepaidLedgerEntry {
  id: string;
  timestamp: string;
  type: PrepaidLedgerType;
  /** 입금·복구는 양수, 차감은 음수 */
  amount: number;
  balanceAfter: number;
  staffId?: string;
  jobId?: string;
  jobTitle?: string;
  note?: string;
}

export interface Client {
  id: string;
  name: string;
  businessRegistrationNumber?: string; 
  contactPerson: string; 
  phone: string; 
  email?: string;
  address?: string;
  note?: string;
  contacts: ClientContact[]; 
  sendSmsOnComplete?: boolean; // 완료 시 알림 문자 발송 여부
  customSmsNumber?: string;    // 알림 수신 전용 연락처 (비어있으면 기본 연락처 사용)
  /** 선불(예치) 잔액 — 작업 결제 시 자동 차감 */
  prepaidBalance?: number;
  /** 선불 입출금 이력 */
  prepaidLedger?: PrepaidLedgerEntry[];
  /** PC 간 병합 리비전 (클럭 skew 완화) */
  rev?: number;
  updatedAt?: string;
  createdAt?: string;
  /** 목록 표시·저장 순서 (낮을수록 앞) */
  order?: number;
}

export interface PaperStock {
  id: string;
  name: string; 
  weight: string; 
  type: string; 
  unitPrice: number; 
  stockLevel: 'high' | 'medium' | 'low';
}

export interface JobTypeDefinition {
  name: string; 
  sizes: string[]; 
  paperTypes: string[]; 
  paperWeights: string[]; 
  /** 일반 품목 후가공 / 책자·카탈로그 제본·공통 후가공 */
  processings?: string[];
  /** 책자·카탈로그 표지 전용 후가공 */
  processingsCover?: string[];
  /** 책자·카탈로그 내지 전용 후가공 */
  processingsInner?: string[];
}

export interface ProductProcessingSets {
  common: string[];
  cover: string[];
  inner: string[];
}

export interface PricingConfig {
  baseLaborCost: number; 
  printColorCost: number; 
  marginRate: number; 
}

export interface NasConfig {
  isEnabled: boolean;
  path: string; 
  dbPath?: string;
  status: 'connected' | 'disconnected' | 'error';
}

export interface SmsConfig {
  mode: 'app' | 'api'; 
  provider: 'coolsms' | 'aligo' | 'solapi' | 'munjavibe' | 'gabia';
  apiKey: string;
  apiSecret: string;
  senderNumber: string; 
  pfId?: string;
  useAlimtalk?: boolean;
  alimtalkTemplates?: Record<string, string>;
  completedMessageTemplate?: string;
  billingMessageTemplate?: string;
  sendOnComplete?: boolean;
}

export interface CompanyInfo {
  name: string;
  ceoName?: string;
  businessNumber?: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
  bankAccount?: string;
}

// --- SaaS & Auth Types ---
export interface Tenant {
  id: string;
  name: string;
  ownerId: string;
  licenseKey?: string;
  licenseExpiresAt?: string;
  plan: string;
  createdAt: string;
  businessNumber?: string;
  joinCode?: string;
  /** 대표(메인 관리자) 연락처 — 최초 가입 필수, 장애·문의 통화용 */
  ownerPhone?: string;
  /** ownerPhone 별칭 (관리 프로그램 호환) */
  contactPhone?: string;
}

export interface AppUser {
  uid: string;
  id: string; // Alias for uid
  email: string;
  displayName: string;
  name: string; // Alias for displayName
  photoURL: string;
  avatarUrl: string; // Alias for photoURL
  tenantId: string | null;
  role: 'admin' | 'staff' | 'superadmin';
  loginId?: string;
  /** 대표·직원 연락처 */
  contactInfo?: string;
}

export interface AuthData {
  adminPasswordHash: string;
}

// --- Electron Bridge ---

export type ElectronUpdaterPhase =
  | 'checking'
  | 'available'
  | 'none'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface ElectronUpdaterStatus {
  phase: ElectronUpdaterPhase;
  version?: string;
  /** 설치된 PC 앱 버전 */
  currentVersion?: string;
  releaseDate?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  message?: string;
  /** true면 자동 확인 실패 — UI 토스트 생략 */
  silent?: boolean;
}

export interface IElectronAPI {
  saveFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>;
  readFile: (path: string) => Promise<{ success: boolean; data?: string | null; error?: string; mtime?: number }>;
  checkPath: (path: string) => Promise<boolean>;
  checkFileExists: (path: string) => Promise<boolean>; 
  exists: (path: string) => Promise<boolean>;
  selectDirectory: () => Promise<string | null>; 
  selectFileOrFolder: () => Promise<string | null>;
  selectFiles?: (options?: {
    filters?: { name: string; extensions: string[] }[];
    defaultPath?: string;
    openSelectedFolderAfter?: boolean;
  }) => Promise<string[]>;
  copyFile?: (source: string, dest: string) => Promise<{ success: boolean; error?: string }>;
  ensureDir?: (path: string) => Promise<{ success: boolean; error?: string }>;
  /** 드라이브 문자(Z:) → UNC(\\server\share) 변환 */
  resolveUncPath?: (path: string) => Promise<{
    ok: boolean;
    path: string | null;
    unc: boolean;
    stillDrive?: boolean;
    changed?: boolean;
    error?: string;
  }>;
  createDatabaseFile: (content: string) => Promise<string | null>; 
  startWatch: (path: string) => void; 
  onFileChange: (callback: (path: string) => void) => void;
  openExternal: (url: string) => Promise<boolean>;
  openPath: (path: string) => Promise<boolean>;
  revealInFolder?: (path: string) => Promise<boolean>;
  getDocumentsPath: () => Promise<string>;
  getUserDataPath?: () => Promise<string | null>;
  checkDirectoryStatus?: (path: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  
  dbConnect: (dbPath: string) => Promise<{ success: boolean; error?: string }>;
  dbQuery: (sql: string, params?: any[]) => Promise<{ success: boolean; data?: any; error?: string }>;

  verifyLicense: () => Promise<{ isValid: boolean; msg?: string; data?: any }>;
  activateLicense: (data: any) => Promise<{ success: boolean; msg?: string }>; 
  requestPurchase: (data: any) => Promise<{ success: boolean; msg?: string }>;
  getMachineId: () => Promise<string>;
  getLicenseInfo: () => Promise<any>;

  getAppVersion: () => Promise<string>;
  /** GitHub Release 기반 데스크톱 설치본 자동 업데이트 */
  updaterCheck?: () => Promise<{
    ok: boolean;
    currentVersion: string;
    updateInfo?: { version: string; releaseDate?: string } | null;
    error?: string;
    busy?: boolean;
  }>;
  updaterDownload?: () => Promise<{
    ok: boolean;
    error?: string;
    busy?: boolean;
    alreadyLatest?: boolean;
  }>;
  updaterInstall?: () => Promise<{ ok: boolean; busy?: boolean }>;
  onUpdaterStatus?: (callback: (payload: ElectronUpdaterStatus) => void) => () => void;
  createDesktopShortcut?: () => Promise<{ ok: boolean; path?: string; paths?: string[]; error?: string }>;
  getOpenAtLogin?: () => Promise<{ ok: boolean; enabled: boolean; supported?: boolean; error?: string }>;
  setOpenAtLogin?: (enabled: boolean) => Promise<{ ok: boolean; enabled: boolean; supported?: boolean; error?: string }>;
  findLegacyDbFiles: () => Promise<{ name: string; path: string; size: string; mtime: string }[]>;
  localDbLoad?: (tenantId: string) => Promise<{
    success: boolean;
    jobs?: unknown[];
    clients?: unknown[];
    settings?: Record<string, unknown> | null;
    jobCount?: number;
    quotes?: unknown[];
    papers?: unknown[];
    leaves?: unknown[];
    instructions?: unknown[];
    error?: string;
  }>;
  localDbSaveJobs?: (tenantId: string, jobs: unknown[]) => Promise<{ success: boolean }>;
  localDbUpsertJob?: (tenantId: string, job: unknown) => Promise<{ success: boolean }>;
  localDbDeleteJob?: (tenantId: string, jobId: string) => Promise<{ success: boolean }>;
  localDbSaveClients?: (tenantId: string, clients: unknown[]) => Promise<{ success: boolean }>;
  localDbUpsertClient?: (tenantId: string, client: unknown) => Promise<{ success: boolean }>;
  localDbDeleteClient?: (tenantId: string, clientId: string) => Promise<{ success: boolean }>;
  localDbSaveSettings?: (tenantId: string, settings: Record<string, unknown>) => Promise<{ success: boolean }>;
  localDbSaveAux?: (
    tenantId: string,
    collection: string,
    items: unknown[]
  ) => Promise<{ success: boolean }>;
  localDbUpsertAux?: (
    tenantId: string,
    collection: string,
    entity: unknown
  ) => Promise<{ success: boolean }>;
  localDbDeleteAux?: (
    tenantId: string,
    collection: string,
    id: string
  ) => Promise<{ success: boolean }>;
  gatewaySetConfig?: (config: {
    archiveRoot: string | null;
    tenantId: string | null;
    gatewayToken?: string | null;
  }) => Promise<{ ok: boolean }>;
  gatewayGetInfo?: () => Promise<{ port: number; baseUrl: string; lanUrls: string[] }>;
  /** 문서 인쇄 (단면 simplex 강제) */
  printDocument?: () => Promise<{ success: boolean; error?: string }>;
  /** 문서 PDF 저장 — 인쇄와 동일 Chromium 렌더 (printToPDF) */
  printDocumentToPdf?: (
    defaultFileName: string
  ) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  lower: () => void;
  toggleAlwaysOnTop: (flag: boolean) => void;
  setSize: (width: number, height: number) => void; 
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
