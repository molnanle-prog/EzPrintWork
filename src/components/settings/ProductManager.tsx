
import React, { useState, useEffect } from 'react';
import { db, isBookletProductType, getErrorMessage } from '../../services/dataService';
import { JobTypeDefinition } from '../../types';
import { Plus, Trash2, Package, Layers, FileBox, File, Save, Check, RefreshCcw, Scissors } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';

export const ProductManager: React.FC = () => {
  const [definitions, setDefinitions] = useState<JobTypeDefinition[]>([]);
  const [selectedType, setSelectedType] = useState<JobTypeDefinition | null>(null);
  const [newTypeName, setNewTypeName] = useState('');
  
  // Inputs for sub-options
  const [newSize, setNewSize] = useState('');
  const [newPaper, setNewPaper] = useState('');
  const [newWeight, setNewWeight] = useState('');
  const [allProcessings, setAllProcessings] = useState<string[]>([]);
  const [draftProcessings, setDraftProcessings] = useState<string[]>([]);
  const [draftProcessingsCover, setDraftProcessingsCover] = useState<string[]>([]);
  const [draftProcessingsInner, setDraftProcessingsInner] = useState<string[]>([]);
  const [processingsDirty, setProcessingsDirty] = useState(false);

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

  const syncDraftProcessingsFromType = (type: JobTypeDefinition) => {
      if (isBookletProductType(type.name)) {
          const sets = db.getProductProcessingSets(type.name);
          setDraftProcessings(sets.common);
          setDraftProcessingsCover(sets.cover);
          setDraftProcessingsInner(sets.inner);
      } else {
          setDraftProcessings(type.processings || []);
          setDraftProcessingsCover([]);
          setDraftProcessingsInner([]);
      }
  };

  useEffect(() => {
      if (selectedType) {
          syncDraftProcessingsFromType(selectedType);
          setProcessingsDirty(false);
      } else {
          setDraftProcessings([]);
          setDraftProcessingsCover([]);
          setDraftProcessingsInner([]);
          setProcessingsDirty(false);
      }
  }, [selectedType?.name]);

  useEffect(() => {
      if (!processingsDirty && selectedType) {
          syncDraftProcessingsFromType(selectedType);
      }
  }, [selectedType?.processings, selectedType?.processingsCover, selectedType?.processingsInner, processingsDirty, selectedType?.name]);

  const loadData = () => {
      setDefinitions(db.getProductDefinitions());
      setAllProcessings(db.getProcessingDefinitions());
  };

  const toggleProcessingOption = (
      option: string,
      list: 'common' | 'cover' | 'inner' = 'common'
  ) => {
      const setter =
          list === 'cover'
              ? setDraftProcessingsCover
              : list === 'inner'
                ? setDraftProcessingsInner
                : setDraftProcessings;
      setter((prev) =>
          prev.includes(option) ? prev.filter((p) => p !== option) : [...prev, option]
      );
      setProcessingsDirty(true);
  };

  const handleSelectAllProcessings = (list: 'common' | 'cover' | 'inner' = 'common') => {
      const setter =
          list === 'cover'
              ? setDraftProcessingsCover
              : list === 'inner'
                ? setDraftProcessingsInner
                : setDraftProcessings;
      setter([...allProcessings]);
      setProcessingsDirty(true);
  };

  const handleClearAllProcessings = (list: 'common' | 'cover' | 'inner' = 'common') => {
      const setter =
          list === 'cover'
              ? setDraftProcessingsCover
              : list === 'inner'
                ? setDraftProcessingsInner
                : setDraftProcessings;
      setter([]);
      setProcessingsDirty(true);
  };

  const handleSaveProcessings = async () => {
      if (!selectedType) return;

      const latestDefs = db.getProductDefinitions();
      const isBooklet = isBookletProductType(selectedType.name);
      const updatedDef = isBooklet
          ? {
                ...selectedType,
                processings: draftProcessings,
                processingsCover: draftProcessingsCover,
                processingsInner: draftProcessingsInner,
            }
          : { ...selectedType, processings: draftProcessings };
      const newDefs = latestDefs.map((d) => (d.name === selectedType.name ? updatedDef : d));

      try {
          await db.saveProductDefinitions(newDefs);
          setDefinitions(newDefs);
          setSelectedType(updatedDef);
          setProcessingsDirty(false);
          const total = isBooklet
              ? draftProcessings.length + draftProcessingsCover.length + draftProcessingsInner.length
              : draftProcessings.length;
          showAlert(`'${selectedType.name}' 후가공 ${total}개가 저장되었습니다.`);
      } catch {
          showAlert('후가공 설정 저장 중 오류가 발생했습니다.');
      }
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
      if (await showConfirm(`'${name}' 작업 종류를 삭제하시겠습니까?\n\n해당 종류의 모든 하위 설정(규격, 용지 등)이 삭제됩니다.\n확인(삭제)을 누르면 즉시 저장됩니다.`)) {
          try {
              await db.deleteJobType(name);
              if (selectedType?.name === name) setSelectedType(null);
              await showAlert(`'${name}' 작업 종류가 삭제되었습니다.`);
          } catch (error) {
              await showAlert('삭제 실패: ' + getErrorMessage(error));
          }
      }
  };

  const handleRestoreDefaults = async () => {
      if (await showConfirm('기본 작업 종류(명함, 전단, 스티커 등)를 모두 복원하시겠습니까?\n현재 설정된 내용이 덮어씌워질 수 있습니다.')) {
          try {
              await db.restoreProductDefaults();
              showAlert('기본 항목들이 복원되었습니다.');
          } catch (error) {
              showAlert('복원 중 오류가 발생했습니다.');
          }
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

      if (await showConfirm(`'${value}' ${categoryName} 항목을 삭제하시겠습니까?\n\n확인(삭제)을 누르면 즉시 저장됩니다.`)) {
          const updatedDef = { ...selectedType, [category]: selectedType[category].filter(v => v !== value) };
          const newDefs = definitions.map(d => d.name === selectedType.name ? updatedDef : d);
          try {
              await db.saveProductDefinitions(newDefs);
              setSelectedType(updatedDef);
              await showAlert(`'${value}' ${categoryName} 항목이 삭제되었습니다.`);
          } catch (error) {
              await showAlert('삭제 실패: ' + getErrorMessage(error));
          }
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
         <div className="flex items-center gap-3">
             <button 
                onClick={handleRestoreDefaults}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-all border border-slate-200 dark:border-slate-600"
                title="시스템 기본 품목 목록을 불러옵니다"
             >
                <RefreshCcw size={14} />
                기본값 복원
             </button>
             <div className="text-xs text-slate-500 dark:text-slate-400">
                 * 이곳에서 추가한 항목은 작업 등록 시 즉시 반영됩니다.
             </div>
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

                      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
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

                          {/* 4. Processings */}
                          <div className={`space-y-3 ${isBookletProductType(selectedType.name) ? 'xl:col-span-4' : ''}`}>
                              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                  <Scissors size={16} className="text-blue-500"/> 후가공 설정 (Processings)
                              </h4>
                              <p className="text-[10px] text-slate-400">
                                  {isBookletProductType(selectedType.name)
                                      ? '제본·공통 / 표지 / 내지 후가공을 각각 선택한 뒤 하단 후가공 저장을 눌러 주세요.'
                                      : '여러 개를 체크한 뒤 하단 후가공 저장을 눌러 주세요.'}
                              </p>

                              {isBookletProductType(selectedType.name) ? (
                                  <div className="space-y-4">
                                      {([
                                          {
                                              key: 'common' as const,
                                              title: '제본 및 공통 후가공',
                                              draft: draftProcessings,
                                              boxClass: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700',
                                              titleClass: 'text-slate-600 dark:text-slate-300',
                                              checkedClass: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-600 text-blue-700 dark:text-blue-100',
                                          },
                                          {
                                              key: 'cover' as const,
                                              title: '표지 전용 후가공',
                                              draft: draftProcessingsCover,
                                              boxClass: 'bg-blue-50/40 dark:bg-slate-900 border-blue-100 dark:border-slate-700',
                                              titleClass: 'text-blue-600 dark:text-blue-300',
                                              checkedClass: 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-500 text-blue-800 dark:text-blue-100',
                                          },
                                          {
                                              key: 'inner' as const,
                                              title: '내지 전용 후가공',
                                              draft: draftProcessingsInner,
                                              boxClass: 'bg-emerald-50/40 dark:bg-slate-900 border-emerald-100 dark:border-slate-700',
                                              titleClass: 'text-emerald-600 dark:text-emerald-300',
                                              checkedClass: 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-100',
                                          },
                                      ]).map((section) => (
                                          <div key={section.key} className={`rounded-lg border p-3 ${section.boxClass}`}>
                                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                                  <span className={`text-xs font-bold ${section.titleClass}`}>{section.title}</span>
                                                  <div className="flex flex-wrap gap-2">
                                                      <button
                                                          type="button"
                                                          onClick={() => handleSelectAllProcessings(section.key)}
                                                          className="px-2.5 py-1 text-[11px] font-bold rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-600"
                                                      >
                                                          전체 선택
                                                      </button>
                                                      <button
                                                          type="button"
                                                          onClick={() => handleClearAllProcessings(section.key)}
                                                          className="px-2.5 py-1 text-[11px] font-bold rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
                                                      >
                                                          전체 해제
                                                      </button>
                                                      <span className="text-[11px] text-slate-500 dark:text-slate-400 self-center">
                                                          선택 {section.draft.length} / {allProcessings.length}
                                                      </span>
                                                  </div>
                                              </div>
                                              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                                                  {allProcessings.map((opt) => {
                                                      const isChecked = section.draft.includes(opt);
                                                      return (
                                                          <label
                                                              key={`${section.key}-${opt}`}
                                                              className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-xs font-medium transition-all ${isChecked ? section.checkedClass : 'bg-white dark:bg-slate-700 border-slate-100 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                                                          >
                                                              <input
                                                                  type="checkbox"
                                                                  checked={isChecked}
                                                                  onChange={() => toggleProcessingOption(opt, section.key)}
                                                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                                                              />
                                                              <span>{opt}</span>
                                                          </label>
                                                      );
                                                  })}
                                              </div>
                                          </div>
                                      ))}
                                  </div>
                              ) : (
                                  <>
                                      <div className="flex flex-wrap gap-2">
                                          <button
                                              type="button"
                                              onClick={() => handleSelectAllProcessings('common')}
                                              className="px-2.5 py-1 text-[11px] font-bold rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-600"
                                          >
                                              전체 선택
                                          </button>
                                          <button
                                              type="button"
                                              onClick={() => handleClearAllProcessings('common')}
                                              className="px-2.5 py-1 text-[11px] font-bold rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
                                          >
                                              전체 해제
                                          </button>
                                          <span className="text-[11px] text-slate-500 dark:text-slate-400 self-center">
                                              선택 {draftProcessings.length} / {allProcessings.length}
                                          </span>
                                      </div>
                                      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-60 overflow-y-auto custom-scrollbar space-y-1">
                                          {allProcessings.map(opt => {
                                              const isChecked = draftProcessings.includes(opt);
                                              return (
                                                  <label key={opt} className={`flex items-center gap-2 px-3 py-1.5 rounded border cursor-pointer text-sm font-medium transition-all ${isChecked ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-600 text-blue-700 dark:text-blue-100' : 'bg-white dark:bg-slate-700 border-slate-100 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                                      <input 
                                                          type="checkbox" 
                                                          checked={isChecked} 
                                                          onChange={() => toggleProcessingOption(opt, 'common')} 
                                                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5" 
                                                      />
                                                      <span>{opt}</span>
                                                  </label>
                                              );
                                          })}
                                      </div>
                                  </>
                              )}

                              <button
                                  type="button"
                                  onClick={handleSaveProcessings}
                                  disabled={!processingsDirty}
                                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                                      processingsDirty
                                          ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                                          : 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                                  }`}
                              >
                                  <Save size={16} />
                                  후가공 저장
                              </button>
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
