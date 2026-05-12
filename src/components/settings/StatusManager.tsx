
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { JobStatusDefinition } from '../../types';
import { ListChecks, Save, Trash2, Plus, Edit3, Eye, EyeOff } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

export const StatusManager: React.FC = () => {
  const [statuses, setStatuses] = useState<JobStatusDefinition[]>([]);
  const [newStatusName, setNewStatusName] = useState('');
  const { showConfirm, showAlert } = useDialog();

  useEffect(() => {
    loadStatuses();
    const unsubscribe = db.subscribe(loadStatuses);
    return () => unsubscribe();
  }, []);

  const loadStatuses = () => {
    const raw = db.getStatusDefinitions();
    // Default visibility to true for legacy data if missing
    setStatuses(raw.map(s => ({ ...s, isVisible: s.isVisible !== false })));
  };

  const handleLabelChange = (key: string, newLabel: string) => {
    const updated = statuses.map(s => s.key === key ? { ...s, label: newLabel } : s);
    setStatuses(updated);
  };

  const handleToggleVisibility = (key: string) => {
    const visibleCount = statuses.filter(s => s.isVisible !== false).length;
    const current = statuses.find(s => s.key === key);
    
    if (current?.isVisible !== false && visibleCount <= 2) {
        showAlert('최소 2개의 단계가 칸반 보드에 표시되어야 합니다.');
        return;
    }

    const updated = statuses.map(s => s.key === key ? { ...s, isVisible: !s.isVisible } : s);
    setStatuses(updated);
  };

  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;

    const visibleCount = statuses.filter(s => s.isVisible !== false).length;
    if (visibleCount >= 7) {
        showAlert('칸반 보드는 가독성을 위해 최대 7개까지만 표시할 수 있습니다.\n기존 단계 중 하나를 숨긴 후 추가해 주세요.');
        // We can still add it, but maybe hidden? Or just limit?
        // User asked for "up to 7", implying total columns.
    }

    const key = newStatusName.trim().toUpperCase().replace(/\s+/g, '_');
    if (statuses.some(s => s.key === key)) {
        showAlert('이미 존재하는 단계 이름입니다. 다른 이름을 사용해주세요.');
        return;
    }

    const newStatus: JobStatusDefinition = {
        key,
        label: newStatusName.trim(),
        isVisible: true
    };
    db.saveStatusDefinitions([...statuses, newStatus]);
    setNewStatusName('');
  };
  
  const handleDeleteStatus = async (key: string) => {
    if (statuses.length <= 2) {
        showAlert('작업 단계는 최소 2개 이상이어야 합니다.');
        return;
    }
    if (await showConfirm(`이 작업 단계를 삭제하시겠습니까?\n이 단계에 있던 작업들은 이전 단계로 이동해야 할 수 있습니다.`)) {
        db.saveStatusDefinitions(statuses.filter(s => s.key !== key));
    }
  };

  const handleSave = () => {
    // Basic validation
    if (statuses.some(s => !s.label.trim())) {
        showAlert('단계 이름은 비워둘 수 없습니다.');
        return;
    }
    db.saveStatusDefinitions(statuses);
    showAlert('작업 단계가 저장되었습니다.');
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-2xl transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
        <ListChecks className="text-blue-600 dark:text-blue-400" />
        작업 단계(칸반) 관리
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        칸반 보드에 표시될 단계와 이름을 편집합니다. 최대 7개까지 표시 가능합니다.
      </p>

      <div className="space-y-4 mb-8">
        {statuses.map((status, index) => (
          <div key={status.key} className={`flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 border rounded-lg transition-all ${status.isVisible !== false ? 'border-slate-200 dark:border-slate-700' : 'border-slate-100 dark:border-slate-800 opacity-60'}`}>
            <span className="font-bold text-blue-600 dark:text-blue-400 w-6 text-center">{index + 1}</span>
            <div className="flex-1">
              <input
                type="text"
                value={status.label}
                onChange={(e) => handleLabelChange(status.key, e.target.value)}
                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium transition-colors"
                placeholder="단계 이름"
              />
              <p className="text-[10px] text-slate-400 mt-1 ml-1 flex items-center gap-2">
                고유키: {status.key} 
                {status.isVisible === false && <span className="text-orange-500 font-bold">(칸반 보드에서 숨겨짐)</span>}
              </p>
            </div>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => handleToggleVisibility(status.key)}
                    className={`p-2 rounded-md transition-colors ${status.isVisible !== false ? 'text-blue-500 hover:bg-blue-50' : 'text-slate-400 hover:bg-slate-200'}`}
                    title={status.isVisible !== false ? "칸반에서 숨기기" : "칸반에 표시하기"}
                >
                    {status.isVisible !== false ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
                <button
                onClick={() => handleDeleteStatus(status.key)}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                title="단계 삭제"
                >
                <Trash2 size={18} />
                </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-8 p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
         <input 
            placeholder="새 단계 이름 (예: 시안확인)"
            value={newStatusName}
            onChange={e => setNewStatusName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
            className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded text-sm min-w-[120px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
         />
         <button onClick={handleAddStatus} className="bg-slate-700 dark:bg-slate-600 text-white p-2 rounded hover:bg-slate-800 dark:hover:bg-slate-500 flex items-center gap-1 px-4 text-sm font-bold">
             <Plus size={16} /> 추가
         </button>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 shadow-md transition-colors"
        >
          <Save size={18} />
          변경사항 저장
        </button>
      </div>
    </div>
  );
};
