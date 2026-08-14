import { db as dataService } from '../services/dataService';
import { setPresenceOffline, type PresenceUser } from '../services/firebase';
import { releaseStaffSessionOnNas } from './staffSession';

export type AppSessionEndReason = 'logout' | 'app_close';

type FlushOpts = {
  reason: AppSessionEndReason;
  presenceUser?: PresenceUser | null;
  releaseNas?: {
    uid: string;
    tenantId: string;
    email?: string | null;
    loginId?: string | null;
    onlyIfSessionId?: string | null;
    gatewayBaseUrl?: string[] | string | null;
  } | null;
  /** 종료 대기 상한 (Electron 창 닫기용) */
  timeoutMs?: number;
};

let endInFlight: Promise<void> | null = null;

/**
 * 사용자가 앱을 닫거나 로그아웃할 때 — 관리자 테넌트 종료 보고 + NAS presence/세션 해제.
 * 강제 종료면 호출되지 않으며, 다음 시작 시 unclean 복구로만 기록한다.
 */
export async function flushAppSessionEnd(opts: FlushOpts): Promise<void> {
  if (endInFlight) return endInFlight;

  const timeoutMs = opts.timeoutMs ?? 2500;
  endInFlight = (async () => {
    const work = (async () => {
      try {
        await dataService.reportTenantSessionEnd(opts.reason);
      } catch (err) {
        console.warn('[AppSession] tenant session end failed:', err);
      }
      try {
        await setPresenceOffline(opts.presenceUser);
      } catch (err) {
        console.warn('[AppSession] presence offline failed:', err);
      }
      const nas = opts.releaseNas;
      if (nas?.uid && nas.tenantId) {
        try {
          await releaseStaffSessionOnNas({
            uid: nas.uid,
            tenantId: nas.tenantId,
            email: nas.email,
            loginId: nas.loginId,
            onlyIfSessionId: nas.onlyIfSessionId ?? null,
            gatewayBaseUrl: nas.gatewayBaseUrl ?? null,
          });
        } catch (err) {
          console.warn('[AppSession] NAS session release failed:', err);
        }
      }
    })();

    await Promise.race([
      work,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  })().finally(() => {
    endInFlight = null;
  });

  return endInFlight;
}
