import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export const TenantGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null; // AuthContext에서 이미 로딩 화면을 보여주고 있으므로 null 반환
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // tenantId가 없고 현재 페이지가 온보딩이 아니면 온보딩으로 이동
  if (currentUser && !currentUser.tenantId && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // tenantId가 있는데 온보딩 페이지에 있으려고 하면 메인으로 이동
  if (currentUser && currentUser.tenantId && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
