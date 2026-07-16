/**
 * Firestore 일시 장애 시 요금제·광고·권한·NAS 경로 폴백용 운영 스냅샷.
 * - 서버에서 정상 조회되면 항상 그 값으로 덮어씀 (결제 만료→광고형 강등 유지)
 * - getDoc 실패·타임아웃 시에만 last-known 복원 (유료가 갑자기 광고형으로 보이는 것 방지)
 * - 권한·경로도 함께 고정해 직원/관리자 화면·저장 경로 불일치 방지
 */

import type { AppUser } from '../types';

export type LastKnownTenantUser = Pick<
  AppUser,
  'uid' | 'id' | 'email' | 'displayName' | 'name' | 'photoURL' | 'avatarUrl' | 'tenantId' | 'role'
> & {
  loginId?: string;
};

export type LastKnownTenantPlan = {
  tenantId: string;
  plan: 'free' | 'pro';
  planCode: string;
  paymentStatus: string;
  licenseExpiresAt?: string | null;
  maxStaff?: number | null;
  ownerId?: string | null;
  updatedAt: string;
  /** 세션 복원용 — 이 uid로 로그인했을 때만 프로필 폴백 */
  uid?: string;
  userRole?: string | null;
  staffIsCompanyAdmin?: boolean;
  staffRecordRole?: string | null;
  archiveRootPath?: string | null;
  /** 프로필 getDoc 실패 시 최소 복원 */
  user?: LastKnownTenantUser;
};

const STORAGE_KEY = 'ezpw_last_known_tenant_plan_v1';
const UID_INDEX_KEY = 'ezpw_last_known_tenant_uid_index_v1';
const ARCHIVE_PATH_KEY = 'ezpw_last_known_archive_root_v1';

export function saveLastKnownTenantPlan(
  snapshot: Omit<LastKnownTenantPlan, 'updatedAt'> & { updatedAt?: string }
): void {
  if (typeof window === 'undefined') return;
  const tenantId = String(snapshot.tenantId || '').trim();
  if (!tenantId) return;

  try {
    const all = readAll();
    const prev = all[tenantId];
    const next: LastKnownTenantPlan = {
      ...prev,
      ...snapshot,
      tenantId,
      paymentStatus: String(
        snapshot.paymentStatus || prev?.paymentStatus || 'UNPAID'
      ).toUpperCase(),
      planCode: String(snapshot.planCode || prev?.planCode || 'free'),
      plan: snapshot.plan || prev?.plan || 'free',
      licenseExpiresAt:
        snapshot.licenseExpiresAt !== undefined
          ? snapshot.licenseExpiresAt
          : (prev?.licenseExpiresAt ?? null),
      maxStaff:
        snapshot.maxStaff !== undefined ? snapshot.maxStaff : (prev?.maxStaff ?? null),
      ownerId:
        snapshot.ownerId !== undefined ? snapshot.ownerId : (prev?.ownerId ?? null),
      uid: snapshot.uid || prev?.uid,
      userRole:
        snapshot.userRole !== undefined ? snapshot.userRole : (prev?.userRole ?? null),
      staffIsCompanyAdmin:
        snapshot.staffIsCompanyAdmin !== undefined
          ? snapshot.staffIsCompanyAdmin
          : prev?.staffIsCompanyAdmin,
      staffRecordRole:
        snapshot.staffRecordRole !== undefined
          ? snapshot.staffRecordRole
          : (prev?.staffRecordRole ?? null),
      archiveRootPath: mergeArchivePath(snapshot.archiveRootPath, prev?.archiveRootPath),
      user: snapshot.user || prev?.user,
      updatedAt: new Date().toISOString(),
    };
    all[tenantId] = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));

    if (next.archiveRootPath) {
      writeArchivePathMap(tenantId, next.archiveRootPath);
    }
    if (next.uid) {
      writeUidIndex(next.uid, tenantId);
    }
  } catch (err) {
    console.warn('[LastKnownPlan] save failed:', err);
  }
}

