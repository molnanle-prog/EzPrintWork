
import React, { useState } from 'react';
import { AdminInstruction } from '../../types';
import { Megaphone, Trash2, Plus, AlertCircle } from 'lucide-react';
import { AdBanner } from '../common/AdBanner';

interface InstructionPanelProps {
  instructions: AdminInstruction[];
  onAdd: (content: string, important: boolean) => void;
  onDelete: (id: string) => void;
}

export const InstructionPanel: React.FC<InstructionPanelProps> = ({ instructions, onAdd, onDelete }) => {
  const [newInstruction, setNewInstruction] = useState('');
  const [isImportant, setIsImportant] = useState(false);

  const handleAdd = () => {
    if (!newInstruction.trim()) return;
    onAdd(newInstruction, isImportant);
    setNewInstruction('');
    setIsImportant(false);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-full overflow-hidden transition-colors">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-orange-50 dark:bg-orange-900/20 flex items-center gap-2">
        <Megaphone size={20} className="text-orange-600 dark:text-orange-400" />
        <h3 className="font-bold text-slate-800 dark:text-slate-100">관리자 지시사항</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
         {instructions.length === 0 && (
           <div className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">
             등록된 지시사항이 없습니다.
           </div>
         )}
         {instructions.map((inst) => (
          <div key={inst.id} className={`p-4 rounded-lg border text-sm shadow-sm relative group animate-in slide-in-from-right-2 duration-300 ${inst.important ? 'bg-white dark:bg-slate-800 border-orange-200 dark:border-orange-900 border-l-4 border-l-orange-500' : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700'}`}>
            <div className="pr-4 break-words font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
              {inst.content}
            </div>
            <div className="mt-2 text-xs text-slate-400 dark:text-slate-500 flex justify-between items-center">
               <span>{new Date(inst.date).toLocaleDateString()}</span>
               {inst.important && <span className="text-orange-500 dark:text-orange-400 font-bold">중요</span>}
            </div>
            <button 
              onClick={() => onDelete(inst.id)}
              title="지시사항 삭제"
              className="absolute top-2 right-2 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="px-3 pt-2 mb-4 flex justify-center">
        <AdBanner slot="dashboard_instruction" type="dashed" size="300x250" format="rectangle" />
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex gap-2 items-center">
          <button 
            onClick={() => setIsImportant(!isImportant)}
            className={`p-2 rounded-lg transition-colors border ${isImportant ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
            title={isImportant ? "일반 공지로 변경" : "중요 공지로 설정 (강조 표시)"}
          >
            <AlertCircle size={20} />
          </button>
          <input 
            type="text" 
            value={newInstruction}
            onChange={(e) => setNewInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="지시사항 입력..."
            className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 min-w-0 bg-white dark:bg-slate-800 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 ${isImportant ? 'border-orange-300 dark:border-orange-800 focus:ring-orange-500' : 'border-slate-300 dark:border-slate-700 focus:ring-blue-500'}`}
          />
          <button 
            onClick={handleAdd}
            title="지시사항 등록"
            className={`p-2 rounded-lg text-white transition-colors shadow-sm active:scale-95 ${isImportant ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
