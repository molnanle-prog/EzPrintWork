import React, { useMemo, useState } from 'react';
import { Staff, StaffLeave } from '../../types';
import { db, getErrorMessage } from '../../services/dataService';
import { X, Calendar as CalendarIcon, User, Save, Palmtree, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { findStaffForUser } from '../../utils/staffMatch';
import { listAssignedJobsOverlappingLeave } from '../../utils/leaveOverlap';
import { useDialog } from '../../contexts/DialogContext';

interface LeaveModalProps {
  onClose: () => void;
  onSave: () => void;
  staffList: Staff[];
}

export const LeaveModal: React.FC<LeaveModalProps> = ({ onClose, onSave, staffList }) => {
  const { currentUser, canAccessAdminSettings } = useAuth();
  const { showAlert } = useDialog();
  const myStaff = useMemo(
    () => findStaffForUser(staffList, currentUser),
    [staffList, currentUser]
  );

  const selectableStaff = useMemo(() => {
    const active = staffList.filter((s) => s.active && !s.isDeleted);
    if (canAccessAdminSettings) return active;
    if (myStaff) return [myStaff];
    return [];
  }, [staffList, canAccessAdminSettings, myStaff]);

  const [formData, setFormData] = useState<Partial<StaffLeave>>({
    staffId: myStaff?.id || '',
    type: '연차',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const targetStaffId = canAccessAdminSettings ? formData.staffId : myStaff?.id || '';
  const handoverJobs = useMemo(
    () =>
      listAssignedJobsOverlappingLeave(
        db.getActiveJobs(),
        staffList,
        targetStaffId || '',
        formData.startDate || '',
        formData.endDate || ''
      ),
    [staffList, targetStaffId, formData.startDate, formData.endDate]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      await showAlert('로그인이 필요합니다.');
      return;
    }

    if (!canAccessAdminSettings && !myStaff) {
      await showAlert('직원 명단에서 본인 계정을 찾을 수 없습니다. 관리자에게 직원 등록을 요청해 주세요.');
      return;
    }

    const staffId = canAccessAdminSettings ? formData.staffId : myStaff!.id;

    if (!staffId || !formData.startDate || !formData.endDate) {
      await showAlert('직원과 날짜를 모두 선택해주세요.');
      return;
    }

    if (!canAccessAdminSettings && staffId !== myStaff!.id) {
      await showAlert('본인 휴가만 등록할 수 있습니다.');
      return;
    }

    if (handoverJobs.length > 0) {
      const preview = handoverJobs
        .slice(0, 8)
        .map((job) => `• ${job.clientName ? `${job.clientName} / ` : ''}${job.title} (${job.dateLabel})`)
        .join('\n');
      const extra = handoverJobs.length > 8 ? `\n외 ${handoverJobs.length - 8}건` : '';
      await showAlert(
        `담당 작업 ${handoverJobs.length}건이 휴가와 겹칩니다.\n휴가 기간 업무는 다른 담당자에게 인계해 주세요.\n\n${preview}${extra}`
      );
    }

    const newLeave: StaffLeave = {
      id: Date.now().toString(),
      staffId,
      type: formData.type as StaffLeave['type'],
      startDate: formData.startDate,
      endDate: formData.endDate,
      reason: formData.reason,
    };

    setIsSubmitting(true);
    try {
      await db.addLeave(newLeave);
      onSave();
    } catch (error) {
      await showAlert('휴가 등록 실패: ' + getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-purple-50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Palmtree className="text-purple-600" />
            휴가/일정 등록
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="text-sm font-bold text-slate-600 mb-1 flex items-center gap-1">
              <User size={16} /> 직원 선택
            </label>
            {canAccessAdminSettings ? (
              <select
                value={formData.staffId}
                onChange={(e) => setFormData({ ...formData, staffId: e.target.value })}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-slate-900 font-medium"
                required
              >
                <option value="">직원을 선택하세요</option>
                {selectableStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full p-2.5 border border-purple-200 rounded-lg bg-purple-50 text-purple-900 font-bold">
                {myStaff?.name || '본인 계정을 찾을 수 없음'}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-bold text-slate-600 mb-1 block">종류</label>
            <div className="flex gap-2">
              {(['연차', '반차', '병가', '기타'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, type })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                            ${
                              formData.type === type
                                ? 'bg-purple-100 border-purple-300 text-purple-700 font-bold shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold text-slate-600 mb-1 flex items-center gap-1">
                <CalendarIcon size={16} /> 시작일
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-slate-900"
                required
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-600 mb-1 flex items-center gap-1">
                <CalendarIcon size={16} /> 종료일
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-slate-900"
                required
              />
            </div>
          </div>

          {handoverJobs.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 space-y-1.5">
              <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle size={14} className="shrink-0" />
                담당 작업 {handoverJobs.length}건이 휴가와 겹칩니다
              </p>
              <p className="text-[11px] leading-relaxed text-amber-800">
                휴가는 등록할 수 있습니다. 휴가 기간 업무는 작업 상세에서 담당자를 바꾼 뒤 다른 사람에게 인계해 주세요.
              </p>
              <ul className="max-h-28 overflow-y-auto space-y-1 pr-1">
                {handoverJobs.map((job) => (
                  <li key={job.id} className="text-[11px] text-amber-900 leading-snug">
                    <span className="font-bold">{job.clientName || job.title}</span>
                    {job.clientName ? ` / ${job.title}` : ''}
                    <span className="block text-amber-700">{job.dateLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="text-sm font-bold text-slate-600 mb-1 block">사유 (선택)</label>
            <input
              type="text"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="예: 개인 사정"
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-slate-900"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-slate-600 font-bold bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (!canAccessAdminSettings && !myStaff)}
              className="flex-1 py-3 text-white font-bold bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              {isSubmitting ? '등록 중...' : '등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
