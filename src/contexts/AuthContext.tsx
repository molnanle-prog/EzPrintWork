import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { AppUser } from '../types';
import { db as dataService } from '../services/dataService';

// [개발용 설정] Firebase 도메인 승인 오류 발생 시 true로 설정하여 로그인을 건너뜁니다.
const DEV_BYPASS_LOGIN = false;

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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [tenantPlan, setTenantPlan] = useState<'free' | 'pro'>('free');
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (user: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      // 구글 등 소셜 계정의 실제 최신 프로필 정보(이름, 이메일, 사진)를 항상 반영하기 위한 동기화 객체 정의
      const socialProfileData = {
        email: user.email || '',
        displayName: user.displayName || '사용자',
        name: user.displayName || '사용자',
        photoURL: user.photoURL || '',
        avatarUrl: user.photoURL || ''
      };

      if (userDoc.exists()) {
        const userData = userDoc.data() as AppUser;
        
        // 소셜 계정의 실제 이름과 이메일 정보가 기존 데이터베이스 꼬임으로 왜곡되는 현상을 방지하기 위해 최신 프로필로 병합
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
              setTenantPlan(tenantDoc.data().plan || 'free');
          }
        }
      } else {
        // Check if there is an invitation for this email (Pre-invite auto-link)
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
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const loginCustomSession = (user: AppUser, plan: 'free' | 'pro') => {
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

  useEffect(() => {
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
        // Fallback: Check if there is a custom session in sessionStorage!
        const savedCustomUser = sessionStorage.getItem('customUser');
        if (savedCustomUser) {
          try {
            const userData = JSON.parse(savedCustomUser) as AppUser;
            setCurrentUser(userData);
            if (userData.tenantId) {
              dataService.setTenant(userData.tenantId);
            }
            const savedPlan = sessionStorage.getItem('customTenantPlan') as 'free' | 'pro';
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