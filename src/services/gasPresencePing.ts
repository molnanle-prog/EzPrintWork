import { GAS_PRESENCE_URL } from '../constants';
import { db as dataService } from './dataService';
import { fetchInstalledAppVersion } from '../utils/appVersion';
import { isRemoteViewRoute } from '../utils/remoteView';
import { isStandaloneDocumentPreviewRoute } from '../utils/documentPreviewRoutes';

const PRESENCE_PING_MS = 5 * 60 * 1000;

export type PresencePingUser = {
  loginId?: string | null;
  email?: string | null;
  name?: string | null;
  displayName?: string | null;
  tenantId?: string | null;
};

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatKey = '';

function shouldSkipPresencePing(): boolean {
  if (typeof window === 'undefined') return true;
  return isRemoteViewRoute() || isStandaloneDocumentPreviewRoute();
}

function resolveLoginId(user: PresencePingUser): string {
  const loginId = String(user.loginId || '').trim();
  if (loginId) return loginId;
  const email = String(user.email || '').trim();
  if (email.endsWith('@ez-hub.kr')) return email.split('@')[0];
  return email;
}

function resolveUserName(user: PresencePingUser): string {
  return String(user.name || user.displayName || '').trim() || '사원';
}

function resolveCompanyName(): string {
  const name = dataService.getCompanyInfo()?.name?.trim();
  if (name && name !== 'EzPrintWork') return name;
  return name || '미지정 회사';
}

/**
 * 매니저 콘솔용 접속·버전 핑. 실패해도 앱 동작에 영향 없음.
 * 사내 온라인(NAS 2분)과 별개이며, 앱은 시트 응답을 읽지 않음.
 */
export async function sendPresencePing(user: PresencePingUser): Promise<void> {
  if (shouldSkipPresencePing()) return;
  const loginId = resolveLoginId(user);
  const tenantId = String(user.tenantId || '').trim();
  if (!loginId || !tenantId) return;

  let appVersion = '';
  try {
    appVersion = await fetchInstalledAppVersion();
  } catch {
    appVersion = '';
  }

  const payload = {
    action: 'presencePing',
    companyName: resolveCompanyName(),
    tenantId,
    loginId,
    userName: resolveUserName(user),
    appVersion: appVersion || 'unknown',
    pingAt: new Date().toISOString(),
  };

  try {
    await fetch(GAS_PRESENCE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('[PresencePing] 핑 전송 실패:', err);
  }
}

export function startPresenceHeartbeat(user: PresencePingUser): void {
  const loginId = resolveLoginId(user);
  const tenantId = String(user.tenantId || '').trim();
  const key = `${tenantId}:${loginId}`;
  if (!loginId || !tenantId) {
    stopPresenceHeartbeat();
    return;
  }
  if (heartbeatTimer && heartbeatKey === key) return;

  stopPresenceHeartbeat();
  heartbeatKey = key;
  void sendPresencePing(user);
  heartbeatTimer = setInterval(() => {
    void sendPresencePing(user);
  }, PRESENCE_PING_MS);
}

export function stopPresenceHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatKey = '';
}
