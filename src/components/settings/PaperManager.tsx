
import React, { useState, useEffect } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { PaperStock } from '../../types';
import { Plus, Trash2, Save, ScrollText } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

export const PaperManager: React.FC = () => {
  const [papers, setPapers] = useState<PaperStock[]>([]);
  const [newPaper, setNewPaper] = useState<Partial<PaperStock>>({
      name: '', weight: '', type: '국전', unitPrice: 0, stockLevel: 'medium'
  });
  const { showConfirm, showAlert } = useDialog();

  const loadPapers = () => {
      setPapers(db.getPapers());
  };

  useEffect(() => {
    db.ensurePapersSync();
    loadPapers();
    // Subscribe to DB changes
    const unsubscribe = db.subscribe(() => {
        loadPapers();
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async () => {
    if (!newPaper.name || !newPaper.weight) return;
    const item: Partial<PaperStock> = {
        name: newPaper.name,
        weight: newPaper.weight,
        type: newPaper.type || '국전',
        unitPrice: Number(newPaper.unitPrice),
        stockLevel: newPaper.stockLevel as any || 'medium'
    };
    try {
        await db.addPaper(item);
        setNewPaper({ name: '', weight: '', type: '국전', unitPrice: 0, stockLevel: 'medium' });
    } catch (error) {
        showAlert(getErrorMessage(error));
    }
  };

  const handleDelete = async (id: string) => {
    if(await showConfirm('이 용지를 삭제하시겠습니까?')) {
        try {
            await db.deletePaper(id);
        } catch (error) {
            showAlert(getErrorMessage(error));
        }
    }
  };

  const inputClass = "p-2 border border-slate-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400";

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
         <ScrollText className="text-blue-600 dark:text-blue-400" />
         용지 재고 및 단가 관리
      </h3>

      {/* Add New */}
      <div className="flex flex-wrap gap-2 mb-6 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors">
         <input 
            placeholder="용지명 (예: 스노우지)"
            value={newPaper.name}
            onChange={e => setNewPaper({...newPaper, name: e.target.value})}
            className={`${inputClass} flex-1 min-w-[120px]`}
         />
         <input 
            placeholder="평량 (예: 250g)"
            value={newPaper.weight}
            onChange={e => setNewPaper({...newPaper, weight: e.target.value})}
            className={`${inputClass} w-24`}
         />
         <select
            value={newPaper.type}
            onChange={e => setNewPaper({...newPaper, type: e.target.value})}
            className={`${inputClass} w-24`}
         >
             <option value="국전">국전</option>
             <option value="46전">46전</option>
         </select>
         <input 
            type="number"
            placeholder="고시가"
            value={newPaper.unitPrice || ''}
            onChange={e => setNewPaper({...newPaper, unitPrice: Number(e.target.value)})}
            className={`${inputClass} w-24`}
         />
         <button onClick={handleAdd} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition-colors">
             <Plus size={20} />
         </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
           <thead className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
              <tr>
                 <th className="p-3">용지명</th>
                 <th className="p-3">평량</th>
                 <th className="p-3">규격</th>
                 <th className="p-3">기준단가</th>
                 <th className="p-3 text-right">관리</th>
              </tr>
           </thead>
           <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {papers.map(p => (
                  <tr key={p.id} className="text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="p-3 font-bold text-slate-700 dark:text-slate-200">{p.name}</td>
                      <td className="p-3">{p.weight}</td>
                      <td className="p-3">{p.type}</td>
                      <td className="p-3">{p.unitPrice}원</td>
                      <td className="p-3 text-right">
                          <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                             <Trash2 size={16} />
                          </button>
                      </td>
                  </tr>
              ))}
           </tbody>
        </table>
      </div>
    </div>
  );
};
