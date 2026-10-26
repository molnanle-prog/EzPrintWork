import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { Dashboard } from '../components/dashboard/Dashboard';
import { KanbanBoard } from '../components/kanban/KanbanBoard';
import { CalendarView } from '../components/calendar/CalendarView';
import { QuoteManager } from '../components/quotes/QuoteManager';
import { SettingsView } from '../components/settings/SettingsView';
import { StaffManager } from '../components/staff/StaffManager';
import { ClientManager } from '../components/settings/ClientManager';
import { PaperManager } from '../components/settings/PaperManager';
import { PaymentReceivableManager } from '../components/payments/PaymentReceivableManager';
import { ArchiveSetupWizard } from '../components/auth/ArchiveSetupWizard';
import { db } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { isArchiveSetupDone, markArchiveSetupDone } from '../utils/archiveStorage';
import { readLastKnownArchiveRootPath } from '../utils/lastKnownTenantPlan';
import { WorkHistoryBoard } from '../components/history/WorkHistoryBoard';
import { FeatureWorkspace } from '../components/features/FeatureLabPanel';
import { isFeatureEnabled } from '../features/featureFlags';

type ViewType = 'dashboard' | 'kanban' | 'calendar' | 'history' | 'customers' | 'quotes' | 'payments' | 'staff' | 'inventory' | 'settings' | 'reports' | 'diagnostics' | 'conflicts' | 'reorder';

export const MainPage: React.FC = () => {
    const { canAccessRootSettings, currentUser } = useAuth();
    const isElectron = typeof window !== 'undefined' && !!window.electron;
    const [showArchiveWizard, setShowArchiveWizard] = useState(false);
    const [activeTab, setActiveTab] = useState<ViewType>('kanban');

    useEffect(() => {
        localStorage.setItem('ezprint_active_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (!isElectron || !canAccessRootSettings) return;

        const syncWizard = () => {
            const tenantId = currentUser?.tenantId || db.getTenantId();
            if (db.getTenantArchiveRootPath() || (tenantId && readLastKnownArchiveRootPath(tenantId))) {
                markArchiveSetupDone();
                setShowArchiveWizard(false);
                return;
            }
            if (isArchiveSetupDone()) {
                setShowArchiveWizard(false);
                return;
            }
            // 설정이 올라오기 전(로그인 직후)에는 띄우지 않음. 신규 회사만 동기화 후 1회.
            if (db.getSyncStatus() !== 'synced') {
                setShowArchiveWizard(false);
                return;
            }
            setShowArchiveWizard(true);
        };

        syncWizard();
        return db.subscribe(syncWizard);
    }, [isElectron, canAccessRootSettings, currentUser?.tenantId]);

    const handleNavigateToQuote = (quoteId?: string) => {
        setActiveTab('quotes');
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard onNavigateToQuote={handleNavigateToQuote} />;
            case 'kanban': return <KanbanBoard onNavigateToQuote={handleNavigateToQuote} />;
            case 'calendar': return <CalendarView onNavigateToQuote={handleNavigateToQuote} />;
            case 'history': return <WorkHistoryBoard />;
            case 'quotes': return <QuoteManager />;
            case 'payments': return <PaymentReceivableManager />;
            case 'staff': return <StaffManager />;
            case 'customers': return <ClientManager />;
            case 'inventory': return <PaperManager />;
            case 'settings': return <SettingsView />;
            case 'reports': return isFeatureEnabled('mgmtReports') ? <FeatureWorkspace feature="mgmtReports" /> : <Dashboard onNavigateToQuote={handleNavigateToQuote} />;
            case 'diagnostics': return isFeatureEnabled('syncDiagnostics') ? <FeatureWorkspace feature="syncDiagnostics" /> : <Dashboard onNavigateToQuote={handleNavigateToQuote} />;
            case 'conflicts': return isFeatureEnabled('conflictInbox') ? <FeatureWorkspace feature="conflictInbox" /> : <Dashboard onNavigateToQuote={handleNavigateToQuote} />;
            case 'reorder': return isFeatureEnabled('crmReorder') ? <FeatureWorkspace feature="crmReorder" /> : <Dashboard onNavigateToQuote={handleNavigateToQuote} />;
            default: return <Dashboard onNavigateToQuote={handleNavigateToQuote} />;
        }
    };

    return (
        <>
            {showArchiveWizard && (
                <ArchiveSetupWizard onComplete={() => setShowArchiveWizard(false)} />
            )}
            <Layout activeTab={activeTab} onTabChange={(tab: any) => setActiveTab(tab)}>
                {renderContent()}
            </Layout>
        </>
    );
};
