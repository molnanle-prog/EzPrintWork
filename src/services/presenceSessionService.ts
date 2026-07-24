/**
 * 접속(presence) + 단일 세션(claim) — NAS JSON / 사내 게이트웨이.
 * Firestore 하트비트·세션 폴링을 대체해 쿼터 부담을 줄입니다.
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
import type { StaffSessionRecord } from '../utils/staffSession';

export const PRESENCE_SESSIONS_FILE = 'presence-sessions.json';
const WRITE_RETRY_DELAYS_MS = [0, 800, 2000];
const FILE_VERSION = 1;

export type PresenceSessionEntry = StaffSessionRecord & {
  uid: string;
  loginId?: string | null;
  staffDocId?: string | null;
  name?: string | null;
  email?: string | null;
  lastLogout?: string;
};

export type PresenceSessionsFile = {
  version: number;
  tenantId: string;
  updatedAt: string;
  sessions: Record<string, PresenceSessionEntry>;
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

function emptyFile(tenantId: string): PresenceSessionsFile {
  return {
    version: FILE_VERSION,
    tenantId,
    updatedAt: new Date().toISOString(),
    sessions: {},
  };
}

function normalizeFile(tenantId: string, raw: unknown): PresenceSessionsFile {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<PresenceSessionsFile>;
  return {
    version: data.version ?? FILE_VERSION,
    tenantId: data.tenantId || tenantId,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    sessions:
      data.sessions && typeof data.sessions === 'object' && !Array.isArray(data.sessions)
        ? (data.sessions as Record<string, PresenceSessionEntry>)
        : {},
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
  }
  return null;
}

function resolveGatewayBases(explicit?: StoreGatewayInput): string[] {
  return resolveStoreGatewayUrlList(explicit);
}

async function readViaGateway(
  tenantId: string,
  gatewayBaseUrl?: StoreGatewayInput
): Promise<PresenceSessionsFile | null> {
  if (!tenantId) return null;
  const urls = await orderStoreGatewayUrls(resolveGatewayBases(gatewayBaseUrl));
  if (urls.length === 0) return null;

  const token = getGatewayAuthToken(tenantId);
  const results = await Promise.all(
    urls.map(async (base) => {
      try {
        const res = await fetchWithTimeout(
          `${base}/api/v1/presence?tenantId=${encodeURIComponent(tenantId)}`,
          {
            cache: 'no-store',
            headers: token ? { 'X-Ezpw-Gateway-Token': token } : {},
          },
          DEFAULT_LAN_FETCH_TIMEOUT_MS
        );
        if (!res.ok) return null;
        const data = await res.json();
        return normalizeFile(tenantId, data);
      } catch {
        return null;
      }
    })
  );

  let best: PresenceSessionsFile | null = null;
  for (const file of results) {
    if (!file) continue;
    if (!best || Date.parse(file.updatedAt) > Date.parse(best.updatedAt)) {
      best = file;
    }
  }
  return best;
}

async function writeViaGateway(
  tenantId: string,
  file: PresenceSessionsFile,
  gatewayBaseUrl?: StoreGatewayInput
): Promise<boolean> {
  if (!tenantId) return false;
  const urls = await orderStoreGatewayUrls(resolveGatewayBases(gatewayBaseUrl));
  if (urls.length === 0) return false;

  const token = getGatewayAuthToken(tenantId);
  for (const base of urls) {
    try {
      const res = await fetchWithTimeout(
        `${base}/api/v1/presence`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'X-Ezpw-Gateway-Token': token } : {}),
          },
          body: JSON.stringify(file),
        },
        DEFAULT_LAN_FETCH_TIMEOUT_MS
      );
      if (res.ok) return true;
    } catch (err) {
      console.warn('[PresenceSession] gateway write failed:', base, err);
    }
  }
  return false;
}

export class PresenceSessionService {
  async read(tenantId: string, gatewayBaseUrl?: StoreGatewayInput): Promise<PresenceSessionsFile | null> {
    if (!tenantId) return null;

    if (isElectron()) {
      const root = await resolveNasRoot(tenantId);
      if (root) {
        const raw = await readLocalWithRetry(joinPath(root, PRESENCE_SESSIONS_FILE));
        if (raw) {
          try {
            return normalizeFile(tenantId, JSON.parse(raw));
          } catch (err) {
            console.warn('[PresenceSession] NAS parse failed:', err);
          }
        }
      }
    }

    return readViaGateway(tenantId, gatewayBaseUrl);
  }

  async readEntry(
    tenantId: string,
    uid: string,
    gatewayBaseUrl?: StoreGatewayInput
  ): Promise<PresenceSessionEntry | null> {
    const file = await this.read(tenantId, gatewayBaseUrl);
    return file?.sessions?.[uid] || null;
  }

  private async persist(
    tenantId: string,
    file: PresenceSessionsFile,
    gatewayBaseUrl?: StoreGatewayInput
  ): Promise<boolean> {
    const payload: PresenceSessionsFile = {
      ...file,
      version: FILE_VERSION,
      tenantId,
      updatedAt: new Date().toISOString(),
    };
    const content = JSON.stringify(payload, null, 2);

    if (isElectron()) {
      const root = await resolveNasRoot(tenantId);
      if (root) {
        const ok = await writeLocalWithRetry(joinPath(root, PRESENCE_SESSIONS_FILE), content);
        if (ok) return true;
      }
    }

    return writeViaGateway(tenantId, payload, gatewayBaseUrl);
  }

  async upsertPresence(opts: {
    tenantId: string;
    uid: string;
    online: boolean;
    loginId?: string | null;
    staffDocId?: string | null;
    name?: string | null;
    email?: string | null;
    sessionId?: string | null;
    gatewayBaseUrl?: StoreGatewayInput;
  }): Promise<boolean> {
    const { tenantId, uid } = opts;
    if (!tenantId || !uid) return false;

    const now = new Date().toISOString();
    const current = (await this.read(tenantId, opts.gatewayBaseUrl)) || emptyFile(tenantId);
    const prev = current.sessions[uid] || { uid };

    const next: PresenceSessionEntry = {
      ...prev,
      uid,
      loginId: opts.loginId ?? prev.loginId ?? null,
      staffDocId: opts.staffDocId ?? prev.staffDocId ?? null,
      name: opts.name ?? prev.name ?? null,
      email: opts.email ?? prev.email ?? null,
      isOnline: opts.online,
      online: opts.online,
      lastActive: now,
      ...(opts.online
        ? { lastLogin: now, lastCheckIn: now }
        : { lastLogout: now }),
    };

    if (opts.sessionId) {
      next.activeSessionId = opts.sessionId;
      next.activeSessionAt = now;
    } else if (!opts.online) {
      // offline 시 세션 ID는 유지(킥 판정용)하되 lastActive만 갱신
    }

    current.sessions[uid] = next;
    return this.persist(tenantId, current, opts.gatewayBaseUrl);
  }

  async claimSession(opts: {
    tenantId: string;
    uid: string;
    sessionId: string;
    loginId?: string | null;
    staffDocId?: string | null;
    name?: string | null;
    email?: string | null;
    gatewayBaseUrl?: StoreGatewayInput;
  }): Promise<boolean> {
    return this.upsertPresence({
      ...opts,
      online: true,
      sessionId: opts.sessionId,
    });
  }

  async releaseSession(opts: {
    tenantId: string;
    uid: string;
    loginId?: string | null;
    email?: string | null;
    gatewayBaseUrl?: StoreGatewayInput;
  }): Promise<boolean> {
    return this.upsertPresence({
      tenantId: opts.tenantId,
      uid: opts.uid,
      online: false,
      loginId: opts.loginId,
      email: opts.email,
      gatewayBaseUrl: opts.gatewayBaseUrl,
    });
  }
}

export const presenceSessionService = new PresenceSessionService();
