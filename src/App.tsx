import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { MainPage } from './pages/MainPage';
import { QuotePreviewPage } from './pages/QuotePreviewPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { TenantGuard } from './components/auth/TenantGuard';
import { Toaster } from 'sonner';
import { AutoUpdateProvider } from './components/common/AutoUpdateProvider';
import { JobOrderPreviewPage } from './pages/JobOrderPreviewPage';
import { isStandaloneDocumentPreviewRoute } from './utils/documentPreviewRoutes';
import { isRemoteViewRoute } from './utils/remoteView';
import { db } from './services/dataService';
import { RemoteSituationPage } from './pages/RemoteSituationPage';

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

function AppRoutes() {
    const { isAuthenticated, loading, currentUser } = useAuth();
    const previewOnly = isStandaloneDocumentPreviewRoute();
    const remoteOnly = isRemoteViewRoute();

    useEffect(() => {
        if (remoteOnly) return;
        if (currentUser?.tenantId && currentUser.uid) {
            db.setSyncUserRole(currentUser.role);
            void db.setTenantWhenReady(currentUser.tenantId, currentUser.uid);
        }
    }, [currentUser?.tenantId, currentUser?.uid, currentUser?.role, remoteOnly]);

    if (loading) {
        return <LoadingScreen />;
    }

    if (previewOnly) {
        return (
            <Router>
                <div className="h-screen w-screen overflow-hidden">
                    <Routes>
                        <Route
                            path="/login"
                            element={!isAuthenticated ? <LoginPage /> : <Navigate to={window.location.hash.slice(1) || '/'} replace />}
                        />
                        <Route
                            path="/quote-preview/:quoteId"
                            element={
                                <TenantGuard>
                                    <QuotePreviewPage />
                                </TenantGuard>
                            }
                        />
                        <Route
                            path="/job-order-preview/:jobId"
                            element={
                                <TenantGuard>
                                    <JobOrderPreviewPage />
                                </TenantGuard>
                            }
                        />
                        <Route path="*" element={<Navigate to="/login" replace />} />
                    </Routes>
                    <Toaster
                        richColors
                        position="top-center"
                        offset={{ top: 52 }}
                        mobileOffset={{ top: 52 }}
                    />
                </div>
            </Router>
        );
    }

    return (
        <AutoUpdateProvider>
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
                            path="/remote"
                            element={
                                <TenantGuard>
                                    <RemoteSituationPage />
                                </TenantGuard>
                            }
                        />
                        <Route
                            path="/"
                            element={
                                <TenantGuard>
                                    <MainPage />
                                </TenantGuard>
                            }
                        />
                        <Route
                            path="/quote-preview/:quoteId"
                            element={
                                <TenantGuard>
                                    <QuotePreviewPage />
                                </TenantGuard>
                            }
                        />
                        <Route
                            path="/job-order-preview/:jobId"
                            element={
                                <TenantGuard>
                                    <JobOrderPreviewPage />
                                </TenantGuard>
                            }
                        />
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                    <Toaster
                        richColors
                        position="top-center"
                        offset={{ top: 52 }}
                        mobileOffset={{ top: 52 }}
                    />
                </div>
            </Router>
        </AutoUpdateProvider>
    );
}

function App() {
    return <AppRoutes />;
}

export default App;
