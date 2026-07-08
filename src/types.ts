
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

export type PaymentStatus = '결제대기' | '일부결제' | '결제완료' | '취소';

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
  
  // Booklet Specifics (내지)
  paperTypeInner?: string;
  paperWeightInner?: string;
  printColorInner?: string;
  innerPages?: InnerPageSpec[];
  hasCoverWing?: boolean;
  processingCover?: string[];
  processingInner?: string[];
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
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  phone: string;        
  phoneOffice?: string; 
  phoneCompany?: string; 
  extensionNumber?: string; 
  avatarUrl: string;
  active: boolean;
  email: string;
  uid?: string; // Firebase User ID link
  loginId?: string; // Custom login ID
  password?: string; // Plaintext password (stored in private tenant staff collection)
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
  createDatabaseFile: (content: string) => Promise<string | null>; 
  startWatch: (path: string) => void; 
  onFileChange: (callback: (path: string) => void) => void;
  openExternal: (url: string) => Promise<boolean>;
  openPath: (path: string) => Promise<boolean>;
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
  }>;
  updaterDownload?: () => Promise<{ ok: boolean; error?: string }>;
  updaterInstall?: () => Promise<{ ok: boolean }>;
  onUpdaterStatus?: (callback: (payload: ElectronUpdaterStatus) => void) => () => void;
  createDesktopShortcut?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  findLegacyDbFiles: () => Promise<{ name: string; path: string; size: string; mtime: string }[]>;
  localDbLoad?: (tenantId: string) => Promise<{
    success: boolean;
    jobs?: unknown[];
    clients?: unknown[];
    settings?: Record<string, unknown> | null;
    jobCount?: number;
    error?: string;
  }>;
  localDbSaveJobs?: (tenantId: string, jobs: unknown[]) => Promise<{ success: boolean }>;
  localDbUpsertJob?: (tenantId: string, job: unknown) => Promise<{ success: boolean }>;
  localDbDeleteJob?: (tenantId: string, jobId: string) => Promise<{ success: boolean }>;
  localDbSaveClients?: (tenantId: string, clients: unknown[]) => Promise<{ success: boolean }>;
  localDbUpsertClient?: (tenantId: string, client: unknown) => Promise<{ success: boolean }>;
  localDbDeleteClient?: (tenantId: string, clientId: string) => Promise<{ success: boolean }>;
    localDbSaveSettings?: (tenantId: string, settings: Record<string, unknown>) => Promise<{ success: boolean }>;
  gatewaySetConfig?: (config: { archiveRoot: string | null; tenantId: string | null }) => Promise<{ ok: boolean }>;
  gatewayGetInfo?: () => Promise<{ port: number; baseUrl: string; lanUrls: string[] }>;
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
