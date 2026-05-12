
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { JobStatusDefinition } from '../../types';
import { ListChecks, Save, Trash2, Plus, Edit3 } from 'lucide-react';
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
    setStatuses(db.getStatusDefinitions());
  };

  const handleLabelChange = (key: string, newLabel: string) => {
    const updated = statuses.map(s => s.key === key ? { ...s, label: newLabel } : s);
    setStatuses(updated);
  };

  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;

    const key = newStatusName.trim().toUpperCase().replace(/\s+/g, '_');
    if (statuses.some(s => s.key === key)) {
        showAlert('이미 존재하는 단계 이름입니다. 다른 이름을 사용해주세요.');
        return;
    }

    const newStatus: JobStatusDefinition = {
        key,
        label: newStatusName.trim()
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
        칸반 보드와 상황판에 표시되는 작업 단계를 편집합니다. 순서대로 표시됩니다.
      </p>

      <div className="space-y-4 mb-8">
        {statuses.map((status, index) => (
          <div key={status.key} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
            <span className="font-bold text-blue-600 dark:text-blue-400 w-6 text-center">{index + 1}</span>
            <div className="flex-1">
              <input
                type="text"
                value={status.label}
                onChange={(e) => handleLabelChange(status.key, e.target.value)}
                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium transition-colors"
              />
              <p className="text-[10px] text-slate-400 mt-1 ml-1">고유키: {status.key} (변경불가)</p>
            </div>
            <button
              onClick={() => handleDeleteStatus(status.key)}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
              title="단계 삭제"
            >
              <Trash2 size={18} />
            </button>
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
