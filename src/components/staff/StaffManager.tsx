
import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { Staff, JoinRequest } from '../../types';
import { User, Phone, Check, X, Shield, Trash2, Edit2, Smartphone, Briefcase, Building2, Hash, Mail, Calendar, UserPlus, Clock, Lock } from 'lucide-react';
import { StaffModal } from './StaffModal';
import { useDialog } from '../../contexts/DialogContext';
import { useAuth } from '../../contexts/AuthContext';
import { UpgradeModal } from '../common/UpgradeModal';
import { GAS_WEBHOOK_URL } from '../../constants';
import { isStaffAdminRole, isTenantOwnerUser, resolveAppRoleFromStaff, isHiddenStaffId } from '../../utils/adminAccess';
import { countActiveStaffSeats } from '../../utils/planLimits';
import { normalizeStaffLoginEmail, provisionStaffAuthAccount, MIN_STAFF_PASSWORD_LENGTH, getStaffAvatarUrl } from '../../utils/staffAuthProvision';

// 연락처 추출 유틸리티 함수
const getStaffContact = (staff: Staff): string => {
  const parts: string[] = [];
  if (staff.phoneOffice) parts.push(`사무실: ${staff.phoneOffice}`);
  if (staff.phone) parts.push(`개인: ${staff.phone}`);
  if (staff.phoneCompany) parts.push(`회사: ${staff.phoneCompany}`);
  if (staff.extensionNumber) parts.push(`내선: ${staff.extensionNumber}`);
  return parts.length > 0 ? parts.join(' | ') : '';
};

const isAdminStaff = (staff: Staff): boolean => isStaffAdminRole(staff.role);

const isStaffMainOwner = (staff: Staff, ownerId: string | null): boolean =>
  isTenantOwnerUser(staff.uid || staff.id, ownerId);


// Firebase Secondary Auth imports for silent user creation/management
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { firebaseConfig, db as firestore } from '../../services/firebase';
import { toast } from 'sonner';

