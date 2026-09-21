export const FEATURE_FLAG_KEYS = [
  'customerPortal',
  'qrTracking',
  'costMargin',
  'inventoryAuto',
  'taxAccounting',
  'industryTemplates',
  'permissionMatrix',
  'syncDiagnostics',
  'conflictInbox',
  'crmReorder',
  'apiWebhook',
  'mgmtReports',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export const FEATURE_FLAG_LABELS: Record<FeatureFlagKey, string> = {
  customerPortal: '고객 포털',
  qrTracking: 'QR 공정 추적',
  costMargin: '원가·마진',
  inventoryAuto: '재고 자동차감·발주',
  taxAccounting: '세금계산서/회계',
  industryTemplates: '업종 템플릿',
  permissionMatrix: '권한 매트릭스',
  syncDiagnostics: '동기화 진단센터',
  conflictInbox: '오프라인/충돌 보관함',
  crmReorder: 'CRM 재주문',
  apiWebhook: 'API/Webhook',
  mgmtReports: '경영 리포트',
};

const STORAGE_PREFIX = 'ezpw_feature_';
export const FEATURE_LAB_STORAGE_KEY = 'ezpw_feature_lab';

const DEFAULTS: Record<FeatureFlagKey, boolean> = {
  customerPortal: false,
  qrTracking: false,
  costMargin: false,
  inventoryAuto: false,
  taxAccounting: false,
  industryTemplates: false,
  permissionMatrix: false,
  syncDiagnostics: false,
  conflictInbox: false,
  crmReorder: false,
  apiWebhook: false,
  mgmtReports: false,
};

function readViteEnv(name: string): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    if (env && name in env) return String(env[name] ?? '');
  } catch {
    /* node/tsx 테스트에서는 Vite env가 없다 */
  }
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return String(runtime.process?.env?.[name] || '');
}

function envFlag(key: FeatureFlagKey): boolean | null {
  const raw = readViteEnv(`VITE_FEATURE_${key.toUpperCase()}`).toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

function storageFlag(key: FeatureFlagKey): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
  } catch {
    /* ignore */
  }
  return null;
}

export function isFeatureLabUnlocked(): boolean {
  if (readViteEnv('VITE_FEATURE_LAB').toLowerCase() === 'true') return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FEATURE_LAB_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setFeatureLabUnlocked(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FEATURE_LAB_STORAGE_KEY, enabled ? '1' : '0');
}

export function isFeatureEnabled(key: FeatureFlagKey): boolean {
  const fromEnv = envFlag(key);
  if (fromEnv != null) return fromEnv;
  const fromStorage = storageFlag(key);
  if (fromStorage != null) return fromStorage;
  return DEFAULTS[key];
}

export function setFeatureEnabled(key: FeatureFlagKey, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, enabled ? '1' : '0');
}

export function listEnabledFeatures(): FeatureFlagKey[] {
  return FEATURE_FLAG_KEYS.filter((key) => isFeatureEnabled(key));
}

export function hasAnyEnabledFeature(): boolean {
  return listEnabledFeatures().length > 0;
}
