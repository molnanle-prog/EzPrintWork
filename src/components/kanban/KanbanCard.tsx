import React, { useState, useEffect } from 'react';
import { Job, Priority, PaymentStatus, JobItem } from '../../types';
import { 
  MoreVertical, User, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, 
  GripHorizontal, Layers, Users, FileText, FileWarning, 
  FolderOpen, Play, CheckCircle, ShieldAlert, ArrowBigUp, ArrowBigDown
} from 'lucide-react';
import { db } from '../../services/dataService';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import {
  isJobAssignedToUser,
  addUserToJobAssignees,
  removeUserFromJobAssignees,
  getStaffIdForUser,
} from '../../utils/staffMatch';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getJobUrgencyStyles,
  resolveEffectiveTier,
  formatDDayLabel,
  getDDayBadgeClasses,
} from '../../utils/jobUrgencyStyles';
import { useKanbanCardInteraction } from './useKanbanCardInteraction';
import type { ManagementPrepaidBadge } from '../../utils/prepaidBalance';

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
  isQuoteTray?: boolean;
  isCompactTray?: boolean;
  onHideFromBoard?: (job: Job) => void;
  /** 관리카드 팝업 — 칸반과 동일 카드, 드래그 비활성 */
  isManagementPanel?: boolean;
  /** 관리카드 — 이 건의 선불 처리 뱃지 */
  managementPrepaidBadge?: ManagementPrepaidBadge;
}

type SortableBinding = Pick<
  ReturnType<typeof useSortable>,
  'attributes' | 'listeners' | 'setNodeRef' | 'transform' | 'transition' | 'isDragging'
>;

const NO_SORTABLE = {
  attributes: {},
  listeners: undefined,
  setNodeRef: () => {},
  transform: null,
  transition: undefined,
  isDragging: false,
} as unknown as SortableBinding;

type KanbanCardImplProps = KanbanCardProps & {
  sortable: SortableBinding;
};

