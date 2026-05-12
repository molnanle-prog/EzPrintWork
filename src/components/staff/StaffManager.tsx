
import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { Staff } from '../../types';
import { User, Phone, Check, X, Shield, Trash2, Edit2, Smartphone, Briefcase, Building2, Hash } from 'lucide-react';
import { StaffModal } from './StaffModal';
import { useDialog } from '../../contexts/DialogContext';
import { useAuth } from '../../contexts/AuthContext';
import { UpgradeModal } from '../common/UpgradeModal';

export const StaffManager: React.FC = () => {
  const { tenantPlan } = useAuth();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const { showConfirm, showAlert } = useDialog();

  const isAtLimit = tenantPlan === 'free' && staffList.length >= 3;

  const loadStaff = () => {
     // Exclude deleted staff AND system admin
     setStaffList(db.getStaff().filter(s => !s.isDeleted && s.id !== 'admin'));
  };

  useEffect(() => {
    loadStaff();
    // Subscribe to DB changes to ensure UI updates immediately after delete/add
    const unsubscribe = db.subscribe(loadStaff);
    return () => unsubscribe();
  }, []);

  const toggleActive = async (id: string) => {
    const staff = staffList.find(s => s.id === id);
    if (!staff) return;
    try {
        await db.updateStaff({ ...staff, active: !staff.active });
    } catch (error) {
        showAlert(getErrorMessage(error));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (await showConfirm(`'${name}' 직원을 정말 삭제하시겠습니까?\n\n삭제하더라도 과거 작업 내역의 담당자 기록은 유지됩니다.`)) {
      try {
          await db.deleteStaff(id);
      } catch (error) {
          showAlert(getErrorMessage(error));
      }
    }
  };

  const handleOpenAdd = () => {
      if (isAtLimit) {
          setIsUpgradeModalOpen(true);
          return;
      }
      setEditingStaff(null);
      setIsModalOpen(true);
  };

  const handleOpenEdit = (staff: Staff) => {
      setEditingStaff(staff);
      setIsModalOpen(true);
  };

  const handleSaveStaff = async (staff: Staff) => {
      try {
          if (editingStaff) {
              await db.updateStaff(staff);
          } else {
              await db.addStaff(staff);
          }
          setIsModalOpen(false);
      } catch (error) {
          showAlert(getErrorMessage(error));
      }
  };

  return (
    <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {staffList.map((staff) => (
            <div key={staff.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden group hover:shadow-md transition-all">
            <div className="h-24 bg-gradient-to-r from-blue-500 to-indigo-600 relative">
                <div className={`absolute -bottom-10 left-6 w-20 h-20 rounded-full border-4 border-white dark:border-slate-800 overflow-hidden bg-slate-200`}>
                <img src={staff.avatarUrl} alt={staff.name} className="w-full h-full object-cover" />
                </div>
                {/* Extension Number Badge on Header */}
                {staff.extensionNumber && (
                    <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md border border-white/30 text-white px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm">
                        <Hash size={12} className="opacity-80"/>
                        내선: <span className="text-sm font-mono">{staff.extensionNumber}</span>
                    </div>
                )}
            </div>
            <div className="pt-12 p-6">
                <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{staff.name}</h3>
                <span className={`px-2 py-1 rounded text-xs font-bold ${staff.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                    {staff.active ? '근무중' : '휴가/비활성'}
                </span>
                </div>
                <p className="text-blue-600 dark:text-blue-400 font-medium mb-4 flex items-center gap-1">
                <Shield size={14} /> {staff.role}
                </p>
                
                <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 min-h-[4rem]">
                    {staff.extensionNumber && (
                        <div className="flex items-center font-bold text-blue-700 dark:text-blue-300" title="내선번호">
                            <Hash size={14} className="mr-2 text-blue-500 dark:text-blue-400 shrink-0" />
                            내선: {staff.extensionNumber}
                        </div>
                    )}
                    {staff.phone && (
                        <div className="flex items-center" title="개인휴대폰">
                            <Smartphone size={14} className="mr-2 text-slate-400 dark:text-slate-500 shrink-0" />
                            {staff.phone}
                        </div>
                    )}
                    {staff.phoneCompany && (
                        <div className="flex items-center" title="회사휴대폰">
                            <Briefcase size={14} className="mr-2 text-slate-400 dark:text-slate-500 shrink-0" />
                            {staff.phoneCompany}
                        </div>
                    )}
                    {staff.phoneOffice && (
                        <div className="flex items-center" title="사무실">
                            <Building2 size={14} className="mr-2 text-slate-400 dark:text-slate-500 shrink-0" />
                            {staff.phoneOffice}
                        </div>
                    )}
                    {!staff.phone && !staff.phoneCompany && !staff.phoneOffice && !staff.extensionNumber && (
                        <span className="text-slate-400 dark:text-slate-500 italic text-xs pl-1">등록된 연락처 없음</span>
                    )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                <button 
                    onClick={() => toggleActive(staff.id)}
                    title={staff.active ? "직원 비활성화 (퇴사/휴직)" : "직원 활성화 (복직)"}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2
                    ${staff.active 
                        ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600' 
                        : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50'}`}
                >
                    {staff.active ? <><X size={16}/> 비활성화</> : <><Check size={16}/> 활성화</>}
                </button>
                
                <button 
                    onClick={() => handleOpenEdit(staff)}
                    className="w-12 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-500 hover:bg-blue-100 hover:text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center"
                    title="직원 정보 수정"
                >
                    <Edit2 size={18} />
                </button>

                <button 
                    onClick={() => handleDelete(staff.id, staff.name)}
                    className="w-12 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors flex items-center justify-center"
                    title="직원 삭제 (기록은 유지됨)"
                >
                    <Trash2 size={18} />
                </button>
                </div>
            </div>
            </div>
        ))}
        
        {/* Add Staff Button */}
        <button 
            onClick={handleOpenAdd}
            title={isAtLimit ? "무료 버전 인원 제한 초과" : "새로운 직원을 등록합니다"}
            className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 transition-all min-h-[300px] 
            ${isAtLimit 
                ? 'border-orange-200 bg-orange-50/30 text-orange-400 opacity-80 cursor-not-allowed group' 
                : 'border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-blue-500 dark:hover:border-blue-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800'}`}
        >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors 
            ${isAtLimit ? 'bg-orange-100' : 'bg-slate-100 dark:bg-slate-700'}`}>
            <User size={24} />
            </div>
            <span className="font-bold">{isAtLimit ? '인원 제한 도달' : '신규 직원 등록'}</span>
            {isAtLimit && (
                <div className="mt-4 px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-black animate-pulse">
                    PRO 버전으로 해제하기
                </div>
            )}
        </button>
        </div>

        {isModalOpen && (
            <StaffModal 
                staff={editingStaff}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveStaff}
            />
        )}

        <UpgradeModal 
            isOpen={isUpgradeModalOpen}
            onClose={() => setIsUpgradeModalOpen(false)}
        />
    </>
  );
};
