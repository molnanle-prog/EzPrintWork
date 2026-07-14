
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { StaffManager } from '../staff/StaffManager';
import { PaperManager } from './PaperManager';
import { PriceManager } from './PriceManager';
import { BackupManager } from './BackupManager';
import { ArchiveManager } from './ArchiveManager';
import { ProductManager } from './ProductManager';
import { CompanyInfoManager } from './CompanyInfoManager';
import { StatusManager } from './StatusManager'; 
import { SmsManager } from './SmsManager'; // Added
import { ProfileManager } from './ProfileManager';
import { ProcessingManager } from './ProcessingManager';
import { PlanManager } from './PlanManager';
import { Users, ScrollText, Calculator, Database, Shield, Lock, Package, Building, ListChecks, MessageSquare, User, LogOut, Scissors, Crown, Archive, Info } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { isRootSettingsTab, isStaffOperationsSettingsTab } from '../../utils/adminAccess';

export const SettingsView: React.FC = () => {
  const {
    currentUser,
    canAccessAdminSettings,
    canAccessRootSettings,
    canAccessStaffOperationsSettings,
    canManageStaff,
    isTenantOwner,
    isSiteAdmin,
  } = useAuth();
  const isAdmin = canAccessAdminSettings;
  
  const [activeSubTab, setActiveSubTab] = useState(isAdmin ? (canManageStaff ? 'staff' : 'company') : 'profile');
 
  useEffect(() => {
    if (!isAdmin && !canAccessStaffOperationsSettings && activeSubTab !== 'profile') {
        setActiveSubTab('profile');
    }
    if (!isAdmin && canAccessStaffOperationsSettings && activeSubTab !== 'profile' && !isStaffOperationsSettingsTab(activeSubTab)) {
        setActiveSubTab('profile');
    }
    if (isAdmin && !canAccessRootSettings && isRootSettingsTab(activeSubTab)) {
        setActiveSubTab(canManageStaff ? 'staff' : 'company');
    }
    if (isAdmin && !canManageStaff && activeSubTab === 'staff') {
        setActiveSubTab('company');
    }
  }, [isAdmin, activeSubTab, canAccessRootSettings, canAccessStaffOperationsSettings, canManageStaff]);

  const renderContent = () => {
    switch (activeSubTab) {
        case 'profile': return <ProfileManager />;
        case 'staff': return canManageStaff ? <StaffManager /> : null;
        case 'plan': return canAccessRootSettings ? <PlanManager /> : null;
        case 'company': return isAdmin ? <CompanyInfoManager /> : null;
        case 'status': return isAdmin ? <StatusManager /> : null; 
        case 'product': return <ProductManager />; 
        case 'processing': return <ProcessingManager />;
        case 'paper': return isAdmin ? <PaperManager /> : null;
        case 'price': return isAdmin ? <PriceManager /> : null;
        case 'sms': return isAdmin ? <SmsManager /> : null; // Added
        case 'archive': return canAccessRootSettings ? <ArchiveManager /> : null;
        case 'backup': return canAccessRootSettings ? <BackupManager /> : null;
        default: return isAdmin ? <StaffManager /> : <ProfileManager />;
    }
  };

  const allMenuItems = [
    { id: 'profile', label: '개인정보 변경', icon: User, adminOnly: false, staffAllowed: false, rootOnly: false, tooltip: '내 계정 이름·연락처·비밀번호 변경' },
    { id: 'staff', label: '직원 관리', icon: Users, adminOnly: true, staffAllowed: false, rootOnly: false, tooltip: '직원 계정 추가·권한·재직 상태 관리' },
    { id: 'plan', label: '요금제 / 인원', icon: Crown, adminOnly: true, staffAllowed: false, rootOnly: true, tooltip: '메인 관리자 전용: 요금제·좌석 수 설정' },
    { id: 'company', label: '회사 정보', icon: Building, adminOnly: true, staffAllowed: false, rootOnly: false, tooltip: '사업자·연락처·주소 등 회사 기본 정보' },
    { id: 'status', label: '작업 단계 관리', icon: ListChecks, adminOnly: true, staffAllowed: false, rootOnly: false, tooltip: '칸반 단계 이름·표시·순서 설정' }, 
    { id: 'product', label: '상품 관리', icon: Package, adminOnly: false, staffAllowed: true, rootOnly: false, tooltip: '상품 규격/용지/가공 옵션 관리' }, 
    { id: 'processing', label: '후가공 관리', icon: Scissors, adminOnly: false, staffAllowed: true, rootOnly: false, tooltip: '후가공 항목 추가·수정·정리' },
    { id: 'paper', label: '용지 재고', icon: ScrollText, adminOnly: true, staffAllowed: false, rootOnly: false, tooltip: '재고 용지 등록·재고량·단가 관리' },
    { id: 'price', label: '견적/단가', icon: Calculator, adminOnly: true, staffAllowed: false, rootOnly: false, tooltip: '기본 단가·견적 계산 기준 설정' },
    { id: 'sms', label: '문자 설정', icon: MessageSquare, adminOnly: true, staffAllowed: false, rootOnly: false, tooltip: '문자 발송 연동키·발신 정보 설정' },
    { id: 'archive', label: '이력 아카이브', icon: Archive, adminOnly: true, staffAllowed: false, rootOnly: true, tooltip: '자동 운영: 1년 초과 이력 보관 경로/NAS 설정' },
    { id: 'backup', label: '재난 백업/복구', icon: Database, adminOnly: true, staffAllowed: false, rootOnly: true, tooltip: '수동 운영: 포맷·장애 대비 백업/복원' },
  ];

  const visibleMenuItems = allMenuItems.filter((item) => {
    if (item.rootOnly) return canAccessRootSettings;
    if (item.id === 'staff') return canManageStaff;
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
                            title={item.tooltip}
                             className={`flex-none lg:w-full flex items-center space-x-2 lg:space-x-3 px-3 py-3 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${
                                 activeSubTab === item.id 
                                 ? 'bg-blue-50 dark:bg-slate-700 text-blue-700 dark:text-blue-300' 
                                 : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'
                             }`}
                         >
                            <item.icon size={18} />
                            <span>{item.label}</span>
                            <Info size={12} className="opacity-60 ml-auto hidden lg:block" />
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
                         직원 계정은 상품·후가공·거래처 등록·수정이 가능합니다. 직원 관리·단가·백업 등은 관리자(메인·사내)만 이용할 수 있습니다.
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
