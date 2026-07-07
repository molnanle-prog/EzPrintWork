import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { auth, db, startPresenceSession, stopPresenceSession, setPresenceOffline } from '../services/firebase';
import { onAuthStateChanged, User, signOut, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { AppUser } from '../types';
import { db as dataService } from '../services/dataService';
import { getMaxStaffForPlan, isProPlan } from '../utils/planLimits';
import { isTenantOwnerUser, hasCompanyAdminAccess, canManageCompany, canManageTenantRoot, canDeletePermanently, canManageStaff, canManageClientMaster, canManageInstructions, canAccessStaffOperationsSettings, isStaffAdminRole, CompanyPermissionContext } from '../utils/adminAccess';
import { isStaffKeepLoggedIn, clearSavedStaffCredentials } from '../utils/staffLoginPreferences';
import { readPendingStaffProfile } from '../utils/staffLoginSession';
import { lookupStaffRecordRole } from '../utils/resolveStaffTenantProfile';
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
import { useDialog } from './DialogContext';
import {
  getLocalStaffSessionId,
  getLocalStaffSessionClaimedAt,
  clearLocalStaffSessionId,
  isRemoteSessionNewerThanLocal,
  releaseStaffSessionOnFirestore,
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
  /** 상품·후가공·거래처 등록/수정 (일반 직원 포함) */
  canAccessStaffOperationsSettings: boolean;
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
  const [tenantPaymentStatus, setTenantPaymentStatus] = useState<string>('UNPAID');
  const [tenantOwnerId, setTenantOwnerId] = useState<string | null>(null);
  const [staffRecordRole, setStaffRecordRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyTenantSnapshot = (tenantData: any) => {
    const plan = determineTenantPlan(tenantData);
    setTenantPlan(plan);
    const code = String(tenantData?.plan || 'free');
    setTenantPlanCode(code);
    setTenantPaymentStatus(String(tenantData?.paymentStatus || 'UNPAID').toUpperCase());
    setMaxStaff(getMaxStaffForPlan(code, tenantData?.paymentStatus, tenantData?.maxStaff));
    setTenantOwnerId(tenantData?.ownerId || null);
  };

  const isTenantOwner = isTenantOwnerUser(currentUser?.uid, tenantOwnerId);
  const permissionCtx: CompanyPermissionContext = {
    userUid: currentUser?.uid,
    userRole: currentUser?.role,
    tenantOwnerId,
    userEmail: currentUser?.email,
    staffRecordRole,
  };
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

  /** determineTenantPlan과 동일 — 광고형(AD)만 true */
  const showsAds = tenantPlan === 'free';

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
      
      // [이름 오버라이트 방지] 기존 DB에 저장된 실제 사용자 정의 이름이 존재한다면, 소셜 로그인 시 구글 계정명으로 무조건 덮어씌워지는 오류를 원천 차단합니다.
      const existingName = userDoc.exists() ? ((userDoc.data() as any).name || (userDoc.data() as any).displayName || '') : '';
      const finalName = (existingName && existingName !== '대표자' && existingName !== '웹 가입자' && existingName !== '사용자')
        ? existingName
        : (user.displayName || '사용자');

      const socialProfileData = {
        email: user.email || '',
        displayName: finalName,
        name: finalName,
        photoURL: user.photoURL || '',
        avatarUrl: user.photoURL || ''
      };

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
        if (userData.tenantId) {
          resolvedStaffRole = await lookupStaffRecordRole(userData.tenantId, user.uid, loginId);
          setStaffRecordRole(resolvedStaffRole);
          const tenantOwnerSnap = await getDoc(doc(db, 'tenants', userData.tenantId));
          const ownerId = tenantOwnerSnap.exists() ? String(tenantOwnerSnap.data()?.ownerId || '') : '';
          const isMainOwner = isTenantOwnerUser(user.uid, ownerId);
          if (isStaffAdminRole(resolvedStaffRole) && !isMainOwner) {
            effectiveRole = 'admin';
          } else if (!isStaffAdminRole(resolvedStaffRole) && !isMainOwner && effectiveRole === 'admin') {
            effectiveRole = 'staff';
          }
          if (effectiveRole !== userData.role) {
            await setDoc(doc(db, 'users', user.uid), { role: effectiveRole }, { merge: true });
          }
        } else {
          setStaffRecordRole(null);
        }

        const updatedUser = {
          ...userData,
          ...socialProfileData,
          role: effectiveRole,
          loginId,
        };

        // Firestore에 소셜 최신 프로필 자동 동기화 (비동기 수행)
        setDoc(doc(db, 'users', user.uid), socialProfileData, { merge: true }).catch(err => {
          console.error("Failed to sync social profile to Firestore users:", err);
        });

        setCurrentUser(updatedUser);
        dataService.setSyncUserRole(updatedUser.role);
        
        if (updatedUser.tenantId) {
          await assertStaffNotDeleted(updatedUser.tenantId, user, loginId);
          const tenantDoc = await getDoc(doc(db, 'tenants', updatedUser.tenantId));
          if (tenantDoc.exists()) {
              const tenantData = tenantDoc.data();
              applyTenantSnapshot(tenantData);
              if (isStaffKeepLoggedIn()) {
                const plan = determineTenantPlan(tenantData);
                const planCode = String(tenantData?.plan || 'free');
                const paymentStatus = String(tenantData?.paymentStatus || 'UNPAID').toUpperCase();
                writePersistedStaffSession(updatedUser, plan, planCode, paymentStatus);
              }
          }
          await dataService.setTenantWhenReady(updatedUser.tenantId, user.uid);

          // [SSOT 대표자 직원 동기화 자가 치유]
          // 테넌트 owner만 staff 문서 자동 생성. 사내 관리자는 기존 staff에 uid만 연결(중복 생성 방지).
          if (updatedUser.role === 'admin') {
            try {
              const tenantOwnerId = tenantDoc.exists() ? String(tenantDoc.data()?.ownerId || '') : '';
              const isMainOwner = !!tenantOwnerId && tenantOwnerId === user.uid;
              const staffCol = collection(db, `tenants/${updatedUser.tenantId}/staff`);
              const staffDocRef = doc(staffCol, user.uid);
              const staffDoc = await getDoc(staffDocRef);

              if (staffDoc.exists()) {
                /* already linked at uid */
              } else {
                const loginIdNorm = String(
                  (updatedUser as any).loginId
                  || (user.email?.endsWith('@ez-hub.kr') ? user.email.split('@')[0] : '')
                  || ''
                ).trim().toLowerCase();

                let existingStaffId: string | null = null;
                if (loginIdNorm) {
                  const byLogin = await getDocs(
                    query(staffCol, where('loginId', '==', loginIdNorm), limit(5))
                  );
                  for (const d of byLogin.docs) {
                    const s = d.data();
                    if (s.isDeleted === true) continue;
                    existingStaffId = d.id;
                    break;
                  }
                }

                if (existingStaffId) {
                  await setDoc(
                    doc(staffCol, existingStaffId),
                    { uid: user.uid, active: true },
                    { merge: true }
                  );
                  console.log(`[AuthSelfHealing] Linked existing staff ${existingStaffId} to uid ${user.uid}`);
                } else if (isMainOwner) {
                  await setDoc(staffDocRef, {
                    id: user.uid,
                    uid: user.uid,
                    name: updatedUser.name || (updatedUser as any).userName || user.displayName || '대표자',
                    role: (updatedUser as any).position || '대표자',
                    phone: (updatedUser as any).contactInfo || '',
                    phoneCompany: (updatedUser as any).contactInfo || '',
                    avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(updatedUser.name || '대표자')}`,
                    active: true,
                    email: user.email || updatedUser.email || '',
                    loginId: (updatedUser as any).loginId || user.email || '',
                    password: (updatedUser as any).password || '',
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
            const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
            if (tenantDoc.exists()) {
              applyTenantSnapshot(tenantDoc.data());
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
            const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
            if (tenantDoc.exists()) {
              applyTenantSnapshot(tenantDoc.data());
            }
            await dataService.setTenantWhenReady(tenantId, user.uid);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'DELETED_STAFF') {
        try {
          const customRaw =
            sessionStorage.getItem('customUser') || localStorage.getItem('customUser');
          if (customRaw) {
            const customUser = JSON.parse(customRaw) as AppUser;
            if (customUser?.tenantId && customUser.uid === user.uid) {
              setCurrentUser(customUser);
              dataService.setSyncUserRole(customUser.role);
              await dataService.setTenantWhenReady(customUser.tenantId, user.uid);
              return;
            }
          }
        } catch {
          /* ignore */
        }
        const healedDeleted = await healStaffUserProfile(user);
        if (healedDeleted?.tenantId) {
          setCurrentUser(healedDeleted);
          dataService.setSyncUserRole(healedDeleted.role);
          await dataService.setTenantWhenReady(healedDeleted.tenantId, user.uid);
          return;
        }
        console.warn('[Auth] Deleted staff account blocked from login');
        await signOut(auth);
        setCurrentUser(null);
        return;
      }
      console.error("Error fetching user profile:", error);

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
        await dataService.setTenantWhenReady(pendingStaff.tenantId, user.uid);
        return;
      }

      const healed = await healStaffUserProfile(user);
      if (healed?.tenantId) {
        setCurrentUser(healed);
        dataService.setSyncUserRole(healed.role);
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
    if (keepLoggedIn) {
      writePersistedStaffSession(user, plan, code, paymentStatus);
    } else {
      clearPersistedStaffSession();
    }
    sessionStorage.setItem('customUser', JSON.stringify(user));
    sessionStorage.setItem('customTenantPlan', plan);
    sessionStorage.setItem('customTenantPlanCode', code);
    setCurrentUser(user);
    setTenantPlan(plan);
    setTenantPlanCode(code);
    setMaxStaff(getMaxStaffForPlan(code, paymentStatus));
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
    if (!currentUser || !currentUser.tenantId) {
      return;
    }

    const tenantRef = doc(db, 'tenants', currentUser.tenantId);
    let cancelled = false;

    const refreshPlan = async () => {
      try {
        const snap = await getDoc(tenantRef);
        if (!cancelled && snap.exists()) {
          applyTenantSnapshot(snap.data());
        }
      } catch (err) {
        console.warn('[TenantPlan] getDoc failed:', err);
      }
    };

    void refreshPlan();
    const interval = window.setInterval(() => void refreshPlan(), 30 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUser?.tenantId]);

  // 로그인 중 온라인 상태를 Firestore에 기록 (관리 프로그램 연동)
  useEffect(() => {
    if (!currentUser?.tenantId || !firebaseUser?.uid) {
      stopPresenceSession();
      return;
    }

    const loginId = currentUser.loginId
      || (firebaseUser.email?.endsWith('@ez-hub.kr') ? firebaseUser.email.split('@')[0] : undefined);

    startPresenceSession({
      uid: firebaseUser.uid,
      tenantId: currentUser.tenantId,
      email: currentUser.email || firebaseUser.email,
      loginId,
      name: currentUser.name || currentUser.displayName,
    });

    return () => {
      void releaseStaffSessionOnFirestore(db, {
        uid: firebaseUser.uid,
        tenantId: currentUser.tenantId!,
        email: currentUser.email || firebaseUser.email,
        name: currentUser.name || currentUser.displayName,
      });
      stopPresenceSession();
    };
  }, [currentUser?.tenantId, currentUser?.email, currentUser?.name, currentUser?.displayName, firebaseUser?.uid, firebaseUser?.email]);

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
    const name = currentUser?.name || currentUser?.displayName || firebaseUser?.displayName;

    stopPresenceSession();
    if (uid && tenantId) {
      try {
        await releaseStaffSessionOnFirestore(db, { uid, tenantId, email, name });
      } catch (err) {
        console.warn('[StaffSession] release on logout failed:', err);
        await setPresenceOffline();
      }
    } else {
      await setPresenceOffline();
    }
    clearPersistedStaffSession();
    clearSavedStaffCredentials();
    clearLocalStaffSessionId();
    await signOut(auth);
    setCurrentUser(null);
    setFirebaseUser(null);
  }, [firebaseUser?.uid, firebaseUser?.email, firebaseUser?.displayName, currentUser?.tenantId, currentUser?.email, currentUser?.name, currentUser?.displayName]);

  // 다른 기기에서 동일 직원 아이디로 로그인 시 기존 접속 종료
  useEffect(() => {
    sessionKickedRef.current = false;
    if (!firebaseUser?.uid || !currentUser?.loginId) return;

    const localSid = getLocalStaffSessionId();
    const localClaimedAt = getLocalStaffSessionClaimedAt();
    if (!localSid) return;

    const userRef = doc(db, 'users', firebaseUser.uid);

    const checkRemoteSession = async () => {
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists() || sessionKickedRef.current) return;
        const data = snap.data();
        if (!isRemoteSessionNewerThanLocal(data, localSid, localClaimedAt)) return;

        sessionKickedRef.current = true;
        await showAlert('다른 곳에서 동일 아이디로 로그인되어 이 접속을 종료합니다.');
        await logout();
      } catch (err) {
        console.warn('[StaffSession] session watch failed:', err);
      }
    };

    void checkRemoteSession();
    const intervalId = window.setInterval(() => void checkRemoteSession(), 45_000);

    return () => window.clearInterval(intervalId);
  }, [firebaseUser?.uid, currentUser?.loginId, showAlert, logout]);

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
