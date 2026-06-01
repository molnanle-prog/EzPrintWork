
import React, { useState, useEffect, useMemo } from 'react';
import { db, getErrorMessage } from '../../services/dataService';
import { Job, Staff, Priority, JobStatusDefinition, JobHistoryLog } from '../../types';
import { JobDetailModal } from '../common/JobDetailModal';
import { KanbanColumn } from './KanbanColumn';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { Calendar as CalendarIcon, AlertCircle, Clock, Plus, Filter, CheckCircle2, Search, User, Users, Tv } from 'lucide-react';

interface KanbanBoardProps {
  onNavigateToQuote: (quoteId?: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ onNavigateToQuote }) => {
  const [displayJobs, setDisplayJobs] = useState<Job[]>([]);
  const [activeJobsStats, setActiveJobsStats] = useState<Job[]>([]); 
  const [staff, setStaff] = useState<Staff[]>([]);
  const [allStatusDefinitions, setAllStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const [visibleStatusDefinitions, setVisibleStatusDefinitions] = useState<JobStatusDefinition[]>([]);
  const [hiddenStatusKeys, setHiddenStatusKeys] = useState<string[]>(() => {
    const saved = localStorage.getItem('ezprint_hidden_columns');
    return saved ? JSON.parse(saved) : [];
  });
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [isTvMode, setIsTvMode] = useState<boolean>(() => {
    return localStorage.getItem('ezprint_tv_mode') === 'true';
  });
  
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobModalViewMode, setJobModalViewMode] = useState<'summary' | 'edit'>('summary');
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const { currentUser, tenantPlan } = useAuth();
  const { showAlert, showConfirm } = useDialog();

  // 스마트 실시간 필터 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOnlyMyJobs, setFilterOnlyMyJobs] = useState(false);
  const [filterUnpaidOnly, setFilterUnpaidOnly] = useState(false);
  const [filterUrgentOnly, setFilterUrgentOnly] = useState(false);
  const [filterCanceled, setFilterCanceled] = useState(false);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');

  // Optimized Data Loading
  const loadBoardData = () => {
    const allJobs = db.getAllJobs();
    const activeJobs = db.getActiveJobs(); 
    const statuses = db.getStatusDefinitions();
    
    // 1. Data-level visibility (from settings)
    // QUOTE (견적) 상태는 독자적인 칸반 컬럼으로 나열되지 않으므로 강제 배제시킵니다.
    const dbVisibleStatuses = statuses.filter(s => s.isVisible !== false && s.key !== 'QUOTE');
    setAllStatusDefinitions(dbVisibleStatuses);
    
    // 2. User-level visibility (from local UI filter)
    const userFiltered = dbVisibleStatuses.filter(s => !hiddenStatusKeys.includes(s.key));
    setVisibleStatusDefinitions(userFiltered);
    const filteredJobs = allJobs.filter(job => {
      // 0. 취소된 건 필터링: '취소 건 조회' 스위치가 활성화되었을 때만 취소된 작업 노출
      if (job.status === 'CANCELED') {
        return filterCanceled;
      }

      // 1. Active jobs are always visible
      if (job.status !== 'DELIVERY') return true;

      // 2. Completed Jobs Logic
      
      // Rule A: If payment is incomplete, ALWAYS show it regardless of date
      if (job.paymentStatus !== '결제완료') return true;

      // Rule B: Show if completed within last 3 days
      const completedAt = job.completedAt ? new Date(job.completedAt) : new Date(job.createdAt);
      const now = new Date();
      const diffTime = now.getTime() - completedAt.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      if (diffDays <= 3) return true;

      // Rule C: Show if matches the manually selected date (for history lookup)
      const completedDateStr = completedAt.toISOString().split('T')[0];
      if (completedDateStr === selectedDate) return true;

      return false;
    });

    setDisplayJobs(filteredJobs);
    setActiveJobsStats(activeJobs);
    setStaff(db.getStaff());
  };

  useEffect(() => {
    loadBoardData();
    // Real-time updates subscription
    const unsubscribe = db.subscribe(() => {
        loadBoardData();
    });
    return () => unsubscribe();
  }, [selectedDate, filterCanceled]); // Reload if date or cancel filter changes

  useEffect(() => {
    localStorage.setItem('ezprint_hidden_columns', JSON.stringify(hiddenStatusKeys));
    const userFiltered = allStatusDefinitions.filter(s => !hiddenStatusKeys.includes(s.key));
    setVisibleStatusDefinitions(userFiltered);
  }, [hiddenStatusKeys, allStatusDefinitions]);

  const toggleStatusVisibility = (key: string) => {
    setHiddenStatusKeys(prev => {
        if (prev.includes(key)) {
            return prev.filter(k => k !== key);
        } else {
            // Ensure at least 1 column is visible
            if (allStatusDefinitions.length - prev.length <= 1) {
                showAlert('최소 하나의 컬럼은 표시되어야 합니다.');
                return prev;
            }
            return [...prev, key];
        }
    });
  };

  const getProgressForStatus = (statusKey: string) => {
    const idx = allStatusDefinitions.findIndex(s => s.key === statusKey);
    if (idx === -1) return 0;
    return (idx / (allStatusDefinitions.length - 1)) * 100;
  };

  const updateJobStatus = (job: Job, direction: 'next' | 'prev') => {
    const currentIndex = allStatusDefinitions.findIndex(s => s.key === job.status);
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (newIndex >= 0 && newIndex < allStatusDefinitions.length) {
      const newStatusKey = allStatusDefinitions[newIndex].key;
      handleJobDrop(job.id, newStatusKey);
    }
  };

  const handleJobDrop = async (draggedJobId: string, newStatusKey: string, targetJobId?: string) => {
    const allJobs = db.getAllJobs(); 
    const draggedJob = allJobs.find(j => j.id === draggedJobId);
    if (!draggedJob || !currentUser) return;

    let newAllJobs = [...allJobs];
    newAllJobs = newAllJobs.filter(j => j.id !== draggedJobId);

    const updatedJob = { ...draggedJob };
    const newHistory: JobHistoryLog[] = [...(draggedJob.history || [])];

    // --- Automatic Assignment & History Logging ---
    if (draggedJob.status !== newStatusKey) {
        updatedJob.status = newStatusKey;
        const fromStatus = allStatusDefinitions.find(s => s.key === draggedJob.status)?.label || draggedJob.status;
        const toStatus = allStatusDefinitions.find(s => s.key === newStatusKey)?.label || newStatusKey;
        
        newHistory.push({
            timestamp: new Date().toISOString(),
            staffId: currentUser.id,
            action: '칸반 이동',
            details: `${fromStatus} → ${toStatus}`
        });
    }
    
    updatedJob.history = newHistory;
    
    if (newStatusKey === 'DELIVERY' && draggedJob.status !== 'DELIVERY') {
        updatedJob.completedAt = new Date().toISOString();
        updatedJob.progress = 100;
        
        // --- 완료 알림 문자 발송 및 이력 자동 기록 트리거 ---
        const smsConfig = db.getSmsConfig();
        if (smsConfig && smsConfig.sendOnComplete) {
            // 1. 거래처 개별 문자 발송 설정 연동
            const clientInfo = db.getClients().find(c => c.name === draggedJob.clientName);
            
            if (clientInfo && clientInfo.sendSmsOnComplete === false) {
                // 알림 문자 발송 거부 거래처인 경우 조용히 발송 스킵하고 토스트 알림
                toast.info(`'${draggedJob.clientName}' 거래처는 알림 문자 수신 거부 상태이므로 발송을 건너뜁니다.`);
            } else {
                // 발송 수신처 번호 지정 (수신 전용 번호가 있으면 그것을 우선 사용, 없으면 작업 연락처 사용)
                const targetPhone = (clientInfo && clientInfo.customSmsNumber) 
                    ? clientInfo.customSmsNumber 
                    : draggedJob.clientPhone;
                
                if (targetPhone) {
                    const companyName = db.getCompanyInfo().name || 'EzPrintWork';
                    const { replaceTemplateVariables, sendCompleteSms } = await import('../../services/smsService');
                    
                    const rawTemplate = smsConfig.completedMessageTemplate || 
                      `[{회사명}] {고객명}님, 주문하신 '{주문명}' 제품의 인쇄/작업이 완료되었습니다. 물건을 찾으러 내방해 주시기 바랍니다. 감사합니다.`;
                    
                    // 수신처 번호를 교체한 임시 작업 객체로 템플릿 변환
                    const jobForSms = { ...draggedJob, clientPhone: targetPhone };
                    const previewMsg = replaceTemplateVariables(rawTemplate, jobForSms, companyName);
                    
                    const isConfirmed = await showConfirm(
                      `[완료 알림 문자 발송]\n\n거래처: ${draggedJob.clientName}\n수신 번호: ${targetPhone}\n\n고객님께 완료 안내 문자를 전송하시겠습니까?\n\n[문자 미리보기]\n${previewMsg}`
                    );
                    
                    if (isConfirmed) {
                        const res = await sendCompleteSms(jobForSms, smsConfig, companyName);
                        if (res.success) {
                            newHistory.push({
                                timestamp: new Date().toISOString(),
                                staffId: currentUser.id,
                                action: '문자 발송',
                                details: `완료 문자 발송 성공 (수신: ${targetPhone})\n내용: ${res.sentContent}`
                            });
                            await showAlert('완료 알림 문자가 정상적으로 발송되었습니다.');
                        } else {
                            newHistory.push({
                                timestamp: new Date().toISOString(),
                                staffId: currentUser.id,
                                action: '문자 발송 실패',
                                details: `발송 실패: ${res.message} (수신: ${targetPhone})`
                            });
                            await showAlert(`문자 발송 실패: ${res.message}`);
                        }
                    }
                }
            }
        }
    } else if (newStatusKey !== 'DELIVERY' && draggedJob.status === 'DELIVERY') {
        updatedJob.completedAt = undefined;
        updatedJob.progress = getProgressForStatus(newStatusKey);
    } else {
        updatedJob.progress = getProgressForStatus(newStatusKey);
    }

    const columnJobs = newAllJobs
        .filter((j: Job) => j.status === newStatusKey)
        .sort((a: Job, b: Job) => a.order - b.order);

    if (targetJobId) {
        const targetIndex = columnJobs.findIndex((j: Job) => j.id === targetJobId);
        if (targetIndex !== -1) {
            columnJobs.splice(targetIndex, 0, updatedJob);
        } else {
            columnJobs.push(updatedJob);
        }
    } else {
        columnJobs.push(updatedJob);
    }

    columnJobs.forEach((job: Job, index: number) => {
        job.order = index;
    });

    newAllJobs = newAllJobs.filter((j: Job) => j.status !== newStatusKey);
    newAllJobs = [...newAllJobs, ...columnJobs];

    try {
        await db.saveJobs(newAllJobs);
    } catch (error) {
        showAlert(getErrorMessage(error));
        // On error, the subscription will reload the old state from DB, 
        // but we might want to force a refresh if the optimism failed.
        loadBoardData();
    }
  };

  const handleCreateJob = async (newJob: Job) => {
    try {
        await db.addJob(newJob);
        setIsCreatingJob(false);
    } catch (error) {
        showAlert(getErrorMessage(error));
    }
  };

  // Helper to handle both single (legacy) and multi staff
  // UPDATED: Now returns all names separated by commas instead of "Name + others"
  const getStaffName = (job?: Job) => {
    if (!job) return '미배정';
    
    const staffIds = job.assignedStaffIds || (job.assignedStaffId ? [job.assignedStaffId] : []);
    if (staffIds.length === 0) return '미배정';
    
    // 유효한 직원만 찾고 중복 제거
    const uniqueValidStaff = Array.from(new Set(staffIds))
        .map(id => staff.find((s: Staff) => s.id === id))
        .filter((s): s is Staff => !!s && !s.isDeleted);

    if (uniqueValidStaff.length === 0) return '미배정';

    // 이름(직책) 형식으로 변환
    return uniqueValidStaff.map(s => `${s.name}(${s.role})`).join(', ');
  };

  // 스마트 실시간 필터 파이프라인
  const filteredJobs = useMemo(() => {
    return displayJobs.filter(job => {
      // 1. 실시간 텍스트 검색어 필터
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = job.title.toLowerCase().includes(query);
        const matchesClient = job.clientName.toLowerCase().includes(query);
        const matchesType = job.type.toLowerCase().includes(query);
        const matchesSpecPaper = job.specs.paperType?.toLowerCase().includes(query) || false;
        
        if (!matchesTitle && !matchesClient && !matchesType && !matchesSpecPaper) {
          return false;
        }
      }
      
      // 2. 내 작업만 보기 필터
      if (filterOnlyMyJobs && currentUser) {
        const isMyJob = job.assignedStaffIds?.includes(currentUser.id) || job.assignedStaffId === currentUser.id;
        if (!isMyJob) return false;
      }
      
      // 3. 미결제만 보기 필터
      if (filterUnpaidOnly) {
        if (job.paymentStatus === '결제완료') return false;
      }
      
      // 4. 긴급만 보기 필터
      if (filterUrgentOnly) {
        if (job.priority === Priority.NORMAL) return false;
      }
      
      // 5. 특정 담당자 필터
      if (selectedStaffFilter !== 'all') {
        const hasStaff = job.assignedStaffIds?.includes(selectedStaffFilter) || job.assignedStaffId === selectedStaffFilter;
        if (!hasStaff) return false;
      }
      
      return true;
    });
  }, [displayJobs, searchQuery, filterOnlyMyJobs, filterUnpaidOnly, filterUrgentOnly, selectedStaffFilter, currentUser]);

  const getJobsForStatus = (statusKey: string) => {
    return filteredJobs.filter((j: Job) => j.status === statusKey).sort((a: Job, b: Job) => a.order - b.order);
  };

  const getAdStatusKey = () => {
    // 접수(RECEIVED) 컬럼과 견적(QUOTE) 컬럼은 하단 보관 상자 충돌을 방지하기 위해 광고 대상에서 안전하게 배제시킵니다.
    const adEligibleDefs = visibleStatusDefinitions.filter(
        (status: JobStatusDefinition) => status.key !== 'RECEIVED' && status.key !== 'QUOTE'
    );
    if (adEligibleDefs.length === 0) return null;
    
    // Calculate job counts for each eligible column
    const counts = adEligibleDefs.map((status: JobStatusDefinition) => ({
        key: status.key,
        count: getJobsForStatus(status.key).length
    }));

    // Find the minimum count
    const minCount = Math.min(...counts.map((c: any) => c.count));
    
    // Filter columns that have the minimum count
    const candidates = counts.filter((c: any) => c.count === minCount);
    
    // Preference: If 'DELIVERY' is in candidates, use it. 
    // Otherwise use the column with fewest items (last one in list if tied).
    const hasDelivery = candidates.find((c: any) => c.key === 'DELIVERY');
    if (hasDelivery) return 'DELIVERY';
    
    return candidates[candidates.length - 1].key;
  };

  const adStatusKey = getAdStatusKey();

  const emptyJob: Job = {
    id: '',
    title: '',
    clientName: '',
    description: '',
    specs: {
      paperType: '',
      paperWeight: '',
      size: '',
      quantity: '',
      processing: [],
      printColor: '단면 4도(컬러)',
      memo: ''
    },
    status: allStatusDefinitions.length > 0 ? allStatusDefinitions[0].key : 'RECEIVED',
    priority: Priority.NORMAL,
    paymentStatus: '결제대기',
    createdAt: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    progress: 0,
    type: db.getJobTypes()[0] || '기타',
    price: 0,
    order: 0,
    history: [] // Initialize empty history
  };

  const defaultStatus = allStatusDefinitions.length > 0 ? allStatusDefinitions[0].key : 'RECEIVED';
  const newJobTemplate = { ...emptyJob, status: defaultStatus };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/40">
      <style>{`
        input[type="date"]::-webkit-calendar-picker-indicator {
          background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%231e293b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E");
          background-position: center;
          background-size: contain;
          cursor: pointer;
          opacity: 1;
          width: 20px;
          height: 20px;
          margin: 0;
        }
      `}</style>

      {/* Header Controls */}
      {!isTvMode && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-sm shrink-0">
        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
          {/* Real-time search bar */}
          <div className="relative flex items-center w-full sm:w-48 md:w-56 lg:w-64 transition-all duration-300 focus-within:sm:w-56 focus-within:md:w-64 focus-within:lg:w-72">
            <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="작업명, 고객명, 용지 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-7 py-1.5 w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder-slate-400 dark:placeholder-slate-500 shadow-inner"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 text-[10px] font-semibold"
                title="지우기"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick toggle: My Jobs */}
          <button
            onClick={() => setFilterOnlyMyJobs(!filterOnlyMyJobs)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border select-none hover:scale-105 active:scale-95
              ${filterOnlyMyJobs 
                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-700' 
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400 dark:hover:border-slate-500'}`}
            title="본인에게 배정된 작업만 표시합니다"
          >
            <User size={13} />
            <span>내 작업</span>
          </button>

          {/* Quick toggle: Unpaid */}
          <button
            onClick={() => setFilterUnpaidOnly(!filterUnpaidOnly)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border select-none hover:scale-105 active:scale-95
              ${filterUnpaidOnly 
                ? 'bg-rose-600 border-rose-600 text-white shadow-md shadow-rose-500/20 hover:bg-rose-700' 
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-rose-400 dark:hover:border-slate-500'}`}
            title="결제대기 또는 일부결제 상태인 작업만 표시합니다"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 border border-white"></span>
            <span>미결제</span>
          </button>

          {/* Quick toggle: Urgent */}
          <button
            onClick={() => setFilterUrgentOnly(!filterUrgentOnly)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border select-none hover:scale-105 active:scale-95
              ${filterUrgentOnly 
                ? 'bg-amber-500 border-amber-500 text-white shadow-md shadow-amber-500/20 hover:bg-amber-600' 
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400 dark:hover:border-slate-500'}`}
            title="긴급 또는 매우긴급 우선순위 작업만 표시합니다"
          >
            <AlertCircle size={13} />
            <span>긴급만</span>
          </button>

          {/* Dropdown: Staff filter */}
          <div className="relative flex items-center">
            <select
              value={selectedStaffFilter}
              onChange={(e) => setSelectedStaffFilter(e.target.value)}
              className="appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-8 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer shadow-sm hover:border-blue-400 dark:hover:border-slate-500 transition-colors"
              title="특정 작업 담당자별로 필터링합니다"
            >
              <option value="all">전체 담당자</option>
              {staff.filter(s => !s.isDeleted).map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
            <Users size={13} className="absolute left-2.5 text-slate-400 pointer-events-none" />
            <div className="absolute right-2.5 pointer-events-none text-slate-400">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>

          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 hidden lg:block"></div>

          {/* Column Toggle (단계 필터) */}
          <div className="relative">
            <button 
              onClick={() => setShowFilterPopover(!showFilterPopover)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border hover:scale-105 active:scale-95
                ${showFilterPopover 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-400'}`}
              title="특정 단계를 숨기거나 표시합니다"
            >
                <Filter size={14} />
                <span>단계 설정</span>
                <span className="px-1.5 bg-slate-100 dark:bg-slate-700 rounded text-[10px] text-slate-600 dark:text-slate-400 group-hover:bg-blue-700">
                    {visibleStatusDefinitions.length}/{allStatusDefinitions.length}
                </span>
            </button>

            {showFilterPopover && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setShowFilterPopover(false)}></div>
                    <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-2 z-40 overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 mb-1">
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">보드 구성 설정</p>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1 space-y-1">
                            {allStatusDefinitions.map(status => (
                                <button
                                    key={status.key}
                                    onClick={() => toggleStatusVisibility(status.key)}
                                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group"
                                >
                                    <span className={`text-sm font-medium ${hiddenStatusKeys.includes(status.key) ? 'text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {status.label}
                                    </span>
                                    {!hiddenStatusKeys.includes(status.key) ? (
                                        <div className="bg-blue-600 text-white rounded-full p-0.5">
                                            <CheckCircle2 size={14} />
                                        </div>
                                    ) : (
                                        <div className="w-4 h-4 border-2 border-slate-200 dark:border-slate-600 rounded"></div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
          </div>

          {/* TV 모드 (모니터링 모드) 토글 버튼 */}
          <button
            onClick={() => {
              const nextVal = !isTvMode;
              setIsTvMode(nextVal);
              localStorage.setItem('ezprint_tv_mode', String(nextVal));
              window.dispatchEvent(new CustomEvent('ezprint-tv-mode-change', { detail: { isTvMode: nextVal } }));
              
              // 브라우저 기본 주소창, 탭바, 북마크바를 완전히 감추는 웹 표준 전체화면(Fullscreen) API 연동
              if (nextVal) {
                if (document.documentElement.requestFullscreen) {
                  document.documentElement.requestFullscreen().catch((err) => {
                    console.log("전체화면 진입 실패:", err);
                  });
                }
              } else {
                if (document.fullscreenElement && document.exitFullscreen) {
                  document.exitFullscreen().catch((err) => {
                    console.log("전체화면 해제 실패:", err);
                  });
                }
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border select-none hover:scale-105 active:scale-95 shadow-md
              ${isTvMode 
                ? 'bg-purple-600 dark:bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/40 hover:bg-purple-700' 
                : 'bg-purple-900 dark:bg-purple-950 border-purple-800 dark:border-purple-900 text-white hover:bg-purple-800 dark:hover:bg-purple-900 hover:border-purple-500'}`}
            title="대형 화면용 모니터링 모드로 전환합니다"
          >
            <Tv size={14} className={isTvMode ? "text-white animate-pulse" : "text-purple-300"} />
            <span>모니터링 모드</span>
          </button>

          {/* Add Job button */}
          <button 
            onClick={() => setIsCreatingJob(true)}
            title="새로운 작업을 등록합니다"
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
          >
            <Plus size={16} />
            <span>작업 등록</span>
          </button>
        </div>

        {/* Right: Date Picker for Completed Jobs */}
        <div 
            className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md shrink-0"
            title="선택한 날짜에 완료된 작업도 표시합니다 (과거 이력 조회용)"
        >
           <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5 whitespace-nowrap">
             <CalendarIcon size={14} />
             <span>완료 기준일</span>
           </span>
           <div className="w-px h-4 bg-slate-200 dark:bg-slate-700"></div>
           <input 
             type="date" 
             value={selectedDate}
             onChange={(e) => setSelectedDate(e.target.value)}
             className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold rounded-md focus:ring-2 focus:ring-blue-500 block px-2 py-1 cursor-pointer shadow-sm hover:border-blue-400 min-w-0"
           />
        </div>
      </div>
      )}

      <div className="flex-1 overflow-x-auto pb-0 custom-scrollbar h-full min-h-0">
        {/* Responsive Width logic: 
            Columns will grow and shrink to fit the screen. 
            Horizontal scroll only appears when absolutely necessary (on very small screens). */}
        <div 
            className="flex gap-1.5 h-full py-1.5 px-0 w-full"
        >
          {visibleStatusDefinitions.map((statusDef) => (
            <div 
                key={statusDef.key} 
                className="h-full flex-1 min-w-[200px] transition-all duration-300"
            >
                <KanbanColumn
                    statusDef={statusDef}
                    jobs={getJobsForStatus(statusDef.key)}
                    quoteJobs={statusDef.key === 'RECEIVED' ? filteredJobs.filter((j: Job) => j.status === 'QUOTE') : undefined}
                    getStaffName={getStaffName}
                    onSelectJob={(job) => { setSelectedJob(job); setJobModalViewMode('summary'); }}
                    onRightClickJob={(job) => { setSelectedJob(job); setJobModalViewMode('edit'); }}
                    onStatusChange={updateJobStatus}
                    onDropJob={handleJobDrop}
                    currentUserId={currentUser?.id}
                    isCompact={statusDef.key === 'DELIVERY' || visibleStatusDefinitions.length > 5}
                    showAd={tenantPlan === 'free' && statusDef.key === adStatusKey}
                    isTvMode={isTvMode}
                />
            </div>
          ))}
        </div>
      </div>

      {selectedJob && (
        <JobDetailModal 
          key={selectedJob.id}
          job={selectedJob} 
          staff={staff} 
          initialViewMode={jobModalViewMode}
          onClose={() => setSelectedJob(null)} 
          onUpdate={async (updated) => {
             try {
                await db.updateJob(updated);
                setSelectedJob(null);
             } catch (error) {
                showAlert(getErrorMessage(error));
             }
          }}
          onNavigateToQuote={onNavigateToQuote}
        />
      )}

      {isCreatingJob && (
        <JobDetailModal 
          key="new-job-modal"
          job={newJobTemplate}
          staff={staff}
          onClose={() => setIsCreatingJob(false)}
          onUpdate={handleCreateJob}
          isNew={true}
        />
      )}

      {isTvMode && (
        <button
          onClick={() => {
            setIsTvMode(false);
            localStorage.setItem('ezprint_tv_mode', 'false');
            window.dispatchEvent(new CustomEvent('ezprint-tv-mode-change', { detail: { isTvMode: false } }));
            
            // 모니터링 모드 종료 시 전체화면 상태도 안전하게 빠져나옴
            if (document.fullscreenElement && document.exitFullscreen) {
              document.exitFullscreen().catch((err) => {
                console.log("전체화면 해제 실패:", err);
              });
            }
          }}
          className="fixed top-3 right-3 z-[9999] flex items-center gap-1.5 px-3 py-2 bg-slate-900/95 hover:bg-slate-800 text-white rounded-xl border border-slate-700/80 shadow-2xl hover:scale-105 active:scale-95 transition-all text-xs font-bold backdrop-blur-md"
          title="일반 화면으로 복원 (모니터링 모드 종료)"
        >
          <Tv size={13} className="text-purple-400 animate-pulse" />
          <span>모니터링 끄기</span>
        </button>
      )}
    </div>
  );
};
