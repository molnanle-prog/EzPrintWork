
import React, { useState, useEffect, useRef } from 'react';
import { Job, Priority, Staff, PaymentStatus, Client, ClientContact, JobItem, JobSpecs, JobTypeDefinition, JobStatusDefinition, JobHistoryLog, InnerPageSpec } from '../../types';
import { db, formatPhoneNumber, getErrorMessage, formatJobNumber, isBookletProductType } from '../../services/dataService';
import { findClientByName, normalizePrepaidBalance, getJobPrepaidBreakdown, getPrepaidSlotForJob } from '../../utils/prepaidBalance';
import { X, Calendar, User, FileText, DollarSign, Printer, Tag, Layers, Scissors, Palette, FileBox, File, Phone, MessageCircle, FolderOpen, Copy, Check, History, Calculator, CreditCard, Trash2, Building2, Search, Settings, Plus, Droplets, Package, ArrowRight, UserCheck, FileEdit, PlusCircle, Users, BookOpen, FileX, RotateCcw, Loader2, ChevronDown } from 'lucide-react';
import { ClientContactModal } from './ClientContactModal';
import { openJobOrderPreviewWindow } from '../../utils/jobOrderPreviewStorage';
import { JobQuoteCalculatorPanel } from './JobQuoteCalculatorPanel';
import { calcQuoteTotals } from '../../utils/quoteCalculator';
import { useDialog } from '../../contexts/DialogContext';
import { LocalPathInput } from './LocalPathInput';
import { useAuth } from '../../contexts/AuthContext';
import { syncClientFromJob, getClientContacts, findClientByNormalizedName, normalizeContactName } from '../../utils/clientSync';
import { findQuoteForJob } from '../../utils/quoteJobSync';
import { openQuotePreviewWindow } from '../../utils/quotePreviewStorage';
import { getStaffIdForUser, resolveHistoryActorName } from '../../utils/staffMatch';
import { toast } from 'sonner';


// --- Helper Components for History Timeline ---