const KanbanCardImpl: React.FC<KanbanCardImplProps> = ({
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
  isDragOverlay = false,
  isQuoteTray = false,
  isCompactTray = false,
  onHideFromBoard,
  isManagementPanel = false,
  managementPrepaidBadge,
  sortable,
}) => {
  const { theme } = useTheme();
  const { currentUser } = useAuth();
  const [isHovered, setIsHovered] = useState(false);
  const isTrayView = isCompactTray;
  const isWebReadOnly = db.isWebMirrorMode();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable;

  const {
    touchPrimary,
    sortableTouchAction,
    handleCardClick,
    handleCardContextMenu,
    handleOpenDetail,
    stopDragPropagation,
    cardSurfaceClass,
  } = useKanbanCardInteraction({ job, isDragOverlay, onSelect, onRightClick });

  const handleMoveToManagementCard = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWebReadOnly) {
      toast.error('웹(태블릿)은 조회 전용입니다. 관리카드 이동은 매장 PC에서 해 주세요.');
      return;
    }
    try {
      await db.pinJobToManagementCard(job.id);
      toast.success('관리카드로 올렸습니다. 칸반에서는 숨겨집니다.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '관리카드로 올리기에 실패했습니다.';
      toast.error(msg);
    }
  };

  const handleMoveToKanban = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isWebReadOnly) {
      toast.error('웹(태블릿)은 조회 전용입니다. 칸반 이동은 매장 PC에서 해 주세요.');
      return;
    }
    try {
      await db.unpinJobFromManagementCard(job.id);
      toast.success('칸반으로 내렸습니다. 다른 PC에도 곧 반영됩니다.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '칸반으로 내리기에 실패했습니다.';
      toast.error(msg);
    }
  };

  const renderManagementMoveButton = (size = 16) => {
    if (isManagementPanel) {
      return (
        <button
          type="button"
          onPointerDown={stopDragPropagation}
          onClick={handleMoveToKanban}
          className="p-1 rounded-md transition-colors pointer-events-auto opacity-100 text-emerald-600 hover:text-emerald-700"
          title="칸반으로 내리기"
        >
          <ArrowBigDown size={size} className="fill-emerald-500 text-emerald-600" strokeWidth={2} />
        </button>
      );
    }

    return (
      <button
        type="button"
        onPointerDown={stopDragPropagation}
        onClick={handleMoveToManagementCard}
        className={`p-1 rounded-md transition-colors pointer-events-auto ${
          touchPrimary ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        } text-violet-500 hover:text-violet-600`}
        title="관리카드로 올리기"
      >
        <ArrowBigUp size={size} className="fill-violet-500 text-violet-600" strokeWidth={2} />
      </button>
    );
  };

  const sortableStyle: React.CSSProperties = isDragOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        touchAction: sortableTouchAction,
      };

  const sortableProps = isDragOverlay || isManagementPanel ? {} : { ...attributes, ...listeners };

  // Calculate Days Remaining
  const now = new Date();
  const due = new Date(job.dueDate);
  const diffTime = due.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isDone = status === 'COMPLETED';
  const canHideFromBoard = !!onHideFromBoard;
  const urgencyTier = resolveEffectiveTier(daysRemaining, job.priority);
  const ddayLabel = formatDDayLabel(daysRemaining);
  const ddayBadgeClass = getDDayBadgeClasses(urgencyTier);
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
        if (!currentUser) {
          toast.error('로그인 세션 정보를 찾을 수 없습니다.');
          return;
        }

        const staffList = db.getStaff();
        const isAssignedToMe = isJobAssignedToUser(job, currentUser, staffList);
        const assignedStaffIds = isAssignedToMe
          ? removeUserFromJobAssignees(job, currentUser, staffList)
          : addUserToJobAssignees(job, currentUser, staffList);
        const assignStaffId = getStaffIdForUser(staffList, currentUser);

        const updatedJob = {
          ...job,
          assignedStaffIds,
          ...(assignedStaffIds[0] ? { assignedStaffId: assignedStaffIds[0] } : {}),
          history: [
            ...(job.history || []),
            {
              timestamp: new Date().toISOString(),
              staffId: assignStaffId || currentUser.id,
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
      case Priority.VERY_URGENT: return 'kanban-badge bg-red-600 text-white border-red-700 shadow-red-500/30';
      case Priority.URGENT: return 'kanban-badge bg-amber-500 text-white border-amber-600 shadow-amber-500/20';
      default: return 'kanban-badge kanban-badge-priority-default bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600';
    }
  };

  const getPaymentColor = (status: PaymentStatus) => {
    switch (status) {
      case '결제대기': return 'kanban-badge kanban-badge-pay-wait bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
      case '일부결제': return 'kanban-badge kanban-badge-pay-partial bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case '결제완료': return 'kanban-badge kanban-badge-pay-done bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      default: return 'kanban-badge kanban-badge-pay-default bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600';
    }
  };

  const cardStyleClass = getJobUrgencyStyles({
    theme,
    priority: job.priority,
    daysRemaining,
    isDone,
    isMyJob,
    isTvMode,
    surface: 'kanban',
  });

  // QUOTE TRAY — 견적 하단 3열 타일 (제목 일부 노출 + 호버 확장)
  // ----------------------------------------------------------------------
  if (isQuoteTray) {
    return (
      <div
        ref={setNodeRef}
        data-job-id={job.id}
        style={sortableStyle}
        {...sortableProps}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`kanban-card kanban-tray-card quote-tray-tile relative px-1.5 py-1 rounded-md border transition-all cursor-grab active:cursor-grabbing group ${cardSurfaceClass} ${
          isHovered ? 'z-30 shadow-lg ring-2 ring-indigo-400/80' : 'z-0 shadow-sm'
        } ${
          theme === 'trello'
            ? 'bg-[#24364e] border-[#384c66] hover:border-indigo-400'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
        }`}
        onClick={handleCardClick}
        onContextMenu={handleCardContextMenu}
        title={!isHovered ? `${job.title}\n${job.clientName}` : undefined}
      >
        <div className={`kanban-card-title font-bold text-slate-800 dark:text-slate-100 leading-snug pr-4 ${isHovered ? 'text-[11px] whitespace-normal' : 'text-[10px] line-clamp-2'}`}>
          {job.title}
        </div>
        {isHovered ? (
          <div className="mt-1 space-y-0.5">
            <div className="kanban-card-subtitle text-[10px] text-slate-600 dark:text-slate-300 truncate" title={job.clientName}>
              {job.clientName || '고객명 없음'}
            </div>
            <div className="kanban-tray-price text-[10px] font-mono font-bold">
              {job.price ? `${job.price.toLocaleString()}원` : '미정'}
            </div>
            {staffName && (
              <div className="kanban-tray-meta text-[9px] truncate">{staffName}</div>
            )}
            <div className="flex items-center justify-end gap-0.5 pt-0.5">
              {renderManagementMoveButton(12)}
              <button
                type="button"
                onPointerDown={stopDragPropagation}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(job, 'prev');
                }}
                className="kanban-tray-icon text-slate-400 hover:text-red-500 p-0.5"
                title="이전 단계"
              >
                <ArrowLeft size={12} />
              </button>
              <button
                type="button"
                onPointerDown={stopDragPropagation}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(job, 'next');
                }}
                className="kanban-tray-icon text-slate-400 hover:text-emerald-500 p-0.5"
                title="다음 단계"
              >
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        ) : (
          <div className="kanban-tray-price text-[9px] font-mono font-bold truncate mt-0.5">
            {job.price ? `${job.price.toLocaleString()}원` : '미정'}
          </div>
        )}
      </div>
    );
  }

  // COMPACT TRAY VIEW (완료 등 한 줄형)
  // ----------------------------------------------------------------------
  if (isTrayView) {
    return (
      <div
        ref={setNodeRef}
        data-job-id={job.id}
        style={sortableStyle}
        {...sortableProps}
        className={`kanban-card kanban-tray-card px-2 py-1.5 rounded-lg shadow-sm border transition-all cursor-grab active:cursor-grabbing flex items-center gap-1.5 group ${cardSurfaceClass} ${
          theme === 'trello'
            ? 'bg-[#24364e] border-[#384c66] hover:border-indigo-400'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500'
        }`}
        onClick={handleCardClick}
        onContextMenu={handleCardContextMenu}
      >
        <GripHorizontal
          size={14}
          className="kanban-tray-icon shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-indigo-400"
        />
        <div className="flex-1 min-w-0">
          <div className="kanban-card-title text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate" title={job.title}>
            {job.title}
          </div>
          <div className="kanban-card-subtitle text-[10px] text-slate-500 dark:text-slate-400 truncate" title={job.clientName}>
            {job.clientName}
          </div>
        </div>
        <span className="kanban-tray-price text-[10px] font-mono font-bold shrink-0">
          {job.price ? `${job.price.toLocaleString()}원` : '미정'}
        </span>
        {renderManagementMoveButton(13)}
        <button
          type="button"
          onPointerDown={stopDragPropagation}
          onClick={(e) => {
            e.stopPropagation();
            onStatusChange(job, 'prev');
          }}
          className="kanban-tray-icon shrink-0 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-0.5"
          title="이전 단계"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          onPointerDown={stopDragPropagation}
          onClick={(e) => {
            e.stopPropagation();
            onStatusChange(job, 'next');
          }}
          className="kanban-tray-icon shrink-0 text-slate-300 dark:text-slate-600 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors p-0.5"
          title="다음 단계 (접수 등)"
        >
          <ArrowRight size={14} />
        </button>
        {canHideFromBoard && (
          <button
            type="button"
            onPointerDown={stopDragPropagation}
            onClick={(e) => {
              e.stopPropagation();
              onHideFromBoard(job);
            }}
            className="kanban-tray-icon shrink-0 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition-colors p-0.5"
            title="보드에서 내리기"
          >
            <CheckCircle size={14} />
          </button>
        )}
      </div>
    );
  }

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
        className={`kanban-card bg-white dark:bg-slate-800 px-3 py-2.5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-md hover:border-blue-400 transition-all cursor-grab active:cursor-grabbing flex items-center gap-3 group ${cardSurfaceClass}`}
        onClick={handleCardClick}
        onContextMenu={handleCardContextMenu}
      >
         <div className="text-emerald-500 cursor-pointer shrink-0" title="완료">
           <CheckCircle2 size={17} className="fill-emerald-100 dark:fill-none" />
         </div>
         <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="kanban-card-title font-semibold text-slate-800 dark:text-slate-200 text-sm truncate">{job.title}</span>
            <span className="kanban-card-subtitle text-xs truncate hidden xl:inline">- {job.clientName}</span>
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
           {renderManagementMoveButton(14)}
           <button 
             onPointerDown={stopDragPropagation}
             onClick={(e) => { e.stopPropagation(); onStatusChange(job, 'prev'); }}
             className="text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors p-0.5"
             title="이전 단계로 돌리기"
           >
             <ArrowLeft size={15} />
           </button>
           {touchPrimary && (
             <button
               type="button"
               onPointerDown={stopDragPropagation}
               onClick={handleOpenDetail}
               className="text-slate-400 hover:text-indigo-500 p-0.5"
               title="상세 보기"
             >
               <MoreVertical size={15} />
             </button>
           )}
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
          kanban-card py-2 px-3.5 rounded-xl shadow-md border transition-all duration-200 cursor-grab active:cursor-grabbing group flex flex-col gap-1.5 relative overflow-hidden backdrop-blur-premium ${cardSurfaceClass}
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
             {!isDone && (
               <span className={ddayBadgeClass} title="납기 D-Day">
                 {job.priority === Priority.VERY_URGENT && <AlertTriangle size={10} className="inline mr-0.5 -mt-px" />}
                 {ddayLabel}
               </span>
             )}
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
               <span className="kanban-badge kanban-badge-file-ok text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-0.5 font-medium shadow-sm">
                 <FileText size={12} />
                 <span>파일</span>
               </span>
             ) : (
               <span className="kanban-badge kanban-badge-file-missing text-[11px] px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-0.5 font-medium shadow-sm">
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
                   kanban-badge text-[11px] px-2.5 py-0.5 rounded-md border shadow-sm shrink-0 select-none cursor-pointer pointer-events-auto transition-colors
                   ${sub.completed 
                     ? 'kanban-badge-sub-done bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' 
                     : 'kanban-badge-sub-pending bg-slate-100 dark:bg-slate-700 border-slate-200/50 dark:border-slate-600/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                 title={`클릭하여 완료 상태 토글 (${sub.completed ? '완료' : '진행중'})`}
               >
                 {sub.type}
               </span>
             ))}
          </div>
        </div>

        {/* 2. Title and Client (Enlarged) */}
        <div className="pointer-events-none flex flex-col gap-0.5">
          <h4 className="kanban-card-title font-medium text-[20px] lg:text-[22px] leading-snug tracking-wide line-clamp-1 text-slate-800 dark:text-slate-100" title={job.title}>
            {job.title}
          </h4>
          <p className="kanban-card-subtitle text-xs leading-tight text-slate-500 dark:text-slate-400">{job.clientName}</p>
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
          {!isDone && (
            <span className={ddayBadgeClass} title="납기 D-Day">
              {ddayLabel}
            </span>
          )}
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
        kanban-card p-3 rounded-xl shadow-sm border transition-all duration-300 group flex flex-col gap-2 relative overflow-hidden backdrop-blur-premium ${cardSurfaceClass}
        ${isManagementPanel ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
        ${cardStyleClass}
        ${isManagementPanel ? 'hover:shadow-md' : 'active:rotate-1 active:scale-[1.02] active:shadow-2xl active:z-50'}
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
           {!isDone && (
             <span className={ddayBadgeClass} title="납기 D-Day">
               {job.priority === Priority.VERY_URGENT && <AlertTriangle size={9} className="inline mr-0.5 -mt-px" />}
               {ddayLabel}
             </span>
           )}
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
             <span className="kanban-badge kanban-badge-file-ok text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-0.5 font-normal shadow-sm" title={`원본 파일 등록됨\n${job.filePath}`}>
               <FileText size={11} />
               <span>파일</span>
             </span>
           ) : (
             <span className="kanban-badge kanban-badge-file-missing text-[10px] px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-0.5 font-medium shadow-sm" title="인쇄용 원본 파일 경로가 지정되지 않았습니다!">
               <ShieldAlert size={11} />
               <span>파일없음</span>
             </span>
           )}

           {/* 작업 종류 (Sub-Jobs) 배지 - 클릭하여 완료/대기 토글 가능 */}
           {subJobsList.map((sub, idx) => (
             <span
               key={sub.id || idx}
               onPointerDown={stopDragPropagation}
               onClick={(e) => handleToggleSubJob(e, idx)}
               className={`
                 kanban-badge text-[10px] px-2 py-0.5 rounded-md border shadow-sm shrink-0 select-none cursor-pointer pointer-events-auto transition-colors
                 ${sub.completed 
                   ? 'kanban-badge-sub-done bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' 
                   : 'kanban-badge-sub-pending bg-slate-100 dark:bg-slate-700 border-slate-200/50 dark:border-slate-600/50 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
               title={`클릭하여 완료 상태 토글 (${sub.completed ? '완료' : '진행중'})`}
             >
               {sub.type}
             </span>
           ))}
        </div>
        
        {/* Grip Icon & More menu */}
        <div className="flex gap-1 kanban-card-icon-muted text-slate-300 dark:text-slate-600 pointer-events-auto shrink-0 items-center">
          {renderManagementMoveButton(15)}
          {canHideFromBoard && (
            <button
              type="button"
              onPointerDown={stopDragPropagation}
              onClick={(e) => {
                e.stopPropagation();
                onHideFromBoard(job);
              }}
              className="hover:text-rose-500 transition-colors p-1 flex items-center justify-center rounded-md"
              title="보드에서 내리기"
            >
              <CheckCircle size={16} />
            </button>
          )}
          {isManagementPanel && (
            <>
              <button
                type="button"
                onPointerDown={stopDragPropagation}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(job, 'prev');
                }}
                className="hover:text-red-500 transition-colors p-1 flex items-center justify-center rounded-md"
                title="이전 단계"
              >
                <ArrowLeft size={15} />
              </button>
              <button
                type="button"
                onPointerDown={stopDragPropagation}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(job, 'next');
                }}
                className="hover:text-emerald-500 transition-colors p-1 flex items-center justify-center rounded-md"
                title="다음 단계"
              >
                <ArrowRight size={15} />
              </button>
            </>
          )}
          {!isManagementPanel && (
          <GripHorizontal
            size={16}
            className={`cursor-grab active:cursor-grabbing hover:text-slate-500 ${touchPrimary ? 'opacity-50' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
          />
          )}
          <button
            type="button"
            onPointerDown={stopDragPropagation}
            onClick={handleOpenDetail}
            className={`hover:text-slate-600 dark:hover:text-slate-400 transition-colors p-1 flex items-center justify-center rounded-md ${touchPrimary ? 'text-slate-500 bg-slate-100/80 dark:bg-slate-800' : ''}`}
            title={touchPrimary ? '상세 보기' : '상세 보기 (우클릭과 동일)'}
          >
            <MoreVertical size={touchPrimary ? 18 : 16} />
          </button>
        </div>
      </div>
      
      {/* 2. Main Title and Client */}
      <div className="pointer-events-none flex flex-col gap-0.5">
        {isManagementPanel && managementPrepaidBadge && (
          <div className="flex justify-end -mb-0.5">
            {managementPrepaidBadge.kind === 'deducted' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 tabular-nums">
                선불 −{managementPrepaidBadge.amount.toLocaleString()}
              </span>
            )}
            {managementPrepaidBadge.kind === 'pending' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 tabular-nums">
                선불 예정 −{managementPrepaidBadge.amount.toLocaleString()}
              </span>
            )}
            {managementPrepaidBadge.kind === 'separate' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                별도결제
              </span>
            )}
            {managementPrepaidBadge.kind === 'receivable' && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 tabular-nums">
                미수 {managementPrepaidBadge.amount.toLocaleString()}
              </span>
            )}
          </div>
        )}
        <h4 className="kanban-card-title font-medium text-[15px] lg:text-[16px] leading-snug truncate text-slate-800 dark:text-slate-100" title={job.title}>
          {job.title}
        </h4>
        <p className="kanban-card-subtitle text-xs truncate text-slate-500 dark:text-slate-400">{job.clientName}</p>
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
            <span className={`kanban-card-meta text-[10px] font-normal truncate ${isMyJob ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`} title={staffName}>
                {staffName}
            </span>
          </div>
          {!isDone && (
            <span className={ddayBadgeClass} title="납기 D-Day">
              {ddayLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const KanbanCardSortable: React.FC<KanbanCardProps> = (props) => {
  const sortable = useSortable({ id: props.job.id, disabled: props.isDragOverlay });
  return <KanbanCardImpl {...props} sortable={sortable} />;
};

export const KanbanCard: React.FC<KanbanCardProps> = (props) => {
  if (props.isManagementPanel) {
    return <KanbanCardImpl {...props} sortable={NO_SORTABLE} />;
  }
  return <KanbanCardSortable {...props} />;
};
