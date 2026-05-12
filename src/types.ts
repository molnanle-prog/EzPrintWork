
export interface JobStatusDefinition {
  key: string;    // e.g., 'RECEIVED', 'DESIGN' (변경불가 고유값)
  label: string;  // e.g., '접수', '디자인 시안' (사용자 편집 가능)
  isVisible?: boolean; // 칸반 보드 표시 여부 (기본값 true)
}

export enum Priority {
  NORMAL = '일반',
  URGENT = '긴급',
  VERY_URGENT = '매우긴급'
}

export type PaymentStatus = '결제대기' | '일부결제' | '결제완료' | '취소';

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
}

// Sub-item within a job (e.g., Business Card part of a larger order)
export interface JobItem {
  id: string;
  type: string;       // 명함, 전단지...
  specs: JobSpecs;    // Specific specs for this item
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
  isDeleted?: boolean; 
}

export interface StaffLeave {
  id: string;
  staffId: string;
  type: '연차' | '반차' | '병가' | '기타';
  startDate: string; // ISO Date String
  endDate: string;   // ISO Date String
  reason?: string;
}

export interface Quote {
  id: string;
  clientName: string;
  items: string;
  totalAmount: number;
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
}

export interface PricingConfig {
  baseLaborCost: number; 
  printColorCost: number; 
  marginRate: number; 
}

export interface NasConfig {
  isEnabled: boolean;
  path: string; 
  status: 'connected' | 'disconnected' | 'error';
}

export interface SmsConfig {
  mode: 'app' | 'api'; 
  provider: 'coolsms' | 'aligo';
  apiKey: string;
  apiSecret: string;
  senderNumber: string; 
  pfId?: string;
  useAlimtalk?: boolean;
  alimtalkTemplates?: Record<string, string>;
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
  plan: 'free' | 'pro';
  createdAt: string;
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
}

export interface AuthData {
  adminPasswordHash: string;
}

// --- Electron Bridge ---
export interface IElectronAPI {
  saveFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>;
  readFile: (path: string) => Promise<{ success: boolean; data?: string | null; error?: string }>;
  checkPath: (path: string) => Promise<boolean>;
  checkFileExists: (path: string) => Promise<boolean>; 
  selectDirectory: () => Promise<string | null>; 
  createDatabaseFile: (content: string) => Promise<string | null>; 
  startWatch: (path: string) => void; 
  onFileChange: (callback: (path: string) => void) => void;
  openExternal: (url: string) => Promise<boolean>;
  openPath: (path: string) => Promise<boolean>;
  
  dbConnect: (dbPath: string) => Promise<{ success: boolean; error?: string }>;
  dbQuery: (sql: string, params?: any[]) => Promise<{ success: boolean; data?: any; error?: string }>;

  verifyLicense: () => Promise<{ isValid: boolean; msg?: string; data?: any }>;
  activateLicense: (data: any) => Promise<{ success: boolean; msg?: string }>; 
  requestPurchase: (data: any) => Promise<{ success: boolean; msg?: string }>;
  getMachineId: () => Promise<string>;
  getLicenseInfo: () => Promise<any>;

  getAppVersion: () => Promise<string>;
  getUserDataPath: () => Promise<string>;
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
