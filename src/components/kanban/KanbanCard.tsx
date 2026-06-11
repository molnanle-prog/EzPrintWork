import React, { useState, useEffect } from 'react';
import { Job, Priority, PaymentStatus, JobItem } from '../../types';
import { 
  MoreVertical, User, AlertTriangle, ArrowLeft, CheckCircle2, 
  GripHorizontal, Layers, Users, FileText, FileWarning, 
  FolderOpen, Play, CheckCircle, ShieldAlert 
} from 'lucide-react';
import { db } from '../../services/dataService';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from 'sonner';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface KanbanCardProps {
  job: Job;
  status: string; 
  staffName: string;
  onSelect: (job: Job) => void;
  onRightClick?: (job: Job) => void;
  onStatusChange: (job: Job, direction: 'next' | 'prev') => void;
  isMyJob: boolean;
  isCompact?: boolean;
  currentUserId?: string;
  isTvMode?: boolean;
  isDragOverlay?: boolean;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({ 
  job, 
  status, 
  staffName, 
  onSelect, 
  onRightClick,
  onStatusChange, 
  isMyJob,
  isCompact = false,
  currentUserId,
  isTvMode = false,
  isDragOverlay = false
}) => {
  const { theme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id, disabled: isDragOverlay });

  const sortableStyle: React.CSSProperties = isDragOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        touchAction: 'manipulation',
      };

  const sortableProps = isDragOverlay ? {} : { ...attributes, ...listeners };

  const handleCardClick = () => {
    if (isDragOverlay) return;
    onSelect(job);
  };

  const handleCardContextMenu = (e: React.MouseEvent) => {
    if (isDragOverlay) return;
    e.preventDefault();
    onRightClick ? onRightClick(job) : onSelect(job);
  };

  // Calculate Days Remaining
  const now = new Date();
  const due = new Date(job.dueDate);
  const diffTime = due.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isDone = status === 'DELIVERY';
  const subJobsList = job.subJobs || [];
  const subJobCount = subJobsList.length > 0 ? subJobsList.length : 1;
  const isMultiJob = subJobsList.length > 1;
  
  const assignedCount = (job.assignedStaffIds?.length || (job.assignedStaffId ? 1 : 0));
  const isMultiStaff = assignedCount > 1 || staffName.includes(',');

  // --- Linear 스타일 단축키 (Keyboard Shortcuts) 구현 ---
  useEffect(() => {
    if (!isHovered || isCompact) return;

    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      // 입력창 입력 중에는 단축키 비활성화
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      const key = e.key.toLowerCase();
      
      // 1. 'A' 키: 담당자 즉시 나에게 지정 / 해제
      if (key === 'a') {
        e.preventDefault();
        if (!currentUserId) {
          toast.error('로그인 세션 정보를 찾을 수 없습니다.');
          return;
        }
        
        let assignedStaffIds = [...(job.assignedStaffIds || [])];
        const isAssignedToMe = assignedStaffIds.includes(currentUserId);
        
        if (isAssignedToMe) {
          assignedStaffIds = assignedStaffIds.filter(id => id !== currentUserId);
        } else {
          assignedStaffIds.push(currentUserId);
        }

        const updatedJob = {
          ...job,
          assignedStaffIds,
          assignedStaffId: assignedStaffIds[0] || undefined,
          history: [
            ...(job.history || []),
            {
              timestamp: new Date().toISOString(),
              staffId: currentUserId,
              action: '단축키 담당자 변경',
              details: isAssignedToMe ? '본인 해제' : '본인 지정'
            }
          ]
        };

        try {
          await db.updateJob(updatedJob);
          toast.success(isAssignedToMe ? '담당 지정이 해제되었습니다.' : '본인이 담당자로 지정되었습니다.');
        } catch (err) {
          toast.error('담당자 변경 중 오류 발생');
        }
      }

      // 2. 'P' 키: 결제 상태 퀵 토글
      if (key === 'p') {
        e.preventDefault();
        const cycle: PaymentStatus[] = ['결제대기', '일부결제', '결제완료'];
        const currentIdx = cycle.indexOf(job.paymentStatus || '결제대기');
        const nextIdx = (currentIdx + 1) % cycle.length;
        const nextStatus = cycle[nextIdx];

        const updatedJob = {
          ...job,
          paymentStatus: nextStatus,
          history: [
            ...(job.history || []),
            {
              timestamp: new Date().toISOString(),
              staffId: currentUserId || 'system',
              action: '단축키 결제 변경',
              details: `${job.paymentStatus || '결제대기'} → ${nextStatus}`
            }
          ]
        };

        try {
          await db.updateJob(updatedJob);
          toast.success(`결제 상태가 [${nextStatus}]로 변경되었습니다.`);
        } catch (err) {
          toast.error('결제 상태 변경 실패');
        }
      }

      // 3. 'E' 키: 상세 보기 모달 즉시 열기
      if (key === 'e') {
        e.preventDefault();
        onSelect(job);
      }

      // 4. 'I' 키: EzImpo 터잡기 모의 실행 & 파일 전송 트리거 (Hot Folder)
      if (key === 'i') {
        e.preventDefault();
        handleEzImpoTrigger();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isHovered, job, currentUserId, isCompact]);

  // --- EzImpo 및 Hot Folder 복사 자동화 트리거 (모의 연동) ---
  const handleEzImpoTrigger = async () => {
    if (!job.filePath) {
      toast.warning('인쇄 원본 파일 경로가 지정되어 있지 않습니다.', {
        description: '카드 호버의 탐색기 아이콘을 누르거나 상세 창에서 파일을 지정해 주세요.'
      });
      return;
    }

    const toastId = toast.loading('EzImpo 터잡기 엔진을 초기화하는 중입니다...', {
      description: '인쇄 규격 및 제본 옵션 해석 중...'
    });

    // 1.5초 후 인프라 복사 시뮬레이션 완료 알림
    setTimeout(async () => {
      // 파일명 추출
      const fileName = job.filePath?.split('\\').pop() || 'print_document.pdf';
      const hotFolderPath = 'C:\\EzPrint\\HotFolder\\' + fileName;
      
      console.log(`[EzImpo 파이프라인] '${job.filePath}' 원본을 '${hotFolderPath}' 핫폴더로 전송 완료!`);
      console.log(`[EzImpo 엔진] 규격: ${job.specs.size}, 색상: ${job.specs.printColor}, 부수: ${job.specs.quantity} 자동 터잡기 완료 및 인쇄 대기열 인입.`);

      // 역사 기록(History) 추가 저장
      const updatedJob = {
        ...job,
        history: [
          ...(job.history || []),
          {
            timestamp: new Date().toISOString(),
            staffId: currentUserId || 'system',
            action: 'EzImpo 자동 전송',
            details: `HotFolder 이동 완료: ${fileName}`
          }
        ]
      };

      try {
        await db.updateJob(updatedJob);
        toast.dismiss(toastId);
        toast.success('EzImpo 자동 터잡기 완료!', {
          description: `성공적으로 '${fileName}' 파일을 Hot Folder로 복사하고 대기열에 인입했습니다.`,
          duration: 4000
        });
      } catch (err) {
        toast.dismiss(toastId);
        toast.error('터잡기 이력 기록 중 오류 발생');
      }
    }, 1500);
  };

  // --- Electron 탐색기 폴더 열기 실행 ---
  const handleOpenNASFolder = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!job.filePath) {
      toast.error('설정된 파일 경로가 없습니다.');
      return;
    }

    if (window.electron && typeof window.electron.openPath === 'function') {
      try {
        // 일렉트론 환경에서 실제 폴더/파일 열기 호출
        const success = await window.electron.openPath(job.filePath);
        if (success) {
          toast.success('탐색기에서 원본 위치를 열었습니다.');
        } else {
          toast.error('폴더를 열 수 없습니다.', { description: '로컬 또는 네트워크 경로가 유효한지 확인해 주세요.' });
        }
      } catch (err) {
        toast.error('일렉트론 파일 브릿지 호출 실패');
      }
    } else {
      // 일반 웹 환경에서는 알림만 제공
      toast.info('웹 환경 모의 실행: 탐색기 폴더 열기 요청', {
        description: `경로: ${job.filePath}`
      });
    }
  };

  // --- 세부 품목(Sub-Job) 개별 체크박스 토글 ---
  const handleToggleSubJob = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (subJobsList.length === 0) return;

    const newSubJobs = [...subJobsList];
    const item = newSubJobs[index];
    const nextCompleted = !item.completed;
    newSubJobs[index] = { ...item, completed: nextCompleted };

    // 전체 하위 작업의 완료율 계산하여 메인 progress 자동 계산
    const completedCount = newSubJobs.filter(sj => sj.completed).length;
    const progressPercent = Math.round((completedCount / newSubJobs.length) * 100);

    const updatedJob = {
      ...job,
      subJobs: newSubJobs,
      progress: progressPercent,
      history: [
        ...(job.history || []),
        {
          timestamp: new Date().toISOString(),
          staffId: currentUserId || 'system',
          action: '하위 작업 상태 변경',
          details: `[${item.type}] 품목 상태 변경: ${nextCompleted ? '완료' : '진행중'} (진행률: ${progressPercent}%)`
        }
      ]
    };

    try {
      await db.updateJob(updatedJob);
      toast.success(`[${item.type}] ${nextCompleted ? '작업 완료 처리됨' : '작업 대기 처리됨'}`);
    } catch (err) {
      toast.error('품목 상태 업데이트 실패');
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case Priority.VERY_URGENT: return 'bg-red-600 text-white border-red-700 shadow-red-500/30';
      case Priority.URGENT: return 'bg-amber-500 text-white border-amber-600 shadow-amber-500/20';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600';
    }
  };

  const getPaymentColor = (status: PaymentStatus) => {
    switch (status) {
      case '결제대기': return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
      case '일부결제': return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case '결제완료': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600';
    }
  };

  // --- D-Day별 박스 테두리 색상 4단계 및 배경 스타일 결정 ---
  let borderAndBgClass = theme === 'trello'
    ? "bg-white text-[#172b4d] border-transparent shadow-[0_1px_1px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)]"
    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700";
  
  if (theme !== 'trello') {
    if (isMyJob) {
      borderAndBgClass = "bg-white dark:bg-slate-800 border-blue-400 dark:border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/40 shadow-blue-100 dark:shadow-none";
    } 
    
    // 완료 상태가 아닐 때 D-Day 단계별 테두리 및 꽉 찬 배경 색상 강제 지정 (4단계 분기)
    if (!isDone) {
      if (daysRemaining <= 0) {
        // 1단계: 당일 이하 (진한 빨간색 가득 채운 박스 + 빨간 링)
        borderAndBgClass = "bg-red-200 dark:bg-red-950/70 border-red-500 dark:border-red-400 ring-2 ring-red-200 dark:ring-red-900/60 shadow-md";
      } else if (daysRemaining === 1) {
        // 2단계: 1일 이하 (진한 주황색 가득 채운 박스 + 주황 링)
        borderAndBgClass = "bg-orange-200 dark:bg-orange-950/70 border-orange-500 dark:border-orange-400 ring-1 ring-orange-200 dark:ring-orange-950/20 shadow-sm";
      } else if (daysRemaining <= 3) {
        // 3단계: 3일 이하 (진한 앰버색 가득 채운 박스)
        borderAndBgClass = "bg-amber-200 dark:bg-amber-950/50 border-amber-400 dark:border-amber-500 shadow-sm";
      } else if (daysRemaining <= 7) {
        // 4단계: 7일 이하 (일주일전 - 연한 파란색 가득 채운 박스)
        borderAndBgClass = "bg-blue-200 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700 shadow-sm";
      } else {
        // 일주일보다 더 남으면 기본 테두리 (isMyJob 상태 유지)
        if (!isMyJob) {
          borderAndBgClass = "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700";
        }
      }
    }
  
    // 우선순위가 VERY_URGENT 인 경우 D-Day보다 우선하는 유동 테두리 효과 및 꽉 찬 배경
    if (job.priority === Priority.VERY_URGENT && !isDone) {
      borderAndBgClass = `bg-red-200 dark:bg-red-950/30 ${isTvMode ? 'flowing-border-red-lg' : 'flowing-border-red'} border-red-600 dark:border-red-500 shadow-md ring-2 ring-red-100 dark:ring-red-950/40`;
    }
  
  
  }
  let cardStyleClass = borderAndBgClass;

  // ----------------------------------------------------------------------
  // COMPACT VIEW (완료/배송 단계 한 줄 축약형)
  // ----------------------------------------------------------------------
  if (isCompact) {
    return (
      <div 
        ref={setNodeRef}
        data-job-id={job.id}
        style={sortableStyle}
        {...sortableProps}
        className={`bg-white dark:bg-slate-800 px-3 py-2.5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-blue-400 transition-all cursor-grab active:cursor-grabbing flex items-center gap-3 group`}
        onClick={handleCardClick}
        onContextMenu={handleCardContextMenu}
      >
         <div className="text-emerald-500 cursor-pointer shrink-0" title="완료">
           <CheckCircle2 size={17} className="fill-emerald-100 dark:fill-none" />
         </div>
         <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate">{job.title}</span>
            <span className="text-xs text-slate-400 truncate hidden xl:inline">- {job.clientName}</span>
            {isMultiJob && (
                <span className="text-[9px] bg-slate-600 dark:bg-slate-600 text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-semibold shrink-0">
                    <Layers size={9} /> {subJobCount}
                </span>
            )}
         </div>
         <div className="flex items-center gap-2 shrink-0">
           <span className="text-xs text-slate-500 dark:text-slate-400 font-normal truncate max-w-[100px]" title={staffName}>{staffName}</span>
           <div className="w-px h-3 bg-slate-200 dark:bg-slate-700"></div>
           <span className={`text-[9px] px-2 py-0.5 rounded-md border font-semibold ${getPaymentColor(job.paymentStatus || '결제대기')}`}>
                {job.paymentStatus || '결제대기'}
           </span>
           <div className="w-px h-3 bg-slate-200 dark:bg-slate-700"></div>
           <button 
             onClick={(e) => { e.stopPropagation(); onStatusChange(job, 'prev'); }}
             className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-0.5"
             title="이전 단계로 돌리기"
           >
             <ArrowLeft size={15} />
           </button>
         </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // TV / MONITORING VIEW (대형 4K 화면 전용 고가독성 뷰)
  // ----------------------------------------------------------------------
  if (isTvMode) {
    const getSimpleColor = (color?: string) => {
      if (!color) return '미지정';
      const lowercase = color.toLowerCase();
      if (lowercase.includes('컬러') || lowercase.includes('4도') || lowercase.includes('8도') || lowercase.includes('칼라') || lowercase.includes('color')) {
        return '컬러';
      }
      if (lowercase.includes('먹') || lowercase.includes('흑백') || lowercase.includes('1도') || lowercase.includes('흑') || lowercase.includes('mono') || lowercase.includes('gray')) {
        return '흑백';
      }
      return color.replace(/\([^)]*\)/g, '').trim(); // 괄호 부분 제거 등 간소화
    };

    return (
      <div 
        ref={setNodeRef}
        data-job-id={job.id}
        style={sortableStyle}
        {...sortableProps}
        className={`
          py-2 px-3.5 rounded-xl shadow-md border transition-all duration-200 cursor-grab active:cursor-grabbing group flex flex-col gap-1.5 relative overflow-hidden backdrop-blur-premium
          ${cardStyleClass}
          active:rotate-1 active:scale-[1.04] active:shadow-2xl active:z-50
        `}
        onClick={handleCardClick}
        onContextMenu={handleCardContextMenu}
      >
        <style>{`
          .backdrop-blur-premium {
            backdrop-filter: blur(8px);
          }
        `}</style>

        {/* 1. Header: Badges */}
        <div className="flex justify-between items-start pointer-events-none">
          <div className="flex gap-2 flex-wrap items-center">
             {isMyJob && <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-600 text-white font-medium shadow-sm tracking-wide">MY</span>}
             
             {/* Priority Badge */}
             <span className={`text-[11px] px-2 py-0.5 rounded-md border ${getPriorityColor(job.priority)} font-normal shadow-sm`}>
              {job.priority}
             </span>

             {/* Payment Badge */}
             <span className={`text-[11px] px-2 py-0.5 rounded-md border ${getPaymentColor(job.paymentStatus || '결제대기')} font-medium shadow-sm`}>
               {job.paymentStatus || '결제대기'}
             </span>

             {/* Smart File Badge */}
             {job.filePath ? (
               <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-0.5 font-medium shadow-sm">
                 <FileText size={12} />
                 <span>파일</span>
               </span>
             ) : (
               <span className="text-[11px] px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-0.5 font-medium shadow-sm">
                 <ShieldAlert size={12} />
                 <span>파일없음</span>
               </span>
             )}

             {/* 작업 종류 (Sub-Jobs) 배지 - 모니터링 모드용 가독성 최적화 */}
             {subJobsList.map((sub, idx) => (
               <span
                 key={sub.id || idx}
                 onClick={(e) => handleToggleSubJob(e, idx)}
                 className={`
                   text-[11px] px-2.5 py-0.5 rounded-md border shadow-sm shrink-0 select-none cursor-pointer pointer-events-auto transition-colors
                   ${sub.completed 
                     ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' 
                     : 'bg-slate-100 dark:bg-slate-700 border-slate-200/50 dark:border-slate-600/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                 title={`클릭하여 완료 상태 토글 (${sub.completed ? '완료' : '진행중'})`}
               >
                 {sub.type}
               </span>
             ))}
          </div>
        </div>

        {/* 2. Title and Client (Enlarged) */}
        <div className="pointer-events-none flex flex-col gap-0.5">
          <h4 className={`font-medium text-[20px] lg:text-[22px] leading-snug tracking-wide line-clamp-1 ${theme === "trello" ? "text-[#172b4d] font-semibold" : "text-slate-800 dark:text-slate-100"}`} title={job.title}>
            {job.title}
          </h4>
          <p className={`text-xs font-normal leading-tight ${theme === "trello" ? "text-[#5e6c84]" : "text-slate-500 dark:text-slate-400"}`}>{job.clientName}</p>
        </div>

        {/* 3. Specs & Giant Quantity Box */}
        <div className="flex gap-2 justify-between items-center bg-slate-50/70 dark:bg-slate-900/40 py-1.5 px-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 pointer-events-none">
          <div className="flex flex-col gap-0.5 text-[14px] lg:text-[15px] text-slate-800 dark:text-slate-100 font-normal flex-1 min-w-0 leading-tight">
             <div className="truncate flex items-center gap-1.5">
                <span className="w-5 shrink-0 text-center text-[15px] lg:text-[16px]">📄</span>
                <span className="truncate">{job.specs.paperType ? `${job.specs.paperType} ${job.specs.paperWeight}` : '용지 미지정'}</span>
             </div>
             <div className="truncate flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="w-5 shrink-0 text-center text-[15px] lg:text-[16px]">📏</span>
                <span className="truncate">{job.specs.size || '규격 미지정'} ({getSimpleColor(job.specs.printColor)})</span>
             </div>
          </div>
          <div className="shrink-0 flex flex-col items-center justify-center bg-blue-50 dark:bg-blue-950/30 px-2.5 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/40 shadow-sm text-center min-w-[70px]">
             <span className="text-[9px] text-blue-500 dark:text-blue-400 uppercase tracking-widest font-medium mb-0.5 leading-none">수량</span>
             <span className="text-[20px] lg:text-[22px] text-blue-700 dark:text-blue-300 font-medium leading-none whitespace-nowrap">
                {job.specs.quantity || '미지정'}
             </span>
          </div>
        </div>

        {/* 4. Footer: Assignee & Due Date (Enlarged) */}
        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800/80 mt-0.5 pointer-events-none shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isMyJob ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
               {isMultiStaff ? <Users size={14} /> : <User size={14} />}
            </div>
            <span className={`text-[12px] font-normal truncate ${isMyJob ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`} title={staffName}>
                {staffName}
            </span>
          </div>
          <div className={`flex items-center gap-1 bg-slate-50 dark:bg-slate-900 px-3 py-1 rounded-lg border-2 border-slate-100 dark:border-slate-800 shrink-0 font-normal text-xs ${daysRemaining <= 3 ? 'text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-900/60' : ''}`}>
            {job.priority === Priority.VERY_URGENT && <AlertTriangle size={13} className="text-red-500" />}
            <span className="font-mono text-xs">
              {daysRemaining < 0 ? `+${Math.abs(daysRemaining)}` : `D-${daysRemaining}`}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // STANDARD VIEW (일반 정보 가득 카드형)
  // ----------------------------------------------------------------------
  const getCleanPrintColor = (color?: string) => {
    if (!color) return '도수 미지정';
    const lowercase = color.toLowerCase();
    let side = '';
    if (lowercase.includes('단면')) side = '단면';
    else if (lowercase.includes('양면')) side = '양면';
    
    let colorType = '';
    if (lowercase.includes('컬러') || lowercase.includes('4도') || lowercase.includes('8도') || lowercase.includes('칼라') || lowercase.includes('color')) {
      colorType = '컬러';
    } else if (lowercase.includes('흑백') || lowercase.includes('먹') || lowercase.includes('흑') || lowercase.includes('mono') || lowercase.includes('gray')) {
      colorType = '흑백';
    } else if (lowercase.includes('1도')) {
      colorType = '1도';
    } else if (lowercase.includes('2도')) {
      colorType = '2도';
    } else {
      colorType = color.replace(/\([^)]*\)/g, '').trim();
    }
    
    if (side && colorType) return `${side}, ${colorType}`;
    return colorType || color;
  };

  const showDetails = isHovered || isTvMode;

  return (
    <div 
      ref={setNodeRef}
      data-job-id={job.id}
      style={sortableStyle}
      {...sortableProps}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        p-3 rounded-xl shadow-sm border transition-all duration-300 cursor-grab active:cursor-grabbing group flex flex-col gap-2 relative overflow-hidden backdrop-blur-premium
        ${cardStyleClass}
        active:rotate-1 active:scale-[1.02] active:shadow-2xl active:z-50
      `}
      onClick={handleCardClick}
      onContextMenu={handleCardContextMenu}
    >
      {/* 프리미엄 블러 효과 인라인 스타일 */}
      <style>{`
        .backdrop-blur-premium {
          backdrop-filter: blur(8px);
        }
        .custom-horizontal-scrollbar::-webkit-scrollbar {
          height: 3px;
        }
        .custom-horizontal-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-horizontal-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.3);
          border-radius: 9999px;
        }
      `}</style>

      {/* 1. Header: Badges & Gripper */}
      <div className="flex justify-between items-center pointer-events-none">
        <div className="flex gap-1.5 flex-wrap items-center min-w-0 flex-1">
           {isMyJob && <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-600 text-white font-medium shadow-sm tracking-wide">MY</span>}
           
           {/* Priority Badge */}
           <span className={`text-[10px] px-2 py-0.5 rounded-md border ${getPriorityColor(job.priority)} font-normal shadow-sm`}>
            {job.priority}
           </span>

           {/* Payment Badge */}
           <span className={`text-[10px] px-2 py-0.5 rounded-md border ${getPaymentColor(job.paymentStatus || '결제대기')} font-medium shadow-sm`}>
             {job.paymentStatus || '결제대기'}
           </span>

           {/* 원본 파일 유/무 표시 스마트 배지 */}
           {job.filePath ? (
             <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-0.5 font-normal shadow-sm" title={`원본 파일 등록됨\n${job.filePath}`}>
               <FileText size={11} />
               <span>파일</span>
             </span>
           ) : (
             <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-0.5 font-medium shadow-sm" title="인쇄용 원본 파일 경로가 지정되지 않았습니다!">
               <ShieldAlert size={11} />
               <span>파일없음</span>
             </span>
           )}

           {/* 작업 종류 (Sub-Jobs) 배지 - 클릭하여 완료/대기 토글 가능 */}
           {subJobsList.map((sub, idx) => (
             <span
               key={sub.id || idx}
               onClick={(e) => handleToggleSubJob(e, idx)}
               className={`
                 text-[10px] px-2 py-0.5 rounded-md border shadow-sm shrink-0 select-none cursor-pointer pointer-events-auto transition-colors
                 ${sub.completed 
                   ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' 
                   : 'bg-slate-100 dark:bg-slate-700 border-slate-200/50 dark:border-slate-600/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
               title={`클릭하여 완료 상태 토글 (${sub.completed ? '완료' : '진행중'})`}
             >
               {sub.type}
             </span>
           ))}
        </div>
        
        {/* Grip Icon & More menu */}
        <div className="flex gap-1 text-slate-300 dark:text-slate-600 pointer-events-auto shrink-0 items-center">
          <GripHorizontal size={16} className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity hover:text-slate-500" />
          <button className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors p-0.5 flex items-center justify-center" title="추가 메뉴">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>
      
      {/* 2. Main Title and Client */}
      <div className="pointer-events-none flex flex-col gap-0.5">
        <h4 className={`font-medium text-[15px] lg:text-[16px] leading-snug truncate ${theme === "trello" ? "text-[#172b4d] font-semibold" : "text-slate-800 dark:text-slate-100"}`} title={job.title}>
          {job.title}
        </h4>
        <p className={`text-xs font-normal truncate ${theme === "trello" ? "text-[#5e6c84]" : "text-slate-400 dark:text-slate-400"}`}>{job.clientName}</p>
      </div>

      {/* 3. 상세 정보 컨테이너 (스펙 그리드, 품목 배지, 담당자/D-day 푸터 통합 아코디언) */}
      <div 
        className={`
          flex flex-col gap-2.5 transition-all duration-300 ease-in-out
          ${showDetails 
            ? 'max-h-[350px] opacity-100 mt-2 translate-y-0 visible' 
            : 'max-h-0 opacity-0 overflow-hidden mt-0 -translate-y-2 invisible pointer-events-none'}
        `}
      >
        {/* 3-A. 인쇄소 특화 프리미엄 사양(Spec) 그리드 */}
        <div className="grid grid-cols-2 gap-2 bg-slate-50/70 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 text-slate-700 dark:text-slate-200 font-normal leading-tight pointer-events-none">
          <div className="truncate text-[12px] lg:text-[13px] font-normal flex items-center gap-1" title={job.specs.paperType ? `${job.specs.paperType} ${job.specs.paperWeight}` : '용지 미지정'}>
             <span className="shrink-0 text-[13px]">📄</span>
             <span className="truncate">{job.specs.paperType ? `${job.specs.paperType} ${job.specs.paperWeight}` : '용지 미지정'}</span>
          </div>
          <div className="truncate text-[12px] lg:text-[13px] font-normal flex items-center gap-1" title={job.specs.size || '규격 미지정'}>
             <span className="shrink-0 text-[13px]">📏</span>
             <span className="truncate">{job.specs.size || '규격 미지정'}</span>
          </div>
          <div className="truncate text-[12px] lg:text-[13px] font-normal flex items-center gap-1" title={job.specs.printColor || '도수 미지정'}>
             <span className="shrink-0 text-[13px]">🎨</span>
             <span className="truncate">{getCleanPrintColor(job.specs.printColor)}</span>
          </div>
          <div className="truncate text-[12px] lg:text-[13px] font-normal text-blue-600 dark:text-blue-400 flex items-center gap-1" title={job.specs.quantity || '수량 미지정'}>
             <span className="shrink-0 text-[13px]">📦</span>
             <span className="truncate">{job.specs.quantity || '수량 미지정'}</span>
          </div>
        </div>



        {/* 3-C. Footer: Assignee & Due Date */}
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 pointer-events-none shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isMyJob ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
               {isMultiStaff ? <Users size={12} /> : <User size={12} />}
            </div>
            <span className={`text-[10px] font-normal truncate ${isMyJob ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`} title={staffName}>
                {staffName}
            </span>
          </div>
          <div className={`flex items-center gap-1 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800 shrink-0 font-normal ${daysRemaining <= 3 ? 'text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/60' : ''}`}>
            {job.priority === Priority.VERY_URGENT && <AlertTriangle size={11} className="text-red-500" />}
            <span className="font-mono text-[10px]">
              {daysRemaining < 0 ? `+${Math.abs(daysRemaining)}` : `D-${daysRemaining}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
