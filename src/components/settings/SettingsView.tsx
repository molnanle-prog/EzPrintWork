
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { StaffManager } from '../staff/StaffManager';
import { PaperManager } from './PaperManager';
import { ClientManager } from './ClientManager';
import { PriceManager } from './PriceManager';
import { BackupManager } from './BackupManager';
import { ProductManager } from './ProductManager';
import { CompanyInfoManager } from './CompanyInfoManager';
import { StatusManager } from './StatusManager'; 
import { SmsManager } from './SmsManager'; // Added
import { ProfileManager } from './ProfileManager';
import { ProcessingManager } from './ProcessingManager';
import { PlanManager } from './PlanManager';
import { Users, ScrollText, Building2, Calculator, Database, Shield, Lock, Package, Building, ListChecks, MessageSquare, User, LogOut, Scissors, Crown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isRootSettingsTab, isStaffOperationsSettingsTab } from '../../utils/adminAccess';

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    canAccessAdminSettings,
    canAccessRootSettings,
    canAccessStaffOperationsSettings,
    isTenantOwner,
    isSiteAdmin,
  } = useAuth();
  const isAdmin = canAccessAdminSettings || currentUser?.email === 'molnanle@gmail.com';
  
  const [activeSubTab, setActiveSubTab] = useState(isAdmin ? 'staff' : 'profile');
 
  useEffect(() => {
    if (!isAdmin && !canAccessStaffOperationsSettings && activeSubTab !== 'profile') {
        setActiveSubTab('profile');
    }
    if (!isAdmin && canAccessStaffOperationsSettings && activeSubTab !== 'profile' && !isStaffOperationsSettingsTab(activeSubTab)) {
        setActiveSubTab('profile');
    }
    if (isAdmin && !canAccessRootSettings && isRootSettingsTab(activeSubTab)) {
        setActiveSubTab('staff');
    }
  }, [isAdmin, activeSubTab, canAccessRootSettings, canAccessStaffOperationsSettings]);

  const renderContent = () => {
    switch (activeSubTab) {
        case 'profile': return <ProfileManager />;
        case 'staff': return isAdmin ? <StaffManager /> : null;
        case 'plan': return canAccessRootSettings ? <PlanManager /> : null;
        case 'company': return isAdmin ? <CompanyInfoManager /> : null;
        case 'status': return isAdmin ? <StatusManager /> : null; 
        case 'product': return <ProductManager />; 
        case 'processing': return <ProcessingManager />;
        case 'paper': return isAdmin ? <PaperManager /> : null;
        case 'client': return <ClientManager />;
        case 'price': return isAdmin ? <PriceManager /> : null;
        case 'sms': return isAdmin ? <SmsManager /> : null; // Added
        case 'backup': return canAccessRootSettings ? <BackupManager /> : null;
        default: return isAdmin ? <StaffManager /> : <ProfileManager />;
    }
  };

  const allMenuItems = [
    { id: 'profile', label: '개인정보 변경', icon: User, adminOnly: false, staffAllowed: false, rootOnly: false },
    { id: 'staff', label: '직원 관리', icon: Users, adminOnly: true, staffAllowed: false, rootOnly: false },
    { id: 'plan', label: '요금제 / 인원', icon: Crown, adminOnly: true, staffAllowed: false, rootOnly: true },
    { id: 'company', label: '회사 정보', icon: Building, adminOnly: true, staffAllowed: false, rootOnly: false },
    { id: 'status', label: '작업 단계 관리', icon: ListChecks, adminOnly: true, staffAllowed: false, rootOnly: false }, 
    { id: 'product', label: '상품 관리', icon: Package, adminOnly: false, staffAllowed: true, rootOnly: false }, 
    { id: 'processing', label: '후가공 관리', icon: Scissors, adminOnly: false, staffAllowed: true, rootOnly: false },
    { id: 'paper', label: '용지 재고', icon: ScrollText, adminOnly: true, staffAllowed: false, rootOnly: false },
    { id: 'client', label: '거래처', icon: Building2, adminOnly: false, staffAllowed: true, rootOnly: false },
    { id: 'price', label: '견적/단가', icon: Calculator, adminOnly: true, staffAllowed: false, rootOnly: false },
    { id: 'sms', label: '문자 설정', icon: MessageSquare, adminOnly: true, staffAllowed: false, rootOnly: false },
    { id: 'backup', label: '백업/복원', icon: Database, adminOnly: true, staffAllowed: false, rootOnly: true },
  ];

  const visibleMenuItems = allMenuItems.filter((item) => {
    if (item.rootOnly) return canAccessRootSettings;
    if (item.staffAllowed) return canAccessStaffOperationsSettings;
    if (item.adminOnly) return isAdmin;
    return true;
  });

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6">
       {/* Settings Sidebar */}
       <div className="w-full lg:w-64 flex-none">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden h-auto lg:h-full flex flex-col transition-colors">
             <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold transition-colors">
                <Shield size={20} />
                {isAdmin ? (isTenantOwner ? '관리자 설정' : '사내 관리자 설정') : '시스템 설정'}
                {isTenantOwner && <span className="text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded ml-auto">메인</span>}
                {isSiteAdmin && <span className="text-xs bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded ml-auto">사내</span>}
             </div>
             <nav className="p-2 space-y-1 flex lg:block overflow-x-auto lg:overflow-visible">
                 {visibleMenuItems.map(item => {
                     return (
                         <button
                             key={item.id}
                             onClick={() => {
                                 setActiveSubTab(item.id);
                             }}
                             className={`flex-none lg:w-full flex items-center space-x-2 lg:space-x-3 px-3 py-3 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${
                                 activeSubTab === item.id 
                                 ? 'bg-blue-50 dark:bg-slate-700 text-blue-700 dark:text-blue-300' 
                                 : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                             }`}
                         >
                             <item.icon size={18} />
                             <span>{item.label}</span>
                         </button>
                     );
                 })}
             </nav>
             
             {!isAdmin && (
                 <div className="p-4 mt-auto border-t border-slate-100 dark:border-slate-700 hidden lg:block">
                     <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                         <div className="flex items-center gap-2 font-bold mb-1 text-slate-700 dark:text-slate-300">
                             <Lock size={12} /> 권한 안내
                         </div>
                         직원 계정은 상품·후가공·거래처 등록·수정이 가능합니다. 직원 관리·단가·백업 등은 관리자만 이용할 수 있습니다.
                     </div>
                 </div>
             )}
          </div>
       </div>

       {/* Settings Content */}
       <div className="flex-1 min-w-0 h-full overflow-y-auto custom-scrollbar bg-white dark:bg-slate-800 lg:bg-transparent rounded-xl lg:rounded-none shadow-sm lg:shadow-none border border-slate-200 dark:border-slate-700 lg:border-none p-4 lg:p-0 transition-colors">
          {renderContent()}
       </div>
    </div>
  );
};
