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
import { isPostCreateBriefingPending } from './utils/postCreateBriefing';
import { db } from './services/dataService';
import { RemoteSituationPage } from './pages/RemoteSituationPage';
import { PaymentFailPage, PaymentSuccessPage } from './pages/PaymentResultPage';
import { ExternalOrderAlertPreview } from './components/common/ExternalOrderAlertModal';
import { JobRegistrationPreview } from './components/common/JobRegistrationPreview';
import { ClientManagerPreview } from './components/settings/ClientManagerPreview';
import { KanbanMergePreview } from './components/kanban/KanbanMergePreview';

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
    const alertPreview =
        import.meta.env.DEV &&
        typeof window !== 'undefined' &&
        window.location.hash.includes('external-order-alert-preview');
    const registrationPreview =
        import.meta.env.DEV &&
        typeof window !== 'undefined' &&
        window.location.hash.includes('job-registration-preview');
    const clientPreview =
        import.meta.env.DEV &&
        typeof window !== 'undefined' &&
        window.location.hash.includes('client-manager-preview');
    const kanbanPreview =
        import.meta.env.DEV &&
        typeof window !== 'undefined' &&
        window.location.hash.includes('kanban-preview');

    useEffect(() => {
        if (remoteOnly) return;
        if (currentUser?.tenantId && currentUser.uid) {
            db.setSyncUserRole(currentUser.role);
            void db.setTenantWhenReady(currentUser.tenantId, currentUser.uid);
        }
    }, [currentUser?.tenantId, currentUser?.uid, currentUser?.role, remoteOnly]);

    if (alertPreview) {
        return (
            <Router>
                <ExternalOrderAlertPreview />
                <Toaster richColors position="top-center" offset={{ top: 52 }} mobileOffset={{ top: 52 }} />
            </Router>
        );
    }

    if (registrationPreview) {
        return (
            <Router>
                <JobRegistrationPreview />
                <Toaster richColors position="top-center" offset={{ top: 52 }} mobileOffset={{ top: 52 }} />
            </Router>
        );
    }

    if (clientPreview) {
        return (
            <Router>
                <ClientManagerPreview />
                <Toaster richColors position="top-center" offset={{ top: 52 }} mobileOffset={{ top: 52 }} />
            </Router>
        );
    }

    if (kanbanPreview) {
        return (
            <Router>
                <KanbanMergePreview />
                <Toaster richColors position="top-center" offset={{ top: 52 }} mobileOffset={{ top: 52 }} />
            </Router>
        );
    }

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
                        <Route path="/quote-preview/:quoteId" element={<QuotePreviewPage />} />
                        <Route path="/job-order-preview/:jobId" element={<JobOrderPreviewPage />} />
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
                            element={isAuthenticated && (!currentUser?.tenantId || isPostCreateBriefingPending()) ? <OnboardingPage /> : <Navigate to="/" />}
                        />
                        {import.meta.env.DEV ? (
                            <>
                                <Route path="/onboarding-preview" element={<OnboardingPage />} />
                                <Route path="/briefing-preview" element={<OnboardingPage />} />
                            </>
                        ) : null}
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
                            path="/payment/success"
                            element={
                                <TenantGuard>
                                    <PaymentSuccessPage />
                                </TenantGuard>
                            }
                        />
                        <Route
                            path="/payment/fail"
                            element={
                                <TenantGuard>
                                    <PaymentFailPage />
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
