
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, isBookletProductType, getErrorMessage } from '../../services/dataService';
import { JobTypeDefinition } from '../../types';
import { Plus, Trash2, Package, Layers, FileBox, File, Save, Check, RefreshCcw, Scissors, X, GitMerge } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { getProductMergePreview, mergeProducts } from '../../utils/productMerge';

function focusRequiredInput(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  input.select();
}

export const ProductManager: React.FC = () => {
  const { canManageProductProcessing } = useAuth();
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
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergePickNames, setMergePickNames] = useState<string[]>([]);
  const [mergePrimaryName, setMergePrimaryName] = useState<string | null>(null);
  const [mergeSearchQuery, setMergeSearchQuery] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const newTypeInputRef = useRef<HTMLInputElement>(null);
  const newSizeInputRef = useRef<HTMLInputElement>(null);
  const newPaperInputRef = useRef<HTMLInputElement>(null);
  const newWeightInputRef = useRef<HTMLInputElement>(null);

  const { showConfirm, showAlert } = useDialog();

  const ensureCanEdit = async () => {
      if (canManageProductProcessing) return true;
      await showAlert(
          '상품 추가/수정 권한이 아직 준비되지 않았거나 없습니다.\n메인·사내 관리자로 다시 로그인한 뒤 시도해 주세요.'
      );
      return false;
  };

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
      if (!(await ensureCanEdit())) return;

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

  const handleAddType = async () => {
      if (!(await ensureCanEdit())) return;
      const trimmed = newTypeName.trim();
      if (!trimmed) {
          await showAlert('필수 입력 항목입니다.\n새 품목명을 입력해 주세요.');
          focusRequiredInput(newTypeInputRef.current);
          return;
      }
      const latestDefs = db.getProductDefinitions();
      if (latestDefs.find(d => d.name === trimmed)) {
          await showAlert('이미 존재하는 작업 종류입니다.\n다른 품목명을 입력해 주세요.');
          focusRequiredInput(newTypeInputRef.current);
          return;
      }
      const newDef: JobTypeDefinition = {
          name: trimmed,
          sizes: ['규격외'],
          paperTypes: ['기본'],
          paperWeights: ['기본']
      };
      const newDefs = [...latestDefs, newDef];
      try {
          await db.saveProductDefinitions(newDefs);
          setDefinitions(db.getProductDefinitions());
          setNewTypeName('');
          setSelectedType(newDef);
          await showAlert(`'${trimmed}' 품목이 추가되었습니다.`);
      } catch (error) {
          await showAlert('품목 추가 실패: ' + getErrorMessage(error));
          focusRequiredInput(newTypeInputRef.current);
      }
  };

  const handleDeleteType = async (name: string) => {
      if (!(await ensureCanEdit())) return;
      if (
          await showConfirm(
              `'${name}' 작업 종류를 삭제하시겠습니까?\n\n` +
                  `• 규격·용지 등 하위 설정이 삭제됩니다.\n` +
                  `• 이미 등록된 작업의 품목명은 그대로 남습니다.\n` +
                  `• 중복 품목을 하나로 모으려면 삭제가 아니라 「상품 합치기」를 사용하세요.\n\n` +
                  `확인(삭제)을 누르면 즉시 저장됩니다.`
          )
      ) {
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
      if (!(await ensureCanEdit())) return;
      if (await showConfirm('기본 작업 종류(명함, 전단, 스티커 등)를 모두 복원하시겠습니까?\n현재 설정된 내용이 덮어씌워질 수 있습니다.')) {
          try {
              await db.restoreProductDefaults();
              showAlert('기본 항목들이 복원되었습니다.');
          } catch (error) {
              showAlert('복원 중 오류가 발생했습니다.');
          }
      }
  };

  const openMergeModal = async () => {
      if (!(await ensureCanEdit())) return;
      if (definitions.length < 2) {
          await showAlert('합치려면 품목이 2개 이상 있어야 합니다.');
          return;
      }
      setMergePickNames([]);
      setMergePrimaryName(null);
      setMergeSearchQuery('');
      setIsMergeModalOpen(true);
  };

  const toggleMergePick = (name: string) => {
      setMergePickNames((prev) => {
          if (prev.includes(name)) {
              const next = prev.filter((n) => n !== name);
              if (mergePrimaryName === name) setMergePrimaryName(next[0] || null);
              return next;
          }
          if (prev.length >= 2) {
              const next = [prev[1], name];
              setMergePrimaryName((current) => (current && next.includes(current) ? current : next[0]));
              return next;
          }
          const next = [...prev, name];
          if (next.length === 1) setMergePrimaryName(name);
          if (next.length === 2 && !mergePrimaryName) setMergePrimaryName(next[0]);
          return next;
      });
  };

  const mergeSelectedDefs = useMemo(
      () => definitions.filter((d) => mergePickNames.includes(d.name)),
      [definitions, mergePickNames]
  );

  const mergeFilteredDefs = useMemo(() => {
      const q = mergeSearchQuery.trim().toLowerCase();
      if (!q) return definitions;
      return definitions.filter((d) => d.name.toLowerCase().includes(q));
  }, [definitions, mergeSearchQuery]);

  const handleMergeProducts = async () => {
      if (!(await ensureCanEdit())) return;
      if (mergePickNames.length !== 2 || !mergePrimaryName) {
          await showAlert('합칠 품목 2개와 유지할 품목명을 선택해 주세요.');
          return;
      }
      const secondaryName = mergePickNames.find((n) => n !== mergePrimaryName);
      if (!secondaryName) return;

      const preview = getProductMergePreview(mergePrimaryName, secondaryName);
      const confirmed = await showConfirm(
          `[상품 합치기]\n\n` +
              `유지(최종명): '${mergePrimaryName}'\n` +
              `합쳐질 쪽: '${secondaryName}' → 목록에서 제거\n\n` +
              `• 작업 ${preview.jobsAffected}건의 품목명을 '${mergePrimaryName}'으로 변경\n` +
              `• 규격·용지·평량·후가공 옵션은 합집합으로 유지 품목에 합침\n` +
              `• 견적서 품목명은 변경하지 않음 (재출력 시 예전과 동일, ${preview.quoteLinesKept}라인 유지)\n\n` +
              `※ 일반 추가/등록 시에는 절대 자동으로 합치지 않습니다.\n` +
              `※ 이 작업은 되돌릴 수 없습니다. 진행하시겠습니까?`
      );
      if (!confirmed) return;

      setIsMerging(true);
      try {
          const result = await mergeProducts(mergePrimaryName, secondaryName);
          setDefinitions(db.getProductDefinitions());
          setSelectedType(db.getProductDefinitions().find((d) => d.name === mergePrimaryName) || null);
          setIsMergeModalOpen(false);
          setMergePickNames([]);
          setMergePrimaryName(null);
          await showAlert(
              `상품 합치기가 완료되었습니다.\n\n` +
                  `• 유지 품목: ${result.primaryName}\n` +
                  `• 작업 ${result.jobsAffected}건 품목명 통합\n` +
                  `• 견적 ${result.quoteLinesKept}라인은 당시 이름 유지\n` +
                  `• '${result.secondaryName}' 품목은 목록에서 제거됨`
          );
      } catch (error) {
          await showAlert('합치기 실패: ' + getErrorMessage(error));
      } finally {
          setIsMerging(false);
      }
  };

  // --- Option Management ---

  const getOptionInputRef = (category: 'sizes' | 'paperTypes' | 'paperWeights') => {
      if (category === 'sizes') return newSizeInputRef;
      if (category === 'paperTypes') return newPaperInputRef;
      return newWeightInputRef;
  };

  const handleAddOption = async (category: 'sizes' | 'paperTypes' | 'paperWeights', value: string, setter: (v: string) => void) => {
      if (!selectedType) return;
      if (!(await ensureCanEdit())) return;

      const categoryName = category === 'sizes' ? '규격' : category === 'paperTypes' ? '용지' : '평량';
      const inputRef = getOptionInputRef(category);

      if (!value.trim()) {
          await showAlert(`필수 입력 항목입니다.\n${categoryName} 값을 입력해 주세요.`);
          focusRequiredInput(inputRef.current);
          return;
      }
      
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

      const latestDefs = db.getProductDefinitions();
      const currentType = latestDefs.find((d) => d.name === selectedType.name);
      if (!currentType) return;

      if (currentType[category].includes(finalValue)) {
          await showAlert(`이미 존재하는 ${categoryName}입니다.\n다른 값을 입력해 주세요.`);
          focusRequiredInput(inputRef.current);
          return;
      }

      const updatedDef = { ...currentType, [category]: [...currentType[category], finalValue] };
      const newDefs = latestDefs.map(d => d.name === selectedType.name ? updatedDef : d);
      try {
          await db.saveProductDefinitions(newDefs);
          const refreshed = db.getProductDefinitions();
          setDefinitions(refreshed);
          const nextSelected = refreshed.find((d) => d.name === selectedType.name) || updatedDef;
          setSelectedType(nextSelected);
          setter('');
      } catch (error) {
          await showAlert('옵션 추가 실패: ' + getErrorMessage(error));
          focusRequiredInput(inputRef.current);
      }
  };

  const handleDeleteOption = async (category: 'sizes' | 'paperTypes' | 'paperWeights', value: string) => {
      if (!selectedType) return;

      const categoryName = category === 'sizes' ? '규격' : category === 'paperTypes' ? '용지' : '평량';

      if (await showConfirm(`'${value}' ${categoryName} 항목을 삭제하시겠습니까?\n\n확인(삭제)을 누르면 즉시 저장됩니다.`)) {
          const latestDefs = db.getProductDefinitions();
          const currentType = latestDefs.find((d) => d.name === selectedType.name);
          if (!currentType) return;

          const updatedDef = { ...currentType, [category]: currentType[category].filter(v => v !== value) };
          const newDefs = latestDefs.map(d => d.name === selectedType.name ? updatedDef : d);
          try {
              await db.saveProductDefinitions(newDefs);
              setDefinitions(newDefs);
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
                type="button"
                onClick={openMergeModal}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded-lg text-xs font-bold transition-all border border-amber-200 dark:border-amber-800"
                title="중복 품목을 하나로 합칩니다 (자동 합치기 아님)"
             >
                <GitMerge size={14} />
                상품 합치기
             </button>
             <button 
                onClick={handleRestoreDefaults}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-all border border-slate-200 dark:border-slate-600"
                title="시스템 기본 품목 목록을 불러옵니다"
             >
                <RefreshCcw size={14} />
                기본값 복원
             </button>
             <div className="text-xs text-slate-500 dark:text-slate-400">
                 * 추가한 품목명은 자동으로 합쳐지지 않습니다. 중복만 「상품 합치기」로 처리하세요.
             </div>
         </div>
      </div>

      {!canManageProductProcessing && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold flex-none">
          상품 추가/수정 권한이 확인되지 않았습니다. 메인·사내 관리자로 다시 로그인하거나 잠시 후 다시 시도해 주세요.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
          {/* Left: Job Types List */}
          <div className="w-1/3 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
              <div className="px-2 py-1.5 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex gap-1.5">
                      <input 
                          ref={newTypeInputRef}
                          value={newTypeName}
                          onChange={(e) => setNewTypeName(e.target.value)}
                          placeholder="새 품목명 (예: 전단지)"
                          className="flex-1 py-1 px-2 text-xs border border-slate-300 dark:border-slate-600 rounded focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 placeholder-slate-400"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddType()}
                      />
                      <button onClick={handleAddType} className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700 transition-colors">
                          <Plus size={16} />
                      </button>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {definitions.map(def => (
                      <div 
                          key={def.name}
                          onClick={() => setSelectedType(def)}
                          className={`flex justify-between items-center px-2.5 py-1.5 rounded-md cursor-pointer transition-colors group ${
                              selectedType?.name === def.name 
                              ? 'bg-white dark:bg-slate-700 shadow-sm border-l-4 border-l-blue-600' 
                              : 'hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm'
                          }`}
                      >
                          <span className={`text-sm font-bold ${selectedType?.name === def.name ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}>
                              {def.name}
                          </span>
                          <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteType(def.name); }}
                              className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                          >
                              <Trash2 size={14} />
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
                                      ref={newSizeInputRef}
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
                                      ref={newPaperInputRef}
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
                                      ref={newWeightInputRef}
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
                                      ? '제본·공통 / 표지 / 내지 후가공을 각각 선택한 뒤 하단 후가공 저장을 눌러 주세요. (목록에 없으면 「후가공 관리」에서 먼저 추가)'
                                      : '여러 개를 체크한 뒤 하단 후가공 저장을 눌러 주세요. (목록에 없으면 「후가공 관리」에서 먼저 추가)'}
                              </p>

                              {isBookletProductType(selectedType.name) ? (
                                  <div className="space-y-4">
                                      {([
                                          {
                                              key: 'common' as const,
                                              title: '제본 및 공통 후가공',
                                              draft: draftProcessings,
                                              boxClass: 'rounded-lg border-2 border-slate-400 bg-[#e2e8f0] booklet-processing-common-box',
                                              titleClass: 'text-[#0f172a] booklet-processing-section-title',
                                              checkedClass: 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-600 text-blue-700 dark:text-blue-100',
                                          },
                                          {
                                              key: 'cover' as const,
                                              title: '표지 전용 후가공',
                                              draft: draftProcessingsCover,
                                              boxClass: 'rounded-lg border-2 border-blue-500 bg-[#bfdbfe] booklet-processing-cover-box',
                                              titleClass: 'text-[#1e3a8a] booklet-processing-cover-title',
                                              checkedClass: 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-500 text-blue-800 dark:text-blue-100',
                                          },
                                          {
                                              key: 'inner' as const,
                                              title: '내지 전용 후가공',
                                              draft: draftProcessingsInner,
                                              boxClass: 'rounded-lg border-2 border-emerald-500 bg-[#a7f3d0] booklet-processing-inner-box',
                                              titleClass: 'text-[#14532d] booklet-processing-inner-title',
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
                                              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5 max-h-[22rem] overflow-y-auto custom-scrollbar">
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
                                      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-[28rem] overflow-y-auto custom-scrollbar space-y-1">
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

      {isMergeModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-start bg-slate-50 dark:bg-slate-900">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <GitMerge className="text-amber-600 dark:text-amber-400" />
                  상품 합치기
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  중복 품목 2개를 고른 뒤 <strong className="text-amber-700 dark:text-amber-300">유지할 이름</strong>을 선택합니다.
                  등록 시 자동으로 합쳐지지 않으며, 이 화면에서만 실행됩니다.
                </p>
              </div>
              <button type="button" onClick={() => setIsMergeModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full">
                <X size={22} className="text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 text-xs text-amber-900 dark:text-amber-100 space-y-1.5 leading-relaxed">
                <p className="font-bold text-sm">합치기 안내 (어제 자동 합치기와 다름)</p>
                <p>1) 합칠 품목 <strong>2개</strong>를 선택하고, 남길 이름을 <strong>「유지」</strong>로 고릅니다.</p>
                <p>2) <strong>작업</strong> 품목명만 유지 이름으로 바뀝니다. 규격·용지 등 옵션은 합쳐집니다.</p>
                <p>3) <strong>견적서</strong> 품목명은 바꾸지 않아, 예전에 준 견적을 다시 출력해도 같습니다.</p>
                <p>4) 이후 같은 이름을 <strong>새로 추가</strong>해도 자동으로 다른 품목에 합쳐지지 않습니다.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">1. 합칠 품목 2개 선택</h4>
                  <span className="text-xs font-bold text-slate-500">{mergePickNames.length}/2 선택</span>
                </div>
                {mergeSelectedDefs.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {mergeSelectedDefs.map((def) => (
                      <span
                        key={def.name}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                      >
                        {def.name}
                        <button type="button" onClick={() => toggleMergePick(def.name)} className="p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-full" title="선택 해제">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="search"
                  value={mergeSearchQuery}
                  onChange={(e) => setMergeSearchQuery(e.target.value)}
                  placeholder="품목명 검색..."
                  className="w-full mb-2 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="max-h-48 overflow-y-auto custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-700">
                  {mergeFilteredDefs.map((def) => {
                    const isSelected = mergePickNames.includes(def.name);
                    return (
                      <button
                        key={def.name}
                        type="button"
                        onClick={() => toggleMergePick(def.name)}
                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 text-sm font-bold transition-colors ${
                          isSelected
                            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                        }`}
                      >
                        <span>{def.name}</span>
                        {isSelected && <Check size={16} className="text-amber-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {mergePickNames.length === 2 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">2. 유지할 품목명 선택</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {mergePickNames.map((name) => {
                      const isPrimary = mergePrimaryName === name;
                      return (
                        <label
                          key={name}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                            isPrimary
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                              : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/40'
                          }`}
                        >
                          <input
                            type="radio"
                            name="product-merge-primary"
                            checked={isPrimary}
                            onChange={() => setMergePrimaryName(name)}
                            className="text-amber-600 focus:ring-amber-500"
                          />
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{name}</span>
                          {isPrimary && <span className="ml-auto text-[10px] font-bold text-amber-700 dark:text-amber-300">유지</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(false)}
                className="px-4 py-2 text-sm font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
                disabled={isMerging}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleMergeProducts}
                disabled={isMerging || mergePickNames.length !== 2 || !mergePrimaryName}
                className="px-5 py-2 text-sm font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <GitMerge size={16} />
                {isMerging ? '합치는 중...' : '상품 합치기 실행'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
