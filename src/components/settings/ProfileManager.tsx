import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, formatPhoneNumber } from '../../services/dataService';
import { Staff } from '../../types';
import { User, Mail, Phone, Shield, Lock, Save, Building, PhoneCall, CheckCircle2, AlertCircle } from 'lucide-react';

export const ProfileManager: React.FC = () => {
  const { currentUser, refreshUser } = useAuth();
  const [staffData, setStaffData] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    phoneOffice: '',
    phoneCompany: '',
    extensionNumber: '',
    password: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  useEffect(() => {
    if (!currentUser) return;

    const loadProfile = () => {
      // 1. db.getStaff() 목록에서 현재 사용자 매칭 시도 (uid, email, id 기준)
      const allStaff = db.getStaff();
      const matchedStaff = allStaff.find(
        (s) =>
          (s.uid && s.uid === currentUser.uid) ||
          (s.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
          s.id === currentUser.uid
      );

      if (matchedStaff) {
        setStaffData(matchedStaff);
        setFormData({
          name: matchedStaff.name || currentUser.displayName || '',
          phone: matchedStaff.phone || '',
          phoneOffice: matchedStaff.phoneOffice || '',
          phoneCompany: matchedStaff.phoneCompany || '',
          extensionNumber: matchedStaff.extensionNumber || '',
          password: matchedStaff.password || ''
        });
      } else {
        // 매칭되는 Staff 데이터가 없는 경우 (예: 테넌트 소유자/관리자)
        setFormData((prev) => ({
          ...prev,
          name: currentUser.displayName || currentUser.name || ''
        }));
      }
    };

    loadProfile();

    // 데이터 변경 감지 시 실시간 동기화
    const unsubscribe = db.subscribe(() => {
      loadProfile();
    });
    return () => unsubscribe();
  }, [currentUser]);

  const handlePhoneChange = (field: 'phone' | 'phoneOffice' | 'phoneCompany', value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: formatPhoneNumber(value)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!formData.name.trim()) {
      setStatus({ type: 'error', message: '이름은 필수 입력 항목입니다.' });
      return;
    }

    setIsSaving(true);
    setStatus({ type: null, message: '' });

    try {
      if (staffData) {
        // 직원이 매칭된 경우 -> db.updateStaff 호출하여 테넌트 내의 직원 데이터 갱신
        const updatedStaff: Staff = {
          ...staffData,
          name: formData.name.trim(),
          phone: formData.phone,
          phoneOffice: formData.phoneOffice,
          phoneCompany: formData.phoneCompany,
          extensionNumber: formData.extensionNumber,
          password: formData.password
        };

        await db.updateStaff(updatedStaff);
        await refreshUser();
        
        setStatus({ type: 'success', message: '개인정보가 성공적으로 업데이트되었습니다.' });
      } else {
        // 직원이 매칭되지 않는 특수한 경우 (관리자 본인이거나 가상 프로필 상태)
        setStatus({ 
          type: 'error', 
          message: '사내 직원 명단에 등록되지 않은 임시 계정입니다. 상세 정보 수정은 관리자 권한을 통해 "직원 관리" 메뉴에서 등록 및 수정해 주세요.' 
        });
      }
    } catch (error: any) {
      console.error('Profile update error:', error);
      setStatus({ type: 'error', message: error.message || '저장 중 오류가 발생했습니다.' });
    } finally {
      setIsSaving(false);
      // 알림 메시지 자동 초기화 (3초 뒤)
      setTimeout(() => {
        setStatus({ type: null, message: '' });
      }, 4000);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        사용자 정보를 불러올 수 없습니다. 로그인이 필요합니다.
      </div>
    );
  }

  return (
    <div className="max-w-4xl p-8 space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
            <User size={22} />
          </div>
          개인정보 변경
        </h3>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">
          본인의 프로필, 다중 연락처 및 로그인 비밀번호를 직접 관리하고 수정할 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Avatar Card */}
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
          <div className="relative">
            {currentUser.photoURL || staffData?.avatarUrl ? (
              <img
                src={currentUser.photoURL || staffData?.avatarUrl}
                alt={currentUser.displayName}
                className="w-28 h-28 rounded-full border-4 border-blue-50 dark:border-slate-700 object-cover shadow-md"
              />
            ) : (
              <div className="w-28 h-28 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center border-4 border-blue-50 dark:border-slate-800 text-slate-300 dark:text-slate-500">
                <User size={56} />
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white rounded-full p-2 border-2 border-white dark:border-slate-800 shadow-md">
              <Shield size={16} />
            </div>
          </div>

          <div className="space-y-1">
            <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {currentUser.displayName || currentUser.name}
            </h4>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs font-bold border border-blue-100 dark:border-blue-900/50">
              {currentUser.role === 'admin' ? '관리자' : '사내 직원'}
            </div>
          </div>

          <div className="w-full border-t border-slate-100 dark:border-slate-700 pt-4 space-y-2.5 text-left text-xs text-slate-500 dark:text-slate-400 font-medium">
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-slate-400 shrink-0" />
              <span className="truncate">{currentUser.email}</span>
            </div>
            {staffData?.joinDate && (
              <div className="flex items-center gap-2">
                <Building size={14} className="text-slate-400 shrink-0" />
                <span>가입일: {new Date(staffData.joinDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            
            {/* Status Feedback Alerts */}
            {status.type && (
              <div
                className={`p-4 rounded-2xl flex items-start gap-3 border text-sm font-medium animate-in slide-in-from-top-2 duration-300
                  ${
                    status.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-400'
                      : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-800 dark:text-rose-400'
                  }`}
              >
                {status.type === 'success' ? (
                  <CheckCircle2 size={18} className="shrink-0 text-emerald-500 mt-0.5" />
                ) : (
                  <AlertCircle size={18} className="shrink-0 text-rose-500 mt-0.5" />
                )}
                <span>{status.message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Name */}
              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User size={13} /> 이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="실명을 입력해 주세요"
                />
              </div>

              {/* Personal Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={13} /> 개인 연락처
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => handlePhoneChange('phone', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="010-0000-0000"
                />
              </div>

              {/* Office Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Building size={13} /> 사무실 연락처
                </label>
                <input
                  type="text"
                  value={formData.phoneOffice}
                  onChange={(e) => handlePhoneChange('phoneOffice', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="사무실 전화번호"
                />
              </div>

              {/* Company Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <PhoneCall size={13} /> 회사 연락처
                </label>
                <input
                  type="text"
                  value={formData.phoneCompany}
                  onChange={(e) => handlePhoneChange('phoneCompany', e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="회사 지정 스마트폰 번호"
                />
              </div>

              {/* Extension Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <PhoneCall size={13} /> 사내 내선 번호
                </label>
                <input
                  type="text"
                  value={formData.extensionNumber}
                  onChange={(e) => setFormData({ ...formData, extensionNumber: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="예: 101"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Lock size={13} /> 로그인 비밀번호
                </label>
                <input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="로그인에 사용할 새 비밀번호를 입력하세요"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                  비밀번호를 설정하지 않은 경우 빈 칸으로 표시되며, 새로운 비밀번호를 여기에 직접 설정해 사용할 수 있습니다.
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-blue-600/10 active:scale-95 disabled:opacity-50 shrink-0"
              >
                {isSaving ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                정보 업데이트
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
