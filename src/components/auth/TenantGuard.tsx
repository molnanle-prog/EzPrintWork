import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export const TenantGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isAuthenticated, loading, firebaseUser } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 프로필 로드 중 (Firebase 로그인됐지만 currentUser 아직 없음)
  if (firebaseUser && !currentUser) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  // tenantId 없으면 온보딩으로
  if (!currentUser?.tenantId && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  if (currentUser?.tenantId && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
