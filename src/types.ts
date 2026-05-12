// src/types.ts

// --- Base Business Types ---
export enum Priority {
    LOW = 'low',
    NORMAL = 'normal',
    HIGH = 'high',
    URGENT = 'urgent'
}

export type PaymentStatus = '결제완료' | '결제대기' | '일부결제' | '취소';

export interface JobHistoryLog {
    timestamp: string;
    staffId: string;
    action: string;
    details?: string;
}

export interface JobSpecs {
    paperType: string;
    paperWeight: string;
    size: string;
    quantity: string;
    printColor: string;
    processing: string[];
    memo?: string;
}

export interface Job {
    id: string;
    title: string;
    clientName: string;
    description: string;
    specs: JobSpecs;
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
    startDate: string;
    endDate: string;
    reason?: string;
}

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

export interface Quote {
    id: string;
    clientName: string;
    items: string;
    totalAmount: number;
    date: string;
    status: '대기' | '승인' | '거절';
}

export interface PaperStock {
    id: string;
    name: string;
    weight: string;
    type: string;
    unitPrice: number;
    stockLevel: 'high' | 'medium' | 'low';
}

// --- SaaS & Auth Types ---
export interface Tenant {
    id: string;
    name: string;
    ownerId: string;
    plan: 'free' | 'pro';
    createdAt: string;
}

export interface AppUser {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string;
    tenantId?: string;
    role?: 'admin' | 'staff';
}

export interface AuthData {
    adminPasswordHash: string;
}

// --- Settings & Config Types ---
export interface JobStatusDefinition {
    key: string;
    label: string;
    isVisible?: boolean;
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

export interface NasConfig {
    isEnabled: boolean;
    path: string;
    status: 'connected' | 'disconnected' | 'error';
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

    // Database
    dbConnect: (dbPath: string) => Promise<{ success: boolean; error?: string }>;
    dbQuery: (sql: string, params: any[]) => Promise<{ success: boolean; data?: any; error?: string }>;

    // License
    verifyLicense: () => Promise<{ isValid: boolean; msg?: string; data?: any }>;
    activateLicense: (data: any) => Promise<{ success: boolean; msg?: string }>;
    requestPurchase: (data: any) => Promise<{ success: boolean; msg?: string }>;
    getMachineId: () => Promise<string>;
    getLicenseInfo: () => Promise<any>;

    // App & Window
    getUserDataPath: () => Promise<string>;
    getAppVersion: () => Promise<string>;
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
