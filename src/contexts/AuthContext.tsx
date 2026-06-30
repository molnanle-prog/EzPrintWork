import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, User, signOut, getRedirectResult } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { AppUser } from '../types';
import { db as dataService } from '../services/dataService';
import { getMaxStaffForPlan, isProPlan } from '../utils/planLimits';
import { isTenantOwnerUser, canManageCompany, canManageTenantRoot, canDeletePermanently, canManageStaff, canManageClientMaster, canManageInstructions, canAccessStaffOperationsSettings, CompanyPermissionContext } from '../utils/adminAccess';
import { readPendingStaffProfile } from '../utils/staffLoginSession';
import { resolveStaffTenantProfile, upsertStaffUserProfile } from '../utils/resolveStaffTenantProfile';

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
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [tenantPlan, setTenantPlan] = useState<'free' | 'pro'>('free');
  const [tenantPlanCode, setTenantPlanCode] = useState<string>('free');
  const [maxStaff, setMaxStaff] = useState<number>(1);
  const [tenantPaymentStatus, setTenantPaymentStatus] = useState<string>('UNPAID');
  const [tenantOwnerId, setTenantOwnerId] = useState<string | null>(null);
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
  const isSiteAdmin = currentUser?.role === 'admin' && !isTenantOwner;
  const canAccessAdminSettings = isTenantOwner || currentUser?.role === 'admin';
  const canAccessRootSettings = isTenantOwner || currentUser?.email === 'molnanle@gmail.com';

  const permissionCtx: CompanyPermissionContext = {
    userUid: currentUser?.uid,
    userRole: currentUser?.role,
    tenantOwnerId,
    userEmail: currentUser?.email,
  };
  const canManageCompanyFlag = canManageCompany(permissionCtx);
  const canDeletePermanentlyFlag = canDeletePermanently(permissionCtx);
  const canManageStaffFlag = canManageStaff(permissionCtx);
  const canManageClientMasterFlag = canManageClientMaster(permissionCtx);
  const canManageInstructionsFlag = canManageInstructions(permissionCtx);
  const canAccessStaffOperationsSettingsFlag = canAccessStaffOperationsSettings(permissionCtx);

  /** determineTenantPlan과 동일 — 광고형(AD)만 true */
  const showsAds = tenantPlan === 'free';

  const assertStaffNotDeleted = async (tenantId: string, user: User) => {
    const staffByUid = await getDoc(doc(db, `tenants/${tenantId}/staff`, user.uid));
    if (staffByUid.exists()) {
      const s = staffByUid.data();
      if (s.isDeleted === true || s.active === false) {
        throw new Error('DELETED_STAFF');
      }
      return;
    }
    if (user.email) {
      const q = query(
        collection(db, `tenants/${tenantId}/staff`),
        where('email', '==', user.email.trim().toLowerCase()),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const s = snap.docs[0].data();
        if (s.isDeleted === true || s.active === false) {
          throw new Error('DELETED_STAFF');
        }
      }
    }
  };

  const healStaffUserProfile = async (user: User, userData?: AppUser | null): Promise<AppUser | null> => {
    if (!user.email?.endsWith('@ez-hub.kr')) return null;

    const resolved = await resolveStaffTenantProfile(user);
    if (!resolved) return null;

    const saved = await upsertStaffUserProfile(user, resolved);
    if (!saved) {
      console.warn('[StaffHeal] users profile write verification failed');
      return null;
    }

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
          throw new Error('DELETED_STAFF');
        }

        if (!userData.tenantId && user.email?.endsWith('@ez-hub.kr')) {
          const healed = await healStaffUserProfile(user, userData);
          if (healed) {
            userData = healed;
          }
        }
        
        const updatedUser = {
          ...userData,
          ...socialProfileData
        };

        // Firestore에 소셜 최신 프로필 자동 동기화 (비동기 수행)
        setDoc(doc(db, 'users', user.uid), socialProfileData, { merge: true }).catch(err => {
          console.error("Failed to sync social profile to Firestore users:", err);
        });

        setCurrentUser(updatedUser);
        
        if (updatedUser.tenantId) {
          await assertStaffNotDeleted(updatedUser.tenantId, user);
          const tenantDoc = await getDoc(doc(db, 'tenants', updatedUser.tenantId));
          if (tenantDoc.exists()) {
              applyTenantSnapshot(tenantDoc.data());
          }
          dataService.setTenant(updatedUser.tenantId);

          // [SSOT 대표자 직원 동기화 자가 치유]
          // 만약 대표자(admin) 역할이지만 테넌트의 직원 목록(staff) 서브컬렉션에 자신의 정보가 등재되어 있지 않은 경우,
          // 별도의 계정 추가 없이 자신의 계정 하나로 완벽히 대표와 직원 역할을 겸임할 수 있도록 자가 치유 동기화를 수행합니다.
          if (updatedUser.role === 'admin') {
            try {
              const staffDocRef = doc(db, `tenants/${updatedUser.tenantId}/staff`, user.uid);
              const staffDoc = await getDoc(staffDocRef);
              if (!staffDoc.exists()) {
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
                console.log(`[AuthSelfHealing] Automatically created missing staff record for admin: ${user.uid}`);
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
          if (tenantId) {
            const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
            if (tenantDoc.exists()) {
              applyTenantSnapshot(tenantDoc.data());
            }
            dataService.setTenant(tenantId);
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
          if (tenantId) {
            const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
            if (tenantDoc.exists()) {
              applyTenantSnapshot(tenantDoc.data());
            }
            dataService.setTenant(tenantId);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'DELETED_STAFF') {
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
        dataService.setTenant(pendingStaff.tenantId);
        return;
      }

      const healed = await healStaffUserProfile(user);
      if (healed?.tenantId) {
        setCurrentUser(healed);
        dataService.setTenant(healed.tenantId);
        return;
      }

      try {
        const customRaw = sessionStorage.getItem('customUser');
        if (customRaw) {
          const customUser = JSON.parse(customRaw) as AppUser;
          if (customUser?.tenantId) {
            setCurrentUser(customUser);
            dataService.setTenant(customUser.tenantId);
            return;
          }
        }
      } catch {
        /* ignore malformed session cache */
      }

      // 프로필 조회 실패 시에도 흰 화면 방지 — Firebase 기본 정보로 폴백
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
    const keepLoggedIn = localStorage.getItem('keepLoggedIn') === 'true';
    const code = planCode || (plan === 'pro' ? 'pro' : 'free');
    if (keepLoggedIn) {
      localStorage.setItem('customUser', JSON.stringify(user));
      localStorage.setItem('customTenantPlan', plan);
      localStorage.setItem('customTenantPlanCode', code);
    } else {
      localStorage.removeItem('customUser');
      localStorage.removeItem('customTenantPlan');
      localStorage.removeItem('customTenantPlanCode');
    }
    sessionStorage.setItem('customUser', JSON.stringify(user));
    sessionStorage.setItem('customTenantPlan', plan);
    sessionStorage.setItem('customTenantPlanCode', code);
    setCurrentUser(user);
    setTenantPlan(plan);
    setTenantPlanCode(code);
    setMaxStaff(getMaxStaffForPlan(code, paymentStatus));
    if (user.tenantId) {
      dataService.setTenant(user.tenantId);
    }
  };

  const refreshUser = async (user?: User | null) => {
    const targetUser = user ?? firebaseUser;
    if (targetUser) {
      await fetchUserProfile(targetUser);
    }
  };

  // [SSOT 실시간 요금제 동기화 엔진] 
  // 테넌트 문서의 실시간 동적 상태 변화(onSnapshot)를 완벽히 감지하여,
  // 대표님이 매니저 프로그램에서 요금제를 바꾸는 즉시 사용 중인 화면에 실시간(1초 이내) 갱신 적용합니다.
  useEffect(() => {
    if (!currentUser || !currentUser.tenantId) {
      return;
    }
    
    console.log(`[RealtimePlanSync] Subscribing to tenant: ${currentUser.tenantId}`);
    const tenantRef = doc(db, 'tenants', currentUser.tenantId);
    
    const unsubscribe = onSnapshot(tenantRef, (docSnap) => {
      if (docSnap.exists()) {
        applyTenantSnapshot(docSnap.data());
        console.log(`[RealtimePlanSync] Tenant plan updated in real-time`);
      }
    }, (err) => {
      console.error("[RealtimePlanSync] Real-time subscription failed:", err);
    });
    
    return () => {
      console.log(`[RealtimePlanSync] Unsubscribing from tenant: ${currentUser.tenantId}`);
      unsubscribe();
    };
  }, [currentUser?.tenantId]);

  useEffect(() => {
    // [앱 기동 시 강력한 보안 안전장치]
    // 사용자가 '자동 로그인 유지'를 수동으로 켜지 않았다면, 
    // 로컬 디렉토리 캐시나 쿠키가 남아 있어도 안전을 위해 세션을 무조건 파괴하고 초기 로그인 창으로 진입시킵니다.
    const keepLoggedIn = localStorage.getItem('keepLoggedIn') === 'true';
    if (!DEV_BYPASS_LOGIN && !keepLoggedIn) {
      console.log("[AuthSecurity] Keep-login is not active. Cleaning up persistent custom session caches.");
      localStorage.removeItem('customUser');
      localStorage.removeItem('customTenantPlan');
      localStorage.removeItem('customTenantPlanCode');
      // sessionStorage customUser는 새로고침 직후 Firebase 프로필 복구 전까지 유지
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
      setLoading(false);
      return;
    }

    console.log("AuthProvider - Initializing...");
    getRedirectResult(auth).catch((err) => {
      console.error('Google redirect sign-in failed:', err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("Auth State Changed:", user ? user.uid : "null");
      setFirebaseUser(user);
      if (user) {
        await fetchUserProfile(user);
      } else {
        // Fallback: Check if there is a custom session in sessionStorage or localStorage!
        const savedCustomUser = sessionStorage.getItem('customUser') || (keepLoggedIn ? localStorage.getItem('customUser') : null);
        if (savedCustomUser) {
          try {
            const userData = JSON.parse(savedCustomUser) as AppUser;
            setCurrentUser(userData);
            if (userData.tenantId) {
              dataService.setTenant(userData.tenantId);
              try {
                const tenantDoc = await getDoc(doc(db, 'tenants', userData.tenantId));
                if (tenantDoc.exists()) {
                  applyTenantSnapshot(tenantDoc.data());
                } else {
                  const savedPlan = (sessionStorage.getItem('customTenantPlan') || (keepLoggedIn ? localStorage.getItem('customTenantPlan') : null)) as 'free' | 'pro';
                  const savedCode = sessionStorage.getItem('customTenantPlanCode') || (keepLoggedIn ? localStorage.getItem('customTenantPlanCode') : null);
                  setTenantPlan(savedPlan || 'free');
                  setTenantPlanCode(savedCode || 'free');
                  setMaxStaff(getMaxStaffForPlan(savedCode || 'free', 'PAID'));
                }
              } catch {
                const savedPlan = (sessionStorage.getItem('customTenantPlan') || (keepLoggedIn ? localStorage.getItem('customTenantPlan') : null)) as 'free' | 'pro';
                setTenantPlan(savedPlan || 'free');
              }
            } else {
              const savedPlan = (sessionStorage.getItem('customTenantPlan') || (keepLoggedIn ? localStorage.getItem('customTenantPlan') : null)) as 'free' | 'pro';
              setTenantPlan(savedPlan || 'free');
            }
          } catch (e) {
            console.error("Failed to parse custom local user session:", e);
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    localStorage.removeItem('customUser');
    localStorage.removeItem('customTenantPlan');
    sessionStorage.removeItem('customUser');
    sessionStorage.removeItem('customTenantPlan');
    await signOut(auth);
    setCurrentUser(null);
    setFirebaseUser(null);
  };

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
