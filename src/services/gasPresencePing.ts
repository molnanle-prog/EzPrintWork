import { GAS_PRESENCE_URL } from '../constants';
import { db as dataService } from './dataService';
import { fetchInstalledAppVersion } from '../utils/appVersion';
import { isRemoteViewRoute } from '../utils/remoteView';
import { isStandaloneDocumentPreviewRoute } from '../utils/documentPreviewRoutes';

export type PresencePingUser = {
  loginId?: string | null;
  email?: string | null;
  name?: string | null;
  displayName?: string | null;
  tenantId?: string | null;
};

let sessionPingKey = '';
let lastPingUser: PresencePingUser | null = null;

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
 * 매니저 콘솔용 버전·로그인 시각 기록.
 * 5분 반복은 GAS 한도를 넘기므로 보내지 않음. 실시간 온라인은 NAS.
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

  lastPingUser = user;
  const payload = {
    action: 'presencePing',
    online: true,
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

/** 로그아웃·업데이트·앱 종료 시 매니저가 바로 끄도록 1회 보고 */
export async function sendPresenceOffline(user?: PresencePingUser | null): Promise<void> {
  const target = user || lastPingUser;
  if (!target || shouldSkipPresencePing()) return;
  const loginId = resolveLoginId(target);
  const tenantId = String(target.tenantId || '').trim();
  if (!loginId || !tenantId) return;

  const payload = {
    action: 'presenceOffline',
    online: false,
    companyName: resolveCompanyName(),
    tenantId,
    loginId,
    userName: resolveUserName(target),
    pingAt: new Date().toISOString(),
  };

  sessionPingKey = '';
  lastPingUser = null;

  try {
    await fetch(GAS_PRESENCE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (err) {
    console.warn('[PresencePing] 오프라인 전송 실패:', err);
  }
}

/** 로그인 세션당 1회만 GAS에 버전을 남긴다. 반복 타이머 없음. */
export function startPresenceHeartbeat(user: PresencePingUser): void {
  const loginId = resolveLoginId(user);
  const tenantId = String(user.tenantId || '').trim();
  const key = `${tenantId}:${loginId}`;
  if (!loginId || !tenantId) {
    stopPresenceHeartbeat();
    return;
  }
  if (sessionPingKey === key) return;

  sessionPingKey = key;
  lastPingUser = user;
  void sendPresencePing(user);
}

export function stopPresenceHeartbeat(): void {
  /* 반복 핑이 없으므로 타이머만 있던 자리. 세션 키는 오프라인 보고에서 지움. */
}
