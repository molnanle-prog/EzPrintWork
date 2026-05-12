import React, { useState } from 'react';
import { Staff, StaffLeave } from '../../types';
import { db } from '../../services/dataService';
import { X, Calendar as CalendarIcon, User, Save, Palmtree } from 'lucide-react';

interface LeaveModalProps {
  onClose: () => void;
  onSave: () => void;
  staffList: Staff[];
}

export const LeaveModal: React.FC<LeaveModalProps> = ({ onClose, onSave, staffList }) => {
  const [formData, setFormData] = useState<Partial<StaffLeave>>({
    staffId: '',
    type: '연차',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.staffId || !formData.startDate || !formData.endDate) {
      alert('직원과 날짜를 모두 선택해주세요.');
      return;
    }

    const newLeave: StaffLeave = {
      id: Date.now().toString(),
      staffId: formData.staffId,
      type: formData.type as any,
      startDate: formData.startDate,
      endDate: formData.endDate,
      reason: formData.reason
    };

    db.addLeave(newLeave);
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-purple-50">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Palmtree className="text-purple-600" />
            휴가/일정 등록
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={24} className="text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-bold text-slate-600 mb-1 flex items-center gap-1">
              <User size={16} /> 직원 선택
            </label>
            <select
              value={formData.staffId}
              onChange={(e) => setFormData({...formData, staffId: e.target.value})}
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white text-slate-900 font-medium"
              required
            >
              <option value="">직원을 선택하세요</option>
              {staffList.filter(s => s.active && !s.isDeleted).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
          </div>

          <div>
             <label className="text-sm font-bold text-slate-600 mb-1 block">종류</label>
             <div className="flex gap-2">
                {['연차', '반차', '병가', '기타'].map(type => (
                    <button
                        key={type}
                        type="button"
                        onClick={() => setFormData({...formData, type: type as any})}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                            ${formData.type === type 
                                ? 'bg-purple-100 border-purple-300 text-purple-700 font-bold shadow-sm' 
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}
                        `}
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
                onChange={(e) => setFormData({...formData, startDate: e.target.value})}
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
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 text-slate-900"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-bold text-slate-600 mb-1 block">사유 (선택)</label>
            <input
              type="text"
              value={formData.reason}
              onChange={(e) => setFormData({...formData, reason: e.target.value})}
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
                className="flex-1 py-3 text-white font-bold bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2"
             >
                <Save size={18} />
                등록하기
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};