function formatRealTime(isoString: string): string {
    const d = new Date(isoString);
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getIconForAction(action: string): React.ReactNode {
    switch (action) {
        case '칸반 이동':
        case '상태 변경': return <ArrowRight size={14} className="text-purple-500" />;
        case '담당자 자동 변경':
        case '담당자 변경': return <UserCheck size={14} className="text-green-500" />;
        case '결제 상태 변경': return <CreditCard size={14} className="text-blue-500" />;
        case '작업 생성': return <PlusCircle size={14} className="text-sky-500" />;
        case '작업 취소': return <FileX size={14} className="text-rose-500" />;
        case '작업 복구': return <RotateCcw size={14} className="text-emerald-500" />;
        default: return <FileEdit size={14} className="text-orange-500" />;
    }
}

const HistoryTimeline: React.FC<{ history: JobHistoryLog[], staff: Staff[] }> = ({ history, staff }) => {
    const sortedHistory = [...history].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 min-h-[80px]">
            <ul className="space-y-3">
                {sortedHistory.map((log, index) => (
                    <li key={index} className="flex gap-2 text-xs">
                        <div className="flex flex-col items-center pt-0.5">
                            <span className="flex items-center justify-center w-5 h-5 bg-slate-100 rounded-full">
                                {getIconForAction(log.action)}
                            </span>
                            {index !== sortedHistory.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1"></div>}
                        </div>
                        <div className="flex-1 pb-1">
                            <p className="font-bold text-slate-700">
                                {resolveHistoryActorName(staff, log.staffId)}{' '}
                                <span className="font-normal text-slate-400 ml-1">{formatRealTime(log.timestamp)}</span>
                            </p>
                            <p className="text-slate-600">
                                <span className="font-semibold">{log.action}:</span> <span className="break-all">{log.details}</span>
                            </p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};


interface JobDetailModalProps {
  job: Job;
  staff: Staff[];
  onClose: () => void;
  onUpdate: (job: Job) => void;
  onNavigateToQuote?: (quoteId?: string) => void;
  isNew?: boolean;
  initialViewMode?: 'summary' | 'edit';
}

const PRINT_COLORS = ['선택안함', '단면 4도(컬러)', '양면 8도(컬러)', '단면 1도(흑백)', '양면 2도(흑백)', '별색'];

const TIME_OPTIONS = (() => {
  const times = [];
  for (let h = 9; h <= 18; h++) {
    const hour = String(h).padStart(2, '0');
    times.push(`${hour}:00`);
    if (h !== 18) times.push(`${hour}:30`);
  }
  return times;
})();
const AFTER_HOURS_VALUE = '19:00';

const SpecSelect = ({ label, value, options = [], onChange, onAdd, icon, suffix, subLabel }: any) => {
    const isCustomValue = value && options.length > 0 && !options.includes(value);
    const [forceDirect, setForceDirect] = useState(false);
    const isDirect = isCustomValue || forceDirect || options.length === 0;
    const inputClass = "w-full px-2.5 py-1.5 h-[34px] bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-400";

    const processSuffix = (val: string) => {
        if (!val) return val;
        let newVal = val.trim();
        if (suffix && !newVal.endsWith(suffix)) {
            if (suffix === 'mm') {
                if (/^\d+$/.test(newVal) || /^\d+\s*[xX*]\s*\d+$/.test(newVal)) newVal += suffix;
            } else if (suffix === 'g') {
                if (/^\d+$/.test(newVal)) newVal += suffix;
            }
        }
        return newVal;
    };

    const handleAddClick = () => {
        if (value && value.trim()) {
            const finalVal = processSuffix(value);
            onChange(finalVal);
            if (onAdd) onAdd(finalVal);
            setForceDirect(false);
        } else {
            setForceDirect(false);
            if (options.length > 0) onChange(options[0]);
        }
    };

    return (
        <div className="space-y-1">
            <div className="h-5 flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                    {icon} {label}
                    {subLabel && <span className="text-[10px] text-slate-400 font-normal ml-1">({subLabel})</span>}
                </label>
            </div>
            {isDirect ? (
                <div className="flex gap-1 animate-in fade-in duration-200">
                    <div className="relative w-full">
                        <input 
                            type="text" 
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            onBlur={() => { if(isDirect && value) onChange(processSuffix(value)); }}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddClick()}
                            className={`${inputClass} ${suffix ? 'pr-8' : ''}`} 
                            placeholder="직접 입력..."
                            autoFocus={forceDirect} 
                        />
                        {suffix && <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold pointer-events-none">{suffix}</span>}
                    </div>
                    <button onClick={handleAddClick} className={`px-3 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1 border ${value.trim() ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'}`}>
                        {value.trim() ? <><Plus size={14}/> 추가</> : '목록'}
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <select 
                        value={value}
                        onChange={(e) => {
                            if(e.target.value === '_DIRECT_') { setForceDirect(true); onChange(''); } 
                            else onChange(e.target.value);
                        }}
                        className={`${inputClass} cursor-pointer hover:bg-slate-50 appearance-none`}
                    >
                        {options.map((opt:string) => <option key={opt} value={opt}>{opt}</option>)}
                        <option value="_DIRECT_" className="font-bold text-blue-600 bg-slate-50">+ 직접 입력...</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
            )}
        </div>
    );
};

function JobDetailModal({ job, staff, onClose, onUpdate, onNavigateToQuote, isNew = false, initialViewMode }: JobDetailModalProps) {
  const initialSubJobs: JobItem[] = job.subJobs && job.subJobs.length > 0 
    ? job.subJobs 
    : [{ id: '1', type: job.type || '책자', specs: job.specs }];

  const initialJob: Job = {
    ...job,
    contactPerson: job.contactPerson || '',
    paymentStatus: job.paymentStatus || '결제대기',
    subJobs: initialSubJobs,
    history: job.history || [],
    assignedStaffIds: job.assignedStaffIds || (job.assignedStaffId ? [job.assignedStaffId] : []),
    priceIncludesVat: job.priceIncludesVat ?? false,
    usePrepaidForPayment: job.usePrepaidForPayment !== false,
  };

  const [editedJob, setEditedJob] = useState<Job>(initialJob);
  const [viewMode, setViewMode] = useState<'summary' | 'edit'>(initialViewMode || (isNew ? 'edit' : 'summary'));
  const [activeTabIdx, setActiveTabIdx] = useState(0); 
  const [activeInnerTabIdx, setActiveInnerTabIdx] = useState(0);
  const [showInnerAddMenu, setShowInnerAddMenu] = useState(false);
  
  const [processingOptions, setProcessingOptions] = useState<string[]>([]);
  const [customInputVal, setCustomInputVal] = useState('');
  const [isCustomChecked, setIsCustomChecked] = useState(false);
  
  const [showContactModal, setShowContactModal] = useState(false);
  const [openingQuote, setOpeningQuote] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);
  
  const [productDefs, setProductDefs] = useState<JobTypeDefinition[]>([]);
  const [isManagingTypes, setIsManagingTypes] = useState(false);
  const [newTypeInput, setNewTypeInput] = useState('');

  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([]);
  const [showClientSearch, setShowClientSearch] = useState(false);
  const [clientSearchField, setClientSearchField] = useState<'company' | 'person'>('company');
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);
  const [linkedContacts, setLinkedContacts] = useState<ClientContact[]>([]);
  const [showContactPicker, setShowContactPicker] = useState(false);
  
  const { showConfirm, showAlert } = useDialog();
  const { currentUser, canDeletePermanently } = useAuth();
  /** 작업 이력 작성자 — Firebase uid가 아닌 staff 문서 id로 통일 */
  const historyActorId = getStaffIdForUser(staff, currentUser) || currentUser?.id || 'system';
  const [pastJobs, setPastJobs] = useState<Job[]>([]);
  const [statusDefinitions, setStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const [showQuoteCalculator, setShowQuoteCalculator] = useState(false);
  const [calcLineQuotes, setCalcLineQuotes] = useState<Record<string, number>>({});
  const [calcVatIncluded, setCalcVatIncluded] = useState(false);

  const currentSubJob = editedJob.subJobs![activeTabIdx];
  const currentSpecs = currentSubJob.specs;
  const isBooklet = isBookletProductType(currentSubJob.type);

  useEffect(() => {
    setStatusDefinitions(db.getStatusDefinitions());
    setProductDefs(db.getProductDefinitions());
    setProcessingOptions(db.getProcessingDefinitions());
    const unsubscribe = db.subscribe(() => {
        setProductDefs(db.getProductDefinitions());
        setProcessingOptions(db.getProcessingDefinitions());
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentSpecs && processingOptions.length > 0) {
        const customVal = currentSpecs.processing.find(opt => !processingOptions.includes(opt)) || '';
        setCustomInputVal(customVal);
        setIsCustomChecked(customVal !== '');
    }
  }, [activeTabIdx, editedJob.subJobs, processingOptions]);

  const currentDef = productDefs.find(d => d.name === currentSubJob.type) || 
                     productDefs.find(d => d.name === '기타') || 
                     { name: '직접입력', sizes: [], paperTypes: [], paperWeights: [] };

  useEffect(() => {
    if (!isNew || !editedJob.clientName || editedJob.clientName.length < 2) {
      setPastJobs([]);
      return;
    }
    const timer = setTimeout(async () => {
      await db.ensureColdArchiveLoaded();
      await db.ensureClientHistoryJobs(editedJob.clientName);
      setPastJobs(db.getJobsByClient(editedJob.clientName));
    }, 500);
    return () => clearTimeout(timer);
  }, [editedJob.clientName, isNew]);

  // 상호명으로 거래처를 찾아 담당자 목록 연결 (편집/신규 공통 — 복수 담당자 선택용)
  useEffect(() => {
    const name = editedJob.clientName?.trim();
    if (!name) {
      setLinkedClientId(null);
      setLinkedContacts([]);
      return;
    }
    const matched = findClientByNormalizedName(db.getClients(), name);
    if (matched) {
      setLinkedClientId(matched.id);
      setLinkedContacts(getClientContacts(matched));
    } else {
      setLinkedClientId(null);
      setLinkedContacts([]);
    }
  }, [editedJob.clientName]);

  const updateCurrentSubJob = (updates: Partial<JobItem>) => {
      const newSubJobs = [...(editedJob.subJobs || [])];
      newSubJobs[activeTabIdx] = { ...newSubJobs[activeTabIdx], ...updates };
      setEditedJob({ ...editedJob, subJobs: newSubJobs });
  };

  const updateCurrentSpecs = (specUpdates: Partial<JobSpecs>) => {
      const newSubJobs = [...(editedJob.subJobs || [])];
      newSubJobs[activeTabIdx] = { 
          ...newSubJobs[activeTabIdx], 
          specs: { ...newSubJobs[activeTabIdx].specs, ...specUpdates } 
      };
      setEditedJob({ ...editedJob, subJobs: newSubJobs });
  };

  const pruneProcessingSelection = (selected: string[] | undefined, allowed: string[]): string[] => {
      const allowedSet = new Set(allowed);
      return (selected || []).filter(
          (opt) => allowedSet.has(opt) || !processingOptions.includes(opt)
      );
  };

  const getFilteredProcessingOptions = (category: 'common' | 'cover' | 'inner' = 'common') => {
      const sets = db.getProductProcessingSets(currentSubJob.type);
      const allowed =
          category === 'cover' ? sets.cover : category === 'inner' ? sets.inner : sets.common;
      const selected =
          category === 'cover'
              ? currentSpecs.processingCover || []
              : category === 'inner'
                ? currentSpecs.processingInner || []
                : currentSpecs.processing || [];

      const combined = [...allowed];
      selected.forEach((opt) => {
          if (!combined.includes(opt)) {
              combined.push(opt);
          }
      });
      return combined.filter((opt) => allowed.includes(opt) || !processingOptions.includes(opt));
  };

  const getInnerPages = () => {
      return currentSpecs.innerPages && currentSpecs.innerPages.length > 0
          ? currentSpecs.innerPages
          : [{
              id: 'inner-1',
              paperType: currentSpecs.paperTypeInner || '모조지(백색)',
              paperWeight: currentSpecs.paperWeightInner || '80g',
              printColor: currentSpecs.printColorInner || '단면 1도(흑백)',
              pagesCount: '0',
              hasDivider: false,
              dividerColor: '',
              dividerQuantity: ''
          }];
  };

  const updateCurrentInner = (innerIdx: number, updates: Partial<InnerPageSpec>) => {
      const innerPages = getInnerPages();
      const updated = innerPages.map((ip, idx) => idx === innerIdx ? { ...ip, ...updates } : ip);
      updateCurrentSpecs({ innerPages: updated });
  };

  const handleAddInnerPage = (isDivider: boolean = false) => {
      const innerPages = getInnerPages();
      const newInner = isDivider 
          ? {
              id: `inner-${Date.now()}`,
              paperType: '간지',
              paperWeight: '',
              printColor: '',
              pagesCount: '',
              isDivider: true,
              dividerColor: '백색',
              dividerQuantity: '1'
            }
          : {
              id: `inner-${Date.now()}`,
              paperType: '모조지(백색)',
              paperWeight: '80g',
              printColor: '단면 1도(흑백)',
              pagesCount: '0',
              isDivider: false,
              dividerColor: '',
              dividerQuantity: ''
            };
      updateCurrentSpecs({
          innerPages: [...innerPages, newInner]
      });
      setActiveInnerTabIdx(innerPages.length);
  };

  const handleRemoveInnerPage = (idx: number) => {
      const innerPages = getInnerPages();
      if (innerPages.length <= 1) return;
      const filtered = innerPages.filter((_, i) => i !== idx);
      updateCurrentSpecs({
          innerPages: filtered
      });
      setActiveInnerTabIdx(prev => Math.max(0, prev - 1));
  };

  const handleTypeChange = (newType: string) => {
      const def = productDefs.find(d => d.name === newType);
      const isNewTypeBooklet = isBookletProductType(newType);
      const sets = db.getProductProcessingSets(newType);
      
      const newSpecs: JobSpecs = {
          ...currentSubJob.specs,
          size: def?.sizes?.[0] || '',
          paperType: def?.paperTypes?.[0] || '',
          paperWeight: def?.paperWeights?.[0] || '',
          processing: pruneProcessingSelection(currentSubJob.specs.processing, sets.common),
          processingCover: pruneProcessingSelection(currentSubJob.specs.processingCover, sets.cover),
          processingInner: pruneProcessingSelection(currentSubJob.specs.processingInner, sets.inner),
          // Reset Inner if switching AWAY from booklet, or Initialize if switching TO booklet
          paperTypeInner: isNewTypeBooklet ? (def?.paperTypes?.[0] || '') : undefined,
          paperWeightInner: isNewTypeBooklet ? (def?.paperWeights?.[0] || '') : undefined,
          printColorInner: isNewTypeBooklet ? '단면 1도(흑백)' : undefined,
      };
      updateCurrentSubJob({ type: newType, specs: newSpecs });
  };

  const handleAddSubJob = () => {
      const defaultType = productDefs.length > 0 ? productDefs[0].name : '기타';
      const defaultDef = productDefs.find(d => d.name === defaultType);
      const newSubJobs = [
          ...(editedJob.subJobs || []),
          { 
              id: Date.now().toString(), 
              type: defaultType, 
              specs: { 
                  paperType: defaultDef?.paperTypes?.[0] || '', 
                  paperWeight: defaultDef?.paperWeights?.[0] || '', 
                  size: defaultDef?.sizes?.[0] || '', 
                  quantity: '', 
                  processing: [], 
                  printColor: '단면 4도(컬러)', 
                  memo: '' 
              } 
          }
      ];
      setEditedJob({ ...editedJob, subJobs: newSubJobs });
      setActiveTabIdx(newSubJobs.length - 1);
  };

  const handleRemoveSubJob = async (index: number) => {
      if ((editedJob.subJobs || []).length <= 1) {
          await showAlert('최소 한 개의 작업은 있어야 합니다.');
          return;
      }
      if (await showConfirm('이 작업 품목을 삭제하시겠습니까?')) {
          const newSubJobs = editedJob.subJobs!.filter((_, i) => i !== index);
          setEditedJob({ ...editedJob, subJobs: newSubJobs });
          setActiveTabIdx(prev => Math.max(0, Math.min(prev, newSubJobs.length - 1)));
      }
  };

  const toggleStaff = (id: string) => {
      const currentIds = editedJob.assignedStaffIds || [];
      let newIds;
      if (currentIds.includes(id)) {
          newIds = currentIds.filter(sid => sid !== id);
      } else {
          newIds = [...currentIds, id];
      }
      const primaryId = newIds.length > 0 ? newIds[0] : undefined;
      setEditedJob({ ...editedJob, assignedStaffIds: newIds, assignedStaffId: primaryId });
  };

  const handleSave = async () => {
    if (!currentUser) {
        showAlert("사용자 정보가 없어 저장할 수 없습니다.");
        return;
    }
    const newHistory: JobHistoryLog[] = [...(editedJob.history || [])];
    
    // --- 완료 상태 전환 여부 확인 ---
    let isStatusChangedToDelivery = false;
    let isStatusChangedToCompleted = false;
    if (isNew && editedJob.status === 'DELIVERY') {
        isStatusChangedToDelivery = true;
    } else if (!isNew && job.status !== editedJob.status && editedJob.status === 'DELIVERY') {
        isStatusChangedToDelivery = true;
    }
    if (isNew && editedJob.status === 'COMPLETED') {
        isStatusChangedToCompleted = true;
    } else if (!isNew && job.status !== editedJob.status && editedJob.status === 'COMPLETED') {
        isStatusChangedToCompleted = true;
    }

    if (isNew) {
        newHistory.push({
            timestamp: new Date().toISOString(),
            staffId: historyActorId,
            action: '작업 생성',
            details: `'${editedJob.title || '제목 없음'}' 작업을 생성했습니다.`
        });
    } else {
        const originalJob = job;
        const updatedJob = editedJob;
        const statusNameMap = new Map(statusDefinitions.map(s => [s.key, s.label]));

        const pushChange = (action: string, details: string) => {
            newHistory.push({ timestamp: new Date().toISOString(), staffId: historyActorId, action, details });
        };
        
        if (originalJob.status !== updatedJob.status) pushChange('상태 변경', `${statusNameMap.get(originalJob.status) || originalJob.status} → ${statusNameMap.get(updatedJob.status) || updatedJob.status}`);
        
        const oldStaffIds = Array.from(new Set(originalJob.assignedStaffIds || (originalJob.assignedStaffId ? [originalJob.assignedStaffId] : []))).sort();
        const newStaffIds = Array.from(new Set(updatedJob.assignedStaffIds || [])).sort();
        
        if (JSON.stringify(oldStaffIds) !== JSON.stringify(newStaffIds)) {
             const formatIds = (ids: string[]) => ids
                .map(id => {
                    const s = staff.find(st => st.id === id);
                    return s ? `${s.name}(${s.role})` : null;
                })
                .filter(Boolean)
                .join(', ') || '미배정';

             const from = formatIds(oldStaffIds);
             const to = formatIds(newStaffIds);
             pushChange('담당자 변경', `${from} → ${to}`);
        }

        if (originalJob.paymentStatus !== updatedJob.paymentStatus) pushChange('결제 상태 변경', `${originalJob.paymentStatus} → ${updatedJob.paymentStatus}`);
        
        const pushContentChange = (details: string) => pushChange('내용 수정', details);
        if (originalJob.title !== updatedJob.title) pushContentChange(`제목: '${originalJob.title}' → '${updatedJob.title}'`);
        if (originalJob.clientName !== updatedJob.clientName) pushContentChange(`거래처: '${originalJob.clientName}' → '${updatedJob.clientName}'`);
        if (originalJob.contactPerson !== updatedJob.contactPerson) pushContentChange(`담당자명: '${originalJob.contactPerson || '없음'}' → '${updatedJob.contactPerson || '없음'}'`);
        if (originalJob.clientPhone !== updatedJob.clientPhone) pushContentChange(`연락처: '${originalJob.clientPhone || '없음'}' → '${updatedJob.clientPhone || '없음'}'`);
        if (originalJob.price !== updatedJob.price) pushContentChange(`총액: ${originalJob.price.toLocaleString()}원 → ${updatedJob.price.toLocaleString()}원`);
        
        const formatDate = (iso?: string) => iso ? iso.split('T')[0] : '없음';
        if (formatDate(originalJob.dueDate) !== formatDate(updatedJob.dueDate)) {
            pushContentChange(`납기일: ${formatDate(originalJob.dueDate)} → ${formatDate(updatedJob.dueDate)}`);
        }

        const priorityMap: any = { 'NORMAL': '보통', 'HIGH': '긴급', 'URGENT': '매우긴급' };
        if (originalJob.priority !== updatedJob.priority) {
            pushChange('우선순위 변경', `${priorityMap[originalJob.priority] || originalJob.priority} → ${priorityMap[updatedJob.priority] || updatedJob.priority}`);
        }

        // Spec changes
        const oldSpecs = originalJob.specs;
        const newSpecs = updatedJob.specs;
        if (oldSpecs && newSpecs) {
            if (oldSpecs.size !== newSpecs.size) pushContentChange(`규격: ${oldSpecs.size || '없음'} → ${newSpecs.size || '없음'}`);
            if (oldSpecs.paperType !== newSpecs.paperType) pushContentChange(`용지: ${oldSpecs.paperType || '없음'} → ${newSpecs.paperType || '없음'}`);
            if (oldSpecs.quantity !== newSpecs.quantity) pushContentChange(`수량: ${oldSpecs.quantity || '0'} → ${newSpecs.quantity || '0'}`);
            
            const oldProc = (oldSpecs.processing || []).sort().join(',');
            const newProc = (newSpecs.processing || []).sort().join(',');
            if (oldProc !== newProc) pushContentChange(`후가공: ${oldProc || '없음'} → ${newProc || '없음'}`);
        }
    }

    const subJobs = editedJob.subJobs!;
    const mainItem = subJobs[0];
    let summaryDesc = `[${mainItem.specs.paperType}] ${mainItem.specs.size} / ${mainItem.specs.quantity}`;
    if (subJobs.length > 1) summaryDesc += ` 외 ${subJobs.length - 1}건`;

    let finalJob: Job = { 
        ...editedJob, 
        id: isNew ? Date.now().toString() : editedJob.id,
        history: newHistory,
        type: mainItem.type,
        specs: mainItem.specs,
        description: summaryDesc,
        subJobs: subJobs,
    };
    if (editedJob.assignedStaffIds && editedJob.assignedStaffIds.length > 0) {
        finalJob.assignedStaffId = editedJob.assignedStaffIds[0];
        finalJob.assignedStaffIds = editedJob.assignedStaffIds;
    } else {
        delete finalJob.assignedStaffId;
        finalJob.assignedStaffIds = [];
    }

    if (isStatusChangedToCompleted) {
        finalJob.completedAt = new Date().toISOString();
        finalJob.progress = 100;
    } else if (!isNew && job.status === 'COMPLETED' && finalJob.status !== 'COMPLETED') {
        finalJob.completedAt = undefined;
    }

    // --- 완료 알림 문자 발송 및 이력 자동 기록 트리거 ---
    if (isStatusChangedToDelivery && finalJob.clientPhone) {
        const smsConfig = db.getSmsConfig();
        if (smsConfig && smsConfig.sendOnComplete) {
            const companyName = db.getCompanyInfo().name || 'EzPrintWork';
            const { replaceTemplateVariables, sendCompleteSms } = await import('../../services/smsService');
            
            const rawTemplate = smsConfig.completedMessageTemplate || 
              `[{회사명}] {고객명}님, 주문하신 '{주문명}' 제품의 인쇄/작업이 완료되었습니다. 물건을 찾으러 내방해 주시기 바랍니다. 감사합니다.`;
            const previewMsg = replaceTemplateVariables(rawTemplate, finalJob, companyName);
            
            const isConfirmed = await showConfirm(
              `[완료 알림 문자 발송]\n\n고객님(${finalJob.clientPhone})께 완료 안내 문자를 전송하시겠습니까?\n\n[문자 미리보기]\n${previewMsg}`
            );
            
            if (isConfirmed) {
                const res = await sendCompleteSms(finalJob, smsConfig, companyName);
                if (res.success) {
                    finalJob.history!.push({
                        timestamp: new Date().toISOString(),
                        staffId: historyActorId,
                        action: '문자 발송',
                        details: `완료 문자 발송 성공 (수신: ${finalJob.clientPhone})\n내용: ${res.sentContent}`
                    });
                    await showAlert('완료 알림 문자가 정상적으로 발송되었습니다.');
                } else {
                    finalJob.history!.push({
                        timestamp: new Date().toISOString(),
                        staffId: historyActorId,
                        action: '문자 발송 실패',
                        details: `발송 실패: ${res.message} (수신: ${finalJob.clientPhone})`
                    });
                    await showAlert(`문자 발송 실패: ${res.message}`);
                }
            }
        }
    }

    try {
        const clientSyncResult = await syncClientFromJob(finalJob, linkedClientId);
        if (clientSyncResult === 'created') {
            toast.success('입력하신 거래처가 거래처 목록에 자동 등록되었습니다.');
        } else if (clientSyncResult === 'updated') {
            toast.success('입력하신 담당자/연락처가 거래처 정보에도 저장되었습니다.');
        }
    } catch (error) {
        console.error('거래처 연락처 동기화 실패:', error);
        toast.error('거래처 자동 등록에 실패했습니다. 상호명을 확인 후 다시 저장해 주세요.');
    }

    onUpdate(finalJob);
  };

  const handleDelete = async () => {
      if (await showConfirm(`'${editedJob.title}' 작업을 전산에서 완전히 영구 삭제하시겠습니까?\n삭제된 데이터는 검색에서도 제외되며 복구할 수 없습니다.`)) {
          try {
              await db.deleteJob(editedJob.id);
              onClose();
          } catch (error) {
              showAlert(getErrorMessage(error));
          }
      }
  };

  const handleCancelJob = async () => {
      if (!currentUser) {
          showAlert("사용자 정보가 없어 작업을 취소할 수 없습니다.");
          return;
      }
      if (await showConfirm(`'${editedJob.title}' 작업을 취소 처리하고 작업 내역에 보관하시겠습니까?`)) {
          const canceledAt = new Date().toISOString();
          const newHistory: JobHistoryLog[] = [...(editedJob.history || [])];
          newHistory.push({
              timestamp: canceledAt,
              staffId: historyActorId,
              action: '작업 취소',
              details: `'${editedJob.title}' 작업을 취소했습니다. 작업 내역에서 확인할 수 있습니다.`
          });

          const finalJob: Job = {
              ...editedJob,
              status: 'CANCELED',
              paymentStatus: '취소',
              history: newHistory,
              // 칸반에서는 숨기고 작업 내역에서 조회
              boardHiddenAt: editedJob.boardHiddenAt || canceledAt,
              boardHiddenReason: editedJob.boardHiddenReason || 'canceled',
          };

          try {
              await db.updateJob(finalJob);
              onUpdate(finalJob);
              onClose();
          } catch (error) {
              showAlert(getErrorMessage(error));
          }
      }
  };

  const handleRestoreJob = async () => {
      if (!currentUser) {
          showAlert("사용자 정보가 없어 작업을 복구할 수 없습니다.");
          return;
      }
      if (await showConfirm(`취소된 '${editedJob.title}' 작업을 원래 공정으로 다시 복구하시겠습니까?`)) {
          const newHistory: JobHistoryLog[] = [...(editedJob.history || [])];
          newHistory.push({
              timestamp: new Date().toISOString(),
              staffId: historyActorId,
              action: '작업 복구',
              details: '취소 상태에서 일반 접수(RECEIVED) 단계로 복구 완료했습니다.'
          });

          const finalJob: Job = {
              ...editedJob,
              status: 'RECEIVED',
              paymentStatus: '결제대기',
              history: newHistory,
              ...(editedJob.boardHiddenReason === 'canceled'
                  ? {
                        boardHiddenAt: null,
                        boardHiddenBy: null,
                        boardHiddenReason: null,
                    }
                  : {}),
          };

          try {
              await db.updateJob(finalJob);
              onUpdate(finalJob);
              onClose();
          } catch (error) {
              showAlert(getErrorMessage(error));
          }
      }
  };

  const handleOpenQuotePreview = async () => {
    if (isNew) return;
    setOpeningQuote(true);
    try {
      const quoteId = await db.ensureQuoteForJob(editedJob);
      const quote =
        db.getQuotes().find((q) => q.id === quoteId) ?? findQuoteForJob(db.getQuotes(), editedJob);
      if (!quote) {
        showAlert('연결된 견적서를 찾을 수 없습니다.');
        return;
      }
      if (!openQuotePreviewWindow(quote)) {
        showAlert('팝업이 차단되었습니다. 브라우저에서 팝업 허용 후 다시 시도해 주세요.');
      }
    } catch (error) {
      showAlert(getErrorMessage(error));
    } finally {
      setOpeningQuote(false);
    }
  };

  const toggleProcessing = (option: string) => {
    const current = currentSpecs.processing || [];
    const updated = current.includes(option) ? current.filter(item => item !== option) : [...current, option];
    updateCurrentSpecs({ processing: updated });
  };

  const toggleProcessingCover = (option: string) => {
    const current = currentSpecs.processingCover || [];
    const updated = current.includes(option) ? current.filter(item => item !== option) : [...current, option];
    updateCurrentSpecs({ processingCover: updated });
  };

  const toggleProcessingInner = (option: string) => {
    const current = currentSpecs.processingInner || [];
    const updated = current.includes(option) ? current.filter(item => item !== option) : [...current, option];
    updateCurrentSpecs({ processingInner: updated });
  };

  const handleCustomInputChange = (newVal: string) => {
      setCustomInputVal(newVal);
      const current = currentSpecs.processing || [];
      const clean = current.filter(opt => processingOptions.includes(opt));
      if (newVal.trim() !== '') {
          updateCurrentSpecs({ processing: [...clean, newVal.trim()] });
      } else {
          updateCurrentSpecs({ processing: clean });
      }
  };

  const handleCustomCheckboxToggle = () => {
      if (isCustomChecked) {
          setIsCustomChecked(false);
          setCustomInputVal('');
          const current = currentSpecs.processing || [];
          const clean = current.filter(opt => processingOptions.includes(opt));
          updateCurrentSpecs({ processing: clean });
      } else {
          setIsCustomChecked(true);
      }
  };

  const handleReorder = async (pastJob: Job) => {
    if (await showConfirm(`'${pastJob.title}'의 사양을 불러오시겠습니까?`)) {
      const importedSubJobs = pastJob.subJobs && pastJob.subJobs.length > 0 ? pastJob.subJobs : [{ id: '1', type: pastJob.type, specs: pastJob.specs }];
      setEditedJob({
        ...editedJob,
        subJobs: importedSubJobs,
        description: pastJob.description,
        type: importedSubJobs[0].type,
        filePath: pastJob.filePath, 
        price: pastJob.price
      });
      setActiveTabIdx(0);
    }
  };

  const toggleQuoteCalculator = () => {
    if (!showQuoteCalculator) {
      const init: Record<string, number> = {};
      (editedJob.subJobs || []).forEach((sj) => {
        init[sj.id] = sj.lineQuote ?? 0;
      });
      setCalcLineQuotes(init);
      setCalcVatIncluded(editedJob.priceIncludesVat ?? false);
    }
    setShowQuoteCalculator((prev) => !prev);
  };

  const applyQuoteCalculator = () => {
    const supplySum = (editedJob.subJobs || []).reduce(
      (sum, sj) => sum + (Number(calcLineQuotes[sj.id] ?? 0) || 0),
      0
    );
    const totals = calcQuoteTotals(supplySum, calcVatIncluded);
    const newSubJobs = (editedJob.subJobs || []).map((sj) => ({
      ...sj,
      lineQuote: Number(calcLineQuotes[sj.id] ?? 0) || 0,
    }));
    setEditedJob({
      ...editedJob,
      price: totals.totalAmount,
      priceIncludesVat: calcVatIncluded,
      subJobs: newSubJobs,
    });
    setShowQuoteCalculator(false);
  };

  const handleAddType = () => {
      if(newTypeInput.trim()) {
          const type = newTypeInput.trim();
          db.addJobType({
              name: type,
              sizes: [],
              paperTypes: [],
              paperWeights: []
          });
          handleTypeChange(type);
          setNewTypeInput('');
      }
  };

  const handleDeleteType = async (type: string) => {
      if(await showConfirm(`'${type}' 항목을 삭제하시겠습니까?`)) {
          db.deleteJobType(type);
          if (currentSubJob.type === type) {
              const remaining = productDefs.filter(d => d.name !== type);
              handleTypeChange(remaining[0]?.name || '기타');
          }
      }
  };

  const setColorMode = (mode: 'color' | 'bw') => {
      if (mode === 'color') updateCurrentSpecs({ printColor: '단면 4도(컬러)' });
      else updateCurrentSpecs({ printColor: '단면 1도(흑백)' });
  };
  const isColor = currentSpecs.printColor.includes('4도') || currentSpecs.printColor.includes('8도') || currentSpecs.printColor.includes('컬러');
  const isBW = currentSpecs.printColor.includes('1도') || currentSpecs.printColor.includes('2도') || currentSpecs.printColor.includes('흑백');

  const runClientSearch = (query: string, field: 'company' | 'person') => {
      const trimmed = query.trim();
      setClientSearchField(field);
      setClientSearchQuery(trimmed);

      if (trimmed.length >= 1) {
          setClientSearchResults(db.searchClients(trimmed));
          setShowClientSearch(true);
      } else {
          setClientSearchResults([]);
          setShowClientSearch(false);
      }
  };

  const handleClientSearch = (query: string, field: 'company' | 'person') => {
      if (field === 'company') {
          setEditedJob({ ...editedJob, clientName: query });
          setLinkedClientId(null);
          setLinkedContacts([]);
          setShowContactPicker(false);
      }
      if (field === 'person') {
          setEditedJob({ ...editedJob, contactPerson: query });
          setShowContactPicker(false);
      }
      runClientSearch(query, field);
  };

  const handleClientInputFocus = (field: 'company' | 'person') => {
      const query = field === 'company' ? editedJob.clientName : (editedJob.contactPerson || '');
      runClientSearch(query, field);
  };

  const applyContactToJob = (contact: ClientContact | undefined) => {
      setEditedJob((prev) => ({
          ...prev,
          contactPerson: contact?.name || '',
          clientPhone: contact?.phone ? formatPhoneNumber(contact.phone) : (contact ? '' : prev.clientPhone),
      }));
  };

  const selectClient = (client: Client, preferredContact?: ClientContact) => {
      const contacts = getClientContacts(client);
      setLinkedClientId(client.id);
      setLinkedContacts(contacts);

      let contact = preferredContact;
      if (!contact && clientSearchField === 'person' && clientSearchQuery) {
          const q = clientSearchQuery.trim().toLowerCase();
          contact = contacts.find(
              (c) => c.name?.toLowerCase().includes(q) || (c.phone || '').includes(q)
          );
      }
      if (!contact && contacts.length >= 1) {
          contact = contacts[0];
      }

      setEditedJob({
          ...editedJob,
          clientName: client.name,
          contactPerson: contact?.name || '',
          clientPhone: contact?.phone ? formatPhoneNumber(contact.phone) : '',
      });
      setShowClientSearch(false);
      setClientSearchResults([]);
      setClientSearchQuery('');
      // 담당자 2명 이상이면 선택 UI 표시 (수동으로 다른 담당자 고를 수 있게)
      setShowContactPicker(contacts.length > 1);
  };

  const selectLinkedContact = (contact: ClientContact) => {
      applyContactToJob(contact);
      setShowContactPicker(false);
  };

  const getDisplayTime = (isoString: string) => {
    const d = new Date(isoString);
    const h = d.getHours();
    const m = d.getMinutes();
    if (h >= 19 || (h === 18 && m > 0)) return AFTER_HOURS_VALUE;
    if (h < 9) return '09:00';
    const roundedM = m < 15 ? '00' : m < 45 ? '30' : '00';
    let roundedH = m >= 45 ? h + 1 : h;
    if (roundedH > 18) return AFTER_HOURS_VALUE;
    return `${String(roundedH).padStart(2, '0')}:${roundedM}`;
  };

  const handleDateChange = (dateStr: string) => {
    const current = new Date(editedJob.dueDate);
    const timeStr = `${String(current.getHours()).padStart(2,'0')}:${String(current.getMinutes()).padStart(2,'0')}`;
    setEditedJob({...editedJob, dueDate: new Date(`${dateStr}T${timeStr}`).toISOString()});
  };

  const handleTimeChange = (timeStr: string) => {
    const current = new Date(editedJob.dueDate);
    const dateStr = current.toISOString().split('T')[0];
    setEditedJob({...editedJob, dueDate: new Date(`${dateStr}T${timeStr}`).toISOString()});
  };

  const handleCreatedAtDateChange = (dateStr: string) => {
    const current = new Date(editedJob.createdAt);
    const timeStr = `${String(current.getHours()).padStart(2,'0')}:${String(current.getMinutes()).padStart(2,'0')}`;
    setEditedJob({...editedJob, createdAt: new Date(`${dateStr}T${timeStr}`).toISOString()});
  };

  const handleCreatedAtTimeChange = (timeStr: string) => {
    const current = new Date(editedJob.createdAt);
    const dateStr = current.toISOString().split('T')[0];
    setEditedJob({...editedJob, createdAt: new Date(`${dateStr}T${timeStr}`).toISOString()});
  };

  const datePart = new Date(editedJob.dueDate).toISOString().split('T')[0];
  const displayTime = getDisplayTime(editedJob.dueDate);
  const createdAtDatePart = new Date(editedJob.createdAt).toISOString().split('T')[0];
  const createdAtDisplayTime = getDisplayTime(editedJob.createdAt);

  const inputClass = "w-full px-2.5 py-1.5 h-[34px] bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-400";
  const sidebarInputClass = "w-full p-1.5 bg-slate-50 border border-slate-200 rounded text-sm text-slate-700 focus:ring-1 focus:ring-blue-500";
  const availableStaff = staff.filter(s => !s.isDeleted && s.active);
  const selectedStaffIds = editedJob.assignedStaffIds || [];
  const shouldWrapTabs = (editedJob.subJobs || []).length > 4;
  
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className={`bg-white rounded-xl shadow-2xl w-full overflow-hidden flex flex-col transition-all duration-300 ${viewMode === 'summary' ? 'max-w-6xl h-[65vh] max-h-[65vh]' : 'max-w-6xl h-[85vh] max-h-[85vh]'}`}>
          {viewMode === 'summary' ? (
            <div className="flex flex-col h-full bg-slate-50 min-h-0">
                {/* Header */}
                <div className="py-3 px-5 border-b border-slate-200 flex justify-between items-start bg-white flex-none">
                    <div className="flex items-start gap-4 w-full max-w-3xl">
                        <div className={`p-3 rounded-xl shrink-0 mt-1 shadow-sm ${editedJob.priority === Priority.VERY_URGENT ? 'bg-red-100 text-red-600' : editedJob.priority === Priority.URGENT ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                            <FileText size={28} />
                        </div>
                        <div className="w-full">
                            <div className="flex items-center gap-3 mb-2">
                                <h2 className="text-2xl font-bold text-slate-800">{editedJob.title}</h2>
                                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">{statusDefinitions.find(s => s.key === editedJob.status)?.label || editedJob.status}</span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${editedJob.paymentStatus === '결제완료' ? 'bg-blue-50 text-blue-700 border-blue-200' : editedJob.paymentStatus === '일부결제' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :'bg-red-50 text-red-700 border-red-200'}`}>{editedJob.paymentStatus}</span>
                            </div>
                            <div className="flex gap-6 items-center text-sm text-slate-600">
                                <div className="flex items-center gap-1.5"><Building2 size={16} className="text-slate-400" /> <span className="font-bold">{editedJob.clientName}</span></div>
                                {editedJob.contactPerson && <div className="flex items-center gap-1.5"><User size={16} className="text-slate-400" /> <span>{editedJob.contactPerson}</span></div>}
                                {editedJob.clientPhone && <div className="flex items-center gap-1.5"><Phone size={16} className="text-slate-400" /> <span>{editedJob.clientPhone}</span></div>}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 self-center mr-2 ml-auto shrink-0 animate-in fade-in duration-300">
                        <span className="text-xs font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded border border-slate-300 font-mono">
                            작업번호: {formatJobNumber(editedJob)}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0"><X size={28} className="text-slate-400 hover:text-slate-600" /></button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1"><Calendar size={14}/> 일정 정보</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-slate-500">접수일시:</span> <span className="font-medium text-slate-700">{createdAtDatePart} {createdAtDisplayTime}</span></div>
                                <div className="flex justify-between"><span className="text-slate-500">납기일시:</span> <span className="font-bold text-blue-600">{datePart} {displayTime}</span></div>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1"><Users size={14}/> 담당자</h3>
                            <div className="flex flex-wrap gap-1.5">
                                {selectedStaffIds.length > 0 ? selectedStaffIds.map(id => {
                                    const s = staff.find(st => st.id === id);
                                    return s ? <span key={id} className="bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-md font-medium border border-slate-200">{s.name}</span> : null;
                                }) : <span className="text-slate-400 text-sm">미배정</span>}
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-1"><FolderOpen size={14}/> 파일 및 금액</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between items-center"><span className="text-slate-500">대상 파일 경로:</span> 
                                    {editedJob.filePath ? (
                                        <div className="flex items-center gap-2 max-w-[200px]">
                                            <span className="text-blue-600 font-bold truncate" title={editedJob.filePath}>{editedJob.filePath}</span>
                                        </div>
                                    ) : <span className="text-slate-400">없음</span>}
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-slate-500">총 금액:</span>
                                  <div className="text-right">
                                    <span className="font-bold text-slate-800">{editedJob.price.toLocaleString()}원</span>
                                    <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${editedJob.priceIncludesVat ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                      {editedJob.priceIncludesVat ? '부가세 포함' : '부가세 미포함'}
                                    </span>
                                  </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Layers size={20}/> 제작 사양 상세</h3>
                    <div className="space-y-4">
                        {(editedJob.subJobs || []).map((subJob, idx) => {
                            const isSubBooklet = isBookletProductType(subJob.type || '');
                            return (
                                <div key={idx} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                                        <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                            <span className="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">{idx + 1}</span>
                                            {subJob.type}
                                        </h4>
                                        <div className="text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                                            수량: {subJob.specs.quantity || '미입력'}
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        {isSubBooklet ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                                <div>
                                                    <h5 className="text-xs font-bold text-blue-600 mb-2 flex items-center gap-1"><BookOpen size={14}/> 표지</h5>
                                                    <ul className="space-y-1.5 text-sm text-slate-700">
                                                        <li><span className="text-slate-400 inline-block w-16">규격:</span> {subJob.specs.size || '-'}</li>
                                                        <li><span className="text-slate-400 inline-block w-16">용지:</span> {subJob.specs.paperType || '-'} {subJob.specs.paperWeight || ''}</li>
                                                        <li><span className="text-slate-400 inline-block w-16">도수:</span> {subJob.specs.printColor || '-'}</li>
                                                        <li><span className="text-slate-400 inline-block w-16">표지날개:</span> {subJob.specs.hasCoverWing ? <span className="text-red-600 font-bold">날개 표지 있음</span> : '없음'}</li>
                                                    </ul>
                                                </div>
                                                <div>
                                                    <h5 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1"><FileText size={14}/> 내지 사양</h5>
                                                    <div className="space-y-2">
                                                        {(() => {
                                                            let innerCounter = 0;
                                                            let dividerCounter = 0;
                                                            return (subJob.specs.innerPages && subJob.specs.innerPages.length > 0 
                                                              ? subJob.specs.innerPages 
                                                              : [{
                                                                  id: 'inner-1',
                                                                  paperType: subJob.specs.paperTypeInner || '-',
                                                                  paperWeight: subJob.specs.paperWeightInner || '',
                                                                  printColor: subJob.specs.printColorInner || '-',
                                                                  pagesCount: '0'
                                                                }]
                                                            ).map((ip: any, idx: number) => {
                                                                if (ip.isDivider) {
                                                                    dividerCounter++;
                                                                    return (
                                                                        <div key={ip.id || idx} className="bg-yellow-50/50 p-2 rounded-lg border border-yellow-200 text-xs">
                                                                            <p className="font-bold text-amber-700 mb-1">간지 {dividerCounter}</p>
                                                                            <ul className="space-y-1 text-slate-700">
                                                                                <li><span className="text-slate-400 inline-block w-14">간지 색상:</span> {ip.dividerColor || '지정안함'}</li>
                                                                                <li><span className="text-slate-400 inline-block w-14">간지 페이지:</span> {ip.dividerQuantity || '0'}장</li>
                                                                            </ul>
                                                                        </div>
                                                                    );
                                                                } else {
                                                                    innerCounter++;
                                                                    return (
                                                                        <div key={ip.id || idx} className="bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs">
                                                                            <p className="font-bold text-blue-700 mb-1">내지 {innerCounter}</p>
                                                                            <ul className="space-y-1 text-slate-700">
                                                                                <li><span className="text-slate-400 inline-block w-14">용지:</span> {ip.paperType} {ip.paperWeight}</li>
                                                                                <li><span className="text-slate-400 inline-block w-14">도수:</span> {ip.printColor}</li>
                                                                                {ip.pagesCount && ip.pagesCount !== '0' && <li><span className="text-slate-400 inline-block w-14">페이지수:</span> {ip.pagesCount}p</li>}
                                                                            </ul>
                                                                        </div>
                                                                    );
                                                                }
                                                            });
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-6 text-sm text-slate-700 mb-4">
                                                <li><span className="text-slate-400 inline-block w-16">규격:</span> {subJob.specs.size || '-'}</li>
                                                <li><span className="text-slate-400 inline-block w-16">용지:</span> {subJob.specs.paperType || '-'} {subJob.specs.paperWeight || ''}</li>
                                                <li><span className="text-slate-400 inline-block w-16">도수:</span> {subJob.specs.printColor || '-'}</li>
                                            </ul>
                                        )}
                                        
                                        {(((subJob.specs?.processing?.length || 0) > 0) || 
                                          (isSubBooklet && ((subJob.specs?.processingCover?.length || 0) > 0)) || 
                                          (isSubBooklet && ((subJob.specs?.processingInner?.length || 0) > 0))) && (
                                            <div className="mb-4 space-y-2">
                                                <h5 className="text-xs font-bold text-slate-500 flex items-center gap-1"><Scissors size={14}/> 후가공</h5>
                                                {isSubBooklet ? (
                                                    <div className="space-y-1 text-xs">
                                                        {subJob.specs?.processing && subJob.specs.processing.length > 0 && (
                                                            <div>
                                                                <span className="text-slate-400 inline-block w-20 font-bold">제본/공통:</span>
                                                                <span className="inline-flex flex-wrap gap-1">
                                                                    {subJob.specs.processing.map(p => <span key={p} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">{p}</span>)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {subJob.specs?.processingCover && subJob.specs.processingCover.length > 0 && (
                                                            <div>
                                                                <span className="text-blue-500 inline-block w-20 font-bold">표지 후가공:</span>
                                                                <span className="inline-flex flex-wrap gap-1">
                                                                    {subJob.specs.processingCover.map(p => <span key={p} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">{p}</span>)}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {subJob.specs?.processingInner && subJob.specs.processingInner.length > 0 && (
                                                            <div>
                                                                <span className="text-emerald-500 inline-block w-20 font-bold">내지 후가공:</span>
                                                                <span className="inline-flex flex-wrap gap-1">
                                                                    {subJob.specs.processingInner.map(p => <span key={p} className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">{p}</span>)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {subJob.specs.processing.map(p => (
                                                            <span key={p} className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded border border-slate-200">{p}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {subJob.specs.memo && (
                                            <div>
                                                <h5 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1"><Tag size={14}/> 메모 / 특이사항</h5>
                                                <div className="bg-yellow-50 text-slate-800 text-sm p-3 rounded-lg border border-yellow-200 whitespace-pre-wrap">
                                                    {subJob.specs.memo}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 flex justify-end gap-3 bg-white flex-none">
                    <div className="mr-auto flex gap-2">
                        <button
                          onClick={handleOpenQuotePreview}
                          disabled={openingQuote}
                          className="px-4 py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-bold transition-colors flex items-center gap-2 border border-indigo-200 disabled:opacity-50"
                          title="이 작업의 견적서 미리보기"
                        >
                          {openingQuote ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                          <span className="hidden sm:inline">견적서 보기</span>
                        </button>
                        <button onClick={() => openJobOrderPreviewWindow(editedJob)} className="px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-bold transition-colors flex items-center gap-2 border border-slate-300" title="작업지시서 인쇄 미리보기"><Printer size={18} /><span className="hidden sm:inline">작업지시서 인쇄</span></button>
                        <button 
                            onClick={() => editedJob.clientPhone ? setShowContactModal(true) : undefined} 
                            disabled={!editedJob.clientPhone}
                            className={`px-4 py-2.5 rounded-lg font-bold transition-colors flex items-center gap-2 border ${editedJob.clientPhone ? 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-300' : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'}`}
                            title={editedJob.clientPhone ? "고객 알림 문자 전송" : "연락처 없음"}
                        >
                            <MessageCircle size={18} />
                            <span>{editedJob.clientPhone ? "문자" : "연락처없음"}</span>
                        </button>
                    </div>
                    {!editedJob.managementCardPinnedAt && (
                      <button
                        onClick={async () => {
                          await db.hideJobFromBoard(editedJob.id, currentUser?.id);
                          onClose();
                        }}
                        className="px-4 py-2.5 bg-rose-600 text-white hover:bg-rose-700 rounded-lg font-bold transition-colors flex items-center gap-2 shadow-sm"
                        title="작업 내역은 남기고 보드(칸반/달력/상황판)에서만 숨깁니다"
                      >
                        보드에서 내리기
                      </button>
                    )}
                    <button onClick={onClose} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">닫기</button>
                    <button onClick={() => setViewMode('edit')} className="px-8 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md transition-all flex items-center gap-2"><FileEdit size={18}/> 상세 정보 및 수정</button>
                </div>
            </div>
          ) : (
            <div className="flex flex-col h-full bg-slate-50 min-h-0">
              {/* Header - 패딩 축소 및 레이아웃 정리 */}
              <div className="py-1.5 px-4 border-b border-slate-200 flex justify-between items-start bg-slate-50 flex-none">
                <div className="flex items-start gap-3 w-full max-w-3xl">
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 shadow-sm ${editedJob.priority === Priority.VERY_URGENT ? 'bg-red-100 text-red-600' : editedJob.priority === Priority.URGENT ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                      <FileText size={24} />
                  </div>
                  <div className="w-full relative">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 w-full mb-1.5">
                      <span className="text-xs font-bold text-slate-500 shrink-0 select-none">제목 :</span>
                      <input 
                          value={editedJob.title}
                          onChange={(e) => setEditedJob({...editedJob, title: e.target.value})}
                          className="bg-transparent border-b border-slate-300 focus:border-blue-500 focus:ring-0 p-1 -ml-1 font-bold w-full text-slate-800 placeholder-slate-300 caret-blue-600 focus:bg-white/60 rounded-md transition-all outline-none text-lg"
                          placeholder={isNew ? "통합 작업 제목 (예: 삼성전자 3월 주문건)" : "작업 제목 입력"}
                      />
                    </h2>
                    
                    <div className="flex gap-4 items-center text-sm relative py-0.5">
                        <div className="flex items-center gap-1.5 flex-1 relative group">
                            <Building2 size={14} className="text-slate-400 shrink-0" />
                            <span className="text-xs font-bold text-slate-500 shrink-0 select-none">거래처 :</span>
                            <input 
                                value={editedJob.clientName}
                                onChange={(e) => handleClientSearch(e.target.value, 'company')}
                                onFocus={() => handleClientInputFocus('company')}
                                onBlur={() => setTimeout(() => setShowClientSearch(false), 200)}
                                className="bg-transparent border-b-2 border-slate-200 focus:border-blue-500 focus:outline-none text-slate-700 w-full placeholder-slate-300 font-bold py-1 transition-colors text-sm"
                                placeholder="고객사(상호)"
                                autoComplete="off"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 w-36 sm:w-52 relative">
                            <User size={14} className="text-slate-400 shrink-0" />
                            <span className="text-xs font-bold text-slate-500 shrink-0 select-none">담당 :</span>
                            <input 
                                value={editedJob.contactPerson || ''}
                                onChange={(e) => handleClientSearch(e.target.value, 'person')}
                                onFocus={() => handleClientInputFocus('person')}
                                onBlur={() => setTimeout(() => {
                                    setShowClientSearch(false);
                                    setShowContactPicker(false);
                                }, 200)}
                                className="bg-transparent border-b-2 border-slate-200 focus:border-blue-500 focus:outline-none text-slate-600 w-full placeholder-slate-300 py-1 transition-colors text-sm"
                                placeholder="담당자명"
                                autoComplete="off"
                            />
                            {linkedContacts.length > 1 && (
                                <button
                                    type="button"
                                    title="담당자 선택"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                        setShowClientSearch(false);
                                        setShowContactPicker((v) => !v);
                                    }}
                                    className="shrink-0 p-1 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100"
                                >
                                    <ChevronDown size={14} />
                                </button>
                            )}
                            {showContactPicker && linkedContacts.length > 1 && (
                                <div className="absolute left-0 right-0 top-full mt-1 z-[75] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                                    <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                            담당자 선택 ({linkedContacts.length}명)
                                        </span>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto custom-scrollbar">
                                        {linkedContacts.map((contact, idx) => {
                                            const selected =
                                                normalizeContactName(contact.name) ===
                                                normalizeContactName(editedJob.contactPerson);
                                            return (
                                                <button
                                                    key={`${contact.name}-${contact.phone}-${idx}`}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => selectLinkedContact(contact)}
                                                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors ${
                                                        selected ? 'bg-blue-50/80' : ''
                                                    }`}
                                                >
                                                    <p className="text-sm font-bold text-slate-800 truncate">
                                                        {contact.name || '(이름 없음)'}
                                                        {idx === 0 && (
                                                            <span className="ml-1.5 text-[10px] font-bold text-blue-600">대표</span>
                                                        )}
                                                    </p>
                                                    <p className="text-[11px] text-slate-500 truncate">
                                                        {[contact.phone, contact.department].filter(Boolean).join(' · ') || '연락처 없음'}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 w-40 sm:w-52">
                            <Phone size={14} className="text-slate-400 shrink-0" />
                            <span className="text-xs font-bold text-slate-500 shrink-0 select-none">연락처 :</span>
                            <input 
                                value={editedJob.clientPhone || ''}
                                onChange={(e) => setEditedJob({...editedJob, clientPhone: formatPhoneNumber(e.target.value)})}
                                className="bg-transparent border-b-2 border-slate-200 focus:border-blue-500 focus:outline-none text-slate-600 w-full placeholder-slate-300 py-1 transition-colors text-sm"
                                placeholder="연락처"
                            />
                            {!isNew && editedJob.clientPhone && (
                                <button onClick={() => setShowContactModal(true)} className="p-1 ml-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 shrink-0 shadow-sm">
                                    <MessageCircle size={14} />
                                </button>
                            )}
                        </div>

                        {showClientSearch && clientSearchQuery.length >= 1 && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-[70] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                                        <Search size={11} />
                                        {clientSearchField === 'company' ? '거래처 검색' : '담당자 검색'}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">"{clientSearchQuery}"</span>
                                </div>
                                {clientSearchResults.length === 0 ? (
                                    <div className="px-3 py-3 text-xs text-slate-500 text-center leading-relaxed">
                                        등록된 거래처가 없습니다.<br />
                                        <span className="text-blue-600 font-medium">새 상호명을 입력하고 작업을 저장하면 거래처가 자동 등록됩니다.</span>
                                    </div>
                                ) : (
                                    <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                        {clientSearchResults.map((client) => {
                                            const contacts = getClientContacts(client);
                                            const q = clientSearchQuery.trim().toLowerCase();
                                            const matchedContact =
                                                clientSearchField === 'person' && q
                                                    ? contacts.find(
                                                          (c) =>
                                                              c.name?.toLowerCase().includes(q) ||
                                                              (c.phone || '').includes(q)
                                                      )
                                                    : undefined;
                                            const preview = matchedContact || contacts[0];
                                            const contactName = preview?.name || client.contactPerson;
                                            const contactPhone = preview?.phone || client.phone;
                                            const extraCount = Math.max(0, contacts.length - 1);

                                            return (
                                                <button
                                                    key={client.id}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => selectClient(client, matchedContact)}
                                                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-slate-100 last:border-b-0 transition-colors flex items-center justify-between gap-3"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-800 truncate">{client.name}</p>
                                                        <p className="text-[11px] text-slate-500 truncate">
                                                            {[contactName, contactPhone].filter(Boolean).join(' · ') || '연락처 없음'}
                                                            {extraCount > 0 && (
                                                                <span className="ml-1 text-blue-600 font-medium">
                                                                    외 {extraCount}명
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-blue-600 shrink-0">선택</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-center mr-2 ml-auto shrink-0">
                    <span className="text-xs font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded border border-slate-300 font-mono">
                        작업번호: {formatJobNumber(editedJob)}
                    </span>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors shrink-0"><X size={24} className="text-slate-400 hover:text-slate-600" /></button>
              </div>

              {/* Main Body - 개별 독립 스크롤을 보장하여 좌우 컬럼 세로 정렬을 완벽하게 동기화 */}
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 bg-slate-50 lg:items-stretch">
                {/* Left Column: Sidebar - items-stretch에 의해 우측과 정확히 동일한 높이를 가지도록 self-stretch 설정 */}
                <div className="w-full lg:w-[45%] bg-slate-50 border-r border-slate-200 flex flex-col lg:self-stretch h-auto shrink-0 min-h-0">
                  
                  {/* Top Section: 접수 내용들 - 내용이 많을 때 독립적으로 스크롤되도록 설정 */}
                  <div className="w-full py-1.5 px-2.5 flex flex-col gap-1.5 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                      {/* Past Jobs History */}
                      {isNew && pastJobs.length > 0 && (
                        <div className="bg-white border border-blue-100 rounded-lg p-2 shadow-sm animate-in slide-in-from-left-2 duration-300">
                          <div className="flex items-center justify-between mb-1 px-1">
                             <h3 className="text-[11px] font-bold text-blue-700 flex items-center gap-1"><History size={11} /> 최근 주문 이력</h3>
                             <span className="text-[9px] bg-blue-100 text-blue-600 px-1 rounded-full font-bold">{pastJobs.length}건</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-20 overflow-y-auto custom-scrollbar pr-1">
                            {pastJobs.slice(0, 4).map(pj => (
                              <div key={pj.id} className="flex gap-1.5 p-1 rounded bg-slate-50 border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-colors group items-center">
                                <div className="w-5 h-5 rounded bg-slate-200 flex items-center justify-center shrink-0 text-[9px] text-slate-500 font-bold">{pj.type.substring(0,1)}</div>
                                <div className="flex-1 min-w-0"><p className="text-[10px] font-bold text-slate-800 truncate">{pj.title}</p></div>
                                <button onClick={() => handleReorder(pj)} className="px-1.5 py-0.5 bg-white border border-slate-200 text-[9px] font-bold text-blue-600 rounded hover:bg-blue-600 hover:text-white transition-colors shrink-0">불러오기</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 그리드로 묶는 핵심 레이아웃 전환! */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {/* Status & Priority */}
                        <div className="bg-white py-1.5 px-2 rounded-lg border border-slate-200 shadow-sm flex gap-1.5">
                          <div className="flex-1">
                              <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">상태</label>
                              <select value={editedJob.status} onChange={(e) => setEditedJob({...editedJob, status: e.target.value })} className={sidebarInputClass}>
                                  {statusDefinitions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                              </select>
                          </div>
                          <div className="flex-1">
                              <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">우선순위</label>
                              <select value={editedJob.priority} onChange={(e) => setEditedJob({...editedJob, priority: e.target.value as Priority})} className={sidebarInputClass}>
                                  {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                          </div>
                        </div>

                        {/* Dates 1: 접수일 */}
                        <div className="bg-white py-1.5 px-2 rounded-lg border border-slate-200 shadow-sm">
                          <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">접수일 설정</label>
                          <div className="flex gap-1 items-center">
                              <input 
                                  type="date" 
                                  value={createdAtDatePart} 
                                  onChange={(e) => handleCreatedAtDateChange(e.target.value)} 
                                  className="w-full py-0.5 pl-1 pr-0 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 flex-1 outline-none min-w-0" 
                                  style={{ colorScheme: 'light' }} 
                              />
                              <select 
                                  value={createdAtDisplayTime} 
                                  onChange={(e) => handleCreatedAtTimeChange(e.target.value)} 
                                  className="py-0.5 pl-0.5 pr-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 w-[68px] shrink-0 outline-none cursor-pointer font-medium"
                              >
                                  {TIME_OPTIONS.map(t => (<option key={t} value={t}>{t}</option>))}
                                  <option value={AFTER_HOURS_VALUE}>18:00~</option>
                              </select>
                          </div>
                        </div>

                        {/* Payment */}
                        <div className="bg-white py-1.5 px-2 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
                          <div className="flex justify-between items-center mb-0.5">
                             <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1"><DollarSign size={10} /> 견적 및 결제</label>
                             <button
                               type="button"
                               onClick={toggleQuoteCalculator}
                               className={`text-[9px] flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold transition-colors ${showQuoteCalculator ? 'bg-blue-600 text-white' : 'bg-slate-800 text-yellow-400 hover:bg-slate-700'}`}
                             >
                               <Calculator size={9} /> 종류별 계산
                             </button>
                          </div>
                          {showQuoteCalculator && (
                            <JobQuoteCalculatorPanel
                              subJobs={editedJob.subJobs || []}
                              lineQuotes={calcLineQuotes}
                              vatIncluded={calcVatIncluded}
                              onLineQuoteChange={(id, amount) =>
                                setCalcLineQuotes((prev) => ({ ...prev, [id]: amount }))
                              }
                              onVatIncludedChange={setCalcVatIncluded}
                              onApply={applyQuoteCalculator}
                              onClose={() => setShowQuoteCalculator(false)}
                            />
                          )}
                          <div className="flex items-center gap-1 mb-0.5">
                            <input
                              type="number"
                              value={editedJob.price}
                              onChange={(e) =>
                                setEditedJob({ ...editedJob, price: Number(e.target.value) })
                              }
                              className="w-full p-0.5 bg-white border border-slate-300 rounded text-right font-bold text-xs text-blue-700 focus:ring-1 focus:ring-blue-500"
                            />
                            <span className="text-[10px] font-bold text-slate-600 whitespace-nowrap">원</span>
                          </div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <label className="flex items-center gap-1 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={editedJob.priceIncludesVat ?? false}
                                onChange={(e) =>
                                  setEditedJob({ ...editedJob, priceIncludesVat: e.target.checked })
                                }
                                className="rounded border-slate-300 text-blue-600 w-3 h-3"
                              />
                              <span className="text-[9px] font-bold text-slate-600">부가세 포함 금액</span>
                            </label>
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded ${editedJob.priceIncludesVat ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}
                            >
                              {editedJob.priceIncludesVat ? '부가세 포함' : '부가세 미포함'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1"><label className="text-[10px] font-bold text-slate-500 whitespace-nowrap flex items-center gap-0.5"><CreditCard size={10} /> 결제:</label><select value={editedJob.paymentStatus} onChange={(e) => setEditedJob({...editedJob, paymentStatus: e.target.value as PaymentStatus})} className={`flex-1 p-0.5 rounded text-[10px] font-bold border outline-none ${editedJob.paymentStatus === '결제완료' ? 'bg-blue-50 text-blue-700 border-blue-200' : editedJob.paymentStatus === '일부결제' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :'bg-red-50 text-red-700 border-red-200'}`}><option value="결제대기">결제대기</option><option value="일부결제">일부결제</option><option value="결제완료">결제완료</option></select></div>
                          {(() => {
                            const clients = db.getClients();
                            const boardJobs = db.getManagementCardJobs();
                            const prepaidSlot = getPrepaidSlotForJob(editedJob, boardJobs, clients);
                            const client = findClientByName(clients, editedJob.clientName);
                            const ledgerBalance = normalizePrepaidBalance(client?.prepaidBalance);
                            const balanceBefore = prepaidSlot?.balanceBefore ?? ledgerBalance;
                            const breakdown = getJobPrepaidBreakdown(editedJob, ledgerBalance, {
                              balanceBefore,
                            });
                            const balanceAfter =
                              prepaidSlot?.applied || breakdown.applied
                                ? Math.max(0, balanceBefore - breakdown.applied)
                                : balanceBefore;
                            if (balanceBefore <= 0 && breakdown.applied <= 0) return null;
                            return (
                              <div className="pl-1 space-y-1">
                                {balanceBefore > 0 && (
                                  <label className="flex items-center gap-1.5 text-[10px] text-indigo-700 dark:text-indigo-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editedJob.usePrepaidForPayment !== false}
                                      onChange={(e) =>
                                        setEditedJob({ ...editedJob, usePrepaidForPayment: e.target.checked })
                                      }
                                      className="rounded border-indigo-300"
                                    />
                                    선불에서 차감 (잔액 {balanceBefore.toLocaleString()}원)
                                  </label>
                                )}
                                {breakdown.applied > 0 && (
                                  <p className="text-[9px] text-violet-600 dark:text-violet-400">
                                    선불 차감 {breakdown.applied.toLocaleString()}원
                                    {breakdown.outstanding > 0 &&
                                      ` · 차감 후 미수 ${breakdown.outstanding.toLocaleString()}원`}
                                    {breakdown.outstanding <= 0 &&
                                      ` · 차감 후 잔액 ${balanceAfter.toLocaleString()}원`}
                                  </p>
                                )}
                                {breakdown.applied <= 0 &&
                                  editedJob.usePrepaidForPayment !== false &&
                                  balanceBefore > 0 &&
                                  (editedJob.paymentStatus === '결제대기' ||
                                    editedJob.paymentStatus === '일부결제' ||
                                    editedJob.paymentStatus === '결제완료') && (
                                    <p className="text-[9px] text-amber-600 dark:text-amber-400">
                                      선불 {Math.min(balanceBefore, breakdown.price).toLocaleString()}원 차감 예정
                                      {breakdown.prepaidShortfall > 0 &&
                                        ` · 부족 ${breakdown.prepaidShortfall.toLocaleString()}원`}
                                      {editedJob.paymentStatus === '결제완료' &&
                                        breakdown.prepaidShortfall <= 0 &&
                                        ` · 차감 후 잔액 ${Math.max(0, balanceBefore - breakdown.price).toLocaleString()}원`}
                                    </p>
                                  )}
                                {editedJob.usePrepaidForPayment === false && balanceBefore > 0 && (
                                  <p className="text-[9px] text-slate-500">별도 수금 (선불 차감 안 함)</p>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Dates 2: 납기일 */}
                        <div className="bg-white py-1.5 px-2 rounded-lg border border-slate-200 shadow-sm">
                          <label className="text-[10px] font-bold text-slate-500 mb-0.5 block">납기일 설정</label>
                          <div className="flex gap-1 items-center">
                              <input 
                                  type="date" 
                                  value={datePart} 
                                  onChange={(e) => handleDateChange(e.target.value)} 
                                  className="w-full py-0.5 pl-1 pr-0 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 focus:ring-1 focus:ring-blue-500 flex-1 outline-none min-w-0" 
                                  style={{ colorScheme: 'light' }} 
                              />
                              <select 
                                  value={displayTime} 
                                  onChange={(e) => handleTimeChange(e.target.value)} 
                                  className="py-0.5 pl-0.5 pr-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 w-[68px] shrink-0 outline-none cursor-pointer font-medium"
                              >
                                  {TIME_OPTIONS.map(t => (<option key={t} value={t}>{t}</option>))}
                                  <option value={AFTER_HOURS_VALUE}>18:00~</option>
                              </select>
                          </div>
                        </div>

                        {/* Staff - 2열 차지 */}
                        <div className="bg-white py-1.5 px-2 rounded-lg border border-slate-200 shadow-sm col-span-1 sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Users size={11}/> 담당자 지정 (토글)</label>
                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                              {availableStaff.length === 0 ? (
                                  <span className="text-slate-400 text-[10px]">등록된 담당자 직원이 없습니다.</span>
                              ) : (
                                  availableStaff.map(s => {
                                      const isSelected = selectedStaffIds.includes(s.id);
                                      return (
                                          <button 
                                              type="button"
                                              key={s.id} 
                                              onClick={() => toggleStaff(s.id)}
                                              className={`px-2 py-0.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-0.5 ${
                                                  isSelected 
                                                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm hover:bg-blue-700' 
                                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                                              }`}
                                          >
                                              {isSelected && <Check size={10} />}
                                              <span>{s.name}</span>
                                              <span className={`text-[9px] font-normal ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                                                  ({s.role})
                                              </span>
                                          </button>
                                      );
                                  })
                              )}
                          </div>
                        </div>

                        {/* 작업 원본 파일 경로 (로컬 PC) */}
                        <div className="col-span-1 sm:col-span-2">
                          <LocalPathInput 
                            value={editedJob.filePath || ''} 
                            onChange={(path) => setEditedJob({...editedJob, filePath: path})} 
                          />
                        </div>
                      </div>
                  </div>

                  {/* 구분 실선 및 작업 이력 영역 - 크기 변화 없이 위치만 아래로 내려서(mt-auto) 우측 추가메모 바닥 라인과 정렬을 통일 */}
                  <div className="space-y-0.5 mt-auto pt-2.5 px-3.5 pb-3.5 flex flex-col h-[270px] shrink-0">
                    <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 shrink-0"><History size={12} /> 작업 이력</label>
                    <div className="flex-1 bg-white p-2 rounded-lg border border-slate-300 shadow-sm overflow-hidden flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 text-xs">
                            {editedJob.history && editedJob.history.length > 0 ? (
                                <HistoryTimeline history={editedJob.history} staff={staff} />
                            ) : (
                                <div className="h-full flex items-center justify-center text-center text-slate-400 text-[11px] py-2">
                                    <p>기록된 이력이 없습니다. 작업 상태를 변경하거나 내용을 저장하면 기록이 시작됩니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                  </div>
                </div>

            {/* Right Column: Detailed Specs - 55% 너비, 좌측 사이드바와 세로 높이 동기화 */}
            <div className="flex-1 flex flex-col bg-white lg:self-stretch h-auto min-h-0">
                <div className={`flex items-end gap-1.5 px-2.5 pt-2 bg-slate-100 border-b border-slate-200 flex-none transition-all ${shouldWrapTabs ? 'flex-wrap h-auto' : 'overflow-x-auto overflow-y-hidden custom-scrollbar h-11'}`}>
                    {(editedJob.subJobs || []).map((subJob, idx) => (
                        <button key={idx} onClick={() => setActiveTabIdx(idx)} className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs sm:text-sm font-bold min-w-[90px] border-t border-x relative transition-all ${activeTabIdx === idx ? 'bg-white text-blue-700 border-slate-200 border-b-white -mb-[1px] z-10 shadow-[0_-2px_3px_rgba(0,0,0,0.02)]' : 'bg-slate-200 text-slate-500 border-transparent hover:bg-slate-300/50 mb-0.5'}`}>
                            <span className="truncate max-w-[100px] flex items-center h-4">{idx + 1}. {subJob.type}</span>
                            {(editedJob.subJobs || []).length > 1 && (<span onClick={(e) => { e.stopPropagation(); handleRemoveSubJob(idx); }} className="p-0.5 rounded-full hover:bg-red-100 hover:text-red-500 ml-1 transition-colors"><X size={10} /></span>)}
                        </button>
                    ))}
                    <button onClick={handleAddSubJob} className="flex items-center gap-1 px-2 py-1 mb-1 rounded-md text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"><Plus size={12} />상품추가</button>
                </div>

                <div className="flex-1 flex flex-col p-3.5 border-t border-slate-100 overflow-y-auto custom-scrollbar min-h-0">
                    <div className="flex justify-between items-center mb-2 border-b border-slate-100 pb-1.5">
                        <div className="flex items-center gap-2"><h3 className="font-bold text-slate-700 flex items-center gap-1.5 text-sm sm:text-base"><Layers size={16} /> 제작 사양</h3></div>
                        <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-md">
                            <button onClick={() => setColorMode('color')} title="컬러 인쇄 모드로 설정" className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${isColor ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><span className="flex items-center gap-0.5"><Droplets size={10} className={isColor ? 'fill-blue-600' : ''}/> 컬러</span></button>
                            <button onClick={() => setColorMode('bw')} title="흑백 인쇄 모드로 설정" className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${isBW ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><span className="flex items-center gap-0.5"><Droplets size={10} className={isBW ? 'fill-black' : ''}/> 흑백</span></button>
                        </div>
                    </div>
                    
                    {/* Product Type & Size (Always Visible) */}
                    <div className="mb-2.5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                             <div className="space-y-1">
                                <div className="flex justify-between items-center h-5">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Package size={16}/> 작업 종류 (품목)</label>
                                    <button onClick={() => setIsManagingTypes(!isManagingTypes)} className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1" title="작업 종류 목록 편집"><Settings size={12}/> {isManagingTypes ? '닫기' : '관리'}</button>
                                </div>
                                <div className="relative">
                                    <select value={currentSubJob.type} onChange={(e) => handleTypeChange(e.target.value)} className={`${inputClass} cursor-pointer hover:bg-slate-50 appearance-none`}>
                                        {productDefs.map(t => (<option key={t.name} value={t.name}>{t.name}</option>))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500"><svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg></div>
                                </div>
                             </div>
                             <SpecSelect label="규격 (사이즈)" value={currentSpecs.size} options={currentDef.sizes} onChange={(val: string) => updateCurrentSpecs({ size: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'sizes', val)} icon={<FileBox size={16} />} suffix="mm" />
                        </div>
                        
                        {isManagingTypes && (
                            <div className="mt-2 bg-slate-50 p-2.5 rounded-xl border border-blue-100 shadow-sm animate-in slide-in-from-top-2">
                                <div className="flex items-center justify-between mb-2"><h4 className="text-xs font-bold text-slate-600">목록 편집</h4></div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex gap-2 items-center">
                                        <input value={newTypeInput} onChange={(e) => setNewTypeInput(e.target.value)} placeholder="새 종류 추가 (예: 엽서)" className="text-sm p-1.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 placeholder-slate-400 min-w-[200px] h-[34px]" onKeyDown={(e) => e.key === 'Enter' && handleAddType()} />
                                        <button onClick={handleAddType} title="새 종류 추가" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition-colors font-bold text-sm flex items-center gap-1 h-[34px]"><Plus size={16}/> 추가</button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 p-1.5 bg-white border border-slate-200 rounded-lg min-h-[40px]">
                                        {productDefs.map(t => (<div key={t.name} className="text-xs bg-slate-50 text-slate-700 font-medium border border-slate-300 rounded px-2 py-0.5 flex gap-1.5 items-center shadow-sm group">{t.name} <button onClick={() => handleDeleteType(t.name)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full p-0.5 transition-colors" title="이 종류 삭제"><X size={12}/></button></div>))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Dynamic Specs Section based on Type */}
                    {isBooklet ? (
                        <div className="mb-2.5 space-y-2.5">
                            {/* Cover Section */}
                            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 shadow-sm relative">
                                <h4 className="text-sm font-bold text-blue-700 mb-1.5 flex items-center gap-2">
                                    <BookOpen size={16} /> 표지 (Cover)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <SpecSelect label="용지 종류" subLabel="표지" value={currentSpecs.paperType} options={currentDef.paperTypes} onChange={(val: string) => updateCurrentSpecs({ paperType: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperTypes', val)} icon={<File size={16} />} />
                                    <SpecSelect label="평량 (두께)" subLabel="표지" value={currentSpecs.paperWeight} options={currentDef.paperWeights} onChange={(val: string) => updateCurrentSpecs({ paperWeight: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperWeights', val)} icon={<Layers size={16} />} suffix="g" />
                                    <div className="space-y-0.5">
                                        <div className="h-5 flex items-center justify-between">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                                <Palette size={16}/> 인쇄 도수 <span className="text-[10px] text-slate-400 font-normal ml-1">(표지)</span>
                                            </label>
                                        </div>
                                        <div className="relative">
                                            <select value={currentSpecs.printColor} onChange={(e) => updateCurrentSpecs({ printColor: e.target.value })} className={`${inputClass} cursor-pointer hover:bg-slate-50 appearance-none`}>
                                                {PRINT_COLORS.map(o => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500"><svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg></div>
                                        </div>
                                    </div>
                                    <div className="space-y-0.5 flex flex-col justify-end">
                                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer h-[34px] pb-1 select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={currentSpecs.hasCoverWing || false} 
                                                onChange={(e) => updateCurrentSpecs({ hasCoverWing: e.target.checked })} 
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4" 
                                            />
                                            <span className="text-sm font-bold text-slate-700">날개 표지 있음 (표지 날개)</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Inner Section (Multi-inner-page Tabbed UI) */}
                            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 shadow-sm relative flex flex-col">
                                <div className="flex justify-between items-center mb-1.5 border-b border-slate-200 pb-1.5 flex-wrap gap-2">
                                    <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                        <FileText size={16} /> 내지 사양 (Inner Pages)
                                    </h4>
                                    <div className="flex items-center gap-1 relative">
                                        {(() => {
                                            const innerPages = getInnerPages();
                                            let innerCount = 0;
                                            let dividerCount = 0;
                                            return innerPages.map((ip, idx) => {
                                                let label = '';
                                                if (ip.isDivider) {
                                                    dividerCount++;
                                                    label = `간지 ${dividerCount}`;
                                                } else {
                                                    innerCount++;
                                                    label = `내지 ${innerCount}`;
                                                }
                                                return (
                                                    <button
                                                        key={ip.id || idx}
                                                        type="button"
                                                        onClick={() => setActiveInnerTabIdx(idx)}
                                                        className={`px-2.5 py-1 rounded text-xs font-bold border transition-colors flex items-center gap-1 ${activeInnerTabIdx === idx ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                                                    >
                                                        <span>{label}</span>
                                                        {innerPages.length > 1 && (
                                                            <span 
                                                                onClick={(e) => { e.stopPropagation(); handleRemoveInnerPage(idx); }}
                                                                className="hover:text-red-300 transition-colors p-0.5 rounded-full hover:bg-black/10"
                                                            >
                                                                ✕
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            });
                                        })()}
                                        
                                        {/* 추가 버튼 및 드롭다운 메뉴 */}
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setShowInnerAddMenu(!showInnerAddMenu)}
                                                className="px-2 py-1 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center gap-0.5"
                                            >
                                                + 추가
                                            </button>
                                            {showInnerAddMenu && (
                                                <>
                                                    {/* Backdrop to close menu */}
                                                    <div 
                                                        className="fixed inset-0 z-30" 
                                                        onClick={() => setShowInnerAddMenu(false)}
                                                    />
                                                    <div className="absolute right-0 mt-1 w-28 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-40 animate-in fade-in slide-in-from-top-1 duration-150">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                handleAddInnerPage(false);
                                                                setShowInnerAddMenu(false);
                                                            }}
                                                            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 font-semibold"
                                                        >
                                                            내지 추가
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                handleAddInnerPage(true);
                                                                setShowInnerAddMenu(false);
                                                            }}
                                                            className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 font-semibold border-t border-slate-100"
                                                        >
                                                            간지 추가
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {getInnerPages().map((ip, idx) => {
                                    if (idx !== activeInnerTabIdx) return null;
                                    
                                    const isPageDivider = ip.isDivider;
                                    
                                    if (isPageDivider) {
                                        return (
                                            <div key={ip.id || idx} className="grid grid-cols-1 md:grid-cols-2 gap-2 animate-in fade-in duration-200 bg-amber-50/30 p-2.5 rounded-lg border border-amber-200/60 mt-1">
                                                <div className="space-y-0.5">
                                                    <div className="h-5 flex items-center">
                                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                                            간지 색상
                                                        </label>
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        value={ip.dividerColor || ''} 
                                                        onChange={(e) => updateCurrentInner(idx, { dividerColor: e.target.value })} 
                                                        placeholder="예: 백색, 황색, 청색" 
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <div className="h-5 flex items-center">
                                                        <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                                            간지 페이지 (수량)
                                                        </label>
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        value={ip.dividerQuantity || ''} 
                                                        onChange={(e) => updateCurrentInner(idx, { dividerQuantity: e.target.value })} 
                                                        placeholder="예: 2장, 4" 
                                                        className={inputClass}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={ip.id || idx} className="grid grid-cols-1 md:grid-cols-2 gap-2 animate-in fade-in duration-200">
                                            <SpecSelect label="용지 종류" subLabel={`내지 ${idx + 1}`} value={ip.paperType} options={currentDef.paperTypes} onChange={(val: string) => updateCurrentInner(idx, { paperType: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperTypes', val)} icon={<File size={16} />} />
                                            <SpecSelect label="평량 (두께)" subLabel={`내지 ${idx + 1}`} value={ip.paperWeight} options={currentDef.paperWeights} onChange={(val: string) => updateCurrentInner(idx, { paperWeight: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperWeights', val)} icon={<Layers size={16} />} suffix="g" />
                                            <div className="space-y-0.5">
                                                <div className="h-5 flex items-center justify-between">
                                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                                        <Palette size={16}/> 인쇄 도수 <span className="text-[10px] text-slate-400 font-normal ml-1">(내지 {idx + 1})</span>
                                                    </label>
                                                </div>
                                                <div className="relative">
                                                    <select value={ip.printColor || '단면 1도(흑백)'} onChange={(e) => updateCurrentInner(idx, { printColor: e.target.value })} className={`${inputClass} cursor-pointer hover:bg-slate-50 appearance-none`}>
                                                        {PRINT_COLORS.map(o => <option key={o} value={o}>{o}</option>)}
                                                    </select>
                                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500"><svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg></div>
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-0.5">
                                                <div className="h-5 flex items-center">
                                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1">내지 페이지 수</label>
                                                </div>
                                                <input 
                                                    type="text" 
                                                    value={ip.pagesCount || ''} 
                                                    onChange={(e) => updateCurrentInner(idx, { pagesCount: e.target.value })} 
                                                    placeholder="예: 32p 또는 32" 
                                                    className={inputClass} 
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Quantity (Common) */}
                            <div className="space-y-0.5">
                                <div className="h-5 flex items-center">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Printer size={16}/> 수량</label>
                                </div>
                                <input type="text" value={currentSpecs.quantity} onChange={(e) => updateCurrentSpecs({ quantity: e.target.value })} placeholder="예: 500권" className={inputClass} />
                            </div>
                        </div>
                    ) : (
                        // Standard Specs (Non-Booklet)
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2.5">
                            <SpecSelect label="용지 종류" value={currentSpecs.paperType} options={currentDef.paperTypes} onChange={(val: string) => updateCurrentSpecs({ paperType: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperTypes', val)} icon={<File size={16} />} />
                            <SpecSelect label="평량 (두께)" value={currentSpecs.paperWeight} options={currentDef.paperWeights} onChange={(val: string) => updateCurrentSpecs({ paperWeight: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperWeights', val)} icon={<Layers size={16} />} suffix="g" />
                            <div className="space-y-0.5">
                                <div className="h-5 flex items-center">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Palette size={16}/> 인쇄 도수</label>
                                </div>
                                <div className="relative">
                                    <select value={currentSpecs.printColor} onChange={(e) => updateCurrentSpecs({ printColor: e.target.value })} className={`${inputClass} cursor-pointer hover:bg-slate-50 appearance-none`}>
                                        {PRINT_COLORS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500"><svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg></div>
                                </div>
                            </div>
                            <div className="space-y-0.5">
                                <div className="h-5 flex items-center">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Printer size={16}/> 수량</label>
                                </div>
                                <input type="text" value={currentSpecs.quantity} onChange={(e) => updateCurrentSpecs({ quantity: e.target.value })} placeholder="예: 500매, 10건, 3box" className={inputClass} />
                            </div>
                        </div>
                    )}

                    {isBooklet ? (
                        <div className="mb-2.5 space-y-3">
                            <label className="text-xs font-semibold flex items-center gap-1 mb-1 booklet-processing-heading text-[#0f172a]"><Scissors size={12}/> 후가공 옵션 (책자 분류)</label>
                            
                            {/* 1. 제본/공통 후가공 */}
                            <div className="p-2.5 rounded-lg border-2 border-slate-400 bg-[#e2e8f0] booklet-processing-common-box">
                                <span className="text-xs font-bold mb-1.5 block booklet-processing-section-title text-[#0f172a]">제본 및 공통 후가공</span>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                    {getFilteredProcessingOptions('common').map((opt) => (
                                        <label key={`common-${opt}`} className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer transition-all text-xs ${currentSpecs.processing.includes(opt) ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-600 text-blue-700 dark:text-blue-100 font-medium' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                            <input type="checkbox" checked={currentSpecs.processing.includes(opt)} onChange={() => toggleProcessing(opt)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5" />
                                            {opt}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* 2. 표지 후가공 */}
                            <div className="p-2.5 rounded-lg border-2 border-blue-500 bg-[#bfdbfe] booklet-processing-cover-box">
                                <span className="text-xs font-bold mb-1.5 block booklet-processing-cover-title text-[#1e3a8a]">표지 전용 후가공</span>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                    {getFilteredProcessingOptions('cover').map((opt) => (
                                        <label key={`cover-${opt}`} className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer transition-all text-xs ${(currentSpecs.processingCover || []).includes(opt) ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-500 text-blue-800 dark:text-blue-100 font-medium' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                            <input type="checkbox" checked={(currentSpecs.processingCover || []).includes(opt)} onChange={() => toggleProcessingCover(opt)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5" />
                                            {opt}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* 3. 내지 후가공 */}
                            <div className="p-2.5 rounded-lg border-2 border-emerald-500 bg-[#a7f3d0] booklet-processing-inner-box">
                                <span className="text-xs font-bold mb-1.5 block booklet-processing-inner-title text-[#14532d]">내지 전용 후가공</span>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                                    {getFilteredProcessingOptions('inner').map((opt) => (
                                        <label key={`inner-${opt}`} className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer transition-all text-xs ${(currentSpecs.processingInner || []).includes(opt) ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-100 font-medium' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                            <input type="checkbox" checked={(currentSpecs.processingInner || []).includes(opt)} onChange={() => toggleProcessingInner(opt)} className="rounded border-slate-300 text-emerald-600 focus:ring-blue-500 w-3.5 h-3.5" />
                                            {opt}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-2.5">
                            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-1"><Scissors size={12}/> 후가공 옵션</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                            {getFilteredProcessingOptions().map((opt) => (<label key={opt} className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer transition-all text-sm ${currentSpecs.processing.includes(opt) ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-600 text-blue-700 dark:text-blue-100 font-medium' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}`}><input type="checkbox" checked={currentSpecs.processing.includes(opt)} onChange={() => toggleProcessing(opt)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />{opt}</label>))}
                            
                            {/* 기타 (직접입력) 체크박스 배지 수동 추가 */}
                            <label className={`flex items-center gap-1.5 p-1.5 rounded border cursor-pointer transition-all text-sm ${isCustomChecked ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-600 text-blue-700 dark:text-blue-100 font-medium' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                <input 
                                    type="checkbox" 
                                    checked={isCustomChecked} 
                                    onChange={handleCustomCheckboxToggle} 
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                                />
                                기타 (직접입력)
                            </label>
                            </div>
                            
                            {/* 기타 (직접입력) 활성화 시 스르륵 열리는 입력 인풋창 */}
                            {isCustomChecked && (
                                <div className="mt-1.5 animate-in slide-in-from-top-1 duration-200">
                                    <input 
                                        type="text"
                                        value={customInputVal}
                                        onChange={(e) => handleCustomInputChange(e.target.value)}
                                        placeholder="특수 후가공 사양을 직접 기입하세요 (예: 금박 30x40mm 우측하단)"
                                        className="w-full px-2.5 py-1.5 h-[34px] bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500 focus:bg-white text-sm placeholder-slate-400 font-medium outline-none transition-all"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    {/* 우측 추가 메모 / 특이사항 본문 복원 - mt-auto를 지정해 우측 컬럼 최하단으로 내림 */}
                    <div className="space-y-0.5 mt-auto pt-2.5">
                        <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Tag size={12}/> 추가 메모 / 특이사항</label>
                        <textarea 
                            value={currentSpecs.memo} 
                            onChange={(e) => updateCurrentSpecs({ memo: e.target.value })} 
                            rows={3} 
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-400 font-medium outline-none resize-none" 
                            placeholder="작업 관련 추가 지시사항이나 메모를 입력하세요."
                        />
                    </div>
                </div>
            </div>
          </div>
          <div className="p-2.5 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 flex-none">
            {!isNew && (canDeletePermanently || currentUser) && (
              <div className="mr-auto flex items-center gap-2 transition-all">
                {canDeletePermanently && (
                  <>
                    <button 
                      onClick={handleDelete} 
                      className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg font-bold transition-colors flex items-center gap-1.5 text-xs sm:text-sm h-8 border border-red-100 hover:border-red-200" 
                      title="이 작업을 전산에서 영구적으로 완전히 삭제하여 검색에서도 제외합니다."
                    >
                      <Trash2 size={16} />
                      <span className="hidden sm:inline">완전 삭제</span>
                    </button>
                    <div className="w-px h-4 bg-slate-200 flex-none" />
                  </>
                )}
                {currentUser && (
                  editedJob.status !== 'CANCELED' ? (
                    <button 
                      onClick={handleCancelJob} 
                      className="px-3 py-1.5 text-orange-600 hover:bg-orange-50 rounded-lg font-bold transition-colors flex items-center gap-1.5 text-xs sm:text-sm h-8" 
                      title="소비자 취소로 이 작업을 취소 보관함으로 옮깁니다"
                    >
                      <FileX size={16} />
                      <span className="hidden md:inline">작업 취소</span>
                    </button>
                  ) : (
                    <button 
                      onClick={handleRestoreJob} 
                      className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg font-bold transition-colors flex items-center gap-1.5 text-xs sm:text-sm h-8" 
                      title="취소된 작업을 다시 진행 중인 공정으로 복원합니다"
                    >
                      <RotateCcw size={16} />
                      <span className="hidden md:inline">작업 복구</span>
                    </button>
                  )
                )}
              </div>
            )}
            {!isNew && (
              <>
                {!editedJob.managementCardPinnedAt && (
                  <button
                    onClick={async () => {
                      await db.hideJobFromBoard(editedJob.id, currentUser?.id);
                      onClose();
                    }}
                    className="px-4 py-1.5 bg-rose-600 text-white hover:bg-rose-700 rounded-lg font-bold transition-colors flex items-center gap-2 shadow-sm"
                    title="작업 내역은 남기고 보드(칸반/달력/상황판)에서만 숨깁니다"
                  >
                    보드에서 내리기
                  </button>
                )}
                <button
                  onClick={handleOpenQuotePreview}
                  disabled={openingQuote}
                  className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-bold transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                  title="이 작업의 견적서 미리보기"
                >
                  {openingQuote ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                  <span className="hidden sm:inline">견적서 보기</span>
                </button>
                <button onClick={() => openJobOrderPreviewWindow(editedJob)} className="px-4 py-1.5 bg-slate-700 text-white hover:bg-slate-800 rounded-lg font-bold transition-colors flex items-center gap-2 shadow-sm" title="작업지시서 인쇄 미리보기"><Printer size={18} /><span className="hidden sm:inline">작업지시서 인쇄</span></button>
                <button 
                    onClick={() => editedJob.clientPhone ? setShowContactModal(true) : undefined} 
                    disabled={!editedJob.clientPhone}
                    className={`px-4 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-2 shadow-sm ${editedJob.clientPhone ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                    title={editedJob.clientPhone ? "고객 알림 문자 전송" : "연락처 없음"}
                >
                    <MessageCircle size={18} />
                    <span>{editedJob.clientPhone ? "문자" : "연락처없음"}</span>
                </button>
              </>
            )}
            <button onClick={() => isNew ? onClose() : setViewMode('summary')} className="px-5 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors" title={isNew ? "닫기" : "요약 보기로 돌아가기"}>취소</button>
            <button onClick={handleSave} className="px-8 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md transition-all hover:scale-[1.02] flex items-center gap-2" title="작업 내용 저장">{isNew ? <><Check size={18}/> 신규 등록</> : '저장 완료'}</button>
          </div>
            </div>
          )}
        </div>
      </div>
      {showContactModal && (
        <ClientContactModal 
          job={editedJob} 
          onClose={() => setShowContactModal(false)} 
          onUpdate={(updatedJob) => {
            setEditedJob(updatedJob);
            onUpdate(updatedJob);
          }} 
        />
      )}
    </>
  );
}

export { JobDetailModal };
export default JobDetailModal;
