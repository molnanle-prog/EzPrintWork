import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { MainPage } from './pages/MainPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { TenantGuard } from './components/auth/TenantGuard';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';

const LoadingScreen = () => (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 gap-6">
        <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-blue-500/10 rounded-full animate-pulse"></div>
            </div>
        </div>
        <p className="text-slate-400 font-black tracking-widest uppercase text-xs animate-pulse">EzPrintWork Loading...</p>
    </div>
);

import { db } from './services/dataService';

function App() {
    const { isAuthenticated, loading, currentUser } = useAuth();

    useEffect(() => {
        if (currentUser?.tenantId) {
            db.setTenant(currentUser.tenantId);
        }
    }, [currentUser]);

    if (loading) {
        return <LoadingScreen />;
    }

    return (
        <Router>
            <div className="h-screen w-screen overflow-hidden">
                <Routes>
                    <Route 
                        path="/login" 
                        element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" />} 
                    />
                    <Route 
                        path="/onboarding" 
                        element={isAuthenticated && !currentUser?.tenantId ? <OnboardingPage /> : <Navigate to="/" />} 
                    />
                    <Route 
                        path="/" 
                        element={
                            <TenantGuard>
                                <MainPage />
                            </TenantGuard>
                        } 
                    />
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
                <Toaster richColors position="top-right" />
            </div>
        </Router>
    );
}

export default App;
