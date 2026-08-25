/**
 * 상황판·달력 칸 필터 — 로그인 아이디별 NAS JSON (회사 공용 아님)
 * 파일: ui-prefs.json
 */
import {
  ARCHIVE_USE_DEFAULT_KEY,
  DEFAULT_ARCHIVE_FOLDER_NAME,
  getArchiveRootPath,
  getEffectiveArchiveRootPath,
  hasCompanyArchiveRootConfigured,
  setCompanyArchiveRootOverride,
} from '../utils/archiveStorage';
import { readLastKnownArchiveRootPath } from '../utils/lastKnownTenantPlan';
import { getGatewayAuthToken } from '../utils/gatewayToken';
import { fetchWithTimeout, DEFAULT_LAN_FETCH_TIMEOUT_MS } from '../utils/fetchWithTimeout';
import {
  orderStoreGatewayUrls,
  resolveStoreGatewayUrlList,
  type StoreGatewayInput,
} from '../utils/storeGatewayUrls';

export const UI_PREFS_FILE = 'ui-prefs.json';
const FILE_VERSION = 1;
const WRITE_RETRY_DELAYS_MS = [0, 800, 2000];

export type BoardUiPrefEntry = {
  hiddenBoardStatusKeys: string[];
  updatedAt: string;
};

export type UiPrefsFile = {
  version: number;
  tenantId: string;
  updatedAt: string;
  users: Record<string, BoardUiPrefEntry>;
};

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electron;
}

function getSep(): string {
  return navigator.platform.toLowerCase().includes('win') ? '\\' : '/';
}

function joinPath(base: string, name: string): string {
  const sep = getSep();
  const normalized = base.endsWith(sep) ? base : `${base}${sep}`;
  return `${normalized}${name}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function emptyFile(tenantId: string): UiPrefsFile {
  return {
    version: FILE_VERSION,
    tenantId,
    updatedAt: new Date().toISOString(),
    users: {},
  };
}

function normalizeFile(tenantId: string, raw: unknown): UiPrefsFile {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<UiPrefsFile>;
  const users: Record<string, BoardUiPrefEntry> = {};
  if (data.users && typeof data.users === 'object' && !Array.isArray(data.users)) {
    for (const [key, value] of Object.entries(data.users)) {
      const k = String(key || '').trim().toLowerCase();
      if (!k || !value || typeof value !== 'object') continue;
      const keys = (value as BoardUiPrefEntry).hiddenBoardStatusKeys;
      users[k] = {
        hiddenBoardStatusKeys: Array.isArray(keys)
          ? keys.filter((item): item is string => typeof item === 'string')
          : [],
        updatedAt: typeof (value as BoardUiPrefEntry).updatedAt === 'string'
          ? (value as BoardUiPrefEntry).updatedAt
          : new Date().toISOString(),
      };
    }
  }
  return {
    version: data.version ?? FILE_VERSION,
    tenantId: data.tenantId || tenantId,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    users,
  };
}

async function resolveNasRoot(tenantId?: string | null): Promise<string | null> {
  if (!isElectron()) return null;

  const known = tenantId ? readLastKnownArchiveRootPath(tenantId) : null;
  if (known?.trim() && !getEffectiveArchiveRootPath()) {
    setCompanyArchiveRootOverride(known.trim());
  }

  const effective = getEffectiveArchiveRootPath();
  if (effective?.trim()) {
    const trimmed = effective.trim();
    return trimmed.endsWith(getSep()) ? trimmed : `${trimmed}${getSep()}`;
  }

  if (hasCompanyArchiveRootConfigured()) return null;

  if (localStorage.getItem(ARCHIVE_USE_DEFAULT_KEY) === 'true' || !getArchiveRootPath()) {
    const docs = await window.electron.getDocumentsPath();
    return `${docs}${getSep()}${DEFAULT_ARCHIVE_FOLDER_NAME}${getSep()}`;
  }
  return null;
}

async function writeLocalWithRetry(filePath: string, content: string): Promise<boolean> {
  if (!isElectron()) return false;
  for (let attempt = 0; attempt < WRITE_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(WRITE_RETRY_DELAYS_MS[attempt]);
    const result = await window.electron.saveFile(filePath, content);
    if (result?.success) return true;
  }
  return false;
}

async function readLocalWithRetry(filePath: string): Promise<string | null> {
  if (!isElectron()) return null;
  for (let attempt = 0; attempt < WRITE_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(WRITE_RETRY_DELAYS_MS[attempt]);
    const result = await window.electron.readFile(filePath);
    if (result?.success && result.data) return result.data;
    if (result && !result.success && result.error === 'ENOENT') return null;
  }
  return null;
}

async function readViaGateway(tenantId: string, gatewayBaseUrl?: StoreGatewayInput): Promise<UiPrefsFile | null> {
  if (!tenantId) return null;
  const urls = await orderStoreGatewayUrls(resolveStoreGatewayUrlList(gatewayBaseUrl));
  if (urls.length === 0) return null;

  const token = getGatewayAuthToken(tenantId);
  for (const base of urls) {
    try {
      const res = await fetchWithTimeout(
        `${base}/api/v1/ui-prefs?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'GET',
          cache: 'no-store',
          headers: token ? { 'X-Ezpw-Gateway-Token': token } : {},
        },
        DEFAULT_LAN_FETCH_TIMEOUT_MS
      );
      if (!res.ok) continue;
      return normalizeFile(tenantId, await res.json());
    } catch (err) {
      console.warn('[UiPrefs] gateway read failed:', base, err);
    }
  }
  return null;
}

