
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Job, JobStatusDefinition } from '../../types';
import { KanbanCard, type TvCardDensity } from './KanbanCard';
import { useTheme } from '../../contexts/ThemeContext';
import { AdBanner } from '../common/AdBanner';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { COLUMN_DROPPABLE_PREFIX } from './kanbanCollisionDetection';
import { GripHorizontal } from 'lucide-react';

export { COLUMN_DROPPABLE_PREFIX };

const getStatusDotColor = (statusKey: string) => {
  switch (statusKey) {
    case 'QUOTE': return 'bg-indigo-500';
    case 'RECEIVED': return 'bg-red-500';
    case 'DESIGN': return 'bg-orange-500';
    case 'PRINTING': return 'bg-amber-500';
    case 'POST_PROCESSING': return 'bg-emerald-500';
    case 'DELIVERY': return 'bg-blue-600';
    case 'COMPLETED': return 'bg-slate-500';
    default: return 'bg-slate-500';
  }
};

function useKanbanHoverSlotLock(enabled: boolean) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const frozenHeightsRef = useRef<Record<string, number>>({});
  const hoverClearTimerRef = useRef<number | null>(null);
  const [frozenHeights, setFrozenHeights] = useState<Record<string, number>>({});
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);

  const snapshotCardHeights = useCallback(() => {
    const list = listRef.current;
    if (!list) return {};
    const next: Record<string, number> = {};
    list.querySelectorAll<HTMLElement>('[data-job-id]').forEach((node) => {
      const id = node.dataset.jobId;
      if (id) next[id] = node.getBoundingClientRect().height;
    });
    return next;
  }, []);

  const handleHoverSlotChange = useCallback(
    (jobId: string | null) => {
      if (!enabled) return;
      if (jobId) {
        if (hoverClearTimerRef.current != null) {
          window.clearTimeout(hoverClearTimerRef.current);
          hoverClearTimerRef.current = null;
        }
        if (Object.keys(frozenHeightsRef.current).length === 0) {
          const snap = snapshotCardHeights();
          frozenHeightsRef.current = snap;
          setFrozenHeights(snap);
        }
        setHoveredJobId(jobId);
        return;
      }
      hoverClearTimerRef.current = window.setTimeout(() => {
        frozenHeightsRef.current = {};
        setFrozenHeights({});
        setHoveredJobId(null);
        hoverClearTimerRef.current = null;
      }, 50);
    },
    [enabled, snapshotCardHeights]
  );

  useEffect(() => {
    return () => {
      if (hoverClearTimerRef.current != null) {
        window.clearTimeout(hoverClearTimerRef.current);
      }
    };
  }, []);

  const hasFrozenSlots = Object.keys(frozenHeights).length > 0;

  return {
    listRef,
    setListRef: (node: HTMLDivElement | null) => {
      listRef.current = node;
    },
    frozenHeights,
    hoveredJobId,
    hasFrozenSlots,
    handleHoverSlotChange: enabled ? handleHoverSlotChange : undefined,
  };
}

const TV_CARD_GAP = 6;
const TV_DENSITY_ORDER: TvCardDensity[] = ['full', 'triple', 'double', 'title'];
const TV_CARD_HEIGHT: Record<TvCardDensity, number> = {
  full: 228,
  triple: 104,
  double: 72,
  title: 48,
};

function pickTvDensity(
  availablePx: number,
  jobCount: number,
  measured: Partial<Record<TvCardDensity, number>>
): TvCardDensity {
  if (jobCount <= 0 || availablePx < 40) return 'full';
  const heightOf = (level: TvCardDensity) => measured[level] ?? TV_CARD_HEIGHT[level];
  const pack = (level: TvCardDensity) =>
    jobCount * heightOf(level) + Math.max(0, jobCount - 1) * TV_CARD_GAP;
  if (pack('full') <= availablePx) return 'full';
  if (pack('triple') <= availablePx) return 'triple';
  if (pack('double') <= availablePx) return 'double';
  return 'title';
}

