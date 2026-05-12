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
import { db } from '../services/dataService';
import { useAuth } from '../contexts/AuthContext';

type ViewType = 'dashboard' | 'kanban' | 'calendar' | 'logs' | 'customers' | 'quotes' | 'staff' | 'inventory' | 'settings';

export const MainPage: React.FC = () => {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState<ViewType>(() => {
        const savedTab = localStorage.getItem('ezprint_active_tab') as ViewType;
        return savedTab || 'dashboard';
    });

    useEffect(() => {
        localStorage.setItem('ezprint_active_tab', activeTab);
    }, [activeTab]);

    const handleNavigateToQuote = (quoteId?: string) => {
        setActiveTab('quotes');
    };

    const renderContent = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard onNavigateToQuote={handleNavigateToQuote} />;
            case 'kanban': return <KanbanBoard onNavigateToQuote={handleNavigateToQuote} />;
            case 'calendar': return <CalendarView onNavigateToQuote={handleNavigateToQuote} />;
            case 'quotes': return <QuoteManager />;
            case 'staff': return <StaffManager />;
            case 'customers': return <ClientManager />;
            case 'inventory': return <PaperManager />;
            case 'logs': return <ActionLogPage />;
            case 'settings': return <SettingsView />;
            default: return <Dashboard onNavigateToQuote={handleNavigateToQuote} />;
        }
    };

    return (
        <Layout activeTab={activeTab} onTabChange={(tab: any) => setActiveTab(tab)}>
            {renderContent()}
        </Layout>
    );
};
