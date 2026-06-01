
import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { Staff, JoinRequest } from '../../types';
import { User, Phone, Check, X, Shield, Trash2, Edit2, Smartphone, Briefcase, Building2, Hash, Mail, Calendar, UserPlus, Clock } from 'lucide-react';
import { StaffModal } from './StaffModal';
import { useDialog } from '../../contexts/DialogContext';
import { useAuth } from '../../contexts/AuthContext';
import { UpgradeModal } from '../common/UpgradeModal';
import { GAS_WEBHOOK_URL } from '../../constants';

// 연락처 추출 유틸리티 함수
const getStaffContact = (staff: Staff): string => {
  const parts: string[] = [];
  if (staff.phoneOffice) parts.push(`사무실: ${staff.phoneOffice}`);
  if (staff.phone) parts.push(`개인: ${staff.phone}`);
  if (staff.phoneCompany) parts.push(`회사: ${staff.phoneCompany}`);
  if (staff.extensionNumber) parts.push(`내선: ${staff.extensionNumber}`);
  return parts.length > 0 ? parts.join(' | ') : '';
};


// Firebase Secondary Auth imports for silent user creation/management
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { firebaseConfig, db as firestore } from '../../services/firebase';

export const StaffManager: React.FC = () => {
  const { tenantPlan, currentUser } = useAuth();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const { showConfirm, showAlert } = useDialog();

  const isAtLimit = tenantPlan === 'free' && staffList.length >= 3;

  const loadStaff = () => {
     // Exclude deleted staff AND system admin
     setStaffList(db.getStaff().filter(s => !s.isDeleted && s.id !== 'admin'));
     setJoinRequests(db.getJoinRequests());
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
        const nextActive = !staff.active;
        await db.updateStaff({ ...staff, active: nextActive });

        // 구글 시트 직원 활성화 상태 웹훅 전송
        try {
            const companyName = db.getCompanyInfo().name || 'EzPrintWork';
            const pureId = staff.loginId?.includes('@') ? staff.loginId.split('@')[0] : (staff.loginId || '');
            await fetch(GAS_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: "active_staff",
                    companyName,
                    loginId: pureId,
                    staffName: staff.name,
                    active: nextActive
                })
            });
        } catch (err) {
            console.error("Google Sheets Sync Error (active_staff):", err);
        }
    } catch (error) {
        showAlert(getErrorMessage(error));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (await showConfirm(`'${name}' 직원을 정말 삭제하시겠습니까?\n\n삭제하더라도 과거 작업 내역의 담당자 기록은 유지됩니다.`)) {
      try {
          const staff = staffList.find(s => s.id === id);
          await db.deleteStaff(id);

          // 구글 시트 직원 삭제 웹훅 전송
          if (staff) {
              try {
                  const companyName = db.getCompanyInfo().name || 'EzPrintWork';
                  const pureId = staff.loginId?.includes('@') ? staff.loginId.split('@')[0] : (staff.loginId || '');
                  await fetch(GAS_WEBHOOK_URL, {
                      method: 'POST',
                      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                      body: JSON.stringify({
                          action: "delete_staff",
                          companyName,
                          loginId: pureId,
                          staffName: staff.name
                      })
                  });
              } catch (err) {
                  console.error("Google Sheets Sync Error (delete_staff):", err);
              }
          }
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
          const tenantId = currentUser?.tenantId;
          if (!tenantId) {
              await showAlert('오류: 테넌트 정보가 존재하지 않습니다.');
              return;
          }

          // 가입/수정 시 아이디와 패스워드 강제 소문자 통일 (대표자 피드백 대소문자 방지)
          if (staff.loginId) staff.loginId = staff.loginId.trim().toLowerCase();
          if (staff.password) staff.password = staff.password.trim().toLowerCase();

          let uid = staff.uid || '';

          // 1. 로그인 크리덴셜 정보가 제공된 경우 Firebase Auth 백그라운드 등록 및 동기화 수행
          if (staff.loginId && staff.password) {
              const email = staff.loginId.includes('@') ? staff.loginId : `${staff.loginId}@ez-hub.kr`;

              // 보조 Firebase App 인스턴스 초기화 (관리자 세션 영향 차단)
              let secondaryApp;
              try {
                  secondaryApp = getApp('Secondary');
              } catch (e) {
                  secondaryApp = initializeApp(firebaseConfig, 'Secondary');
              }
              const secondaryAuth = getAuth(secondaryApp);

              if (!uid) {
                  // 신규 계정 백그라운드 생성
                  try {
                      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, staff.password);
                      uid = userCredential.user.uid;
                      staff.uid = uid;

                      // 글로벌 테넌트 매핑을 위한 users/{uid} 생성
                      await setDoc(doc(firestore, 'users', uid), {
                          uid,
                          id: uid,
                          email,
                          displayName: staff.name,
                          name: staff.name,
                          tenantId,
                          role: 'staff',
                          loginId: staff.loginId.trim(),
                          password: staff.password.trim(),
                          position: staff.role
                      });

                      await signOut(secondaryAuth);
                  } catch (authError: any) {
                      if (authError.code === 'auth/email-already-in-use') {
                          await showAlert('오류: 이미 가입되어 사용 중인 아이디(이메일)입니다.');
                          return;
                      }
                      throw authError;
                  }
              } else {
                  // 패스워드 또는 정보 변경 처리
                  const oldStaff = staffList.find(s => s.id === staff.id);
                  if (oldStaff && oldStaff.password !== staff.password) {
                      try {
                          // 이전 비밀번호로 보조 세션 로그인 후 패스워드 변경 승인
                          const oldEmail = oldStaff.loginId?.includes('@') ? oldStaff.loginId.trim().toLowerCase() : `${oldStaff.loginId?.trim().toLowerCase()}@ez-hub.kr`;
                          const oldPassword = oldStaff.password || '';

                          await signInWithEmailAndPassword(secondaryAuth, oldEmail, oldPassword);
                          if (secondaryAuth.currentUser) {
                              await updatePassword(secondaryAuth.currentUser, staff.password);
                          }
                          await signOut(secondaryAuth);
                      } catch (updateError) {
                          console.warn("Silent auth update failed, trying fallback create:", updateError);
                          // 이전 계정 매핑이 유실된 경우 대비해 대체 재생성 시도
                          try {
                              const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, staff.password);
                              uid = userCredential.user.uid;
                              staff.uid = uid;
                              await setDoc(doc(firestore, 'users', uid), {
                                  uid,
                                  id: uid,
                                  email,
                                  displayName: staff.name,
                                  name: staff.name,
                                  tenantId,
                                  role: 'staff',
                                  loginId: staff.loginId.trim(),
                                  password: staff.password.trim(),
                                  position: staff.role
                              });
                              await signOut(secondaryAuth);
                          } catch (fallbackError) {
                              await showAlert('오류: 아이디 패스워드 설정 변경 권한이 없거나 중복된 아이디입니다.');
                              return;
                          }
                      }
                  }
                  
                  // 글로벌 사용자 Profile 동기화 유지
                  const userProfileUpdate: any = {
                      displayName: staff.name,
                      name: staff.name,
                      email: email
                  };
                  if (staff.loginId) userProfileUpdate.loginId = staff.loginId.trim();
                  if (staff.password) userProfileUpdate.password = staff.password.trim();
                  
                  await setDoc(doc(firestore, 'users', uid), userProfileUpdate, { merge: true });
              }
          }

          // 2. 테넌트 내부 DB 정보 저장
          if (editingStaff) {
              await db.updateStaff(staff);

              // 구글 시트 직원 수정 웹훅 전송
              try {
                  const companyName = db.getCompanyInfo().name || 'EzPrintWork';
                  const pureId = staff.loginId?.includes('@') ? staff.loginId.split('@')[0] : (staff.loginId || '');
                  await fetch(GAS_WEBHOOK_URL, {
                      method: 'POST',
                      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                      body: JSON.stringify({
                          action: "update_staff",
                          companyName,
                          loginId: pureId,
                          password: staff.password || '',
                          staffName: staff.name,
                          staffRole: staff.role || '직원',
                          contact: getStaffContact(staff)
                      })
                  });
              } catch (err) {
                  console.error("Google Sheets Sync Error (update_staff):", err);
              }
          } else {
              await db.addStaff(staff);

              // 구글 시트 직원 추가 웹훅 전송
              try {
                  const companyName = db.getCompanyInfo().name || 'EzPrintWork';
                  const pureId = staff.loginId?.includes('@') ? staff.loginId.split('@')[0] : (staff.loginId || '');
                  await fetch(GAS_WEBHOOK_URL, {
                      method: 'POST',
                      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                      body: JSON.stringify({
                          action: "add_staff",
                          companyName,
                          loginId: pureId,
                          password: staff.password || '',
                          staffName: staff.name,
                          staffRole: staff.role || '직원',
                          contact: getStaffContact(staff)
                      })
                  });
              } catch (err) {
                  console.error("Google Sheets Sync Error (add_staff):", err);
              }
          }
          setIsModalOpen(false);
      } catch (error: any) {
          showAlert('직원 등록 처리 중 오류가 발생했습니다: ' + (error.message || getErrorMessage(error)));
      }
  };

  const handleApproveRequest = async (request: JoinRequest) => {
      if (isAtLimit) {
          setIsUpgradeModalOpen(true);
          return;
      }
      try {
          await db.approveJoinRequest(request);
          showAlert(`${request.userName} 직원의 등록을 승인했습니다.`);

          // 구글 시트 직원 승인 웹훅 전송
          try {
              const companyName = db.getCompanyInfo().name || 'EzPrintWork';
              const approvedStaff = db.getStaff().find(s => s.id === request.userId);
              const pureId = approvedStaff?.loginId?.includes('@') ? approvedStaff.loginId.split('@')[0] : (approvedStaff?.loginId || request.userEmail.split('@')[0]);
              
              await fetch(GAS_WEBHOOK_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({
                      action: "add_staff",
                      companyName,
                      loginId: pureId,
                      password: approvedStaff?.password || '',
                      staffName: request.userName,
                      staffRole: approvedStaff?.role || '디자이너',
                      contact: approvedStaff ? getStaffContact(approvedStaff) : ''
                  })
              });
          } catch (err) {
              console.error("Google Sheets Sync Error (approve_request/add_staff):", err);
          }
      } catch (error) {
          showAlert(getErrorMessage(error));
      }
  };

  const handleRejectRequest = async (requestId: string) => {
      if (await showConfirm('이 가입 요청을 거절하시겠습니까?')) {
          try {
              await db.rejectJoinRequest(requestId);
          } catch (error) {
              showAlert(getErrorMessage(error));
          }
      }
  };

  return (
    <>
        {/* Join Requests Section */}
        {joinRequests.length > 0 && (
            <div className="mb-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                        <UserPlus size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">가입 승인 대기</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">새로운 직원이 그룹 가입을 요청했습니다.</p>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {joinRequests.map(request => (
                        <div key={request.id} className="bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-xl p-4 shadow-sm flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold">
                                    {request.userName.charAt(0)}
                                </div>
                                <div>
                                    <div className="font-bold text-slate-800 dark:text-slate-100">{request.userName}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                        <Mail size={12} /> {request.userEmail}
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                        <Clock size={10} /> {new Date(request.requestedAt).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => handleApproveRequest(request)}
                                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md shadow-blue-600/10"
                                    title="승인"
                                >
                                    <Check size={18} />
                                </button>
                                <button 
                                    onClick={() => handleRejectRequest(request.id)}
                                    className="p-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 rounded-lg transition-colors"
                                    title="거절"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

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
                    {staff.email && !staff.email.endsWith('@ez-hub.kr') && (
                        <div className="flex items-center" title="이메일">
                            <Mail size={14} className="mr-2 text-slate-400 dark:text-slate-500 shrink-0" />
                            {staff.email}
                        </div>
                    )}
                    {staff.joinDate && (
                        <div className="flex items-center" title="입사일">
                            <Calendar size={14} className="mr-2 text-slate-400 dark:text-slate-500 shrink-0" />
                            입사일: {staff.joinDate}
                        </div>
                    )}
                    {!staff.phone && !staff.phoneCompany && !staff.phoneOffice && !staff.extensionNumber && !staff.email && (
                        <span className="text-slate-400 dark:text-slate-500 italic text-xs pl-1">등록된 정보 없음</span>
                    )}
                    {currentUser?.role === 'admin' && (staff.loginId || staff.password) && (
                        <div className="mt-3 p-2.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-xl text-xs space-y-1.5 animate-in fade-in duration-200">
                            <div className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider pl-0.5 mb-1">
                                로그인 계정 정보 (관리자 전용)
                            </div>
                            {staff.loginId && (
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400 dark:text-slate-500 font-bold">아이디 (ID):</span>
                                    <span className="font-mono font-black text-blue-700 dark:text-blue-300">{staff.loginId}</span>
                                </div>
                            )}
                            {staff.password && (
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400 dark:text-slate-500 font-bold">비밀번호:</span>
                                    <span className="font-mono font-black text-blue-700 dark:text-blue-300 select-all" title="더블 클릭하여 복사">{staff.password}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                {/* 본인 계정 또는 대표자 계정(ADMIN)인 경우 비활성화 및 삭제 제어 원천 잠금 */}
                {staff.id === currentUser?.uid || 
                 staff.uid === currentUser?.uid || 
                 (staff.email && currentUser?.email && staff.email.toLowerCase() === currentUser.email.toLowerCase()) ||
                 staff.role === 'admin' || 
                 staff.role === '대표자' ? (
                    <div className="flex-1 py-2 px-3 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 border border-blue-100 dark:border-blue-900 w-full">
                        <Shield size={14} /> {staff.id === currentUser?.uid || staff.uid === currentUser?.uid || (staff.email && currentUser?.email && staff.email.toLowerCase() === currentUser.email.toLowerCase()) ? '본인 계정 (보호 상태)' : '대표자 계정 (보호 상태)'}
                    </div>
                ) : (
                    <>
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
                    </>
                )}
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
