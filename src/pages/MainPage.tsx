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
import { ActionLogPage } from './ActionLogPage';
import { PaymentReceivableManager } from '../components/payments/PaymentReceivableManager';
import { ArchiveSetupWizard } from '../components/auth/ArchiveSetupWizard';
import { db } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';
import { isArchiveSetupDone, markArchiveSetupDone } from '../utils/archiveStorage';

type ViewType = 'dashboard' | 'kanban' | 'calendar' | 'logs' | 'customers' | 'quotes' | 'payments' | 'staff' | 'inventory' | 'settings';

export const MainPage: React.FC = () => {
    const { currentUser, canAccessRootSettings } = useAuth();
    const isElectron = typeof window !== 'undefined' && !!window.electron;
    const [showArchiveWizard, setShowArchiveWizard] = useState(false);
    const [activeTab, setActiveTab] = useState<ViewType>(() => {
        const savedTab = localStorage.getItem('ezprint_active_tab') as ViewType;
        const isStaff = currentUser?.role === 'staff';
        if (isStaff) {
            // 직원의 경우, 로그인이나 세션 복구 시점에 settings나 dashboard가 잡혀있다면 kanban으로 시작하게 보장합니다.
            return (savedTab && savedTab !== 'settings' && savedTab !== 'dashboard') ? savedTab : 'kanban';
        }
        return savedTab || 'dashboard';
    });

    useEffect(() => {
        localStorage.setItem('ezprint_active_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (!isElectron || !canAccessRootSettings) return;

        const syncWizard = () => {
            if (db.getTenantArchiveRootPath()) {
                markArchiveSetupDone();
                setShowArchiveWizard(false);
                return;
            }
            if (!isArchiveSetupDone()) {
                setShowArchiveWizard(true);
            }
        };

        syncWizard();
        return db.subscribe(syncWizard);
    }, [isElectron, canAccessRootSettings]);

    const handleNavigateToQuote = (quoteId?: string) => {
        setActiveTab('quotes');
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard onNavigateToQuote={handleNavigateToQuote} />;
            case 'kanban': return <KanbanBoard onNavigateToQuote={handleNavigateToQuote} />;
            case 'calendar': return <CalendarView onNavigateToQuote={handleNavigateToQuote} />;
            case 'quotes': return <QuoteManager />;
            case 'payments': return <PaymentReceivableManager />;
            case 'staff': return <StaffManager />;
            case 'customers': return <ClientManager />;
            case 'inventory': return <PaperManager />;
            case 'logs': return <ActionLogPage />;
            case 'settings': return <SettingsView />;
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
