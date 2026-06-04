import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { AppUser } from '../types';
import { db as dataService } from '../services/dataService';

// [개발용 설정] Firebase 도메인 승인 오류 발생 시 true로 설정하여 로그인을 건너뜁니다.
const DEV_BYPASS_LOGIN = true;

interface AuthContextType {
  firebaseUser: User | null;
  currentUser: AppUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  tenantPlan: 'free' | 'pro';
  updatePlan: (plan: 'free' | 'pro') => void;
  loginCustomSession: (user: AppUser, plan: 'free' | 'pro') => void;
}

// [결제 만료 및 미결제 실시간 자동 판별 엔진]
// plan이 유료(pro, u3, u5 등)라 하더라도 만료일이 지났거나 paymentStatus가 PAID/FREE가 아니라면 즉각 'free' 광고형으로 강제 변환합니다.
export const determineTenantPlan = (tenantData: any): 'free' | 'pro' => {
  if (!tenantData) return 'free';

  const plan = tenantData.plan || 'free';
  const paymentStatus = tenantData.paymentStatus || 'UNPAID';
  const licenseExpiresAt = tenantData.licenseExpiresAt || null;

  // 1. 유료 플랜 타입 대조 (pro, pro_plus, u3, u5, u10, service 등)
  const isPaidPlanType = ['pro', 'pro_plus', 'u3', 'u5', 'u10', 'service'].includes(plan);
  if (!isPaidPlanType) return 'free';

  // 2. 결제 미완료 시 즉각 광고형 모드 자동 변환 (UNPAID 등)
  if (paymentStatus !== 'PAID' && paymentStatus !== 'FREE') {
    return 'free';
  }

  // 3. 선불 요금제 만료일 경과 시 즉각 광고형 모드 자동 변환
  if (licenseExpiresAt) {
    const expireDate = new Date(licenseExpiresAt);
    if (!isNaN(expireDate.getTime()) && expireDate < new Date()) {
      return 'free';
    }
  }

  return 'pro';
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [tenantPlan, setTenantPlan] = useState<'free' | 'pro'>('free');
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (user: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
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
        const userData = userDoc.data() as AppUser;
        
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
          dataService.setTenant(updatedUser.tenantId);
          // Fetch tenant plan
          const tenantDoc = await getDoc(doc(db, 'tenants', updatedUser.tenantId));
          if (tenantDoc.exists()) {
              setTenantPlan(determineTenantPlan(tenantDoc.data()));
          }

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
            dataService.setTenant(tenantId);
            const tenantDoc = await getDoc(doc(db, 'tenants', tenantId));
            if (tenantDoc.exists()) {
              setTenantPlan(determineTenantPlan(tenantDoc.data()));
            }
          }
        } else {
          // 일치하는 임시 등록 정보가 없는 경우: 기존의 초대코드 확인 및 신규 가입 로직 수행
          let tenantId: string | null = null;
          let role = 'staff';
          
          try {
            if (user.email) {
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
            role: role as 'admin' | 'staff' | 'superadmin'
          };
          await setDoc(doc(db, 'users', user.uid), newUser);
          setCurrentUser(newUser);
          if (tenantId) {
            dataService.setTenant(tenantId);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const loginCustomSession = (user: AppUser, plan: 'free' | 'pro') => {
    const keepLoggedIn = localStorage.getItem('keepLoggedIn') === 'true';
    if (keepLoggedIn) {
      localStorage.setItem('customUser', JSON.stringify(user));
      localStorage.setItem('customTenantPlan', plan);
    } else {
      localStorage.removeItem('customUser');
      localStorage.removeItem('customTenantPlan');
    }
    sessionStorage.setItem('customUser', JSON.stringify(user));
    sessionStorage.setItem('customTenantPlan', plan);
    setCurrentUser(user);
    setTenantPlan(plan);
    if (user.tenantId) {
      dataService.setTenant(user.tenantId);
    }
  };

  const refreshUser = async () => {
    if (firebaseUser) {
      await fetchUserProfile(firebaseUser);
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
        const determined = determineTenantPlan(docSnap.data());
        console.log(`[RealtimePlanSync] Tenant plan updated in real-time (Determined: ${determined})`);
        setTenantPlan(determined);
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
    if (!keepLoggedIn) {
      console.log("[AuthSecurity] Keep-login is not active. Cleaning up local session caches.");
      localStorage.removeItem('customUser');
      localStorage.removeItem('customTenantPlan');
      sessionStorage.removeItem('customUser');
      sessionStorage.removeItem('customTenantPlan');
      signOut(auth).catch(() => {});
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
            }
            const savedPlan = (sessionStorage.getItem('customTenantPlan') || (keepLoggedIn ? localStorage.getItem('customTenantPlan') : null)) as 'free' | 'pro';
            setTenantPlan(savedPlan || 'free');
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
      updatePlan: (plan: 'free' | 'pro') => setTenantPlan(plan),
      loading, 
      logout, 
      refreshUser,
      isAuthenticated: !!firebaseUser || !!currentUser,
      loginCustomSession
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