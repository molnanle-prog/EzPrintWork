import React, { createContext, useContext, useState, useEffect } from 'react';
import { Staff } from '../types';
import { db } from '../services/dataService';

// =========================================================
// [개발용 설정] 사용자 로그인 화면 건너뛰기
// 개발 완료 후 이 값을 false로 변경하면 로그인 화면이 다시 활성화됩니다.
// =========================================================
const DEV_BYPASS_LOGIN = true;

interface AuthContextType {
  currentUser: Staff | null;
  login: (staffId: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (DEV_BYPASS_LOGIN) {
      login('admin');
      setIsLoading(false);
      return;
    }

    // Check local storage for auto-login simulation
    const storedUserId = localStorage.getItem('pm_current_user_id');
    if (storedUserId) {
      if (storedUserId === 'admin') {
         // Auto-login as admin
         login('admin');
      } else {
        const staff = db.getStaff().find(s => s.id === storedUserId);
        if (staff && staff.active) {
          setCurrentUser(staff);
        }
      }
    }
    setIsLoading(false);
  }, []);

  const login = (staffId: string) => {
    if (staffId === 'admin') {
       const adminUser: Staff = {
         id: 'admin',
         name: '시스템 관리자',
         role: 'Super Admin',
         phone: '',
         active: true,
         avatarUrl: 'https://ui-avatars.com/api/?name=Admin&background=1e293b&color=fff&bold=true'
       };
       setCurrentUser(adminUser);
       localStorage.setItem('pm_current_user_id', 'admin');
       return;
    }

    const staff = db.getStaff().find(s => s.id === staffId);
    if (staff) {
      setCurrentUser(staff);
      localStorage.setItem('pm_current_user_id', staffId); // Persist login
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('pm_current_user_id');
  };

  // Prevent rendering children until initial auth check is done
  if (isLoading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-slate-100">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, isAuthenticated: !!currentUser }}>
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