function stepTvDensityDown(current: TvCardDensity): TvCardDensity {
  const index = TV_DENSITY_ORDER.indexOf(current);
  return TV_DENSITY_ORDER[Math.min(index + 1, TV_DENSITY_ORDER.length - 1)];
}

function useTvColumnDensity(
  enabled: boolean,
  jobCount: number,
  listRef: React.RefObject<HTMLDivElement | null>
) {
  const [density, setDensity] = useState<TvCardDensity>('full');
  const densityRef = useRef(density);
  densityRef.current = density;
  const measuredRef = useRef<Partial<Record<TvCardDensity, number>>>({});

  useLayoutEffect(() => {
    if (!enabled) {
      measuredRef.current = {};
      if (densityRef.current !== 'full') setDensity('full');
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    const apply = (next: TvCardDensity) => {
      if (cancelled || densityRef.current === next) return;
      setDensity(next);
    };

    const update = () => {
      const el = listRef.current;
      if (!el || cancelled) return;
      const style = window.getComputedStyle(el);
      const pad = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      const available = el.clientHeight - pad;
      // 첫 프레임에 높이가 0이면 'full'로 고정하지 않고 다음 측정까지 둔다.
      if (available < 40) return;

      const cards = el.querySelectorAll<HTMLElement>('[data-job-id]');
      const current = densityRef.current;
      if (cards.length > 0) {
        let packed = 0;
        cards.forEach((card) => {
          packed += card.getBoundingClientRect().height;
        });
        packed += Math.max(0, cards.length - 1) * TV_CARD_GAP;
        const avg = (packed - Math.max(0, cards.length - 1) * TV_CARD_GAP) / cards.length;
        const expected = TV_CARD_HEIGHT[current];
        if (avg >= expected * 0.75) measuredRef.current[current] = avg;
        const overflows =
          packed > available + 4 || el.scrollHeight > el.clientHeight + 16;
        if (overflows) {
          apply(stepTvDensityDown(current));
          return;
        }
      }
      apply(pickTvDensity(available, jobCount, measuredRef.current));
    };

    const observe = (ro: ResizeObserver) => {
      const el = listRef.current;
      if (!el) return;
      ro.observe(el);
      el.querySelectorAll<HTMLElement>('[data-job-id]').forEach((card) => ro.observe(card));
    };

    update();
    const ro = new ResizeObserver(() => update());
    observe(ro);
    const onLayoutShift = () => update();
    document.addEventListener('fullscreenchange', onLayoutShift);
    // 글자 크기·전체화면이 한 박자 늦게 잡혀도 첫 진입에서 다시 맞춘다.
    timers.push(window.setTimeout(update, 50));
    timers.push(window.setTimeout(update, 280));
    timers.push(window.setTimeout(update, 600));

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      ro.disconnect();
      document.removeEventListener('fullscreenchange', onLayoutShift);
    };
  }, [enabled, jobCount, listRef, density]);

  return density;
}

export interface CompactTraySectionProps {
  statusDef: JobStatusDefinition;
  jobs: Job[];
  getStaffName: (job?: Job) => string;
  onSelectJob: (job: Job) => void;
  onRightClickJob?: (job: Job) => void;
  onStatusChange: (job: Job, direction: 'next' | 'prev') => void;
  currentUserId?: string;
  resolveIsMyJob?: (job: Job) => boolean;
  isTvMode?: boolean;
  fillHeight?: boolean;
  resizeHandle?: {
    dragging: boolean;
    onPointerDown: (e: React.PointerEvent) => void;
    title?: string;
  };
  onHideFromBoard?: (job: Job) => void;
  /** 합친 칸 하단 모양: 견적형 격자 / 한줄 리스트 */
  trayStyle?: 'grid' | 'line';
}

