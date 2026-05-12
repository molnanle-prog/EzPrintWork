
import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../services/dataService';
import { Staff } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { UserCircle2, LogIn, Printer, Shield, ArrowRight, KeyRound, Lock, Hash, Database, Link } from 'lucide-react';
import { PasswordRecoveryModal } from './PasswordRecoveryModal';
import { NetworkPathPicker } from '../settings/NetworkPathPicker';

interface AdminLoginContentProps {
  isPasswordSet: boolean;
  adminPassword: string;
  confirmPassword: string;
  adminError: string;
  handleAdminLogin: (e: React.FormEvent) => Promise<void>;
  setAdminPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  setShowRecoveryModal: (show: boolean) => void;
  setIsAdminMode: (isAdmin: boolean) => void;
}

const AdminLoginContent: React.FC<AdminLoginContentProps> = ({
  isPasswordSet,
  adminPassword,
  confirmPassword,
  adminError,
  handleAdminLogin,
  setAdminPassword,
  setConfirmPassword,
  setShowRecoveryModal,
  setIsAdminMode,
}) => {
  // Input Ref for auto-focus
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Focus input when mounted
  useEffect(() => {
      // Small timeout ensures the animation/render is complete
      const timer = setTimeout(() => {
          passwordInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
  }, []);

  if (isPasswordSet) {
    // --- Enter Password Mode ---
    return (
      <form onSubmit={handleAdminLogin} className="flex-1 flex flex-col animate-in slide-in-from-right-10 duration-300">
          <div className="flex-1">
              <div className="bg-slate-800 dark:bg-slate-950 text-white p-4 rounded-xl mb-6 shadow-lg border border-slate-700">
                  <div className="flex items-center gap-2 mb-2">
                      <Shield size={20} className="text-yellow-400" />
                      <h3 className="font-bold">관리자 인증</h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                      시스템 설정을 위해 관리자 비밀번호를 입력하세요.
                  </p>
              </div>
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">관리자 비밀번호</label>
                      <input 
                          ref={passwordInputRef} // Ref Attached
                          type="password" 
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none text-center font-bold tracking-widest bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
                          placeholder="••••••"
                          autoFocus // Native autoFocus as backup
                      />
                      {adminError && <p className="text-red-500 text-xs mt-2 font-bold text-center">{adminError}</p>}
                  </div>
                  <button type="button" onClick={() => setShowRecoveryModal(true)} className="text-xs text-slate-500 dark:text-slate-400 hover:underline text-center w-full transition-colors">
                      비밀번호를 잊으셨나요?
                  </button>
              </div>
          </div>
          <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setIsAdminMode(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">취소</button>
              <button type="submit" className="flex-[2] py-3 rounded-xl font-bold text-white bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 shadow-md transition-all flex items-center justify-center gap-2 border border-transparent dark:border-slate-600">
                  <span>관리자 접속</span><ArrowRight size={18} />
              </button>
          </div>
      </form>
    );
  } else {
    // --- Set Initial Password Mode ---
    return (
      <form onSubmit={handleAdminLogin} className="flex-1 flex flex-col animate-in slide-in-from-right-10 duration-300">
          <div className="flex-1">
              <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-4 rounded-xl mb-6 shadow-sm border border-blue-100 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                      <KeyRound size={20} className="text-blue-600 dark:text-blue-400" />
                      <h3 className="font-bold">초기 비밀번호 설정</h3>
                  </div>
                  <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                      최초 접속 또는 비밀번호 초기화 후, 사용할 관리자 비밀번호를 설정해주세요. (최소 4자)
                  </p>
              </div>
              <div className="space-y-4">
                  <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">새 비밀번호</label>
                      <input 
                        ref={passwordInputRef} // Ref Attached
                        type="password" 
                        value={adminPassword} 
                        onChange={(e) => setAdminPassword(e.target.value)} 
                        className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-center font-bold tracking-widest bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-colors" 
                        placeholder="최소 4자 이상" 
                        autoFocus
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">비밀번호 확인</label>
                      <input 
                        type="password" 
                        value={confirmPassword} 
                        onChange={(e) => setConfirmPassword(e.target.value)} 
                        className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-center font-bold tracking-widest bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-colors" 
                        placeholder="한 번 더 입력" 
                      />
                  </div>
                  {adminError && <p className="text-red-500 text-xs font-bold text-center">{adminError}</p>}
              </div>
          </div>
          <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setIsAdminMode(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">취소</button>
              <button type="submit" className="flex-[2] py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all flex items-center justify-center gap-2">
                  <span>비밀번호 설정 및 접속</span><ArrowRight size={18} />
              </button>
          </div>
      </form>
    );
  }
};

export const LoginScreen: React.FC = () => {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const { login } = useAuth();
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  
  // Admin Login State
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isPasswordSet, setIsPasswordSet] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  
  // Data Connection State
  const [showPathPicker, setShowPathPicker] = useState(false);

  useEffect(() => {
    refreshData();
    // 중요: 데이터베이스 변경(예: NAS 연결 후 데이터 로드)을 구독하여 UI 업데이트
    const unsubscribe = db.subscribe(() => {
        refreshData();
    });
    return () => unsubscribe();
  }, []);

  const refreshData = () => {
    setStaffList(db.getStaff().filter(s => s.active && s.id !== 'admin'));
    setIsPasswordSet(db.hasAdminPassword());
  };

  const handleLogin = () => {
    if (selectedStaffId) {
      login(selectedStaffId);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setAdminError('');

      if (isPasswordSet) {
          // Verify existing password
          if (db.verifyAdminPassword(adminPassword)) {
              login('admin');
          } else {
              setAdminError('비밀번호가 일치하지 않습니다.');
          }
      } else {
          // Set new password
          if (adminPassword.length < 4) {
              setAdminError('비밀번호는 최소 4자 이상이어야 합니다.');
              return;
          }
          if (adminPassword !== confirmPassword) {
              setAdminError('비밀번호가 일치하지 않습니다.');
              return;
          }
          await db.setAdminPassword(adminPassword);
          login('admin');
      }
  };

  const handleConnectDatabase = async (path: string) => {
      try {
          // Logic moved to db.saveNasConfig to handle "Load vs Save" decision
          await db.saveNasConfig({ isEnabled: true, path, status: 'connected' });
          
          // 알림 표시
          alert('데이터 저장소가 연결되었습니다.\n(서버 데이터가 존재하면 동기화되고, 없으면 현재 데이터가 업로드됩니다)');
          
          // 데이터가 비동기로 로드되므로 refreshData는 구독(subscribe)에 의해 자동으로 호출됩니다.
      } catch (e) {
          console.error(e);
          alert('데이터 저장소 연결 중 오류가 발생했습니다.');
      }
  };

  return (
    <>
    <div className="h-screen w-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center relative overflow-hidden transition-colors duration-300">
      {/* ADDED: Top Drag Region for moving window, z-index 10 (lowered) */}
      <div className="absolute top-0 left-0 w-full h-10 z-[10]" style={{ WebkitAppRegion: 'drag' } as any}></div>

      <div className="absolute top-0 left-0 w-full h-64 bg-slate-900 dark:bg-slate-900 skew-y-3 origin-top-left -translate-y-20 z-0"></div>
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-100 dark:bg-blue-900/20 rounded-full blur-3xl opacity-50 z-0"></div>

      {/* ADDED: Explicit no-drag for main card to ensure inputs work, increased z-index to 50 */}
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700 relative z-[50] flex flex-col max-h-[90vh] transition-colors" style={{ WebkitAppRegion: 'no-drag' } as any}>
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200 dark:shadow-none">
            <Printer className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">EzPrintWork</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">인쇄소 통합 관리 시스템 v1.2.0</p>
        </div>

        {!isAdminMode ? (
            // Regular Staff Login
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="mb-2">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 px-1">작업자 선택</label>
                {staffList.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                        <p className="text-slate-400 dark:text-slate-300 text-sm mb-2">등록된 직원이 없습니다.</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">관리자 모드에서 직원을 등록하거나<br/>하단의 데이터 저장소 연결을 이용하세요.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2 max-h-[30vh] overflow-y-auto custom-scrollbar p-1">
                    {staffList.map((staff) => (
                        <button
                        key={staff.id}
                        onClick={() => setSelectedStaffId(staff.id)}
                        className={`flex items-center p-3 rounded-xl border transition-all text-left group ${
                            selectedStaffId === staff.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-200 dark:ring-blue-800 shadow-md'
                            : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                        >
                        <img src={staff.avatarUrl} alt={staff.name} className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-600 mr-3 bg-white" />
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 dark:text-slate-100 truncate">{staff.name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                                <span>{staff.role}</span>
                                {staff.extensionNumber && (
                                    <span className="flex items-center bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-800 font-bold ml-1">
                                        <Hash size={10} className="mr-0.5"/>
                                        {staff.extensionNumber}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className={`ml-2 text-blue-600 dark:text-blue-400 transition-opacity ${selectedStaffId === staff.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
                            <UserCircle2 size={24} />
                        </div>
                        </button>
                    ))}
                    </div>
                )}
              </div>

              <div className="mt-6 space-y-4">
                  <button
                    onClick={handleLogin}
                    disabled={!selectedStaffId}
                    className={`w-full py-3.5 rounded-xl font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all
                    ${selectedStaffId 
                        ? 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5' 
                        : 'bg-slate-300 dark:bg-slate-600 cursor-not-allowed'}`}
                  >
                    <LogIn size={20} />
                    <span>접속하기</span>
                  </button>
                  
                  <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                      </div>
                      <div className="relative flex justify-center text-xs">
                          <span className="px-2 bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500">설정 및 관리</span>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setShowPathPicker(true)}
                        className="py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-transparent hover:border-slate-300 dark:hover:border-slate-500 transition-all flex items-center justify-center gap-1.5"
                        title="다른 PC의 데이터를 공유받기 위해 NAS/공유폴더를 연결합니다"
                      >
                          <Database size={14} />
                          데이터 저장소 연결
                      </button>
                      
                      <button 
                        onClick={() => setIsAdminMode(true)}
                        className="py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-transparent hover:border-slate-300 dark:hover:border-slate-500 transition-all flex items-center justify-center gap-1.5"
                      >
                          <Shield size={14} />
                          관리자 모드 접속
                      </button>
                  </div>
              </div>
            </div>
        ) : (
            <AdminLoginContent 
              isPasswordSet={isPasswordSet}
              adminPassword={adminPassword}
              confirmPassword={confirmPassword}
              adminError={adminError}
              handleAdminLogin={handleAdminLogin}
              setAdminPassword={setAdminPassword}
              setConfirmPassword={setConfirmPassword}
              setShowRecoveryModal={setShowRecoveryModal}
              setIsAdminMode={setIsAdminMode}
            />
        )}
      </div>
      
      <p className="absolute bottom-6 text-xs text-slate-400 dark:text-slate-600 text-center w-full transition-colors">
        * 로그인 정보는 이 PC에 자동 저장되어 다음 실행 시 자동으로 접속됩니다.
      </p>
    </div>
    {showRecoveryModal && <PasswordRecoveryModal onClose={() => setShowRecoveryModal(false)} />}
    {showPathPicker && <NetworkPathPicker onClose={() => setShowPathPicker(false)} onSelect={handleConnectDatabase} />}
    </>
  );
};
