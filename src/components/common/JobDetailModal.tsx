
import React, { useState, useEffect, useRef } from 'react';
import { Job, Priority, Staff, PaymentStatus, Client, JobItem, JobSpecs, JobTypeDefinition, JobStatusDefinition, JobHistoryLog } from '../../types';
import { db, calculateEstimate, formatPhoneNumber, getErrorMessage } from '../../services/dataService';
import { X, Calendar, User, FileText, DollarSign, Printer, Tag, Layers, Scissors, Palette, FileBox, File, Phone, MessageCircle, FolderOpen, Copy, Check, History, Calculator, ArrowRightCircle, CreditCard, Trash2, Building2, Search, Settings, Plus, Droplets, Package, ArrowRight, UserCheck, FileEdit, PlusCircle, Users, BookOpen } from 'lucide-react';
import { ClientContactModal } from './ClientContactModal';
import { JobOrderPreviewModal } from './JobOrderPreviewModal';
import { useDialog } from '../../contexts/DialogContext';
import { NetworkPathPicker } from '../settings/NetworkPathPicker';
import { LocalPathInput } from './LocalPathInput';
import { useAuth } from '../../contexts/AuthContext';


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
        default: return <FileEdit size={14} className="text-orange-500" />;
    }
}

const HistoryTimeline: React.FC<{ history: JobHistoryLog[], staff: Staff[] }> = ({ history, staff }) => {
    const getStaffName = (id: string) => staff.find(s => s.id === id)?.name || '시스템';
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
                                {getStaffName(log.staffId)} <span className="font-normal text-slate-400 ml-1">{formatRealTime(log.timestamp)}</span>
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
}

const PRINT_COLORS = ['선택안함', '단면 4도(컬러)', '양면 8도(컬러)', '단면 1도(흑백)', '양면 2도(흑백)', '별색'];
const PROCESSING_OPTIONS = ['유광코팅', '무광코팅', '오시', '미싱', '타공', '귀도리', '접지', '무선제본', '중철제본', '스프링제본', '박가공', '형압', '양면테이프', '도무송', '미싱(절취선)', '넘버링'];

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

