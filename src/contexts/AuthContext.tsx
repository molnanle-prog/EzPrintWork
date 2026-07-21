import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { auth, db, startPresenceSession, stopPresenceSession, setPresenceOffline, setPresenceGatewayUrls } from '../services/firebase';
import { onAuthStateChanged, User, signOut, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { presenceSessionService } from '../services/presenceSessionService';
import { AppUser } from '../types';
import { db as dataService } from '../services/dataService';
import { getStaffIdForUser } from '../utils/staffMatch';
import { getMaxStaffForPlan, isProPlan, shouldShowTenantAds } from '../utils/planLimits';
import { isTenantOwnerUser, hasCompanyAdminAccess, canManageCompany, canManageTenantRoot, canDeletePermanently, canManageStaff, canManageClientMaster, canManageInstructions, canAccessStaffOperationsSettings, canManageProductProcessing, CompanyPermissionContext } from '../utils/adminAccess';
import { isStaffKeepLoggedIn } from '../utils/staffLoginPreferences';
import { readPendingStaffProfile } from '../utils/staffLoginSession';
import { lookupStaffAuthSnapshot } from '../utils/resolveStaffTenantProfile';
import {
  abortIncompleteStaffLogin,
  healStaffProfileFromRecords,
  isStaffInternalEmail,
} from '../utils/staffLoginRecovery';
import { configureAuthPersistenceFromPreferences } from '../utils/authPersistence';
import {
  clearPersistedStaffSession,
  writePersistedStaffSession,
} from '../utils/persistedStaffSession';
import {
  clearLastKnownTenantPlanForUid,
  readLastKnownArchiveRootPath,
  readLastKnownTenantPlan,
  readLastKnownTenantPlanByUid,
  saveLastKnownTenantPlan,
  type LastKnownTenantUser,
} from '../utils/lastKnownTenantPlan';
import { useDialog } from './DialogContext';
import {
  getLocalStaffSessionId,
  getLocalStaffSessionClaimedAt,
  clearLocalStaffSessionId,
  isRemoteSessionNewerThanLocal,
  releaseStaffSessionOnNas,
} from '../utils/staffSession';

// [개발용 설정] Firebase 도메인 승인 오류 발생 시 true로 설정하여 로그인을 건너뜁니다.
const DEV_BYPASS_LOGIN = false;

interface AuthContextType {
  firebaseUser: User | null;
  currentUser: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: (user?: User | null) => Promise<void>;
  isAuthenticated: boolean;
  tenantPlan: 'free' | 'pro';
  /** 광고형(AD)일 때 true — EzImpo 배너 표시 */
  showsAds: boolean;
  /** Firestore tenants.plan 원본 (u5, u10 등) */
  tenantPlanCode: string;
  /** 현재 요금제 최대 직원 수 (대표 포함) */
  maxStaff: number;
  /** tenants.paymentStatus (FREE=선물 | AD=광고형 | PAID=유료) */
  tenantPaymentStatus: string;
  updatePlan: (plan: 'free' | 'pro') => void;
  loginCustomSession: (user: AppUser, plan: 'free' | 'pro', planCode?: string, paymentStatus?: string) => void;
  /** tenants.ownerId — 구글 로그인 메인 관리자 UID */
  tenantOwnerId: string | null;
  /** 구글 가입 대표(메인) 관리자 */
  isTenantOwner: boolean;
  /** 사내 관리자 (staff admin, 메인 아님) */
  isSiteAdmin: boolean;
  /** 사내·메인 관리자 공통 — 대부분 설정 메뉴 */
  canAccessAdminSettings: boolean;
  /** 메인 관리자 전용 — 요금제·백업 */
  canAccessRootSettings: boolean;
  /** 사내·메인 관리자 — 회사 운영(직원·삭제·마스터 데이터) */
  canManageCompany: boolean;
  /** 영구 삭제·거래처 합치기 등 */
  canDeletePermanently: boolean;
  canManageStaff: boolean;
  canManageClientMaster: boolean;
  canManageInstructions: boolean;
  /** 상품·후가공 설정 — 관리자 전용(호환용, 항상 false) */
  canAccessStaffOperationsSettings: boolean;
  /** 상품·후가공 마스터 추가/삭제/수정 */
  canManageProductProcessing: boolean;
}

// [결제 만료 및 미결제 실시간 자동 판별 엔진]
// gift(FREE)=무료 선물·광고없음, paid(PAID)=유료·광고없음, ad(AD/UNPAID)=광고형·광고표시
export const determineTenantPlan = (tenantData: any): 'free' | 'pro' => {
  if (!tenantData) return 'free';
  return isProPlan(
    tenantData.plan,
    tenantData.paymentStatus,
    tenantData.licenseExpiresAt
  )
    ? 'pro'
    : 'free';
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showAlert } = useDialog();
  const sessionKickedRef = useRef(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [tenantPlan, setTenantPlan] = useState<'free' | 'pro'>('free');
  const [tenantPlanCode, setTenantPlanCode] = useState<string>('free');
  const [maxStaff, setMaxStaff] = useState<number>(1);
  /** 서버/스냅샷 확인 전 — UNPAID 기본값으로 광고가 튀지 않게 비워 둠 */
  const [tenantPaymentStatus, setTenantPaymentStatus] = useState<string>('');
  const [tenantPlanReady, setTenantPlanReady] = useState(false);
  const [tenantOwnerId, setTenantOwnerId] = useState<string | null>(null);
  const [tenantLicenseExpiresAt, setTenantLicenseExpiresAt] = useState<string | null>(null);
  const [staffRecordRole, setStaffRecordRole] = useState<string | null>(null);
  const [staffIsCompanyAdmin, setStaffIsCompanyAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  const persistOpsSnapshot = (args: {
    tenantId: string;
    plan: 'free' | 'pro';
    planCode: string;
    paymentStatus: string;
    licenseExpiresAt?: string | null;
    maxStaff?: number | null;
    ownerId?: string | null;
    uid?: string | null;
    user?: AppUser | null;
    userRole?: string | null;
    staffIsCompanyAdmin?: boolean;
    staffRecordRole?: string | null;
  }) => {
    const userSnap: LastKnownTenantUser | undefined = args.user
      ? {
          uid: args.user.uid,
          id: args.user.id || args.user.uid,
          email: args.user.email || '',
          displayName: args.user.displayName || args.user.name || '',
          name: args.user.name || args.user.displayName || '',
          photoURL: args.user.photoURL || '',
          avatarUrl: args.user.avatarUrl || args.user.photoURL || '',
          tenantId: args.user.tenantId,
          role: args.user.role,
          loginId: (args.user as AppUser & { loginId?: string }).loginId,
        }
      : undefined;
    saveLastKnownTenantPlan({
      tenantId: args.tenantId,
      plan: args.plan,
      planCode: args.planCode,
      paymentStatus: args.paymentStatus,
      licenseExpiresAt: args.licenseExpiresAt ?? null,
      maxStaff: args.maxStaff ?? null,
      ownerId: args.ownerId ?? null,
      uid: args.uid || args.user?.uid || undefined,
      userRole: args.userRole ?? args.user?.role ?? null,
      staffIsCompanyAdmin: args.staffIsCompanyAdmin,
      staffRecordRole: args.staffRecordRole,
      archiveRootPath: readLastKnownArchiveRootPath(args.tenantId),
      user: userSnap,
    });
  };

  /** Firestore에서 읽은 정상 스냅샷 적용 + last-known 저장 */
  const applyTenantSnapshot = (tenantData: any, tenantIdForCache?: string) => {
    const plan = determineTenantPlan(tenantData);
    const code = String(tenantData?.plan || 'free');
    const paymentStatus = String(tenantData?.paymentStatus || 'UNPAID').toUpperCase();
    const expiresAt = tenantData?.licenseExpiresAt
      ? String(tenantData.licenseExpiresAt)
      : null;
    const max = getMaxStaffForPlan(code, tenantData?.paymentStatus, tenantData?.maxStaff);
    const ownerId = tenantData?.ownerId || null;

    setTenantPlan(plan);
    setTenantPlanCode(code);
    setTenantPaymentStatus(paymentStatus);
    setTenantLicenseExpiresAt(expiresAt);
    setMaxStaff(max);
    setTenantOwnerId(ownerId);
    setTenantPlanReady(true);

    const cacheTenantId =
      String(tenantIdForCache || tenantData?.id || currentUser?.tenantId || '').trim();
    if (cacheTenantId) {
      saveLastKnownTenantPlan({
        tenantId: cacheTenantId,
        plan,
        planCode: code,
        paymentStatus,
        licenseExpiresAt: expiresAt,
        maxStaff: max,
        ownerId,
        archiveRootPath: readLastKnownArchiveRootPath(cacheTenantId),
      });
    }
  };

  /** Firestore 일시 실패 시 — 마지막 정상 요금제·권한 복원 (광고형 오판 방지) */
  const restoreLastKnownTenantPlan = (tenantId?: string | null): boolean => {
    const known = readLastKnownTenantPlan(tenantId);
    if (!known) {
      setTenantPlanReady(false);
      return false;
    }
    setTenantPlan(known.plan);
    setTenantPlanCode(known.planCode);
    setTenantPaymentStatus(known.paymentStatus);
    setTenantLicenseExpiresAt(known.licenseExpiresAt ? String(known.licenseExpiresAt) : null);
    setMaxStaff(
      getMaxStaffForPlan(known.planCode, known.paymentStatus, known.maxStaff)
    );
    if (known.ownerId) setTenantOwnerId(known.ownerId);
    if (typeof known.staffIsCompanyAdmin === 'boolean') {
      setStaffIsCompanyAdmin(known.staffIsCompanyAdmin);
    }
    if (known.staffRecordRole !== undefined) {
      setStaffRecordRole(known.staffRecordRole ?? null);
    }
    setTenantPlanReady(true);
    console.warn(
      `[TenantPlan] Firestore 조회 실패 → last-known 복원 (${known.paymentStatus}/${known.planCode})`
    );
    return true;
  };

  const isTenantOwner = isTenantOwnerUser(currentUser?.uid, tenantOwnerId);
  const permissionCtx: CompanyPermissionContext = {
    userUid: currentUser?.uid,
    userRole: currentUser?.role,
    tenantOwnerId,
    userEmail: currentUser?.email,
    staffRecordRole,
    staffIsCompanyAdmin,
  };

  /** 광고형(AD/UNPAID)만 true — 서버/스냅샷 확인 전에는 광고 숨김 */
  const showsAds =
    tenantPlanReady &&
    shouldShowTenantAds(tenantPlanCode, tenantPaymentStatus, tenantLicenseExpiresAt);
  const hasAdminAccess = hasCompanyAdminAccess(permissionCtx) || currentUser?.email === 'molnanle@gmail.com';
  const isSiteAdmin = hasAdminAccess && !isTenantOwner;
  const canAccessAdminSettings = hasAdminAccess;
  const canAccessRootSettings = isTenantOwner || currentUser?.email === 'molnanle@gmail.com';
  const canManageCompanyFlag = canManageCompany(permissionCtx);
  const canDeletePermanentlyFlag = canDeletePermanently(permissionCtx);
  const canManageStaffFlag = canManageStaff(permissionCtx);
  const canManageClientMasterFlag = canManageClientMaster(permissionCtx);
  const canManageInstructionsFlag = canManageInstructions(permissionCtx);
  const canAccessStaffOperationsSettingsFlag = canAccessStaffOperationsSettings(permissionCtx);
  const canManageProductProcessingFlag = canManageProductProcessing(permissionCtx);

  useEffect(() => {
    dataService.setSessionCapabilities({
      canManageProductProcessing: canManageProductProcessingFlag,
    });
  }, [canManageProductProcessingFlag]);

  const assertStaffNotDeleted = async (tenantId: string, user: User, loginId?: string | null) => {
    const staffCol = collection(db, `tenants/${tenantId}/staff`);
    const loginNorm =
      loginId?.trim().toLowerCase()
      || (user.email?.endsWith('@ez-hub.kr') ? user.email.split('@')[0].trim().toLowerCase() : '');

    if (loginNorm) {
      const byLogin = await getDocs(
        query(staffCol, where('loginId', '==', loginNorm), limit(10))
      );
      const activeByLogin = byLogin.docs.find((d) => {
        const s = d.data();
        return s.isDeleted !== true && s.active !== false;
      });
      if (activeByLogin) return;
      if (byLogin.docs.length > 0) {
        throw new Error('DELETED_STAFF');
      }
    }

    const staffByUid = await getDoc(doc(staffCol, user.uid));
    if (staffByUid.exists()) {
      const s = staffByUid.data();
      if (s.isDeleted === true || s.active === false) {
        throw new Error('DELETED_STAFF');
      }
      return;
    }
    if (user.email) {
      const snap = await getDocs(
        query(staffCol, where('email', '==', user.email.trim().toLowerCase()), limit(5))
      );
      const activeByEmail = snap.docs.find((d) => {
        const s = d.data();
        return s.isDeleted !== true && s.active !== false;
      });
      if (activeByEmail) return;
      if (!snap.empty) {
        throw new Error('DELETED_STAFF');
      }
    }
  };

  const healStaffUserProfile = async (user: User, userData?: AppUser | null): Promise<AppUser | null> => {
    const resolved = await healStaffProfileFromRecords(user);
    if (!resolved) return null;

    return {
      uid: user.uid,
      id: user.uid,
      email: user.email || `${resolved.loginId}@ez-hub.kr`,
      displayName: resolved.name || userData?.name || user.displayName || '사원',
      name: resolved.name || userData?.name || user.displayName || '사원',
      photoURL: user.photoURL || userData?.photoURL || '',
      avatarUrl: user.photoURL || userData?.avatarUrl || '',
      tenantId: resolved.tenantId,
      role: resolved.role,
      loginId: resolved.loginId,
    } as AppUser;
  };

  const fetchUserProfile = async (user: User) => {
    try {
      let userDoc = await getDoc(doc(db, 'users', user.uid));

      // 직원 로그인 직후 LoginPage가 users 문서를 쓰는 동안 프로필 조회가 먼저 도착할 수 있음
      if (!userDoc.exists() && user.email?.endsWith('@ez-hub.kr')) {
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 120));
          userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) break;
        }
      }
      
      // [이름 오버라이트 방지] 실명은 유지. Google displayName / '사용자'로 users·staff를 덮지 않음.
      const existingName = userDoc.exists()
        ? String((userDoc.data() as any).name || (userDoc.data() as any).displayName || '').trim()
        : '';
      const keepExistingName =
        !!existingName &&
        existingName !== '대표자' &&
        existingName !== '웹 가입자' &&
        existingName !== '사용자' &&
        existingName !== '사원';

      const storedAvatar = userDoc.exists()
        ? String(
            (userDoc.data() as Record<string, unknown>).photoURL ||
              (userDoc.data() as Record<string, unknown>).avatarUrl ||
              ''
          ).trim()
        : '';

      const socialProfileData: Record<string, string> = {
        email: user.email || '',
        photoURL: storedAvatar || user.photoURL || '',
        avatarUrl: storedAvatar || user.photoURL || '',
      };
      // placeholder 이름일 때만 채움 — Google 계정명으로 실명을 절대 덮지 않음
      if (!keepExistingName) {
        const fillName = existingName || user.displayName || '사용자';
        socialProfileData.displayName = fillName;
        socialProfileData.name = fillName;
      }

      if (userDoc.exists()) {
        let userData = userDoc.data() as AppUser;
        if ((userData as any).active === false) {
          const healedInactive = await healStaffUserProfile(user, userData);
          if (healedInactive) {
            userData = healedInactive;
          } else {
            throw new Error('DELETED_STAFF');
          }
        }

        if (!userData.tenantId) {
          const healed = await healStaffUserProfile(user, userData);
          if (healed) {
            userData = healed;
          }
        }
        
        const loginId =
            (userData as AppUser & { loginId?: string }).loginId
            || (user.email?.endsWith('@ez-hub.kr') ? user.email.split('@')[0].toLowerCase() : undefined);

        let effectiveRole = userData.role;
        let resolvedStaffRole: string | null = null;
        let resolvedStaffIsCompanyAdmin = false;
        if (userData.tenantId) {
          const staffAuth = await lookupStaffAuthSnapshot(userData.tenantId, user.uid, loginId);
          resolvedStaffRole = staffAuth?.jobTitle ?? null;
          resolvedStaffIsCompanyAdmin = staffAuth?.isCompanyAdmin === true;
          setStaffRecordRole(resolvedStaffRole);
          setStaffIsCompanyAdmin(resolvedStaffIsCompanyAdmin);
          const tenantOwnerSnap = await getDoc(doc(db, 'tenants', userData.tenantId));
          const ownerId = tenantOwnerSnap.exists() ? String(tenantOwnerSnap.data()?.ownerId || '') : '';
          const isMainOwner = isTenantOwnerUser(user.uid, ownerId);
          if (resolvedStaffIsCompanyAdmin && !isMainOwner) {
            effectiveRole = 'admin';
          } else if (!resolvedStaffIsCompanyAdmin && !isMainOwner && effectiveRole === 'admin') {
            effectiveRole = 'staff';
          }
          if (effectiveRole !== userData.role) {
            await setDoc(doc(db, 'users', user.uid), { role: effectiveRole }, { merge: true });
          }
        } else {
          setStaffRecordRole(null);
          setStaffIsCompanyAdmin(false);
        }

        const updatedUser = {
          ...userData,
          ...socialProfileData,
          ...(keepExistingName
            ? { name: existingName, displayName: existingName }
            : {}),
          role: effectiveRole,
          loginId,
        };

        // Firestore 동기화 — 실명이 있으면 name/displayName 필드를 보내지 않음
        setDoc(doc(db, 'users', user.uid), socialProfileData, { merge: true }).catch(err => {
          console.error("Failed to sync social profile to Firestore users:", err);
        });

        setCurrentUser(updatedUser);
        dataService.setSyncUserRole(updatedUser.role);
        
        if (updatedUser.tenantId) {
          await assertStaffNotDeleted(updatedUser.tenantId, user, loginId);
          let tenantDoc: Awaited<ReturnType<typeof getDoc>> | null = null;
          try {
            tenantDoc = await getDoc(doc(db, 'tenants', updatedUser.tenantId));
            if (tenantDoc.exists()) {
              const tenantData = tenantDoc.data() as Record<string, unknown>;
              applyTenantSnapshot(tenantData, updatedUser.tenantId);
              const plan = determineTenantPlan(tenantData);
              const planCode = String(tenantData?.plan || 'free');
              const paymentStatus = String(tenantData?.paymentStatus || 'UNPAID').toUpperCase();
              if (isStaffKeepLoggedIn()) {
                writePersistedStaffSession(updatedUser, plan, planCode, paymentStatus);
              }
              persistOpsSnapshot({
                tenantId: updatedUser.tenantId,
                plan,
                planCode,
                paymentStatus,
                licenseExpiresAt: tenantData?.licenseExpiresAt
                  ? String(tenantData.licenseExpiresAt)
                  : null,
                maxStaff: getMaxStaffForPlan(
                  planCode,
                  paymentStatus,
                  typeof tenantData?.maxStaff === 'number' ? tenantData.maxStaff : null
                ),
                ownerId: tenantData?.ownerId ? String(tenantData.ownerId) : null,
                uid: user.uid,
                user: updatedUser,
                userRole: updatedUser.role,
                staffIsCompanyAdmin: resolvedStaffIsCompanyAdmin,
                staffRecordRole: resolvedStaffRole,
              });
            } else {
              restoreLastKnownTenantPlan(updatedUser.tenantId);
            }
          } catch (tenantErr) {
            console.warn('[TenantPlan] tenant getDoc failed during profile load:', tenantErr);
            restoreLastKnownTenantPlan(updatedUser.tenantId);
          }
          await dataService.setTenantWhenReady(updatedUser.tenantId, user.uid);

          // [SSOT 대표자 직원 동기화 자가 치유]
          // 테넌트 owner만 staff 문서 자동 생성. 사내 관리자는 기존 staff에 uid만 연결(중복 생성 방지).
          if (updatedUser.role === 'admin') {
            try {
              const tenantOwnerId = tenantDoc?.exists()
                ? String((tenantDoc.data() as Record<string, unknown> | undefined)?.ownerId || '')
                : '';
              const isMainOwner = !!tenantOwnerId && tenantOwnerId === user.uid;
              const staffCol = collection(db, `tenants/${updatedUser.tenantId}/staff`);
              const staffDocRef = doc(staffCol, user.uid);
              const staffDoc = await getDoc(staffDocRef);

              if (staffDoc.exists()) {
                const existing = staffDoc.data() || {};
                const needsRestore =
                  existing.isDeleted === true || existing.active === false || existing.deleted === true;
                const patch: Record<string, unknown> = {
                  uid: user.uid,
                  active: true,
                  isDeleted: false,
                };
                if (isMainOwner) {
                  patch.isCompanyAdmin = true;
                  const existingStaffName = String(existing.name || '').trim();
                  const preferredName = String(
                    updatedUser.name || (updatedUser as any).userName || ''
                  ).trim();
                  // 빈/placeholder 이름일 때만 채움 — Google displayName으로 실명 덮지 않음
                  if (
                    (!existingStaffName ||
                      existingStaffName === '사용자' ||
                      existingStaffName === '사원' ||
                      existingStaffName === '대표자' ||
                      existingStaffName === '웹 가입자') &&
                    preferredName &&
                    preferredName !== '사용자' &&
                    preferredName !== '사원' &&
                    preferredName !== user.displayName
                  ) {
                    patch.name = preferredName;
                  }
                } else if (existing.isCompanyAdmin !== true && existing.role !== 'admin') {
                  // 사내 관리자(users.role=admin)인데 플래그가 없으면 보정
                  patch.isCompanyAdmin = true;
                }
                if (needsRestore || isMainOwner || patch.isCompanyAdmin) {
                  await setDoc(staffDocRef, patch, { merge: true });
                  if (needsRestore) {
                    console.log(`[AuthSelfHealing] Restored staff visibility for ${user.uid}`);
                  }
                }
              } else {
                const loginIdNorm = String(
                  (updatedUser as any).loginId
                  || (user.email?.endsWith('@ez-hub.kr') ? user.email.split('@')[0] : '')
                  || ''
                ).trim().toLowerCase();
                const emailNorm = String(user.email || updatedUser.email || '').trim().toLowerCase();

                let existingStaffId: string | null = null;
                let existingStaffDeleted = false;

                // uid 필드가 다른 문서에 이미 있으면 그걸 연결 (staff/{uid} 중복 생성 방지)
                try {
                  const byUidField = await getDocs(
                    query(staffCol, where('uid', '==', user.uid), limit(5))
                  );
                  for (const d of byUidField.docs) {
                    const s = d.data();
                    if (s.isDeleted !== true) {
                      existingStaffId = d.id;
                      existingStaffDeleted = false;
                      break;
                    }
                    if (!existingStaffId) {
                      existingStaffId = d.id;
                      existingStaffDeleted = true;
                    }
                  }
                } catch { /* optional */ }

                if (!existingStaffId && loginIdNorm) {
                  const byLogin = await getDocs(
                    query(staffCol, where('loginId', '==', loginIdNorm), limit(5))
                  );
                  for (const d of byLogin.docs) {
                    const s = d.data();
                    if (s.isDeleted !== true) {
                      existingStaffId = d.id;
                      existingStaffDeleted = false;
                      break;
                    }
                    if (!existingStaffId) {
                      existingStaffId = d.id;
                      existingStaffDeleted = true;
                    }
                  }
                }

                if (!existingStaffId && emailNorm) {
                  try {
                    const byEmail = await getDocs(
                      query(staffCol, where('email', '==', emailNorm), limit(5))
                    );
                    for (const d of byEmail.docs) {
                      const s = d.data();
                      if (s.isDeleted !== true) {
                        existingStaffId = d.id;
                        existingStaffDeleted = false;
                        break;
                      }
                      if (!existingStaffId) {
                        existingStaffId = d.id;
                        existingStaffDeleted = true;
                      }
                    }
                  } catch { /* optional */ }
                }

                if (existingStaffId) {
                  await setDoc(
                    doc(staffCol, existingStaffId),
                    {
                      uid: user.uid,
                      active: true,
                      isDeleted: false,
                      ...(isMainOwner || updatedUser.role === 'admin'
                        ? { isCompanyAdmin: true }
                        : {}),
                    },
                    { merge: true }
                  );
                  console.log(
                    `[AuthSelfHealing] Linked existing staff ${existingStaffId} to uid ${user.uid}` +
                      (existingStaffDeleted ? ' (restored from deleted)' : '')
                  );
                } else if (isMainOwner) {
                  const ownerName =
                    String(updatedUser.name || (updatedUser as any).userName || '').trim() ||
                    '대표자';
                  await setDoc(staffDocRef, {
                    id: user.uid,
                    uid: user.uid,
                    name: ownerName,
                    role: (updatedUser as any).position || '대표자',
                    isCompanyAdmin: true,
                    phone: (updatedUser as any).contactInfo || '',
                    phoneCompany: (updatedUser as any).contactInfo || '',
                    avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(ownerName)}`,
                    active: true,
                    isDeleted: false,
                    email: user.email || updatedUser.email || '',
                    loginId: (updatedUser as any).loginId || user.email || '',
                    joinDate: (updatedUser as any).createdAt || new Date().toISOString()
                  }, { merge: true });
                  console.log(`[AuthSelfHealing] Automatically created missing staff record for tenant owner: ${user.uid}`);
                }
              }
            } catch (staffSyncErr) {
              console.warn("[AuthSelfHealing] Failed to sync admin as staff:", staffSyncErr);
            }
          }
        }
      } else {
        // [SSOT 자동 자가 치유 병합 엔진]
        // 만약 매니저 프로그램에서 임시 ID(예: user-fndeynhwo)로 이미 등록해 둔 사용자라면,
        // 최초 소셜 로그인 시 새 문서를 만드는 대신 기존 문서의 권한과 테넌트 정보를 새 Google UID 문서로 완벽히 이전/병합합니다.
        let preRegisteredUserDoc: any = null;
        if (user.email) {
          try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', user.email.trim().toLowerCase()));
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              // 본인의 실제 Google UID가 아닌 기존 임시 문서를 찾습니다.
              preRegisteredUserDoc = querySnap.docs.find((d: any) => d.id !== user.uid);
            }
          } catch (e) {
            console.warn("Failed to check pre-registered user by email:", e);
          }
        }

        if (preRegisteredUserDoc) {
          const oldUid = preRegisteredUserDoc.id;
          const oldUserData = preRegisteredUserDoc.data();
          const tenantId = oldUserData.tenantId || null;
          
          console.log(`[AuthSelfHealing] Found pre-registered user [${oldUserData.name || oldUserData.userName}] with temporary ID: ${oldUid}. Migrating to real Google UID: ${user.uid}`);

          const newUser: AppUser = {
            ...oldUserData,
            uid: user.uid,
            id: user.uid,
            email: user.email || oldUserData.email || '',
            displayName: user.displayName || oldUserData.displayName || oldUserData.userName || oldUserData.name || '사용자',
            name: oldUserData.name || oldUserData.userName || user.displayName || '사용자',
            photoURL: user.photoURL || oldUserData.photoURL || '',
            avatarUrl: user.photoURL || oldUserData.photoURL || '',
            role: oldUserData.role || 'staff'
          };
          
          // 1. 새 Google UID로 문서 복제 생성
          await setDoc(doc(db, 'users', user.uid), newUser);
          
          // 2. 관리자(admin) 계정이고 테넌트의 기존 ownerId가 임시 ID라면, 테넌트 정보의 소유주를 실시간 수정
          if (newUser.role === 'admin' && tenantId) {
            const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
            if (tenantDoc.exists() && tenantDoc.data().ownerId === oldUid) {
              await setDoc(doc(db, 'tenants', tenantId), {
                ownerId: user.uid,
                updatedAt: new Date().toISOString()
              }, { merge: true });
              console.log(`[AuthSelfHealing] Successfully updated tenant [${tenantDoc.data().name}] ownerId to real Google UID: ${user.uid}`);
            }
          }
          
          // 3. 테넌트 소속 사원 서브컬렉션(staff) 정보가 임시 ID로 매핑되어 있다면 신규 UID로 복제 후 구버전 영구 격리 삭제
          if (tenantId) {
            try {
              const oldStaffDoc = await getDoc(doc(db, `tenants/${tenantId}/staff/${oldUid}`));
              if (oldStaffDoc.exists()) {
                const oldStaffData = oldStaffDoc.data();
                await setDoc(doc(db, `tenants/${tenantId}/staff/${user.uid}`), {
                  ...oldStaffData,
                  id: user.uid,
                  uid: user.uid,
                  email: user.email || oldStaffData.email || '',
                  name: newUser.name,
                  active: true
                });
                await deleteDoc(doc(db, `tenants/${tenantId}/staff/${oldUid}`));
                console.log(`[AuthSelfHealing] Successfully migrated tenant staff subcollection record to real Google UID: ${user.uid}`);
              }
            } catch (staffErr) {
              console.warn("[AuthSelfHealing] Failed migrating tenant staff record:", staffErr);
            }
          }
          
          // 4. 구버전 임시 문서 최종 파괴 (중복 꼬임 방지)
          await deleteDoc(doc(db, 'users', oldUid));
          console.log(`[AuthSelfHealing] Successfully destroyed temporary user document: ${oldUid}`);

          setCurrentUser(newUser);
          dataService.setSyncUserRole(newUser.role);
          if (tenantId) {
            try {
              const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
              if (tenantDoc.exists()) {
                applyTenantSnapshot(tenantDoc.data(), tenantId);
              } else {
                restoreLastKnownTenantPlan(tenantId);
              }
            } catch (tenantErr) {
              console.warn('[TenantPlan] tenant getDoc failed (heal path):', tenantErr);
              restoreLastKnownTenantPlan(tenantId);
            }
            await dataService.setTenantWhenReady(tenantId, user.uid);
          }
        } else {
          // 일치하는 임시 등록 정보가 없는 경우: 기존의 초대코드 확인 및 신규 가입 로직 수행
          let tenantId: string | null = null;
          let role: 'admin' | 'staff' | 'superadmin' = 'staff';

          const pendingStaff = readPendingStaffProfile(user.email);
          if (pendingStaff) {
            tenantId = pendingStaff.tenantId;
            role = pendingStaff.role;
            try {
              await setDoc(doc(db, `tenants/${pendingStaff.tenantId}/staff/${pendingStaff.staffDocId}`), {
                uid: user.uid,
                active: true,
              }, { merge: true });
            } catch (staffLinkErr) {
              console.warn('[Auth] Failed to link pending staff uid:', staffLinkErr);
            }
          }
          
          try {
            if (!tenantId && user.email) {
              const inviteDoc = await getDoc(doc(db, 'invitations', user.email.trim().toLowerCase()));
              if (inviteDoc.exists()) {
                const inviteData = inviteDoc.data();
                tenantId = inviteData.tenantId || null;
                role = inviteData.role || 'staff';
                
                // 1. Link the staff record with the user's uid in the tenant subcollection
                if (inviteData.staffId && tenantId) {
                  await setDoc(doc(db, `tenants/${tenantId}/staff/${inviteData.staffId}`), {
                    uid: user.uid,
                    active: true
                  }, { merge: true });
                }
                
                // 2. Delete the consumed invitation
                await deleteDoc(doc(db, 'invitations', user.email.trim().toLowerCase()));
              }
            }
          } catch (e) {
            console.warn("Failed checking or linking invitations:", e);
          }

          // Create profile
          const newUser: AppUser = {
            uid: user.uid,
            id: user.uid,
            email: user.email || '',
            displayName: user.displayName || '사용자',
            name: user.displayName || '사용자',
            photoURL: user.photoURL || '',
            avatarUrl: user.photoURL || '',
            tenantId,
            role
          };
          await setDoc(doc(db, 'users', user.uid), newUser, { merge: true });
          setCurrentUser(newUser);
          dataService.setSyncUserRole(newUser.role);
          if (tenantId) {
            try {
              const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
              if (tenantDoc.exists()) {
                applyTenantSnapshot(tenantDoc.data(), tenantId);
              } else {
                restoreLastKnownTenantPlan(tenantId);
              }
            } catch (tenantErr) {
              console.warn('[TenantPlan] tenant getDoc failed (signup path):', tenantErr);
              restoreLastKnownTenantPlan(tenantId);
            }
            await dataService.setTenantWhenReady(tenantId, user.uid);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'DELETED_STAFF') {
        // 삭제/비활성 확정 — 캐시·스냅샷으로 절대 복원하지 않음
        console.warn('[Auth] Deleted staff account blocked from login');
        clearPersistedStaffSession();
        clearLastKnownTenantPlanForUid(user.uid);
        try {
          dataService.clearSession();
        } catch {
          /* ignore */
        }
        await signOut(auth);
        setCurrentUser(null);
        setFirebaseUser(null);
        setTenantPlanReady(false);
        return;
      }
      console.error("Error fetching user profile:", error);

      // Firestore 일시 장애 — 직전 정상 스냅샷으로 세션 유지 (로그아웃 방지)
      const knownOps = readLastKnownTenantPlanByUid(user.uid);
      if (knownOps?.user?.tenantId || knownOps?.tenantId) {
        const tenantId = String(knownOps.user?.tenantId || knownOps.tenantId);
        const restoredUser: AppUser = {
          uid: user.uid,
          id: user.uid,
          email: knownOps.user?.email || user.email || '',
          displayName:
            knownOps.user?.displayName ||
            knownOps.user?.name ||
            user.displayName ||
            '사용자',
          name:
            knownOps.user?.name ||
            knownOps.user?.displayName ||
            user.displayName ||
            '사용자',
          photoURL: knownOps.user?.photoURL || user.photoURL || '',
          avatarUrl:
            knownOps.user?.avatarUrl ||
            knownOps.user?.photoURL ||
            user.photoURL ||
            '',
          tenantId,
          role: (knownOps.userRole || knownOps.user?.role || 'staff') as AppUser['role'],
          loginId: knownOps.user?.loginId,
        } as AppUser;
        console.warn(
          `[Auth] Profile fetch failed — last-known ops bootstrap (${tenantId})`
        );
        setCurrentUser(restoredUser);
        dataService.setSyncUserRole(restoredUser.role);
        restoreLastKnownTenantPlan(tenantId);
        await dataService.setTenantWhenReady(tenantId, user.uid);
        return;
      }

      const pendingStaff = readPendingStaffProfile(user.email);
      if (pendingStaff?.tenantId) {
        setCurrentUser({
          uid: user.uid,
          id: user.uid,
          email: user.email || pendingStaff.email,
          displayName: pendingStaff.name || user.displayName || '사원',
          name: pendingStaff.name || user.displayName || '사원',
          photoURL: user.photoURL || '',
          avatarUrl: user.photoURL || '',
          tenantId: pendingStaff.tenantId,
          role: pendingStaff.role,
        });
        dataService.setSyncUserRole(pendingStaff.role);
        restoreLastKnownTenantPlan(pendingStaff.tenantId);
        await dataService.setTenantWhenReady(pendingStaff.tenantId, user.uid);
        return;
      }

      const healed = await healStaffUserProfile(user);
      if (healed?.tenantId) {
        setCurrentUser(healed);
        dataService.setSyncUserRole(healed.role);
        restoreLastKnownTenantPlan(healed.tenantId);
        await dataService.setTenantWhenReady(healed.tenantId, user.uid);
        return;
      }

      try {
        const customRaw =
          sessionStorage.getItem('customUser') || localStorage.getItem('customUser');
        if (customRaw) {
          const customUser = JSON.parse(customRaw) as AppUser;
          if (customUser?.tenantId) {
            setCurrentUser(customUser);
            dataService.setSyncUserRole(customUser.role);
            restoreLastKnownTenantPlan(customUser.tenantId);
            await dataService.setTenantWhenReady(customUser.tenantId, user.uid);
            return;
          }
        }
      } catch {
        /* ignore malformed session cache */
      }

      // Google 등 검증된 계정: 일시 오류로 tenantId=null 폴백 시 중복 회사 생성 방지
      if (user.emailVerified && !user.email?.endsWith('@ez-hub.kr')) {
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          try {
            const retryDoc = await getDoc(doc(db, 'users', user.uid));
            if (retryDoc.exists()) {
              await fetchUserProfile(user);
              return;
            }
          } catch {
            /* retry */
          }
        }
        console.error('[Auth] Profile fetch failed for verified user — signing out to prevent duplicate onboarding');
        // 스냅샷이 있으면 위에서 이미 복원됨. 여기까지 온 경우만 로그아웃.
        await signOut(auth);
        setCurrentUser(null);
        return;
      }

      // 직원 계정(@ez-hub.kr·loginId 보유) 소속 복구 실패 — 로그아웃으로 루프 방지
      let hasStaffLoginId = false;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        hasStaffLoginId = !!snap.data()?.loginId;
      } catch {
        /* ignore */
      }
      if (isStaffInternalEmail(user.email) || hasStaffLoginId) {
        console.warn('[Auth] Staff profile incomplete — aborting session to prevent login loop');
        await abortIncompleteStaffLogin();
        setCurrentUser(null);
        return;
      }

      setCurrentUser({
        uid: user.uid,
        id: user.uid,
        email: user.email || '',
        displayName: user.displayName || '사용자',
        name: user.displayName || '사용자',
        photoURL: user.photoURL || '',
        avatarUrl: user.photoURL || '',
        tenantId: null,
        role: 'staff',
      });
    }
  };

  const loginCustomSession = (user: AppUser, plan: 'free' | 'pro', planCode?: string, paymentStatus?: string) => {
    const keepLoggedIn = isStaffKeepLoggedIn();
    const code = planCode || (plan === 'pro' ? 'pro' : 'free');
    const pay = String(paymentStatus || (plan === 'pro' ? 'PAID' : 'AD')).toUpperCase();
    if (keepLoggedIn) {
      writePersistedStaffSession(user, plan, code, pay);
    } else {
      clearPersistedStaffSession();
    }
    sessionStorage.setItem('customUser', JSON.stringify(user));
    sessionStorage.setItem('customTenantPlan', plan);
    sessionStorage.setItem('customTenantPlanCode', code);
    setCurrentUser(user);
    setTenantPlan(plan);
    setTenantPlanCode(code);
    setTenantPaymentStatus(pay);
    setMaxStaff(getMaxStaffForPlan(code, pay));
    setTenantPlanReady(true);
    if (user.tenantId) {
      persistOpsSnapshot({
        tenantId: user.tenantId,
        plan,
        planCode: code,
        paymentStatus: pay,
        licenseExpiresAt: null,
        maxStaff: getMaxStaffForPlan(code, pay),
        ownerId: null,
        uid: user.uid,
        user,
        userRole: user.role,
      });
    }
    dataService.setSyncUserRole(user.role);
    if (user.tenantId && user.uid) {
      void dataService.setTenantWhenReady(user.tenantId, user.uid);
    }
  };

  const refreshUser = async (user?: User | null) => {
    const targetUser = user ?? firebaseUser;
    if (targetUser) {
      await fetchUserProfile(targetUser);
    }
  };

  // 요금제 — 로그인 시 1회 조회 (onSnapshot 제거로 읽기 절감)
  useEffect(() => {
    if (!currentUser?.tenantId) {
      setTenantPlanReady(false);
      return;
    }

    const tenantId = currentUser.tenantId;
    // 네트워크보다 먼저 last-known 적용 → 광고/권한 깜빡임 방지
    restoreLastKnownTenantPlan(tenantId);

    const tenantRef = doc(db, 'tenants', tenantId);
    let cancelled = false;

    const refreshPlan = async () => {
      try {
        const snap = await getDoc(tenantRef);
        if (cancelled) return;
        if (snap.exists()) {
          applyTenantSnapshot(snap.data(), tenantId);
        } else {
          // 문서가 잠깐 안 보이면 광고형으로 떨어뜨리지 않음
          restoreLastKnownTenantPlan(tenantId);
        }
      } catch (err) {
        console.warn('[TenantPlan] getDoc failed:', err);
        if (!cancelled) {
          restoreLastKnownTenantPlan(tenantId);
        }
      }
    };

    void refreshPlan();
    const interval = window.setInterval(() => void refreshPlan(), 30 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUser?.tenantId]);

  // 로그인 중 온라인 상태 — NAS presence + Firestore 미러(라이선스 매니저용)
  useEffect(() => {
    if (!currentUser?.tenantId || !firebaseUser?.uid) {
      stopPresenceSession();
      return;
    }

    const loginId = currentUser.loginId
      || (firebaseUser.email?.endsWith('@ez-hub.kr') ? firebaseUser.email.split('@')[0] : undefined);

    const staffList = dataService.getStaff();
    const staffDocId =
      getStaffIdForUser(staffList, currentUser) ||
      staffList.find((s) => s.uid === firebaseUser.uid)?.id ||
      undefined;

    setPresenceGatewayUrls(dataService.getStoreGatewayUrls());
    startPresenceSession({
      uid: firebaseUser.uid,
      tenantId: currentUser.tenantId,
      email: currentUser.email || firebaseUser.email,
      loginId,
      name: currentUser.name || currentUser.displayName,
      staffDocId: staffDocId || null,
    });

    // 의존성 변경 시 cleanup에서 offline 쓰지 않음 — 로그아웃에서만 release
    return () => {
      stopPresenceSession();
    };
  }, [currentUser?.tenantId, currentUser?.email, currentUser?.loginId, currentUser?.name, currentUser?.displayName, currentUser?.id, firebaseUser?.uid, firebaseUser?.email]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    const initAuth = async () => {
      const authReadyTimer = window.setTimeout(() => {
        console.warn('[Auth] 초기화 지연 — 로딩 화면 강제 해제');
        setLoading(false);
      }, 12000);

      const clearAuthReadyTimer = () => {
        window.clearTimeout(authReadyTimer);
      };
      const keepLoggedIn = isStaffKeepLoggedIn();

      if (!DEV_BYPASS_LOGIN && !keepLoggedIn) {
        console.log("[AuthSecurity] Keep-login is not active. Cleaning up persistent custom session caches.");
        clearPersistedStaffSession();
      }

      if (DEV_BYPASS_LOGIN) {
        const mockUser = {
          uid: 'dev-admin-uid',
          email: 'admin@ezprintwork.local',
          displayName: '시스템 관리자',
          photoURL: 'https://ui-avatars.com/api/?name=Admin&background=020617&color=fff'
        } as User;

        const mockProfile: AppUser = {
          uid: 'dev-admin-uid',
          id: 'dev-admin-uid',
          email: 'admin@ezprintwork.local',
          displayName: '시스템 관리자',
          name: '시스템 관리자',
          photoURL: 'https://ui-avatars.com/api/?name=Admin&background=020617&color=fff',
          avatarUrl: 'https://ui-avatars.com/api/?name=Admin&background=020617&color=fff',
          tenantId: 'dev-tenant-id',
          role: 'admin'
        };
        
        setFirebaseUser(mockUser);
        setCurrentUser(mockProfile);
        setTenantPlan('free');
        dataService.setTenant('dev-tenant-id');
        clearAuthReadyTimer();
        setLoading(false);
        return;
      }

      try {
        await configureAuthPersistenceFromPreferences();
      } catch (err) {
        console.warn('[Auth] Failed to configure auth persistence:', err);
      }

      if (cancelled) return;

      console.log("AuthProvider - Initializing...");
      getRedirectResult(auth).catch((err) => {
        console.error('Google redirect sign-in failed:', err);
      });

      unsubscribe = onAuthStateChanged(auth, async (user) => {
        console.log("Auth State Changed:", user ? user.uid : "null");
        setFirebaseUser(user);
        try {
          if (user) {
            await fetchUserProfile(user);
          } else {
            const stillKeepLoggedIn = isStaffKeepLoggedIn();
            if (!stillKeepLoggedIn) {
              clearPersistedStaffSession();
            }
            setCurrentUser(null);
          }
        } catch (err) {
          console.error('[Auth] onAuthStateChanged handler failed:', err);
        } finally {
          clearAuthReadyTimer();
          setLoading(false);
        }
      });
    };

    void initAuth();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const logout = useCallback(async () => {
    const uid = firebaseUser?.uid;
    const tenantId = currentUser?.tenantId;
    const email = currentUser?.email || firebaseUser?.email;

    stopPresenceSession();
    if (uid && tenantId) {
      try {
        await setPresenceOffline({
          uid,
          tenantId,
          email,
          loginId: currentUser?.loginId,
          name: currentUser?.name || currentUser?.displayName,
          staffDocId:
            getStaffIdForUser(dataService.getStaff(), currentUser!) ||
            dataService.getStaff().find((s) => s.uid === uid)?.id ||
            null,
        });
        await releaseStaffSessionOnNas({
          uid,
          tenantId,
          email,
          loginId: currentUser?.loginId,
          gatewayBaseUrl: dataService.getStoreGatewayUrls(),
        });
      } catch (err) {
        console.warn('[StaffSession] release on logout failed:', err);
        await setPresenceOffline();
      }
    } else {
      await setPresenceOffline();
    }
    clearPersistedStaffSession();
    clearLocalStaffSessionId();
    dataService.clearSession();
    await signOut(auth);
    setCurrentUser(null);
    setFirebaseUser(null);
  }, [firebaseUser?.uid, firebaseUser?.email, currentUser?.tenantId, currentUser?.email]);

  // 다른 기기에서 동일 직원 아이디로 로그인 시 기존 접속 종료 (NAS 폴링)
  useEffect(() => {
    const isDesktopApp = typeof window !== 'undefined' && !!(window as any).electron;
    if (!isDesktopApp) return;

    sessionKickedRef.current = false;
    if (!firebaseUser?.uid || !currentUser?.loginId || !currentUser?.tenantId) return;

    const localSid = getLocalStaffSessionId();
    const localClaimedAt = getLocalStaffSessionClaimedAt();
    if (!localSid) return;

    const tenantId = currentUser.tenantId;
    const uid = firebaseUser.uid;

    const checkRemoteSession = async () => {
      try {
        if (sessionKickedRef.current) return;
        setPresenceGatewayUrls(dataService.getStoreGatewayUrls());
        const data = await presenceSessionService.readEntry(
          tenantId,
          uid,
          dataService.getStoreGatewayUrls()
        );
        if (!data || !isRemoteSessionNewerThanLocal(data, localSid, localClaimedAt)) return;

        sessionKickedRef.current = true;
        await showAlert('다른 곳에서 동일 아이디로 로그인되어 이 접속을 종료합니다.');
        await logout();
      } catch (err) {
        console.warn('[StaffSession] session watch failed:', err);
      }
    };

    void checkRemoteSession();
    const intervalId = window.setInterval(() => void checkRemoteSession(), 90_000);

    return () => window.clearInterval(intervalId);
  }, [firebaseUser?.uid, currentUser?.loginId, currentUser?.tenantId, showAlert, logout]);

  console.log('AuthProvider State:', { hasFirebaseUser: !!firebaseUser, hasCurrentUser: !!currentUser, loading });

  return (
    <AuthContext.Provider value={{ 
      firebaseUser, 
      currentUser, 
      tenantPlan,
      showsAds,
      tenantPlanCode,
      maxStaff,
      tenantPaymentStatus,
      updatePlan: (plan: 'free' | 'pro') => setTenantPlan(plan),
      loading, 
      logout, 
      refreshUser,
      isAuthenticated: !!firebaseUser || !!currentUser,
      loginCustomSession,
      tenantOwnerId,
      isTenantOwner,
      isSiteAdmin,
      canAccessAdminSettings,
      canAccessRootSettings,
      canManageCompany: canManageCompanyFlag,
      canDeletePermanently: canDeletePermanentlyFlag,
      canManageStaff: canManageStaffFlag,
      canManageClientMaster: canManageClientMasterFlag,
      canManageInstructions: canManageInstructionsFlag,
      canAccessStaffOperationsSettings: canAccessStaffOperationsSettingsFlag,
      canManageProductProcessing: canManageProductProcessingFlag,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