/** 경로만 갱신 (settings 적용 성공 시) — 빈 값으로 지우지 않음, 요금제 추정 금지 */
export function saveLastKnownArchiveRootPath(
  tenantId: string | null | undefined,
  archiveRootPath: string | null | undefined
): void {
  const id = String(tenantId || '').trim();
  const path = String(archiveRootPath || '').trim();
  if (!id || !path) return;

  writeArchivePathMap(id, path);

  const prev = readLastKnownTenantPlan(id);
  if (!prev) return;
  if (prev.archiveRootPath === path) return;
  saveLastKnownTenantPlan({ ...prev, archiveRootPath: path });
}

export function readLastKnownArchiveRootPath(
  tenantId?: string | null
): string | null {
  if (typeof window === 'undefined') return null;
  const id = String(tenantId || '').trim();
  if (!id) return null;
  try {
    const fromPlan = readLastKnownTenantPlan(id)?.archiveRootPath?.trim();
    if (fromPlan) return fromPlan;
    const map = readArchivePathMap();
    const path = String(map[id] || '').trim();
    return path || null;
  } catch {
    return null;
  }
}

export function readLastKnownTenantPlan(tenantId?: string | null): LastKnownTenantPlan | null {
  if (typeof window === 'undefined') return null;
  const id = String(tenantId || '').trim();
  if (!id) return null;
  try {
    return readAll()[id] || null;
  } catch {
    return null;
  }
}

export function readLastKnownTenantPlanByUid(uid?: string | null): LastKnownTenantPlan | null {
  if (typeof window === 'undefined') return null;
  const id = String(uid || '').trim();
  if (!id) return null;
  try {
    const tenantId = readUidIndex()[id];
    if (tenantId) {
      const byTenant = readLastKnownTenantPlan(tenantId);
      if (byTenant && (!byTenant.uid || byTenant.uid === id)) return byTenant;
    }
    const all = readAll();
    for (const snap of Object.values(all)) {
      if (snap?.uid === id || snap?.user?.uid === id) return snap;
    }
    return null;
  } catch {
    return null;
  }
}

/** 삭제/비활성 직원 확정 시 — 해당 uid 스냅샷·인덱스 제거 (오프라인 재진입 방지) */
export function clearLastKnownTenantPlanForUid(uid?: string | null): void {
  if (typeof window === 'undefined') return;
  const id = String(uid || '').trim();
  if (!id) return;
  try {
    const all = readAll();
    const idx = readUidIndex();
    const tenantId = idx[id];
    let changed = false;
    if (tenantId && all[tenantId]) {
      const snap = all[tenantId];
      if (!snap.uid || snap.uid === id || snap.user?.uid === id) {
        delete all[tenantId];
        changed = true;
      }
    }
    for (const [tid, snap] of Object.entries(all)) {
      if (snap?.uid === id || snap?.user?.uid === id) {
        delete all[tid];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
    if (idx[id]) {
      delete idx[id];
      localStorage.setItem(UID_INDEX_KEY, JSON.stringify(idx));
    }
  } catch (err) {
    console.warn('[LastKnownPlan] clearForUid failed:', err);
  }
}

function mergeArchivePath(
  incoming: string | null | undefined,
  prev: string | null | undefined
): string | null {
  const next = String(incoming || '').trim();
  if (next) return next;
  const kept = String(prev || '').trim();
  return kept || null;
}

function readAll(): Record<string, LastKnownTenantPlan> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function readUidIndex(): Record<string, string> {
  try {
    const raw = localStorage.getItem(UID_INDEX_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeUidIndex(uid: string, tenantId: string): void {
  try {
    const idx = readUidIndex();
    idx[uid] = tenantId;
    localStorage.setItem(UID_INDEX_KEY, JSON.stringify(idx));
  } catch {
    /* ignore */
  }
}

function readArchivePathMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ARCHIVE_PATH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeArchivePathMap(tenantId: string, path: string): void {
  try {
    const map = readArchivePathMap();
    map[tenantId] = path;
    localStorage.setItem(ARCHIVE_PATH_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
