import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, formatPhoneNumber } from '../../services/dataService';
import { Staff } from '../../types';
import { User, Mail, Phone, Shield, Lock, Save, Building, PhoneCall, CheckCircle2, AlertCircle, RefreshCw, Camera } from 'lucide-react';
import { APP_BUILD_ID, APP_VERSION } from '../../utils/autoUpdate';
import { manualUpdateCheck as runManualUpdateCheck } from '../../hooks/useAutoUpdate';
import { useUpdateNotice } from '../../contexts/UpdateNoticeContext';
import { doc, setDoc } from 'firebase/firestore';
import { updatePassword } from 'firebase/auth';
import { db as firestore, auth } from '../../services/firebase';
import { getStaffAvatarUrl, MIN_STAFF_PASSWORD_LENGTH } from '../../utils/staffAuthProvision';
import { findStaffForUser, isPlaceholderStaffName } from '../../utils/staffMatch';
import { isStaffKeepLoggedIn } from '../../utils/staffLoginPreferences';
import { writePersistedStaffSession } from '../../utils/persistedStaffSession';

export const ProfileManager: React.FC = () => {
  const {
    currentUser,
    refreshUser,
    loginCustomSession,
    tenantPlan,
    tenantPlanCode,
    tenantPaymentStatus,
  } = useAuth();
  const { setWebNotice, setDesktopNotice } = useUpdateNotice();
  const [staffData, setStaffData] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    phoneOffice: '',
    phoneCompany: '',
    extensionNumber: '',
    password: '',
    avatarUrl: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
  /** 사용자가 입력 중이면 subscribe로 폼을 덮어쓰지 않음 */
  const isDirtyRef = useRef(false);
  const suppressReloadUntilRef = useRef(0);

  const applyStaffToForm = useCallback((matchedStaff: Staff | null) => {
    if (!currentUser) return;
    if (matchedStaff) {
      setStaffData(matchedStaff);
      const staffName = matchedStaff.name?.trim() || '';
      const userName = (currentUser.displayName || currentUser.name || '').trim();
      const name =
        staffName && !isPlaceholderStaffName(staffName)
          ? staffName
          : userName && !isPlaceholderStaffName(userName)
            ? userName
            : staffName || userName;
      setFormData({
        name,
        email: matchedStaff.email || currentUser.email || '',
        phone: matchedStaff.phone || '',
        phoneOffice: matchedStaff.phoneOffice || '',
        phoneCompany: matchedStaff.phoneCompany || '',
        extensionNumber: matchedStaff.extensionNumber || '',
        password: '',
        avatarUrl: matchedStaff.avatarUrl || currentUser.avatarUrl || currentUser.photoURL || '',
      });
    } else {
      setStaffData(null);
      setFormData({
        name: currentUser.displayName || currentUser.name || '',
        email: currentUser.email || '',
        phone: '',
        phoneOffice: '',
        phoneCompany: '',
        extensionNumber: '',
        password: '',
        avatarUrl: currentUser.avatarUrl || currentUser.photoURL || '',
      });
    }
  }, [currentUser]);

  const loadProfile = useCallback((force = false) => {
    if (!currentUser) return;
    if (!force) {
      if (isDirtyRef.current) return;
      if (Date.now() < suppressReloadUntilRef.current) return;
    }

    const matchedStaff = findStaffForUser(db.getStaff(), currentUser) || null;
    applyStaffToForm(matchedStaff);
  }, [currentUser, applyStaffToForm]);

  useEffect(() => {
    if (!currentUser) return;
    isDirtyRef.current = false;
    loadProfile(true);

    const unsubscribe = db.subscribe(() => {
      loadProfile(false);
    });
    return () => unsubscribe();
  }, [currentUser, loadProfile]);

  const markDirty = () => {
    isDirtyRef.current = true;
  };

  const handlePhoneChange = (field: 'phone' | 'phoneOffice' | 'phoneCompany', value: string) => {
    markDirty();
    setFormData((prev) => ({
      ...prev,
      [field]: formatPhoneNumber(value)
    }));
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        markDirty();
        setFormData((prev) => ({ ...prev, avatarUrl: dataUrl }));
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
      const newPassword = formData.password.trim();
      if (newPassword && currentUser.role !== 'admin') {
        if (newPassword.length < MIN_STAFF_PASSWORD_LENGTH) {
          setStatus({ type: 'error', message: `비밀번호는 ${MIN_STAFF_PASSWORD_LENGTH}자 이상 입력해 주세요.` });
          setIsSaving(false);
          return;
        }
        if (!auth.currentUser) {
          setStatus({ type: 'error', message: '로그인 세션이 없습니다. 다시 로그인해 주세요.' });
          setIsSaving(false);
          return;
        }
        await updatePassword(auth.currentUser, newPassword.toLowerCase());
      }

      // 저장 직전 최신 매칭 — 중복 addStaff 방지, 기존 staff 문서 id 유지(작업 이력 안정)
      const matchedNow = findStaffForUser(db.getStaff(), currentUser) || staffData;

      if (matchedNow || currentUser.role === 'admin') {
        const base = matchedNow;
        const updatedStaff: Staff = {
          ...(base || {}),
          id: base ? base.id : currentUser.uid,
          uid: currentUser.uid,
          name: formData.name.trim(),
          phone: formData.phone,
          phoneOffice: formData.phoneOffice,
          phoneCompany: formData.phoneCompany,
          extensionNumber: formData.extensionNumber,
          role: base ? base.role : '대표자',
          isCompanyAdmin: base?.isCompanyAdmin ?? (currentUser.role === 'admin'),
          active: true,
          isDeleted: false,
          email: formData.email.trim() || currentUser.email || '',
          avatarUrl:
            formData.avatarUrl.trim() ||
            base?.avatarUrl ||
            currentUser.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(formData.name.trim())}`,
          joinDate: base?.joinDate || new Date().toISOString(),
          loginId: base?.loginId || currentUser.loginId || currentUser.email || '',
        };

        if (base) {
          await db.updateStaff(updatedStaff);
        } else {
          // 관리자인데 staff가 전혀 없을 때만 1회 생성 (기존 문서 재조회 후에도 없을 때)
          const recheck = findStaffForUser(db.getStaff(), currentUser);
          if (recheck) {
            await db.updateStaff({ ...updatedStaff, id: recheck.id, role: recheck.role, loginId: recheck.loginId || updatedStaff.loginId });
          } else {
            await db.addStaff(updatedStaff);
          }
        }

        await setDoc(doc(firestore, 'users', currentUser.uid), {
          displayName: formData.name.trim(),
          name: formData.name.trim(),
          contactInfo: formData.phone,
          email: formData.email.trim(),
          photoURL: updatedStaff.avatarUrl,
          avatarUrl: updatedStaff.avatarUrl,
        }, { merge: true });

        await refreshUser();
        isDirtyRef.current = false;
        suppressReloadUntilRef.current = Date.now() + 2500;
        setStaffData(updatedStaff);
        setFormData((prev) => ({ ...prev, password: '', name: formData.name.trim() }));

        setStatus({
          type: 'success',
          message: newPassword && currentUser.role !== 'admin'
            ? '개인정보와 로그인 비밀번호가 업데이트되었습니다.'
            : '개인정보가 성공적으로 업데이트되었습니다.',
        });
      } else {
        setStatus({
          type: 'error',
          message: '사내 직원 명단에 등록되지 않은 임시 계정입니다. 상세 정보 수정은 관리자 권한을 통해 "직원 관리" 메뉴에서 등록 및 수정해 주세요.'
        });
      }
    } catch (error: any) {
      console.error(error);
      setStatus({ type: 'error', message: error.message || '업데이트 중 오류가 발생했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!currentUser) return null;

  const isSocialLogin = currentUser.email && !currentUser.email.endsWith('@ez-hub.kr');

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
          <User size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {currentUser.role === 'admin' ? '관리자 정보 변경' : '개인정보 변경'}
          </h2>
          <p className="text-sm text-slate-500">계정에 연결된 프로필과 연락처를 관리합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Sidebar Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center text-center shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-br from-indigo-500/20 to-purple-500/20" />
            
            <div className="relative mt-4 mb-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative group w-24 h-24 rounded-full border-4 border-white dark:border-slate-900 shadow-xl overflow-hidden bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                title="프로필 사진 변경"
              >
                <img 
                  src={getStaffAvatarUrl(formData.avatarUrl, currentUser.uid || currentUser.loginId || 'me')} 
                  alt={currentUser.displayName}
                  className="w-full h-full object-cover transition-opacity group-hover:opacity-75"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <Camera size={18} className="mb-0.5" />
                  <span className="text-[10px] font-bold">사진 변경</span>
                </div>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarFileChange}
                accept="image/*"
                className="hidden"
              />
              <div className="absolute bottom-0 right-0 w-8 h-8 bg-indigo-500 text-white rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center shadow-lg pointer-events-none">
                <Shield size={12} fill="currentColor" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">프로필 사진을 클릭해 변경할 수 있습니다.</p>

            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">
              {currentUser.displayName || currentUser.name}
            </h3>
            <div className="px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded-full uppercase tracking-wider mb-4">
              {currentUser.role === 'admin' ? '관리자' : '사원'}
            </div>
            
            <div className="w-full space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <Mail size={14} className="text-slate-400" />
                <span className="truncate">{currentUser.email}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span>가입일: {new Date(staffData?.joinDate || Date.now()).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Area */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm space-y-6">
            {status.type && (
              <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-medium animate-in slide-in-from-top-2 ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
              }`}>
                {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                {status.message}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <User size={12} /> 이름 <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text" 
                  required
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
                  value={formData.name}
                  onChange={(e) => {
                    markDirty();
                    setFormData({ ...formData, name: e.target.value });
                  }}
                  placeholder="실명을 입력하세요"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail size={12} /> 설정 이메일
                </label>
                <input 
                  type="email" 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
                  value={formData.email}
                  onChange={(e) => {
                    markDirty();
                    setFormData({ ...formData, email: e.target.value });
                  }}
                  placeholder="contact@example.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={12} /> 개인 연락처
                </label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
                  value={formData.phone}
                  onChange={(e) => handlePhoneChange('phone', e.target.value)}
                  placeholder="010-0000-0000"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Building size={12} /> 사무실 연락처
                </label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
                  value={formData.phoneOffice}
                  onChange={(e) => handlePhoneChange('phoneOffice', e.target.value)}
                  placeholder="사무실 전화번호"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <PhoneCall size={12} /> 회사 연락처
                </label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
                  value={formData.phoneCompany}
                  onChange={(e) => handlePhoneChange('phoneCompany', e.target.value)}
                  placeholder="회사 대표/업무용 번호"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={12} /> 사내 내선 번호
                </label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
                  value={formData.extensionNumber}
                  onChange={(e) => {
                    markDirty();
                    setFormData({ ...formData, extensionNumber: e.target.value });
                  }}
                  placeholder="예: 201"
                />
              </div>
            </div>

            {/* Password Section */}
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Lock size={16} className="text-slate-400" /> 보안 설정
                </h4>
              </div>
              
              {isSocialLogin ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 leading-relaxed">
                  구글 소셜 로그인 계정은 시스템 내에서 비밀번호를 변경할 수 없습니다. 구글 계정의 보안 설정을 통해 관리해 주세요.
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">새 비밀번호 (변경 시에만 입력)</label>
                  <input 
                    type="password" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm font-medium"
                    value={formData.password}
                    onChange={(e) => {
                      markDirty();
                      setFormData({ ...formData, password: e.target.value });
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
              )}
            </div>

            <div className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="font-mono">
                  v{APP_VERSION}
                  <span className="text-slate-400 ml-1">(build {APP_BUILD_ID})</span>
                </span>
                <button
                  type="button"
                  onClick={() => void runManualUpdateCheck(setWebNotice, setDesktopNotice)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <RefreshCw size={12} />
                  업데이트 확인
                </button>
              </div>
              <button 
                type="submit" 
                disabled={isSaving}
                className="flex items-center justify-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
              >
                {isSaving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={18} />
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
