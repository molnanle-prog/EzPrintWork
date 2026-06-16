import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { Scissors, Save, Trash2, Plus } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

export const ProcessingManager: React.FC = () => {
  const [processingOptions, setProcessingOptions] = useState<string[]>([]);
  const [newOptionName, setNewOptionName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { showConfirm, showAlert } = useDialog();

  useEffect(() => {
    loadOptions();
    const unsubscribe = db.subscribe(loadOptions);
    return () => unsubscribe();
  }, []);

  const loadOptions = () => {
    const raw = db.getProcessingDefinitions();
    setProcessingOptions(raw);
  };

  const handleOptionNameChange = (index: number, newName: string) => {
    const updated = [...processingOptions];
    updated[index] = newName;
    setProcessingOptions(updated);
  };

  const handleAddOption = async () => {
    const trimmed = newOptionName.trim();
    if (!trimmed) return;

    if (processingOptions.includes(trimmed)) {
        await showAlert('이미 존재하는 후가공 항목입니다. 다른 이름을 사용해주세요.');
        return;
    }

    const updated = [...processingOptions, trimmed];
    try {
        await db.saveProcessingDefinitions(updated);
        setProcessingOptions(updated);
        setNewOptionName('');
        await showAlert(`'${trimmed}' 후가공 항목이 추가되었습니다.`);
    } catch (error) {
        await showAlert('추가 실패: ' + getErrorMessage(error));
    }
  };
  
  const handleDeleteOption = async (index: number) => {
    if (processingOptions.length <= 1) {
        await showAlert('후가공 항목은 최소 1개 이상이어야 합니다.');
        return;
    }

    const option = processingOptions[index];
    if (!option) return;

    const confirmed = await showConfirm(
        `[후가공 삭제]\n\n` +
        `'${option}' 항목을 완전히 삭제하시겠습니까?\n\n` +
        `• 기존 주문에 등록된 후가공 텍스트는 보존됩니다.\n` +
        `• 등록창 선택 목록에서만 사라집니다.\n` +
        `• 확인(삭제)을 누르면 즉시 저장됩니다.`
    );
    if (!confirmed) return;

    const updated = processingOptions.filter((_, i) => i !== index);

    try {
        await db.saveProcessingDefinitions(updated);
        setProcessingOptions(updated);
        await showAlert(`'${option}' 후가공 항목이 삭제되었습니다.`);
    } catch (error) {
        await showAlert('삭제 실패: ' + getErrorMessage(error));
    }
  };

  const handleSave = async () => {
    if (processingOptions.some(o => !o.trim())) {
        await showAlert('후가공 이름은 비워둘 수 없습니다.');
        return;
    }
    const duplicates = processingOptions.filter((item, index) => processingOptions.indexOf(item) !== index);
    if (duplicates.length > 0) {
        await showAlert(`중복된 후가공 이름이 있습니다: ${duplicates.join(', ')}`);
        return;
    }

    setIsSaving(true);
    try {
        await db.saveProcessingDefinitions(processingOptions);
        await showAlert('후가공 항목 목록이 정상적으로 저장되었습니다.');
    } catch (error) {
        await showAlert('저장 실패: ' + getErrorMessage(error));
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-2xl transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
        <Scissors className="text-blue-600 dark:text-blue-400" />
        마스터 후가공 관리
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        주문 사양 등록창에 나타날 마스터 후가공 옵션 목록을 추가하거나 삭제합니다. 삭제 시 확인 후 즉시 저장됩니다.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
        {processingOptions.map((option, index) => (
          <div key={`${index}-${option}`} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
            <span className="font-bold text-blue-600 dark:text-blue-400 w-5 text-center text-xs">{index + 1}</span>
            <input
              type="text"
              value={option}
              onChange={(e) => handleOptionNameChange(index, e.target.value)}
              className="flex-1 p-1.5 border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold text-xs transition-colors"
              placeholder="후가공 항목 이름"
            />
            <button
              type="button"
              onClick={() => handleDeleteOption(index)}
              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors shrink-0"
              title="후가공 삭제"
              disabled={processingOptions.length <= 1}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-8 p-4 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-600">
         <input 
            placeholder="새 후가공 이름 (예: 무공코팅, 별색박)"
            value={newOptionName}
            onChange={e => setNewOptionName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddOption()}
            className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
         />
         <button type="button" onClick={handleAddOption} className="bg-slate-700 dark:bg-slate-600 text-white p-2 rounded hover:bg-slate-800 dark:hover:bg-slate-500 flex items-center gap-1 px-4 text-sm font-bold shrink-0">
             <Plus size={16} /> 추가
         </button>
      </div>

      <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 shadow-md transition-colors disabled:opacity-50"
        >
          <Save size={18} />
          {isSaving ? '저장 중...' : '변경사항 저장'}
        </button>
      </div>
    </div>
  );
};
