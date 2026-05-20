import React, { useState, useEffect } from 'react';
import { Job, Priority, PaymentStatus, JobItem } from '../../types';
import { 
  MoreVertical, User, AlertTriangle, ArrowLeft, CheckCircle2, 
  GripHorizontal, Layers, Users, FileText, FileWarning, 
  FolderOpen, Play, CheckCircle, ShieldAlert 
} from 'lucide-react';
import { db } from '../../services/dataService';
import { toast } from 'sonner';

interface KanbanCardProps {
  job: Job;
  status: string; 
  staffName: string;
  onSelect: (job: Job) => void;
  onStatusChange: (job: Job, direction: 'next' | 'prev') => void;
  onDropOnCard: (draggedJobId: string, targetJobId: string) => void;
  isMyJob: boolean;
  isCompact?: boolean;
  currentUserId?: string; // Linear-style 단축키 배정을 위한 현재 사용자 ID
}

export const KanbanCard: React.FC<KanbanCardProps> = ({ 
  job, 
  status, 
  staffName, 
  onSelect, 
  onStatusChange, 
  onDropOnCard,
  isMyJob,
  isCompact = false,
  currentUserId
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("jobId", job.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); 
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); 
    setIsDragOver(false);
    const draggedJobId = e.dataTransfer.getData("jobId");
    if (draggedJobId && draggedJobId !== job.id) {
        onDropOnCard(draggedJobId, job.id);
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

  // --- 프리미엄 카드 글래스모피즘 테두리 & 배경 스타일 결정 ---
  let cardStyleClass = "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700";
  
  if (isMyJob) {
    cardStyleClass = "bg-white dark:bg-slate-800 border-blue-400 dark:border-blue-600 ring-2 ring-blue-100 dark:ring-blue-900/40 shadow-blue-100 dark:shadow-none";
  } 
  
  if (job.priority === Priority.VERY_URGENT) {
    cardStyleClass = "bg-red-50/80 dark:bg-red-950/20 border-red-500 dark:border-red-900 border-2 neon-glow-red";
  } else if (job.priority === Priority.URGENT) {
    cardStyleClass = "bg-amber-50/60 dark:bg-amber-950/10 border-amber-400 dark:border-amber-900 border neon-glow-amber";
  } else if (!isDone) {
    if (daysRemaining < 0) {
       cardStyleClass = "bg-rose-50/60 dark:bg-rose-950/20 border-rose-600 dark:border-rose-800 border-2 shadow-lg shadow-rose-200/20";
    } else if (daysRemaining <= 1) {
       cardStyleClass = "bg-orange-50/40 dark:bg-orange-950/10 border-orange-400 dark:border-orange-900 border shadow-md animate-pulse";
    } else if (!isMyJob) {
       if (daysRemaining <= 3) cardStyleClass = "bg-white dark:bg-slate-800 border-slate-400 dark:border-slate-600 shadow-sm";
       else if (daysRemaining <= 5) cardStyleClass = "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 shadow-sm";
    }
  }

  if (isDragOver) {
      cardStyleClass = "bg-blue-50/90 dark:bg-blue-900/30 border-2 border-blue-500 shadow-2xl scale-[1.03] z-40 rotate-1";
  }

  // ----------------------------------------------------------------------
  // COMPACT VIEW (완료/배송 단계 한 줄 축약형)
  // ----------------------------------------------------------------------
  if (isCompact) {
    return (
      <div 
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`bg-white dark:bg-slate-800 px-3 py-2.5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-blue-400 transition-all cursor-grab active:cursor-grabbing flex items-center gap-3 group ${isDragOver ? 'border-t-4 border-t-blue-500' : ''}`}
        onClick={() => onSelect(job)}
      >
         <div className="text-emerald-500 cursor-pointer shrink-0" title="완료">
           <CheckCircle2 size={17} className="fill-emerald-100 dark:fill-none" />
         </div>
         <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">{job.title}</span>
            <span className="text-xs text-slate-400 truncate hidden xl:inline">- {job.clientName}</span>
            {isMultiJob && (
                <span className="text-[9px] bg-slate-600 dark:bg-slate-600 text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5 font-bold shrink-0">
                    <Layers size={9} /> {subJobCount}
                </span>
            )}
         </div>
         <div className="flex items-center gap-2 shrink-0">
           <span className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[100px]" title={staffName}>{staffName}</span>
           <div className="w-px h-3 bg-slate-200 dark:bg-slate-700"></div>
           <span className={`text-[9px] px-2 py-0.5 rounded-md border font-bold ${getPaymentColor(job.paymentStatus || '결제대기')}`}>
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
  // STANDARD VIEW (일반 정보 가득 카드형)
  // ----------------------------------------------------------------------
  return (
    <div 
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        p-3 rounded-xl shadow-sm border transition-all duration-200 cursor-grab active:cursor-grabbing group flex flex-col gap-2.5 relative overflow-hidden backdrop-blur-premium
        ${cardStyleClass}
        active:rotate-1 active:scale-[1.04] active:shadow-2xl active:z-50
      `}
      onClick={() => onSelect(job)}
    >
      {/* 프리미엄 네온 키프레임 애니메이션용 인라인 스타일 */}
      <style>{`
        @keyframes neonPulseRed {
          0%, 100% { box-shadow: 0 0 3px rgba(239, 68, 68, 0.25), inset 0 0 1px rgba(239, 68, 68, 0.1); }
          50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.55), inset 0 0 3px rgba(239, 68, 68, 0.25); border-color: rgba(239, 68, 68, 0.85); }
        }
        @keyframes neonPulseAmber {
          0%, 100% { box-shadow: 0 0 3px rgba(245, 158, 11, 0.18), inset 0 0 1px rgba(245, 158, 11, 0.08); }
          50% { box-shadow: 0 0 9px rgba(245, 158, 11, 0.45), inset 0 0 3px rgba(245, 158, 11, 0.2); border-color: rgba(245, 158, 11, 0.75); }
        }
        .neon-glow-red {
          animation: neonPulseRed 2s infinite alternate;
        }
        .neon-glow-amber {
          animation: neonPulseAmber 2.5s infinite alternate;
        }
        .backdrop-blur-premium {
          backdrop-filter: blur(8px);
        }
      `}</style>

      {/* 1. Header: Badges & Gripper */}
      <div className="flex justify-between items-start pointer-events-none">
        <div className="flex gap-1.5 flex-wrap items-center">
           {isMyJob && <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-600 text-white font-extrabold shadow-sm tracking-wide">MY</span>}
           
           {/* Priority Badge */}
           <span className={`text-[9px] px-1.5 py-0.5 rounded-md border ${getPriorityColor(job.priority)} font-bold shadow-sm`}>
            {job.priority}
           </span>

           {/* Payment Badge */}
           <span className={`text-[9px] px-1.5 py-0.5 rounded-md border ${getPaymentColor(job.paymentStatus || '결제대기')} font-extrabold shadow-sm`}>
             {job.paymentStatus || '결제대기'}
           </span>

           {/* 원본 파일 유/무 표시 스마트 배지 (EzImpo 핵심) */}
           {job.filePath ? (
             <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-0.5 font-bold shadow-sm" title={`원본 파일 등록됨\n${job.filePath}`}>
               <FileText size={10} />
               <span>파일</span>
             </span>
           ) : (
             <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-0.5 font-extrabold shadow-sm animate-pulse" title="인쇄용 원본 파일 경로가 지정되지 않았습니다!">
               <ShieldAlert size={10} />
               <span>파일없음</span>
             </span>
           )}
        </div>
        
        {/* Grip Icon & More menu (Always interactable on hover) */}
        <div className="flex gap-1 text-slate-300 dark:text-slate-600 pointer-events-auto shrink-0">
          <GripHorizontal size={16} className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity hover:text-slate-500" />
          <button className="hover:text-slate-600 dark:hover:text-slate-400 transition-colors p-0.5" title="추가 메뉴">
            <MoreVertical size={16} />
          </button>
        </div>
      </div>
      
      {/* 2. Main Title and Client */}
      <div className="pointer-events-none flex flex-col gap-0.5">
        <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-[14px] lg:text-[15px] leading-snug truncate" title={job.title}>
          {job.title}
        </h4>
        <p className="text-xs text-slate-400 dark:text-slate-400 truncate">{job.clientName}</p>
      </div>

      {/* 3. 인쇄소 특화 프리미엄 사양(Spec) 표시부 */}
      <div className="grid grid-cols-2 gap-1.5 bg-slate-50/60 dark:bg-slate-900/30 p-2 rounded-xl border border-slate-100 dark:border-slate-800/60 text-[10px] text-slate-600 dark:text-slate-300 font-bold leading-tight pointer-events-none">
        <div className="truncate" title={job.specs.paperType ? `${job.specs.paperType} ${job.specs.paperWeight}` : '용지 미지정'}>
           📄 {job.specs.paperType ? `${job.specs.paperType} ${job.specs.paperWeight}` : '용지 미지정'}
        </div>
        <div className="truncate">
           📏 {job.specs.size || '규격 미지정'}
        </div>
        <div className="truncate">
           🎨 {job.specs.printColor || '도수 미지정'}
        </div>
        <div className="truncate text-blue-600 dark:text-blue-400">
           📦 {job.specs.quantity || '수량 미지정'}
        </div>
      </div>

      {/* 4. 세부 품목(Sub-Job) 개별 체크박스 리스트 */}
      {subJobsList.length > 0 && (
         <div className="flex flex-col gap-1 border-t border-slate-100 dark:border-slate-800/80 pt-2 pointer-events-auto">
            <div className="flex items-center justify-between text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">
               <span>세부 품목 ({subJobsList.filter(s => s.completed).length}/{subJobsList.length})</span>
               <span className="font-mono text-blue-600">{job.progress}%</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-[72px] overflow-y-auto custom-scrollbar">
               {subJobsList.map((sub, idx) => (
                  <button
                     key={sub.id || idx}
                     onClick={(e) => handleToggleSubJob(e, idx)}
                     className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] border transition-all font-bold select-none
                       ${sub.completed 
                         ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400' 
                         : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:bg-blue-50/30'}`}
                  >
                     <div className={`w-3 h-3 rounded-full flex items-center justify-center shrink-0 border
                       ${sub.completed 
                         ? 'bg-emerald-500 border-emerald-600 text-white' 
                         : 'border-slate-300 dark:border-slate-500'}`}
                     >
                        {sub.completed && <CheckCircle size={8} className="stroke-[3]" />}
                     </div>
                     <span className="truncate max-w-[80px]">{sub.type}</span>
                  </button>
               ))}
            </div>
         </div>
      )}

      {/* 5. Footer: Assignee & Due Date */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 pointer-events-none shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isMyJob ? 'bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-400'}`}>
             {isMultiStaff ? <Users size={12} /> : <User size={12} />}
          </div>
          <span className={`text-[10px] font-bold truncate ${isMyJob ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`} title={staffName}>
              {staffName}
          </span>
        </div>
        <div className={`flex items-center gap-1 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-100 dark:border-slate-800 shrink-0 font-bold ${daysRemaining <= 3 ? 'text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/10 border-red-100 dark:border-red-900/60' : ''}`}>
          {job.priority === Priority.VERY_URGENT && <AlertTriangle size={11} className="text-red-500 animate-pulse" />}
          <span className="font-mono text-[10px]">
            {daysRemaining < 0 ? `+${Math.abs(daysRemaining)}` : `D-${daysRemaining}`}
          </span>
        </div>
      </div>

      {/* 6. 카드 호버 시 나타나는 스마트 슬라이드 퀵 액션 패널 (Trello/Jira style) */}
      {isHovered && (
         <div 
            className="absolute top-0 right-0 h-full bg-slate-50/95 dark:bg-slate-800/95 border-l border-slate-200 dark:border-slate-700 flex flex-col justify-center items-center gap-2.5 px-2.5 py-2 animate-in slide-in-from-right duration-200 z-30 shadow-2xl pointer-events-auto cursor-default"
            onClick={(e) => e.stopPropagation()} 
         >
            {/* A. NAS 폴더 열기 (Electron 브릿지) */}
            <button
               onClick={handleOpenNASFolder}
               className={`p-2 rounded-xl border flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-sm
                 ${job.filePath 
                   ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:shadow-blue-500/20' 
                   : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'}`}
               title={job.filePath ? `로컬 NAS 원본 폴더 열기\n(${job.filePath})` : '설정된 파일 경로가 없습니다'}
               disabled={!job.filePath}
            >
               <FolderOpen size={16} />
            </button>

            {/* B. EzImpo 터잡기 엔진 작동 및 Hot Folder 전송 */}
            <button
               onClick={(e) => { e.stopPropagation(); handleEzImpoTrigger(); }}
               className={`p-2 rounded-xl border flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-sm
                 ${job.filePath 
                   ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-500/20' 
                   : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'}`}
               title={job.filePath ? 'EzImpo 자동 터잡기 엔진 작동 및 Hot Folder 파일 전송' : '파일 경로가 설정되어야 작동 가능합니다'}
               disabled={!job.filePath}
            >
               <Play size={16} className="fill-current" />
            </button>

            <div className="w-6 h-px bg-slate-200 dark:bg-slate-700"></div>

            {/* C. 상세 보기 편집 모달 열기 */}
            <button
               onClick={(e) => { e.stopPropagation(); onSelect(job); }}
               className="p-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 hover:border-blue-400 transition-all hover:scale-105 active:scale-95 shadow-sm"
               title="상세 수정 모달 열기"
            >
               <MoreVertical size={16} />
            </button>
         </div>
      )}
    </div>
  );
};