const SpecSelect = ({ label, value, options, onChange, onAdd, icon, suffix, subLabel }: any) => {
    const isCustomValue = value && options.length > 0 && !options.includes(value);
    const [forceDirect, setForceDirect] = useState(false);
    const isDirect = isCustomValue || forceDirect || options.length === 0;
    const inputClass = "w-full px-3 py-2 h-10 bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-400";

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
            <div className="h-6 flex items-center justify-between">
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

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ job, staff, onClose, onUpdate, onNavigateToQuote, isNew = false }) => {
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
  };

  const [editedJob, setEditedJob] = useState<Job>(initialJob);
  const [viewMode, setViewMode] = useState<'summary' | 'edit'>(isNew ? 'edit' : 'summary');
  const [activeTabIdx, setActiveTabIdx] = useState(0); 
  
  const [showContactModal, setShowContactModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);
  const [isStaffDropdownOpen, setIsStaffDropdownOpen] = useState(false);
  
  const [productDefs, setProductDefs] = useState<JobTypeDefinition[]>([]);
  const [isManagingTypes, setIsManagingTypes] = useState(false);
  const [newTypeInput, setNewTypeInput] = useState('');

  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([]);
  const [showClientSearch, setShowClientSearch] = useState(false);
  
  const { showConfirm, showAlert } = useDialog();
  const { currentUser } = useAuth();
  const [pastJobs, setPastJobs] = useState<Job[]>([]);
  const [statusDefinitions, setStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const [estimateResult, setEstimateResult] = useState<{cost: number, recommended: number} | null>(null);

  const currentSubJob = editedJob.subJobs![activeTabIdx];
  const currentSpecs = currentSubJob.specs;
  const isBooklet = currentSubJob.type.includes('책자') || currentSubJob.type.includes('카탈로그') || currentSubJob.type.includes('카달로그');

  useEffect(() => {
    setStatusDefinitions(db.getStatusDefinitions());
    setProductDefs(db.getProductDefinitions());
    const unsubscribe = db.subscribe(() => setProductDefs(db.getProductDefinitions()));
    return () => unsubscribe();
  }, []);

  const currentDef = productDefs.find(d => d.name === currentSubJob.type) || 
                     productDefs.find(d => d.name === '기타') || 
                     { name: '직접입력', sizes: [], paperTypes: [], paperWeights: [] };

  useEffect(() => {
    if (!isNew || !editedJob.clientName || editedJob.clientName.length < 2) {
      setPastJobs([]);
      return;
    }
    const timer = setTimeout(() => {
      setPastJobs(db.getJobsByClient(editedJob.clientName));
    }, 500);
    return () => clearTimeout(timer);
  }, [editedJob.clientName, isNew]);

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

  const handleTypeChange = (newType: string) => {
      const def = productDefs.find(d => d.name === newType);
      const isNewTypeBooklet = newType.includes('책자') || newType.includes('카탈로그') || newType.includes('카달로그');
      
      const newSpecs: JobSpecs = {
          ...currentSubJob.specs,
          size: def?.sizes?.[0] || '',
          paperType: def?.paperTypes?.[0] || '',
          paperWeight: def?.paperWeights?.[0] || '',
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

  const handleSave = () => {
    if (!currentUser) {
        showAlert("사용자 정보가 없어 저장할 수 없습니다.");
        return;
    }
    const newHistory: JobHistoryLog[] = [...(editedJob.history || [])];
    if (isNew) {
        newHistory.push({
            timestamp: new Date().toISOString(),
            staffId: currentUser.id,
            action: '작업 생성',
            details: `'${editedJob.title || '제목 없음'}' 작업을 생성했습니다.`
        });
    } else {
        const originalJob = job;
        const updatedJob = editedJob;
        const statusNameMap = new Map(statusDefinitions.map(s => [s.key, s.label]));

        const pushChange = (action: string, details: string) => {
            newHistory.push({ timestamp: new Date().toISOString(), staffId: currentUser.id, action, details });
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

    const finalJob: Job = { 
        ...editedJob, 
        id: isNew ? Date.now().toString() : editedJob.id,
        history: newHistory,
        type: mainItem.type,
        specs: mainItem.specs,
        description: summaryDesc,
        subJobs: subJobs,
        assignedStaffId: (editedJob.assignedStaffIds && editedJob.assignedStaffIds.length > 0) ? editedJob.assignedStaffIds[0] : undefined
    };
    onUpdate(finalJob);
  };

  const handleDelete = async () => {
      if (await showConfirm(`'${editedJob.title}' 작업을 정말 삭제하시겠습니까?`)) {
          try {
              await db.deleteJob(editedJob.id);
              onClose();
          } catch (error) {
              showAlert(getErrorMessage(error));
          }
      }
  };

  const toggleProcessing = (option: string) => {
    const current = currentSpecs.processing || [];
    const updated = current.includes(option) ? current.filter(item => item !== option) : [...current, option];
    updateCurrentSpecs({ processing: updated });
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

  const handleCalculate = () => {
    const result = calculateEstimate(currentSpecs, db.getPricingConfig());
    setEstimateResult({ cost: result.totalCost, recommended: result.recommendedPrice });
  };

  const applyEstimate = () => {
    if (estimateResult) {
      setEditedJob({ ...editedJob, price: (editedJob.price || 0) + estimateResult.recommended });
      setEstimateResult(null);
    }
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

  const handleClientSearch = (query: string, field: 'company' | 'person') => {
      if (field === 'company') setEditedJob({...editedJob, clientName: query});
      if (field === 'person') setEditedJob({...editedJob, contactPerson: query});
      if (query.length > 1) {
          setClientSearchResults(db.searchClients(query));
          setShowClientSearch(true);
      } else {
          setShowClientSearch(false);
      }
  };

  const selectClient = (client: Client) => {
      setEditedJob({ ...editedJob, clientName: client.name, contactPerson: client.contactPerson, clientPhone: client.phone });
      setShowClientSearch(false);
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

  const inputClass = "w-full px-3 py-2 h-10 bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-400";
  const sidebarInputClass = "w-full p-1.5 bg-slate-50 border border-slate-200 rounded text-sm text-slate-700 focus:ring-1 focus:ring-blue-500";
  const availableStaff = staff.filter(s => !s.isDeleted && s.active);
  const selectedStaffIds = editedJob.assignedStaffIds || [];
  const shouldWrapTabs = (editedJob.subJobs || []).length > 4;
  
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[90vh]">
          {viewMode === 'summary' ? (
            <div className="flex flex-col h-full bg-slate-50">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 flex justify-between items-start bg-white flex-none">
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
                                <div className="flex justify-between"><span className="text-slate-500">총 금액:</span> <span className="font-bold text-slate-800">{editedJob.price.toLocaleString()}원</span></div>
                            </div>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Layers size={20}/> 제작 사양 상세</h3>
                    <div className="space-y-4">
                        {(editedJob.subJobs || []).map((subJob, idx) => {
                            const isSubBooklet = subJob.type.includes('책자') || subJob.type.includes('카탈로그') || subJob.type.includes('카달로그');
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
                                                    </ul>
                                                </div>
                                                <div>
                                                    <h5 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1"><FileText size={14}/> 내지</h5>
                                                    <ul className="space-y-1.5 text-sm text-slate-700">
                                                        <li><span className="text-slate-400 inline-block w-16">용지:</span> {subJob.specs.paperTypeInner || '-'} {subJob.specs.paperWeightInner || ''}</li>
                                                        <li><span className="text-slate-400 inline-block w-16">도수:</span> {subJob.specs.printColorInner || '-'}</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        ) : (
                                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-6 text-sm text-slate-700 mb-4">
                                                <li><span className="text-slate-400 inline-block w-16">규격:</span> {subJob.specs.size || '-'}</li>
                                                <li><span className="text-slate-400 inline-block w-16">용지:</span> {subJob.specs.paperType || '-'} {subJob.specs.paperWeight || ''}</li>
                                                <li><span className="text-slate-400 inline-block w-16">도수:</span> {subJob.specs.printColor || '-'}</li>
                                            </ul>
                                        )}
                                        
                                        {subJob.specs.processing && subJob.specs.processing.length > 0 && (
                                            <div className="mb-4">
                                                <h5 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1"><Scissors size={14}/> 후가공</h5>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {subJob.specs.processing.map(p => (
                                                        <span key={p} className="bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded border border-slate-200">{p}</span>
                                                    ))}
                                                </div>
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
                    <button onClick={() => setShowPrintModal(true)} className="mr-auto px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-bold transition-colors flex items-center gap-2 border border-slate-300" title="작업지시서 인쇄 미리보기"><Printer size={18} /><span className="hidden sm:inline">작업지시서 인쇄</span></button>
                    <button onClick={onClose} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors">닫기</button>
                    <button onClick={() => setViewMode('edit')} className="px-8 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md transition-all flex items-center gap-2"><FileEdit size={18}/> 상세 정보 및 수정</button>
                </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-6 border-b border-slate-200 flex justify-between items-start bg-slate-50 flex-none">
            <div className="flex items-start gap-4 w-full max-w-3xl">
              <div className={`p-3 rounded-xl shrink-0 mt-1 shadow-sm ${editedJob.priority === Priority.VERY_URGENT ? 'bg-red-100 text-red-600' : editedJob.priority === Priority.URGENT ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                  <FileText size={28} />
              </div>
              <div className="w-full relative">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2 w-full mb-3">
                  <input 
                      value={editedJob.title}
                      onChange={(e) => setEditedJob({...editedJob, title: e.target.value})}
                      className="bg-transparent border-none focus:ring-0 p-2 -ml-2 font-bold w-full text-slate-800 placeholder-slate-300 caret-blue-600 focus:bg-white/60 rounded-lg transition-colors"
                      placeholder={isNew ? "통합 작업 제목 (예: 삼성전자 3월 주문건)" : "작업 제목 입력"}
                  />
                </h2>
                
                <div className="flex gap-4 items-center text-base relative">
                    <div className="flex items-center gap-2 flex-1 relative group">
                        <Building2 size={18} className="text-slate-400 shrink-0" />
                        <input 
                            value={editedJob.clientName}
                            onChange={(e) => handleClientSearch(e.target.value, 'company')}
                            onFocus={() => { if(editedJob.clientName.length > 1) setShowClientSearch(true); }}
                            onBlur={() => setTimeout(() => setShowClientSearch(false), 200)}
                            className="bg-transparent border-b-2 border-slate-200 focus:border-blue-500 focus:outline-none text-slate-700 w-full placeholder-slate-300 font-bold py-2 transition-colors"
                            placeholder="고객사(상호)"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-32 sm:w-40 relative">
                        <User size={18} className="text-slate-400 shrink-0" />
                        <input 
                            value={editedJob.contactPerson || ''}
                            onChange={(e) => handleClientSearch(e.target.value, 'person')}
                            onFocus={() => { if((editedJob.contactPerson || '').length > 1) setShowClientSearch(true); }}
                            onBlur={() => setTimeout(() => setShowClientSearch(false), 200)}
                            className="bg-transparent border-b-2 border-slate-200 focus:border-blue-500 focus:outline-none text-slate-600 w-full placeholder-slate-300 py-2 transition-colors"
                            placeholder="담당자명"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-40 sm:w-48">
                        <Phone size={18} className="text-slate-400 shrink-0" />
                        <input 
                            value={editedJob.clientPhone || ''}
                            onChange={(e) => setEditedJob({...editedJob, clientPhone: formatPhoneNumber(e.target.value)})}
                            className="bg-transparent border-b-2 border-slate-200 focus:border-blue-500 focus:outline-none text-slate-600 w-full placeholder-slate-300 py-2 transition-colors"
                            placeholder="연락처"
                        />
                        {!isNew && editedJob.clientPhone && (
                            <button onClick={() => setShowContactModal(true)} className="p-1.5 ml-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 shrink-0 shadow-sm">
                                <MessageCircle size={16} />
                            </button>
                        )}
                    </div>
                    {showClientSearch && clientSearchResults.length > 0 && (
                        <div className="absolute top-12 left-0 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto">
                            {clientSearchResults.map(client => (
                                <button key={client.id} onMouseDown={() => selectClient(client)} className="w-full text-left px-4 py-3 hover:bg-blue-50 flex flex-col border-b border-slate-50 last:border-0">
                                    <div className="font-bold text-slate-800 text-sm">{client.name}</div>
                                    <div className="text-xs text-slate-500 flex gap-2 mt-1"><span>{client.contactPerson}</span><span>|</span><span>{client.phone}</span></div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors shrink-0"><X size={28} className="text-slate-400 hover:text-slate-600" /></button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
            {/* Left Column: Sidebar - Adjusted for 1920x1080 (Whole Scroll) */}
            <div className="w-full lg:w-1/3 bg-slate-50 p-2 border-r border-slate-200 flex flex-col gap-2 overflow-hidden">
              
              {/* Past Jobs History */}
              {isNew && pastJobs.length > 0 && (
                <div className="bg-white border-2 border-blue-100 rounded-lg p-2 shadow-sm animate-in slide-in-from-left-2 duration-300 flex-none">
                  <div className="flex items-center justify-between mb-1.5 px-1">
                     <h3 className="text-xs font-bold text-blue-700 flex items-center gap-1"><History size={12} /> 최근 주문 이력</h3>
                     <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 rounded-full font-bold">{pastJobs.length}건</span>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                    {pastJobs.slice(0, 3).map(pj => (
                      <div key={pj.id} className="flex gap-2 p-1.5 rounded bg-slate-50 border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-colors group items-center">
                        <div className="w-6 h-6 rounded bg-slate-200 flex items-center justify-center shrink-0 text-[10px] text-slate-500 font-bold">{pj.type.substring(0,1)}</div>
                        <div className="flex-1 min-w-0"><p className="text-[11px] font-bold text-slate-800 truncate">{pj.title}</p></div>
                        <button onClick={() => handleReorder(pj)} className="px-2 py-0.5 bg-white border border-slate-200 text-[10px] font-bold text-blue-600 rounded hover:bg-blue-600 hover:text-white transition-colors shrink-0">불러오기</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status & Priority */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex gap-2 flex-none">
                <div className="flex-1">
                    <label className="text-[11px] font-bold text-slate-500 mb-0.5 block">상태</label>
                    <select value={editedJob.status} onChange={(e) => setEditedJob({...editedJob, status: e.target.value })} className={sidebarInputClass}>
                        {statusDefinitions.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                </div>
                <div className="flex-1">
                    <label className="text-[11px] font-bold text-slate-500 mb-0.5 block">우선순위</label>
                    <select value={editedJob.priority} onChange={(e) => setEditedJob({...editedJob, priority: e.target.value as Priority})} className={sidebarInputClass}>
                        {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
              </div>

              {/* Staff */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm relative z-20 flex-none">
                <div className="flex-1">
                    <label className="text-[11px] font-bold text-slate-500 mb-0.5 flex items-center gap-1"><Users size={12}/> 담당자 (다중 선택 가능)</label>
                    <div className="relative">
                        <div className="w-full min-h-[34px] p-1 bg-slate-50 border border-slate-200 rounded flex flex-wrap gap-1 items-center cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setIsStaffDropdownOpen(!isStaffDropdownOpen)}>
                            {selectedStaffIds.length === 0 && <span className="text-slate-400 text-sm px-1">담당자 선택...</span>}
                            {selectedStaffIds.map(id => {
                                const s = staff.find(st => st.id === id);
                                return s ? (
                                    <span key={id} className="bg-white border border-slate-300 text-slate-700 text-[11px] px-1.5 py-0.5 rounded-md flex items-center gap-1 font-bold shadow-sm">
                                        {s.name}<span className="text-[9px] text-slate-400 font-normal">({s.role})</span>
                                        <button onClick={(e) => { e.stopPropagation(); toggleStaff(id); }} className="hover:text-red-500"><X size={10}/></button>
                                    </span>
                                ) : null;
                            })}
                        </div>
                        {isStaffDropdownOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsStaffDropdownOpen(false)}></div>
                                <div className="absolute top-full left-0 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-xl max-h-48 overflow-y-auto z-20 custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                                    {availableStaff.map(s => (
                                        <div key={s.id} onClick={() => toggleStaff(s.id)} className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 flex items-center justify-between ${selectedStaffIds.includes(s.id) ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700'}`}>
                                            <span>{s.name} <span className="text-xs text-slate-400 font-normal ml-1">({s.role})</span></span>
                                            {selectedStaffIds.includes(s.id) && <Check size={14} />}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
              </div>
              
              {/* Dates */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex-none">
                <label className="text-[11px] font-bold text-slate-500 mb-0.5 block">접수일 설정</label>
                <div className="flex flex-col gap-1.5">
                    <input type="date" value={createdAtDatePart} onChange={(e) => handleCreatedAtDateChange(e.target.value)} className={sidebarInputClass} style={{ colorScheme: 'light' }} />
                    <select value={createdAtDisplayTime} onChange={(e) => handleCreatedAtTimeChange(e.target.value)} className={sidebarInputClass}>
                        {TIME_OPTIONS.map(t => (<option key={t} value={t}>{t}</option>))}
                        <option value={AFTER_HOURS_VALUE}>18:00 이후</option>
                    </select>
                </div>
              </div>

              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex-none">
                <label className="text-[11px] font-bold text-slate-500 mb-0.5 block">납기일 설정</label>
                <div className="flex flex-col gap-1.5">
                    <input type="date" value={datePart} onChange={(e) => handleDateChange(e.target.value)} className={sidebarInputClass} style={{ colorScheme: 'light' }} />
                    <select value={displayTime} onChange={(e) => handleTimeChange(e.target.value)} className={sidebarInputClass}>
                        {TIME_OPTIONS.map(t => (<option key={t} value={t}>{t}</option>))}
                        <option value={AFTER_HOURS_VALUE}>18:00 이후</option>
                    </select>
                </div>
              </div>

              {/* NAS Path */}
              <LocalPathInput 
                value={editedJob.filePath || ''} 
                onChange={(path) => setEditedJob({...editedJob, filePath: path})} 
              />
              
              {/* Payment */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden flex-none">
                <div className="flex justify-between items-center mb-1.5">
                   <label className="text-[11px] font-bold text-slate-500 flex items-center gap-1"><DollarSign size={12} /> 견적 및 결제</label>
                   <button onClick={handleCalculate} className="text-[10px] flex items-center gap-1 bg-slate-800 text-yellow-400 px-2 py-0.5 rounded-full font-bold hover:bg-slate-700 transition-colors"><Calculator size={10} /> ⚡현재항목 추가</button>
                </div>
                {estimateResult && (<div className="mb-2 bg-slate-100 p-2 rounded border border-slate-200 animate-in fade-in zoom-in duration-200"><div className="flex justify-between text-xs mb-1"><span className="text-slate-500">예상 원가:</span><span className="font-mono text-slate-600">{estimateResult.cost.toLocaleString()}원</span></div><div className="flex justify-between text-sm font-bold items-center"><span className="text-slate-700">추천 공급가:</span><div className="flex items-center gap-2"><span className="text-blue-600">+{estimateResult.recommended.toLocaleString()}원</span><button onClick={applyEstimate} className="bg-blue-600 text-white p-1 rounded hover:bg-blue-700"><ArrowRightCircle size={14} /></button></div></div></div>)}
                <div className="flex items-center gap-2 mb-2"><input type="number" value={editedJob.price} onChange={(e) => setEditedJob({...editedJob, price: Number(e.target.value)})} className="w-full p-1.5 bg-white border border-slate-300 rounded text-right font-bold text-sm text-blue-700 focus:ring-1 focus:ring-blue-500" /><span className="text-xs font-bold text-slate-600 whitespace-nowrap">원 (총액)</span></div>
                <div className="flex items-center gap-2"><label className="text-[11px] font-bold text-slate-500 whitespace-nowrap flex items-center gap-1"><CreditCard size={12} /> 상태:</label><select value={editedJob.paymentStatus} onChange={(e) => setEditedJob({...editedJob, paymentStatus: e.target.value as PaymentStatus})} className={`flex-1 p-1 rounded text-xs font-bold border outline-none ${editedJob.paymentStatus === '결제완료' ? 'bg-blue-50 text-blue-700 border-blue-200' : editedJob.paymentStatus === '일부결제' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :'bg-red-50 text-red-700 border-red-200'}`}><option value="결제대기">결제대기</option><option value="일부결제">일부결제</option><option value="결제완료">결제완료</option></select></div>
                {!isNew && onNavigateToQuote && (<button onClick={() => onNavigateToQuote(editedJob.linkedQuoteId)} className="mt-2 w-full py-1.5 bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold rounded hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"><FileText size={12} />견적서 바로가기</button>)}
              </div>

              {/* History - Takes remaining space and scrolls */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
                  <label className="text-[11px] font-bold text-slate-500 mb-1.5 block flex items-center gap-1 shrink-0"><History size={12} /> 작업 이력</label>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                      {editedJob.history && editedJob.history.length > 0 ? (
                          <HistoryTimeline history={editedJob.history} staff={staff} />
                      ) : (
                          <div className="h-full flex items-center justify-center text-center text-slate-400 text-xs p-4">
                              <p>기록된 이력이 없습니다.<br/>작업 상태를 변경하거나<br/>내용을 저장하면 기록이 시작됩니다.</p>
                          </div>
                      )}
                  </div>
              </div>
            </div>

            {/* Right Column: Detailed Specs */}
            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <div className={`flex items-end gap-2 px-3 pt-3 bg-slate-100 border-b border-slate-200 flex-none transition-all ${shouldWrapTabs ? 'flex-wrap h-auto' : 'overflow-x-auto custom-scrollbar h-14'}`}>
                    {(editedJob.subJobs || []).map((subJob, idx) => (
                        <button key={idx} onClick={() => setActiveTabIdx(idx)} className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-bold min-w-[100px] border-t border-x relative transition-all ${activeTabIdx === idx ? 'bg-white text-blue-700 border-slate-200 border-b-white -mb-[1px] z-10 shadow-[0_-2px_3px_rgba(0,0,0,0.02)]' : 'bg-slate-200 text-slate-500 border-transparent hover:bg-slate-300/50 mb-1'}`}>
                            <span className="truncate max-w-[120px] flex items-center h-5">{idx + 1}. {subJob.type}</span>
                            {(editedJob.subJobs || []).length > 1 && (<span onClick={(e) => { e.stopPropagation(); handleRemoveSubJob(idx); }} className="p-0.5 rounded-full hover:bg-red-100 hover:text-red-500 ml-1 transition-colors"><X size={12} /></span>)}
                        </button>
                    ))}
                    <button onClick={handleAddSubJob} className="flex items-center gap-1.5 px-3 py-2 mb-1.5 rounded-md text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"><Plus size={14} />상품추가</button>
                </div>

                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar border-t border-slate-100">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-3"><h3 className="font-bold text-slate-700 flex items-center gap-2"><Layers size={18} /> 제작 사양</h3></div>
                        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                            <button onClick={() => setColorMode('color')} title="컬러 인쇄 모드로 설정" className={`px-3 py-1 rounded text-xs font-bold transition-all ${isColor ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><span className="flex items-center gap-1"><Droplets size={12} className={isColor ? 'fill-blue-600' : ''}/> 컬러</span></button>
                            <button onClick={() => setColorMode('bw')} title="흑백 인쇄 모드로 설정" className={`px-3 py-1 rounded text-xs font-bold transition-all ${isBW ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><span className="flex items-center gap-1"><Droplets size={12} className={isBW ? 'fill-black' : ''}/> 흑백</span></button>
                        </div>
                    </div>
                    
                    {/* Product Type & Size (Always Visible) */}
                    <div className="mb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                             <div className="space-y-1">
                                <div className="flex justify-between items-center h-6">
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
                            <div className="mt-3 bg-slate-50 p-4 rounded-xl border border-blue-100 shadow-sm animate-in slide-in-from-top-2">
                                <div className="flex items-center justify-between mb-3"><h4 className="text-xs font-bold text-slate-600">목록 편집</h4></div>
                                <div className="flex flex-col gap-3">
                                    <div className="flex gap-2 items-center">
                                        <input value={newTypeInput} onChange={(e) => setNewTypeInput(e.target.value)} placeholder="새 종류 추가 (예: 엽서)" className="text-sm p-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 placeholder-slate-400 min-w-[200px]" onKeyDown={(e) => e.key === 'Enter' && handleAddType()} />
                                        <button onClick={handleAddType} title="새 종류 추가" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg shadow-sm transition-colors font-bold text-sm flex items-center gap-1"><Plus size={16}/> 추가</button>
                                    </div>
                                    <div className="flex flex-wrap gap-2 p-2 bg-white border border-slate-200 rounded-lg min-h-[40px]">
                                        {productDefs.map(t => (<div key={t.name} className="text-xs bg-slate-50 text-slate-700 font-medium border border-slate-300 rounded px-2 py-1 flex gap-2 items-center shadow-sm group">{t.name} <button onClick={() => handleDeleteType(t.name)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full p-0.5 transition-colors" title="이 종류 삭제"><X size={12}/></button></div>))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Dynamic Specs Section based on Type */}
                    {isBooklet ? (
                        <div className="mb-4 space-y-4">
                            {/* Cover Section */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm relative">
                                <h4 className="text-sm font-bold text-blue-700 mb-3 flex items-center gap-2">
                                    <BookOpen size={16} /> 표지 (Cover)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <SpecSelect label="용지 종류" subLabel="표지" value={currentSpecs.paperType} options={currentDef.paperTypes} onChange={(val: string) => updateCurrentSpecs({ paperType: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperTypes', val)} icon={<File size={16} />} />
                                    <SpecSelect label="평량 (두께)" subLabel="표지" value={currentSpecs.paperWeight} options={currentDef.paperWeights} onChange={(val: string) => updateCurrentSpecs({ paperWeight: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperWeights', val)} icon={<Layers size={16} />} suffix="g" />
                                    <div className="space-y-1">
                                        <div className="h-6 flex items-center justify-between">
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
                                </div>
                            </div>

                            {/* Inner Section */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm relative">
                                <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                    <FileText size={16} /> 내지 (Inner Pages)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <SpecSelect label="용지 종류" subLabel="내지" value={currentSpecs.paperTypeInner || ''} options={currentDef.paperTypes} onChange={(val: string) => updateCurrentSpecs({ paperTypeInner: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperTypes', val)} icon={<File size={16} />} />
                                    <SpecSelect label="평량 (두께)" subLabel="내지" value={currentSpecs.paperWeightInner || ''} options={currentDef.paperWeights} onChange={(val: string) => updateCurrentSpecs({ paperWeightInner: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperWeights', val)} icon={<Layers size={16} />} suffix="g" />
                                    <div className="space-y-1">
                                        <div className="h-6 flex items-center justify-between">
                                            <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                                                <Palette size={16}/> 인쇄 도수 <span className="text-[10px] text-slate-400 font-normal ml-1">(내지)</span>
                                            </label>
                                        </div>
                                        <div className="relative">
                                            <select value={currentSpecs.printColorInner || '단면 1도(흑백)'} onChange={(e) => updateCurrentSpecs({ printColorInner: e.target.value })} className={`${inputClass} cursor-pointer hover:bg-slate-50 appearance-none`}>
                                                {PRINT_COLORS.map(o => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500"><svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Quantity (Common) */}
                            <div className="space-y-1">
                                <div className="h-6 flex items-center">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Printer size={16}/> 수량</label>
                                </div>
                                <input type="text" value={currentSpecs.quantity} onChange={(e) => updateCurrentSpecs({ quantity: e.target.value })} placeholder="예: 500권" className={inputClass} />
                            </div>
                        </div>
                    ) : (
                        // Standard Specs (Non-Booklet)
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                            <SpecSelect label="용지 종류" value={currentSpecs.paperType} options={currentDef.paperTypes} onChange={(val: string) => updateCurrentSpecs({ paperType: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperTypes', val)} icon={<File size={16} />} />
                            <SpecSelect label="평량 (두께)" value={currentSpecs.paperWeight} options={currentDef.paperWeights} onChange={(val: string) => updateCurrentSpecs({ paperWeight: val })} onAdd={(val: string) => db.registerProductOption(currentSubJob.type, 'paperWeights', val)} icon={<Layers size={16} />} suffix="g" />
                            <div className="space-y-1">
                                <div className="h-6 flex items-center">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Palette size={16}/> 인쇄 도수</label>
                                </div>
                                <div className="relative">
                                    <select value={currentSpecs.printColor} onChange={(e) => updateCurrentSpecs({ printColor: e.target.value })} className={`${inputClass} cursor-pointer hover:bg-slate-50 appearance-none`}>
                                        {PRINT_COLORS.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500"><svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg></div>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <div className="h-6 flex items-center">
                                    <label className="text-sm font-bold text-slate-700 flex items-center gap-1"><Printer size={16}/> 수량</label>
                                </div>
                                <input type="text" value={currentSpecs.quantity} onChange={(e) => updateCurrentSpecs({ quantity: e.target.value })} placeholder="예: 500매, 10건, 3box" className={inputClass} />
                            </div>
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="text-xs font-semibold text-slate-500 flex items-center gap-1 mb-2"><Scissors size={12}/> 후가공 옵션</label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {PROCESSING_OPTIONS.map((opt) => (<label key={opt} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all text-sm ${currentSpecs.processing.includes(opt) ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><input type="checkbox" checked={currentSpecs.processing.includes(opt)} onChange={() => toggleProcessing(opt)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />{opt}</label>))}
                        </div>
                    </div>
                    <div className="space-y-1"><label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Tag size={12}/> 추가 메모 / 특이사항</label><textarea value={currentSpecs.memo} onChange={(e) => updateCurrentSpecs({ memo: e.target.value })} rows={6} className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-700 focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-400" placeholder="작업 관련 추가 지시사항이나 메모를 입력하세요."/></div>
                </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 flex-none">
            {!isNew && (<button onClick={handleDelete} className="mr-auto px-4 py-2.5 text-red-500 hover:bg-red-50 rounded-lg font-bold transition-colors flex items-center gap-2" title="이 작업을 완전히 삭제합니다"><Trash2 size={18} /><span className="hidden sm:inline">삭제</span></button>)}
            {!isNew && (<button onClick={() => setShowPrintModal(true)} className="px-4 py-2.5 bg-slate-700 text-white hover:bg-slate-800 rounded-lg font-bold transition-colors flex items-center gap-2 shadow-sm" title="작업지시서 인쇄 미리보기"><Printer size={18} /><span className="hidden sm:inline">작업지시서 인쇄</span></button>)}
            <button onClick={() => isNew ? onClose() : setViewMode('summary')} className="px-5 py-2.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors" title={isNew ? "닫기" : "요약 보기로 돌아가기"}>취소</button>
            <button onClick={handleSave} className="px-8 py-2.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md transition-all hover:scale-[1.02] flex items-center gap-2" title="작업 내용 저장">{isNew ? <><Check size={18}/> 신규 등록</> : '저장 완료'}</button>
          </div>
            </div>
          )}
        </div>
      </div>
      {showContactModal && (<ClientContactModal job={editedJob} onClose={() => setShowContactModal(false)} />)}
      {showPrintModal && (<JobOrderPreviewModal job={editedJob} onClose={() => setShowPrintModal(false)} />)}
    </>
  );
};