async function writeViaGateway(
  tenantId: string,
  userKey: string,
  hiddenBoardStatusKeys: string[],
  gatewayBaseUrl?: StoreGatewayInput
): Promise<boolean> {
  if (!tenantId || !userKey) return false;
  const urls = await orderStoreGatewayUrls(resolveStoreGatewayUrlList(gatewayBaseUrl));
  if (urls.length === 0) return false;

  const token = getGatewayAuthToken(tenantId);
  const body = JSON.stringify({
    tenantId,
    userKey,
    hiddenBoardStatusKeys,
  });
  for (const base of urls) {
    try {
      const res = await fetchWithTimeout(
        `${base}/api/v1/ui-prefs`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'X-Ezpw-Gateway-Token': token } : {}),
          },
          body,
        },
        DEFAULT_LAN_FETCH_TIMEOUT_MS
      );
      if (res.ok) return true;
    } catch (err) {
      console.warn('[UiPrefs] gateway write failed:', base, err);
    }
  }
  return false;
}

export class UiPrefsService {
  async read(tenantId: string, gatewayBaseUrl?: StoreGatewayInput): Promise<UiPrefsFile | null> {
    if (!tenantId) return null;

    if (isElectron()) {
      const root = await resolveNasRoot(tenantId);
      if (root) {
        const raw = await readLocalWithRetry(joinPath(root, UI_PREFS_FILE));
        if (raw) {
          try {
            return normalizeFile(tenantId, JSON.parse(raw));
          } catch (err) {
            console.warn('[UiPrefs] NAS parse failed:', err);
          }
        }
      }
    }

    return readViaGateway(tenantId, gatewayBaseUrl);
  }

  async readHiddenBoardStatusKeys(
    tenantId: string,
    userKey: string,
    gatewayBaseUrl?: StoreGatewayInput
  ): Promise<string[] | null> {
    const key = String(userKey || '').trim().toLowerCase();
    if (!tenantId || !key) return null;
    const file = await this.read(tenantId, gatewayBaseUrl);
    if (!file?.users || !(key in file.users)) return null;
    return file.users[key].hiddenBoardStatusKeys || [];
  }

  async saveHiddenBoardStatusKeys(
    tenantId: string,
    userKey: string,
    hiddenBoardStatusKeys: string[],
    gatewayBaseUrl?: StoreGatewayInput
  ): Promise<boolean> {
    const key = String(userKey || '').trim().toLowerCase();
    if (!tenantId || !key) return false;
    const now = new Date().toISOString();
    const entry: BoardUiPrefEntry = {
      hiddenBoardStatusKeys,
      updatedAt: now,
    };

    if (isElectron()) {
      const root = await resolveNasRoot(tenantId);
      if (root) {
        let file = emptyFile(tenantId);
        const raw = await readLocalWithRetry(joinPath(root, UI_PREFS_FILE));
        if (raw) {
          try {
            file = normalizeFile(tenantId, JSON.parse(raw));
          } catch {
            /* keep empty */
          }
        }
        file.tenantId = tenantId;
        file.updatedAt = now;
        file.users = { ...file.users, [key]: entry };
        const ok = await writeLocalWithRetry(joinPath(root, UI_PREFS_FILE), JSON.stringify(file, null, 2));
        if (ok) return true;
      }
    }

    return writeViaGateway(tenantId, key, hiddenBoardStatusKeys, gatewayBaseUrl);
  }
}

export const uiPrefsService = new UiPrefsService();
