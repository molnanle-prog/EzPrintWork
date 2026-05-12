import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
      if (userDoc.exists()) {
        const userData = userDoc.data() as AppUser;
        setCurrentUser(userData);
        if (userData.tenantId) {
          dataService.setTenant(userData.tenantId);
          // Fetch tenant plan
          const tenantDoc = await getDoc(doc(db, 'tenants', userData.tenantId));
          if (tenantDoc.exists()) {
              setTenantPlan(tenantDoc.data().plan || 'free');
          }
        }
      } else {
        // Create profile if it doesn't exist
        const newUser: AppUser = {
          uid: user.uid,
          id: user.uid,
          email: user.email || '',
          displayName: user.displayName || '사용자',
          name: user.displayName || '사용자',
          photoURL: user.photoURL || '',
          avatarUrl: user.photoURL || '',
          tenantId: null,
          role: 'staff' // Default role
        };
        await setDoc(doc(db, 'users', user.uid), newUser);
        setCurrentUser(newUser);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
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
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await signOut(auth);
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
      isAuthenticated: !!firebaseUser 
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