export const StaffManager: React.FC = () => {
  const { tenantPlan, maxStaff, currentUser, tenantOwnerId, isTenantOwner, canManageStaff } = useAuth();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const { showConfirm, showAlert } = useDialog();
  const [deletingAdminStaff, setDeletingAdminStaff] = useState<Staff | null>(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSavingStaff, setIsSavingStaff] = useState(false);

  // 대표(1석) + staff 서브컬렉션 활성 직원 (대표가 staff에 있어도 1명으로 집계)
  const activeStaffCount = countActiveStaffSeats(staffList, tenantOwnerId);
  const isAtLimit = activeStaffCount >= maxStaff;

  const loadStaff = () => {
     // Exclude deleted staff AND system admin
     setStaffList(db.getStaff().filter(s => !s.isDeleted && !isHiddenStaffId(s.id)));
     setJoinRequests(db.getJoinRequests());
  };

  useEffect(() => {
    loadStaff();
    const unsubscribe = db.subscribe(loadStaff);
    return () => unsubscribe();
  }, []);

  const toggleRole = async (staff: Staff) => {
    if (staff.id === currentUser?.uid || staff.uid === currentUser?.uid) {
      showAlert('본인의 권한은 변경할 수 없습니다.');
      return;
    }

    if (isStaffMainOwner(staff, tenantOwnerId)) {
      showAlert('메인(대표) 관리자 권한은 변경할 수 없습니다.');
      return;
    }

    const currentlyAdmin = isStaffAdminRole(staff.role);
    const nextRole = currentlyAdmin ? '사원' : 'admin';
    const nextRoleLabel = currentlyAdmin ? '일반 직원' : '사내 관리자';

    const confirm = await showConfirm(
      currentlyAdmin
        ? `'${staff.name}' 직원의 사내 관리자 권한을 해제하시겠습니까?`
        : `'${staff.name}' 직원에게 사내 관리자 권한을 추가하시겠습니까?\n\n사내 관리자는 직원 관리(등록·수정·비활성), 회사 설정, 작업·견적 관리 등을 이용할 수 있습니다.\n메인 관리자(대표)는 그대로 유지되며, 사내 관리자는 여러 명이 될 수 있습니다.`
    );
    if (!confirm) return;

    try {
      const updatedStaff = { ...staff, role: nextRole };
      await db.updateStaff(updatedStaff);

      if (staff.uid) {
        await setDoc(doc(firestore, 'users', staff.uid), {
          role: currentlyAdmin ? 'staff' : 'admin',
        }, { merge: true });
      } else if (staff.loginId) {
        const loginNorm = staff.loginId.trim().toLowerCase();
        const usersSnap = await getDocs(
          query(collection(firestore, 'users'), where('loginId', '==', loginNorm), limit(5))
        );
        for (const userDoc of usersSnap.docs) {
          await setDoc(doc(firestore, 'users', userDoc.id), {
            role: currentlyAdmin ? 'staff' : 'admin',
          }, { merge: true });
        }
      }

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
                staffRole: nextRoleLabel,
                contact: getStaffContact(staff)
            })
        });
      } catch (err) {
        console.error("Google Sheets Sync Error (update_staff role):", err);
      }

      showAlert(
        currentlyAdmin
          ? `'${staff.name}' 직원의 사내 관리자 권한이 해제되었습니다.`
          : `'${staff.name}' 직원이 사내 관리자로 추가되었습니다.`
      );
    } catch (error: any) {
      showAlert('권한 변경 중 오류가 발생했습니다: ' + (error.message || getErrorMessage(error)));
    }
  };

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

  const syncDeleteStaffWebhook = async (staff: Staff) => {
    try {
      const companyName = db.getCompanyInfo().name || 'EzPrintWork';
      const pureId = staff.loginId?.includes('@') ? staff.loginId.split('@')[0] : (staff.loginId || '');
      await fetch(GAS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete_staff',
          companyName,
          loginId: pureId,
          staffName: staff.name,
        }),
      });
    } catch (err) {
      console.error('Google Sheets Sync Error (delete_staff):', err);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const staff = staffList.find(s => s.id === id);
    if (!staff) return;

    if (isStaffMainOwner(staff, tenantOwnerId)) {
      showAlert('회사 메인 관리자(대표) 계정은 삭제할 수 없습니다.');
      return;
    }

    const isAdminRole = isAdminStaff(staff);

    if (isAdminRole && !isTenantOwner) {
      // 사내 관리자가 다른 관리자 삭제 — 비밀번호 확인 (있을 때만)
      setDeletingAdminStaff(staff);
      setAdminPasswordInput('');
      setPasswordError('');
    } else if (isAdminRole && isTenantOwner) {
      if (await showConfirm(`관리자 '${name}' 직원을 삭제(비활성)하시겠습니까?\n\n과거 작업 내역의 담당자 기록은 유지됩니다.`)) {
        try {
          await db.deleteStaff(id);
          await syncDeleteStaffWebhook(staff);
        } catch (error) {
          showAlert(getErrorMessage(error));
        }
      }
    } else {
      // 일반 사원 삭제 확인창
      if (await showConfirm(`'${name}' 직원을 정말 삭제하시겠습니까?\n\n삭제하더라도 과거 작업 내역의 담당자 기록은 유지됩니다.`)) {
        try {
            await db.deleteStaff(id);
            await syncDeleteStaffWebhook(staff);
        } catch (error) {
            showAlert(getErrorMessage(error));
        }
      }
    }
  };

  const handleConfirmDeleteAdmin = async () => {
    if (!deletingAdminStaff) return;

    const correctPassword = deletingAdminStaff.password || '';
    if (!correctPassword) {
      if (!await showConfirm(
        `'${deletingAdminStaff.name}' 관리자 계정에 삭제 확인용 비밀번호가 없습니다.\n(구글 로그인 관리자일 수 있습니다)\n\n정말 삭제(비활성)하시겠습니까?`
      )) return;
    } else if (adminPasswordInput.trim().toLowerCase() !== correctPassword.trim().toLowerCase()) {
      setPasswordError('비밀번호가 일치하지 않습니다.');
      return;
    }

    try {
      await db.deleteStaff(deletingAdminStaff.id);
      await syncDeleteStaffWebhook(deletingAdminStaff);

      setDeletingAdminStaff(null);
      setAdminPasswordInput('');
      setPasswordError('');
    } catch (error) {
      showAlert(getErrorMessage(error));
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
      let staffSaved = false;
      try {
          const tenantId = currentUser?.tenantId;
          if (!tenantId) {
              await showAlert('오류: 테넌트 정보가 존재하지 않습니다.');
              return;
          }

          // 가입/수정 시 아이디와 패스워드 강제 소문자 통일 (대표자 피드백 대소문자 방지)
          if (staff.loginId) staff.loginId = staff.loginId.trim().toLowerCase();
          if (staff.password) staff.password = staff.password.trim().toLowerCase();

          const isNewStaff = !editingStaff;
          if (isNewStaff && activeStaffCount >= maxStaff) {
              setIsUpgradeModalOpen(true);
              return;
          }

          if (isNewStaff && staff.loginId) {
              const loginNorm = staff.loginId.trim().toLowerCase();
              const dup = staffList.find(
                  (s) => s.loginId?.trim().toLowerCase() === loginNorm
              );
              if (dup) {
                  await showAlert('이미 등록된 사내 아이디입니다. 목록에서 확인해 주세요.');
                  return;
              }
          }

          if (staff.loginId && staff.password && staff.password.length < MIN_STAFF_PASSWORD_LENGTH) {
              await showAlert(`비밀번호는 ${MIN_STAFF_PASSWORD_LENGTH}자 이상 입력해 주세요.`);
              return;
          }

          setIsSavingStaff(true);

          // 1. 직원 정보를 Firestore에 먼저 저장 (Auth 실패해도 목록·로그인 조회 가능)
          if (isNewStaff) {
              await db.addStaff(staff);
              const added = db.getStaff().find(
                  (s) =>
                      !s.isDeleted &&
                      staff.loginId &&
                      s.loginId?.trim().toLowerCase() === staff.loginId.trim().toLowerCase()
              );
              if (added) staff.id = added.id;
          } else {
              await db.updateStaff(staff);
          }
          staffSaved = true;

          // 2. 로그인 계정(Firebase Auth) 연동 — 실패해도 1번 저장은 유지
          try {
          if (staff.loginId && staff.password) {
              const email = normalizeStaffLoginEmail(staff.loginId);
              let uid = staff.uid || '';

              if (!uid) {
                  const provision = await provisionStaffAuthAccount({
                      loginId: staff.loginId,
                      password: staff.password,
                      tenantId,
                      staffName: staff.name,
                      staffRole: staff.role,
                      existingStaffInTenant: db.getStaff().filter((s) => !s.isDeleted),
                      excludeStaffId: staff.id,
                  });
                  if (provision.ok) {
                      uid = provision.uid;
                      staff.uid = uid;
                      try {
                        await db.updateStaff({ ...staff, uid });
                      } catch (uidErr) {
                        console.warn('staff uid link failed:', uidErr);
                        toast.warning('직원은 저장되었으나 로그인 계정(uid) 연결만 실패했습니다.');
                      }
                      if (provision.recovered) {
                          toast.success('Firebase에만 남아 있던 로그인 계정을 연결했습니다.');
                      }
                  } else {
                      toast.warning(
                          `직원은 목록에 저장되었습니다.\n로그인 계정 연결은 실패했습니다 — ${provision.message.split('\n')[0]}`
                      );
                  }
              } else {
                  let secondaryApp;
                  try {
                      secondaryApp = getApp('Secondary');
                  } catch {
                      secondaryApp = initializeApp(firebaseConfig, 'Secondary');
                  }
                  const secondaryAuth = getAuth(secondaryApp);
                  const oldStaff = staffList.find((s) => s.id === staff.id);
                  if (oldStaff && oldStaff.password !== staff.password) {
                      try {
                          const oldEmail = normalizeStaffLoginEmail(oldStaff.loginId || staff.loginId);
                          const oldPassword = oldStaff.password || '';
                          await signInWithEmailAndPassword(secondaryAuth, oldEmail, oldPassword);
                          if (secondaryAuth.currentUser) {
                              await updatePassword(secondaryAuth.currentUser, staff.password);
                          }
                          await signOut(secondaryAuth);
                      } catch (updateError) {
                          console.warn('Auth password update failed:', updateError);
                          toast.warning('직원 정보는 저장되었으나 Firebase 비밀번호 변경에 실패했습니다.');
                      }
                  }

                  const userSnap = await getDoc(doc(firestore, 'users', uid));
                  const existingUser = userSnap.exists() ? userSnap.data() : null;
                  const authRole =
                    existingUser?.role === 'admin' || existingUser?.role === 'staff'
                      ? existingUser.role
                      : resolveAppRoleFromStaff(staff.role);
                  const userProfileUpdate: Record<string, unknown> = {
                      displayName: staff.name,
                      name: staff.name,
                      email,
                      tenantId,
                      role: authRole,
                      position: staff.role,
                      loginId: staff.loginId.trim(),
                      password: staff.password.trim(),
                  };
                  if (!userSnap.exists()) {
                      userProfileUpdate.uid = uid;
                      userProfileUpdate.id = uid;
                  }

                  try {
                      await setDoc(doc(firestore, 'users', uid), userProfileUpdate, { merge: true });
                  } catch (userErr: unknown) {
                      // users 프로필은 직원 첫 로그인 시 본인 계정으로 생성됨
                      console.warn('users profile sync skipped (staff login will create):', userErr);
                  }
              }
          }
          } catch (authErr) {
              console.warn('Staff auth sync failed (staff record kept):', authErr);
              toast.warning('직원은 목록에 저장되었습니다. 로그인 계정 연동 중 오류가 있었습니다.');
          }

          // 구글 시트 웹훅
          try {
              const companyName = db.getCompanyInfo().name || 'EzPrintWork';
              const pureId = staff.loginId?.includes('@') ? staff.loginId.split('@')[0] : (staff.loginId || '');
              await fetch(GAS_WEBHOOK_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({
                      action: isNewStaff ? 'add_staff' : 'update_staff',
                      companyName,
                      loginId: pureId,
                      password: staff.password || '',
                      staffName: staff.name,
                      staffRole: staff.role || '직원',
                      contact: getStaffContact(staff),
                  }),
              });
          } catch (err) {
              console.error('Google Sheets Sync Error (staff save):', err);
          }

          toast.success(isNewStaff ? '직원이 등록되었습니다.' : '직원 정보가 저장되었습니다.');
          setIsModalOpen(false);
      } catch (error: any) {
          if (staffSaved) {
              toast.warning('직원은 저장되었으나 후속 처리 중 오류가 있었습니다.');
              setIsModalOpen(false);
              return;
          }
          showAlert('직원 정보 저장 중 오류가 발생했습니다: ' + (error.message || getErrorMessage(error)));
      } finally {
          setIsSavingStaff(false);
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

  if (!canManageStaff) {
    return (
      <div className="p-8 text-center text-slate-500 dark:text-slate-400">
        직원 관리 메뉴는 메인·사내 관리자만 이용할 수 있습니다.
      </div>
    );
  }

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
                <img src={getStaffAvatarUrl(staff.avatarUrl, staff.id)} alt={staff.name} className="w-full h-full object-cover" />
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
                <div className="flex justify-between items-start mb-2 gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{staff.name}</h3>
                {isAdminStaff(staff) && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide shrink-0 shadow-sm border ${
                        isStaffMainOwner(staff, tenantOwnerId)
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 border-red-300/80 dark:border-red-600'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 border-amber-300/80 dark:border-amber-600'
                    }`}>
                        <Shield size={10} />
                        {isStaffMainOwner(staff, tenantOwnerId) ? '메인 관리자' : '사내 관리자'}
                    </span>
                )}
                </div>
                <span className={`px-2 py-1 rounded text-xs font-bold shrink-0 ${staff.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
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

                {currentUser?.role === 'admin' && 
                 !isStaffMainOwner(staff, tenantOwnerId) &&
                 staff.id !== currentUser?.uid && 
                 staff.uid !== currentUser?.uid && 
                 !(staff.email && currentUser?.email && staff.email.toLowerCase() === currentUser.email.toLowerCase()) && (
                    <div className="mt-4 mb-2">
                        <button
                            onClick={() => toggleRole(staff)}
                            className={`w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border shadow-sm active:scale-95
                            ${isStaffAdminRole(staff.role)
                                ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-950/40'
                                : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-950/40'}`}
                        >
                            <Shield size={14} />
                            {isStaffAdminRole(staff.role) ? '사내 관리자 권한 해제' : '사내 관리자로 추가'}
                        </button>
                    </div>
                )}

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                {/* 본인 계정인 경우 비활성화 및 삭제 제어 원천 잠금 */}
                {staff.id === currentUser?.uid || 
                 staff.uid === currentUser?.uid || 
                 (staff.email && currentUser?.email && staff.email.toLowerCase() === currentUser.email.toLowerCase()) ? (
                    <div className="flex-1 py-2 px-3 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 border border-blue-100 dark:border-blue-900 w-full">
                        <Shield size={14} /> 본인 계정 (보호 상태)
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
            title={isAtLimit ? `요금제 인원 제한 (${maxStaff}명) 도달` : "새로운 직원을 등록합니다"}
            className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 transition-all min-h-[300px] 
            ${isAtLimit 
                ? 'border-orange-200 bg-orange-50/30 text-orange-400 opacity-80 cursor-not-allowed group' 
                : 'border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:border-blue-500 dark:hover:border-blue-400 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800'}`}
        >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors 
            ${isAtLimit ? 'bg-orange-100' : 'bg-slate-100 dark:bg-slate-700'}`}>
            <User size={24} />
            </div>
            <span className="font-bold">{isAtLimit ? `인원 제한 (${activeStaffCount}/${maxStaff})` : '신규 직원 등록'}</span>
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
                isSaving={isSavingStaff}
            />
        )}

        <UpgradeModal 
            isOpen={isUpgradeModalOpen}
            onClose={() => setIsUpgradeModalOpen(false)}
        />

        {deletingAdminStaff && (
            <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-700 p-6 text-center animate-in zoom-in-95 duration-200">
                    <div className="w-12 h-12 bg-red-100 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">관리자 계정 삭제 비밀번호 확인</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                        '{deletingAdminStaff.name}' 관리자 계정을 삭제하려면<br/>
                        해당 관리자의 비밀번호를 입력해 주세요.
                    </p>
                    <input
                        type="password"
                        value={adminPasswordInput}
                        onChange={(e) => {
                            setAdminPasswordInput(e.target.value);
                            setPasswordError('');
                        }}
                        placeholder="비밀번호 입력"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-center font-bold tracking-widest focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-slate-800 transition-all outline-none text-slate-900 dark:text-slate-100 mb-2"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleConfirmDeleteAdmin();
                            }
                        }}
                        autoFocus
                    />
                    {passwordError && (
                        <p className="text-red-500 text-xs font-bold mb-4">{passwordError}</p>
                    )}
                    <div className="flex gap-3">
                        <button
                            onClick={() => {
                                setDeletingAdminStaff(null);
                                setAdminPasswordInput('');
                                setPasswordError('');
                            }}
                            className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleConfirmDeleteAdmin}
                            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors"
                        >
                            확인
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
  );
};
