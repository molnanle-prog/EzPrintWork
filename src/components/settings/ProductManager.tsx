
import React, { useState, useEffect } from 'react';
import { db } from '../../services/dataService';
import { JobTypeDefinition } from '../../types';
import { Plus, Trash2, Package, Layers, FileBox, File, Save, Check } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

export const ProductManager: React.FC = () => {
  const [definitions, setDefinitions] = useState<JobTypeDefinition[]>([]);
  const [selectedType, setSelectedType] = useState<JobTypeDefinition | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  
  // Inputs for sub-options
  const [newSize, setNewSize] = useState('');
  const [newPaper, setNewPaper] = useState('');
  const [newWeight, setNewWeight] = useState('');

  const { showConfirm, showAlert } = useDialog();

  useEffect(() => {
    loadData();
    const unsubscribe = db.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
      // Keep selected type synced with updates
      if (selectedType) {
          const updated = definitions.find(d => d.name === selectedType.name);
          if (updated) setSelectedType(updated);
          else setSelectedType(null); // Type was deleted
      } else if (definitions.length > 0 && !selectedType) {
          // Select first by default if none selected
          setSelectedType(definitions[0]);
      }
  }, [definitions]);

  const loadData = () => {
      setDefinitions(db.getProductDefinitions());
  };

  // --- Type Management ---

  const handleAddType = () => {
      if (!newTypeName.trim()) return;
      if (definitions.find(d => d.name === newTypeName)) {
          showAlert('이미 존재하는 작업 종류입니다.');
          return;
      }
      const newDef: JobTypeDefinition = {
          name: newTypeName,
          sizes: ['규격외'],
          paperTypes: ['기본'],
          paperWeights: ['기본']
      };
      db.saveProductDefinitions([...definitions, newDef]);
      setNewTypeName('');
      setSelectedType(newDef);
  };

  const handleDeleteType = async (name: string) => {
      if (await showConfirm(`'${name}' 작업 종류를 삭제하시겠습니까?\n해당 종류의 모든 하위 설정(규격, 용지 등)이 삭제됩니다.`)) {
          db.deleteJobType(name);
      }
  };

  // --- Option Management ---

  const handleAddOption = (category: 'sizes' | 'paperTypes' | 'paperWeights', value: string, setter: (v: string) => void) => {
      if (!selectedType || !value.trim()) return;
      
      let finalValue = value.trim();

      // Auto-append logic
      if (category === 'sizes') {
          // If purely numbers (e.g. "50") -> "50mm"
          if (/^\d+$/.test(finalValue)) {
              finalValue += 'mm';
          } 
          // If dimensions like "90x50" or "90 50" -> "90x50mm"
          else if (/^\d+\s*[xX*]\s*\d+$/.test(finalValue)) {
              finalValue = finalValue.replace(/\s+/g, '') + 'mm'; // Remove spaces if any
          }
      } else if (category === 'paperWeights') {
          // If purely numbers (e.g. "250") -> "250g"
          if (/^\d+$/.test(finalValue)) {
              finalValue += 'g';
          }
      }

      if (selectedType[category].includes(finalValue)) {
          setter(''); 
          return;
      }

      const updatedDef = { ...selectedType, [category]: [...selectedType[category], finalValue] };
      const newDefs = definitions.map(d => d.name === selectedType.name ? updatedDef : d);
      db.saveProductDefinitions(newDefs);
      setter('');
  };

  const handleDeleteOption = async (category: 'sizes' | 'paperTypes' | 'paperWeights', value: string) => {
      if (!selectedType) return;

      const categoryName = category === 'sizes' ? '규격' : category === 'paperTypes' ? '용지' : '평량';

      if (await showConfirm(`'${value}' ${categoryName} 항목을 삭제하시겠습니까?`)) {
          const updatedDef = { ...selectedType, [category]: selectedType[category].filter(v => v !== value) };
          const newDefs = definitions.map(d => d.name === selectedType.name ? updatedDef : d);
          db.saveProductDefinitions(newDefs);
      }
  };

  const inputClass = "flex-1 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 placeholder-slate-400";
  const btnClass = "bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 p-2 rounded transition-colors";

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between flex-none transition-colors">
         <div className="flex items-center gap-2">
            <Package className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">상품 및 품목 관리</h3>
         </div>
         <div className="text-xs text-slate-500 dark:text-slate-400">
             * 이곳에서 추가한 항목은 작업 등록 시 즉시 반영됩니다.
         </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
          {/* Left: Job Types List */}
          <div className="w-1/3 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
              <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex gap-2">
                      <input 
                          value={newTypeName}
                          onChange={(e) => setNewTypeName(e.target.value)}
                          placeholder="새 품목명 (예: 전단지)"
                          className={inputClass}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
                      />
                      <button onClick={handleAddType} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition-colors">
                          <Plus size={18} />
                      </button>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {definitions.map(def => (
                      <div 
                          key={def.name}
                          onClick={() => setSelectedType(def)}
                          className={`flex justify-between items-center p-3 rounded-lg cursor-pointer transition-colors group ${
                              selectedType?.name === def.name 
                              ? 'bg-white dark:bg-slate-700 shadow-md border-l-4 border-l-blue-600' 
                              : 'hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm'
                          }`}
                      >
                          <span className={`font-bold ${selectedType?.name === def.name ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}>
                              {def.name}
                          </span>
                          <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteType(def.name); }}
                              className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                          >
                              <Trash2 size={16} />
                          </button>
                      </div>
                  ))}
              </div>
          </div>

          {/* Right: Detailed Options */}
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 transition-colors">
              {selectedType ? (
                  <div className="flex-1 overflow-y-auto p-6">
                      <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-100 dark:border-slate-700">
                          <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{selectedType.name}</span>
                          <span className="text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">하위 옵션 설정</span>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                          {/* 1. Sizes */}
                          <div className="space-y-3">
                              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                  <FileBox size={16} className="text-blue-500"/> 규격 (Sizes)
                              </h4>
                              <div className="flex gap-2">
                                  <input 
                                      value={newSize} 
                                      onChange={(e) => setNewSize(e.target.value)}
                                      className={inputClass}
                                      placeholder="예: 90 50 (자동 mm)"
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddOption('sizes', newSize, setNewSize)}
                                  />
                                  <button onClick={() => handleAddOption('sizes', newSize, setNewSize)} className={btnClass}>
                                      <Plus size={16} />
                                  </button>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                  {selectedType.sizes.map(opt => (
                                      <div key={opt} className="flex justify-between items-center bg-white dark:bg-slate-700 px-3 py-2 rounded border border-slate-100 dark:border-slate-600 shadow-sm text-sm group text-slate-700 dark:text-slate-200 font-medium transition-colors">
                                          <span>{opt}</span>
                                          <button onClick={() => handleDeleteOption('sizes', opt)} className="text-slate-300 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <X size={14} />
                                          </button>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          {/* 2. Paper Types */}
                          <div className="space-y-3">
                              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                  <File size={16} className="text-emerald-500"/> 용지 종류 (Papers)
                              </h4>
                              <div className="flex gap-2">
                                  <input 
                                      value={newPaper} 
                                      onChange={(e) => setNewPaper(e.target.value)}
                                      className={inputClass}
                                      placeholder="새 용지 추가"
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddOption('paperTypes', newPaper, setNewPaper)}
                                  />
                                  <button onClick={() => handleAddOption('paperTypes', newPaper, setNewPaper)} className={btnClass}>
                                      <Plus size={16} />
                                  </button>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                  {selectedType.paperTypes.map(opt => (
                                      <div key={opt} className="flex justify-between items-center bg-white dark:bg-slate-700 px-3 py-2 rounded border border-slate-100 dark:border-slate-600 shadow-sm text-sm group text-slate-700 dark:text-slate-200 font-medium transition-colors">
                                          <span>{opt}</span>
                                          <button onClick={() => handleDeleteOption('paperTypes', opt)} className="text-slate-300 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <X size={14} />
                                          </button>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          {/* 3. Weights */}
                          <div className="space-y-3">
                              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                  <Layers size={16} className="text-purple-500"/> 평량/두께 (Weights)
                              </h4>
                              <div className="flex gap-2">
                                  <input 
                                      value={newWeight} 
                                      onChange={(e) => setNewWeight(e.target.value)}
                                      className={inputClass}
                                      placeholder="예: 250 (자동 g)"
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddOption('paperWeights', newWeight, setNewWeight)}
                                  />
                                  <button onClick={() => handleAddOption('paperWeights', newWeight, setNewWeight)} className={btnClass}>
                                      <Plus size={16} />
                                  </button>
                              </div>
                              <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                  {selectedType.paperWeights.map(opt => (
                                      <div key={opt} className="flex justify-between items-center bg-white dark:bg-slate-700 px-3 py-2 rounded border border-slate-100 dark:border-slate-600 shadow-sm text-sm group text-slate-700 dark:text-slate-200 font-medium transition-colors">
                                          <span>{opt}</span>
                                          <button onClick={() => handleDeleteOption('paperWeights', opt)} className="text-slate-300 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <X size={14} />
                                          </button>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </div>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                      <Package size={48} className="mb-4 opacity-50" />
                      <p>좌측에서 작업 종류를 선택하거나 새로 추가하세요.</p>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};

// Internal icon import since X is generic
const X = ({size}: {size:number}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
)