export const CompactTraySection: React.FC<CompactTraySectionProps> = ({
  statusDef,
  jobs,
  getStaffName,
  onSelectJob,
  onRightClickJob,
  onStatusChange,
  currentUserId,
  resolveIsMyJob,
  isTvMode = false,
  fillHeight = false,
  resizeHandle,
  onHideFromBoard,
  trayStyle = 'line',
}) => {
  const { theme } = useTheme();
  const droppableId = `${COLUMN_DROPPABLE_PREFIX}${statusDef.key}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  const sortedJobs = [...jobs].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const jobIds = sortedJobs.map((job) => job.id);
  const isGridTray = trayStyle === 'grid';
  const { setListRef, frozenHeights, hoveredJobId, hasFrozenSlots, handleHoverSlotChange } = useKanbanHoverSlotLock(!isTvMode);
  // 하단 묶음 칸은 어떤 단계로 연결되더라도 일반 컬럼과 같은 헤더 가독성을 유지한다.
  const useLargeHeader = true;

  const setTrayRef = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    setListRef(node);
  };

  return (
    <div className={`flex flex-col ${fillHeight ? 'h-full min-h-0' : 'flex-none'}`}>
      {useLargeHeader ? (
        <div className={`relative p-1.5 lg:p-2 flex items-center justify-between shrink-0 ${theme === 'trello' ? 'border-b border-transparent' : 'border-b border-slate-200/80 dark:border-slate-700/80'}`}>
          <h3 className={`font-medium flex items-center gap-2 ${theme === 'trello' ? 'text-slate-100 font-bold' : 'text-slate-700 dark:text-slate-200'} ${isTvMode ? 'text-[19px] lg:text-[22px]' : 'text-[15px] lg:text-[17px]'}`}>
            <div className={`rounded-full shadow-sm ${isTvMode ? 'w-3 h-3' : 'w-2 h-2'} ${getStatusDotColor(statusDef.key)}`} />
            {statusDef.label}
          </h3>
          {resizeHandle && (
            <button
              type="button"
              onPointerDown={resizeHandle.onPointerDown}
              title={resizeHandle.title || '드래그하여 상·하 비율 조절'}
              className={`absolute left-1/2 -translate-x-1/2 px-1.5 py-1 rounded cursor-row-resize ${
                resizeHandle.dragging
                  ? 'bg-blue-500/25 text-blue-200'
                  : theme === 'trello'
                    ? 'hover:bg-[#334a67] text-slate-400'
                    : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400'
              }`}
            >
              <GripHorizontal size={14} />
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span className={`rounded-full font-medium shadow-sm ${theme === 'trello' ? 'bg-[#2c3e56] text-slate-100 border-transparent font-bold' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600'} ${isTvMode ? 'text-[13px] lg:text-[14px] px-3 py-0.5' : 'text-[10px] px-2 py-0.5'}`}>
              {jobs.length}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
          <span className="text-[10px] lg:text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            {statusDef.label}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
              theme === 'trello'
                ? 'bg-[#2c3e56] text-slate-300'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {jobs.length}
          </span>
        </div>
      )}

      <div
        ref={setTrayRef}
        data-kanban-column={statusDef.key}
        className={`${fillHeight ? 'flex-1 min-h-0' : isGridTray ? 'min-h-[100px] max-h-none' : 'min-h-[88px] max-h-[220px]'} kanban-card-scroll custom-scrollbar rounded-lg border border-dashed p-1.5 transition-colors kanban-tray-zone ${
          isGridTray ? 'overflow-x-hidden' : 'flex flex-col gap-1.5'
        } ${
          isOver
            ? theme === 'trello'
              ? 'border-indigo-400 bg-indigo-950/30 ring-2 ring-indigo-400/40'
              : 'border-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/30 ring-2 ring-indigo-300/50'
            : theme === 'trello'
              ? 'border-[#384c66] bg-[#152238]/50'
              : 'border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-900/40'
        }`}
        style={hasFrozenSlots ? { overflowAnchor: 'none' } : undefined}
      >
        <SortableContext items={jobIds} strategy={isGridTray ? rectSortingStrategy : verticalListSortingStrategy}>
          {sortedJobs.length === 0 ? (
            <div className={`kanban-tray-empty flex items-center justify-center text-[10px] text-slate-400 dark:text-slate-500 py-4 pointer-events-none text-center px-2 ${isGridTray ? 'min-h-[72px]' : 'flex-1'}`}>
              {`${statusDef.label} 작업을 여기로 끌어다 놓으세요`}
            </div>
          ) : (
            <div className={isGridTray ? 'grid grid-cols-2 lg:grid-cols-3 gap-1.5 auto-rows-min' : `flex flex-col gap-1.5 ${fillHeight ? 'h-full' : ''}`}>
              {sortedJobs.map((job) => (
                <KanbanCard
                  key={job.id}
                  job={job}
                  status={job.status}
                  staffName={getStaffName(job)}
                  onSelect={onSelectJob}
                  onRightClick={onRightClickJob}
                  onStatusChange={onStatusChange}
                  isMyJob={resolveIsMyJob ? resolveIsMyJob(job) : false}
                  currentUserId={currentUserId}
                  isTvMode={isTvMode}
                  isCompactTray={!isGridTray}
                  isQuoteTray={isGridTray}
                  onHideFromBoard={onHideFromBoard}
                  lockedSlotHeight={
                    frozenHeights[job.id] != null ? frozenHeights[job.id] : undefined
                  }
                  onHoverSlotChange={handleHoverSlotChange}
                  isSlotHovered={handleHoverSlotChange ? hoveredJobId === job.id : undefined}
                />
              ))}
            </div>
          )}
        </SortableContext>

        {isOver && sortedJobs.length > 0 && (
          <div className="h-8 shrink-0 rounded border border-dashed border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 flex items-center justify-center pointer-events-none">
            <span className="text-indigo-500 dark:text-indigo-300 text-[10px] font-bold">
              {statusDef.label}(으)로 이동
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

interface KanbanColumnProps {
  statusDef: JobStatusDefinition;
  jobs: Job[];
  getStaffName: (job?: Job) => string;
  onSelectJob: (job: Job) => void;
  onRightClickJob?: (job: Job) => void;
  onStatusChange: (job: Job, direction: 'next' | 'prev') => void;
  currentUserId?: string;
  resolveIsMyJob?: (job: Job) => boolean;
  isCompact?: boolean;
  showAd?: boolean;
  isTvMode?: boolean;
  /** 상·하 분할 칸 내부에 넣을 때 외곽 테두리 제거 */
  embedded?: boolean;
  resizeHandle?: {
    dragging: boolean;
    onPointerDown: (e: React.PointerEvent) => void;
    title?: string;
  };
  onHideFromBoard?: (job: Job) => void;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
  statusDef, 
  jobs, 
  getStaffName, 
  onSelectJob, 
  onRightClickJob,
  onStatusChange, 
  currentUserId,
  resolveIsMyJob,
  isCompact = false,
  showAd = false,
  isTvMode = false,
  embedded = false,
  resizeHandle,
  onHideFromBoard,
}) => {
  const { theme } = useTheme();

  const droppableId = `${COLUMN_DROPPABLE_PREFIX}${statusDef.key}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  const getColorForStatus = (statusKey: string) => getStatusDotColor(statusKey);

  const sortedJobs = [...jobs].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const jobIds = sortedJobs.map(job => job.id);
  const { listRef, frozenHeights, hoveredJobId, hasFrozenSlots, handleHoverSlotChange } = useKanbanHoverSlotLock(
    !isCompact && !isTvMode
  );
  const tvDensity = useTvColumnDensity(isTvMode && !isCompact, sortedJobs.length, listRef);

  return (
    <div 
      className={`flex flex-col h-full min-h-0 transition-colors duration-200
        ${embedded ? 'flex-1 rounded-none border-0 bg-transparent shadow-none' : `flex-1 rounded-xl border ${
        theme === 'trello'
          ? (isOver ? 'bg-[#24364e] border-[#384c66] shadow-sm' : 'bg-[#1d2d44] border-[#2c3e56] shadow-none')
          : (isOver 
              ? 'bg-blue-100/80 dark:bg-blue-900/50 border-blue-400 ring-2 ring-blue-300 ring-inset' 
              : 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200/60 dark:border-slate-700')
        }`}
      `}
    >
      <div className={`relative p-1.5 lg:p-2 flex items-center justify-between rounded-t-xl sticky top-0 z-10 ${theme === "trello" ? "bg-transparent border-b border-transparent" : "bg-white/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 backdrop-blur-sm"}`}>
        <h3 className={`font-medium flex items-center gap-2 ${theme === "trello" ? "text-slate-300 font-bold" : "text-slate-700 dark:text-slate-200"} ${isTvMode ? 'text-[19px] lg:text-[22px] font-medium' : 'text-[15px] lg:text-[17px]'}`}>
          <div className={`rounded-full shadow-sm ${isTvMode ? 'w-3 h-3' : 'w-2 h-2'} ${getColorForStatus(statusDef.key)}`} />
          {statusDef.label}
        </h3>
        {resizeHandle && (
          <button
            type="button"
            onPointerDown={resizeHandle.onPointerDown}
            title={resizeHandle.title || '드래그하여 상·하 비율 조절'}
            className={`absolute left-1/2 -translate-x-1/2 px-1.5 py-1 rounded cursor-row-resize ${
              resizeHandle.dragging
                ? 'bg-blue-500/25 text-blue-200'
                : theme === 'trello'
                  ? 'hover:bg-[#334a67] text-slate-400'
                  : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400'
            }`}
          >
            <GripHorizontal size={14} />
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <span className={`rounded-full font-medium shadow-sm ${theme === "trello" ? "bg-[#2c3e56] text-slate-300 border-transparent shadow-none font-bold" : "bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600"} ${isTvMode ? 'text-[13px] lg:text-[14px] px-3 py-0.5 font-medium' : 'text-[10px] px-2 py-0.5'}`}>
            {jobs.length}
          </span>
        </div>
      </div>
      
      <div
        ref={setNodeRef}
        data-kanban-column={statusDef.key}
        className={`flex-1 min-h-0 flex flex-col ${isOver ? 'ring-2 ring-inset ring-blue-400/60 rounded-b-xl' : ''}`}
      >
        <SortableContext items={jobIds} strategy={verticalListSortingStrategy}>
          <div
            ref={listRef}
            className={`p-1 lg:p-1.5 flex-1 min-h-0 kanban-card-scroll flex flex-col gap-1.5 custom-scrollbar ${embedded ? 'min-h-[80px]' : 'min-h-[160px]'}`}
            style={hasFrozenSlots ? { overflowAnchor: 'none' } : undefined}
          >
            {jobs.length === 0 && statusDef.key === 'COMPLETED' && (
              <div className="text-center text-slate-400 text-xs py-4">
                해당 날짜의 완료 내역이 없습니다.
              </div>
            )}
            {sortedJobs.map((job) => (
              <KanbanCard 
                key={job.id}
                job={job}
                status={job.status}
                staffName={getStaffName(job)}
                onSelect={onSelectJob}
                onRightClick={onRightClickJob}
                onStatusChange={onStatusChange}
                isMyJob={resolveIsMyJob ? resolveIsMyJob(job) : false}
                isCompact={isCompact}
                currentUserId={currentUserId}
                isTvMode={isTvMode}
                tvDensity={isTvMode ? tvDensity : undefined}
                onHideFromBoard={onHideFromBoard}
                lockedSlotHeight={
                  frozenHeights[job.id] != null ? frozenHeights[job.id] : undefined
                }
                onHoverSlotChange={handleHoverSlotChange}
                isSlotHovered={handleHoverSlotChange ? hoveredJobId === job.id : undefined}
              />
            ))}

            <div
              className={`${hasFrozenSlots || isTvMode ? 'flex-1 min-h-0' : 'flex-1 min-h-[72px] shrink-0'} rounded-lg border border-dashed border-transparent pointer-events-none`}
              aria-hidden
            />

            {isOver && (
              <div className="h-12 shrink-0 rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/40 dark:bg-blue-900/20 flex items-center justify-center pointer-events-none">
                <span className="text-blue-500 dark:text-blue-300 text-xs font-bold">이 위치로 이동</span>
              </div>
            )}
          </div>
        </SortableContext>
      </div>

      {showAd && !embedded && (
        <div className="p-3 mt-auto flex-none">
          <AdBanner slot="kanban_column" type="dashed" size="300x250" format="rectangle" />
        </div>
      )}
    </div>
  );
};
