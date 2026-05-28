import React, { useState, useEffect, useRef } from 'react';
import { Staff } from '../../types';
import { db, formatPhoneNumber } from '../../services/dataService';
import { X, User, Phone, Shield, Save, Hash, Settings, Plus, Camera, Upload, Key } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

interface StaffModalProps {
  staff?: Staff | null;
  onClose: () => void;
  onSave: (staff: Staff) => void;
}

export const StaffModal: React.FC<StaffModalProps> = ({ staff, onClose, onSave }) => {
  const isEdit = !!staff;
  const [roles, setRoles] = useState<string[]>([]);
  const [isManagingRoles, setIsManagingRoles] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showConfirm, showAlert } = useDialog();
  
  const [formData, setFormData] = useState<Partial<Staff>>({
    name: '',
    role: '',
    phone: '',
    phoneOffice: '',
    phoneCompany: '',
    extensionNumber: '',
    email: '',
    loginId: '',
    password: '',
    joinDate: new Date().toISOString().split('T')[0],
    active: true,
    avatarUrl: ''
  });

  useEffect(() => {
    // Load roles from DB and merge with default system roles to ensure newly added roles exist
    const dbRoles = db.getRoles();
    const DEFAULT_ROLES = ["관리자", "디자이너", "인쇄기장", "후가공", "배송", "실장", "부장", "과장", "대리", "사원"];
    const mergedRoles = Array.from(new Set([...dbRoles, ...DEFAULT_ROLES]));

    if (staff) {
      if (staff.role && !mergedRoles.includes(staff.role)) {
        setRoles([staff.role, ...mergedRoles]);
      } else {
        setRoles(mergedRoles);
      }
      const cleanEmail = staff.email?.endsWith('@ez-hub.kr') ? '' : (staff.email || '');
      setFormData({
        ...staff,
        email: cleanEmail
      });
    } else {
      setRoles(mergedRoles);
      // Set default avatar for new staff (random fallback)
      setFormData({
        name: '',
        role: '', // Start empty to force selection
        phone: '',
        phoneOffice: '',
        phoneCompany: '',
        extensionNumber: '',
        email: '',
        loginId: '',
        password: '',
        joinDate: new Date().toISOString().split('T')[0],
        active: true,
        avatarUrl: `https://i.pravatar.cc/150?u=${Date.now()}`
      });
    }
  }, [staff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.role) {
        await showAlert('이름과 직책은 필수입니다.');
        return;
    }

    if ((formData.loginId && !formData.password) || (!formData.loginId && formData.password)) {
        await showAlert('로그인 계정을 사용하려면 아이디와 비밀번호를 모두 입력해야 합니다.');
        return;
    }

    const finalData: Staff = {
        id: staff?.id || Date.now().toString(),
        name: formData.name || '',
        role: formData.role || '',
        phone: formData.phone || '',
        phoneOffice: formData.phoneOffice || '',
        phoneCompany: formData.phoneCompany || '',
        extensionNumber: formData.extensionNumber || '',
        email: formData.email || '',
        loginId: formData.loginId || '',
        password: formData.password || '',
        uid: formData.uid || '',
        joinDate: formData.joinDate || new Date().toISOString().split('T')[0],
        avatarUrl: formData.avatarUrl || `https://i.pravatar.cc/150?u=${Date.now()}`,
        active: formData.active !== undefined ? formData.active : true,
        isDeleted: false
    };

    onSave(finalData);
  };

  const handleAddRole = () => {
    if (newRoleInput.trim()) {
        const newRole = newRoleInput.trim();
        db.addRole(newRole);
        setRoles(db.getRoles());
        setNewRoleInput('');
        // Automatically select the new role if currently empty
        if (!formData.role) {
            setFormData({...formData, role: newRole});
        }
    }
  };

  const handleDeleteRole = async (roleToDelete: string) => {
    if (await showConfirm(`'${roleToDelete}' 직책을 정말 삭제하시겠습니까?`)) {
        db.deleteRole(roleToDelete);
        setRoles(db.getRoles());
        // If the deleted role was selected, clear it
        if (formData.role === roleToDelete) {
             setFormData({...formData, role: ''});
        }
    }
  };

  // Handle Image File Upload & Resize
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300;
        const MAX_HEIGHT = 300;
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          // Convert to Base64 string (JPEG format, quality 0.8)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setFormData({ ...formData, avatarUrl: dataUrl });
        }
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <User className="text-blue-600" />
            직원 정보 수정
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} className="text-slate-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Top Section: Avatar & Basic Info */}
          <div className="flex gap-6 mb-2">
              {/* Left: Avatar Upload */}
              <div className="flex-none flex flex-col items-center gap-2">
                  <div 
                    className="relative group w-32 h-32 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                      <img 
                        src={formData.avatarUrl} 
                        alt="Preview" 
                        className="w-full h-full rounded-xl border-4 border-slate-100 object-cover bg-slate-200 shadow-sm transition-opacity group-hover:opacity-75"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/150?text=User'; }}
                      />
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-xl text-white opacity-0 group-hover:opacity-100 transition-all duration-200">
                          <Camera size={24} className="mb-1" />
                          <span className="text-xs font-bold">사진 변경</span>
                      </div>
                      {/* Hidden File Input */}
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept="image/*" 
                        className="hidden" 
                      />
                  </div>
                  <div className="text-xs text-slate-400 font-medium">프로필 사진 (클릭)</div>
              </div>

              {/* Right: Basic Info (Name, Role, Extension) */}
              <div className="flex-1 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">이름 <span className="text-red-500">*</span></label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 bg-white"
                      placeholder="예: 홍길동"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                          <Shield size={12} /> 직책 <span className="text-red-500">*</span>
                        </label>
                        <button 
                            type="button" 
                            onClick={() => setIsManagingRoles(!isManagingRoles)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium bg-blue-50 px-2 py-0.5 rounded transition-colors"
                        >
                            <Settings size={12} /> {isManagingRoles ? '닫기' : '관리'}
                        </button>
                    </div>
                    
                    {isManagingRoles ? (
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-1">
                             <div className="flex gap-2 mb-3">
                                <input
                                    type="text"
                                    value={newRoleInput}
                                    onChange={(e) => setNewRoleInput(e.target.value)}
                                    placeholder="새 직책 입력"
                                    className="flex-1 p-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRole())}
                                />
                                <button
                                    type="button"
                                    onClick={handleAddRole}
                                    className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700 transition-colors"
                                >
                                    <Plus size={18} />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                                {roles.map(r => (
                                    <div key={r} className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-medium text-slate-700 flex items-center gap-1 shadow-sm">
                                        {r}
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteRole(r)}
                                            className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full p-0.5 transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <select
                            value={formData.role}
                            onChange={(e) => setFormData({...formData, role: e.target.value})}
                            className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-slate-900 font-medium"
                        >
                            <option value="">직책 선택</option>
                            {roles.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-blue-600 flex items-center gap-1 mb-1">
                      <Hash size={12} /> 내선 번호
                    </label>
                    <input 
                      type="text" 
                      value={formData.extensionNumber || ''}
                      onChange={(e) => setFormData({...formData, extensionNumber: e.target.value})}
                      className="w-full p-2 border border-blue-200 bg-blue-50 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xl text-blue-900 font-bold placeholder-blue-300"
                      placeholder="예: 101"
                    />
                  </div>
              </div>
          </div>

          <hr className="border-slate-100 my-4" />

          {/* Contact Information Group */}
          <div className="space-y-2 p-4 bg-slate-50 rounded-xl border border-slate-200">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
              <Phone size={16} /> 외부 연락처 정보
            </label>
            
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 w-20 text-right">사무실 직통</span>
                <input 
                  type="text" 
                  value={formData.phoneOffice || ''}
                  onChange={(e) => setFormData({...formData, phoneOffice: formatPhoneNumber(e.target.value)})}
                  className="flex-1 p-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-900"
                  placeholder="02-000-0000"
                />
            </div>
            
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 w-20 text-right">회사 휴대폰</span>
                <input 
                  type="text" 
                  value={formData.phoneCompany || ''}
                  onChange={(e) => setFormData({...formData, phoneCompany: formatPhoneNumber(e.target.value)})}
                  className="flex-1 p-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-900"
                  placeholder="010-0000-0000"
                />
            </div>
            
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 w-20 text-right">개인 휴대폰</span>
                <input 
                  type="text" 
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({...formData, phone: formatPhoneNumber(e.target.value)})}
                  className="flex-1 p-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-900"
                  placeholder="010-0000-0000"
                />
            </div>

            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 w-20 text-right">이메일</span>
                <input 
                  type="email" 
                  value={formData.email || ''}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="flex-1 p-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-900"
                  placeholder="example@email.com"
                />
            </div>

            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 w-20 text-right">입사일</span>
                <input 
                  type="date" 
                  value={formData.joinDate || ''}
                  onChange={(e) => setFormData({...formData, joinDate: e.target.value})}
                  className="flex-1 p-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-900"
                />
            </div>
          </div>

          {/* 로그인 계정 설정 Group */}
          <div className="space-y-2 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
            <label className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-2">
              <Key size={16} /> 로그인 계정 설정 (선택)
            </label>
            <p className="text-xs text-slate-500 font-medium mb-1.5 pl-1">
              직원이 프로그램에 로그인할 수 있도록 ID와 비밀번호를 생성해 줍니다.
            </p>
            
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 w-20 text-right">아이디 (ID)</span>
                <input 
                  type="text" 
                  value={formData.loginId || ''}
                  onChange={(e) => setFormData({...formData, loginId: e.target.value})}
                  className="flex-1 p-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-900"
                  placeholder="예: staff01 (또는 이메일)"
                />
            </div>
            
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 w-20 text-right">비밀번호</span>
                <input 
                  type="text" 
                  value={formData.password || ''}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="flex-1 p-2 border border-slate-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-white text-slate-900"
                  placeholder="6자리 이상의 비밀번호"
                />
            </div>
          </div>

          <div className="pt-4 flex gap-3 sticky bottom-0 bg-white border-t border-slate-100 mt-auto">
             <button 
                type="button" 
                onClick={onClose} 
                className="flex-1 py-3 text-slate-600 font-bold bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
             >
                취소하기
             </button>
             <button 
                type="submit" 
                className="flex-1 py-3 text-white font-bold bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2"
             >
                <Save size={18} />
                정보 업데이트
             </button>
          </div>

        </form>
      </div>
    </div>
  );
};