import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Eye, EyeOff, GripHorizontal, GripVertical, Trash2, Unlink, ArrowUpDown } from 'lucide-react';
import { JobStatusDefinition, KanbanBottomStyle, KanbanLayoutConfig, KanbanSplitPair } from '../../types';
import {
  KanbanColumnSlot,
  buildKanbanColumnSlots,
  clampSplitTopPercent,
  findPairForKey,
  parseStageSortId,
  reorderDefinitionsBySlots,
  resolveBottomStyle,
  slotContainsStatus,
  slotSortId,
  stageSortId,
} from '../../utils/kanbanLayout';

const previewCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const closestHits = closestCenter(args);
  const activeId = String(args.active.id);
  const pick = (hits: typeof pointerHits, pred: (id: string) => boolean) => hits.filter((hit) => pred(String(hit.id)));

  if (activeId.startsWith('stage:')) {
    const stages = pick(pointerHits, (id) => id.startsWith('stage:'));
    if (stages.length) return stages;
    const closestStages = pick(closestHits, (id) => id.startsWith('stage:'));
    if (closestStages.length) return closestStages;
  }

  const slots = pick(closestHits, (id) => !id.startsWith('stage:'));
  return slots.length ? slots : closestHits;
};

const PAIR_ACCENT = ['border-indigo-500', 'border-emerald-500', 'border-amber-500', 'border-sky-500'];

const compactBtn =
  'px-1.5 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-0.5 shrink-0';

type StatusKanbanPreviewProps = {
  statuses: JobStatusDefinition[];
  kanbanLayout: KanbanLayoutConfig;
  selectedKeys: string[];
  onToggleSelect: (key: string) => void;
  onLabelChange: (key: string, label: string) => void;
  onToggleVisibility: (key: string) => void;
  onDelete: (key: string) => void;
  onSwapPair: (pair: KanbanSplitPair) => void;
  onRemovePair: (pair: KanbanSplitPair) => void;
  onSetBottomStyle: (pair: KanbanSplitPair, style: KanbanBottomStyle) => void;
  onSplitPercentChange: (pair: KanbanSplitPair, percent: number) => void;
  onSplitPercentCommit: (pair: KanbanSplitPair, percent: number) => void;
  onReorderStatuses: (next: JobStatusDefinition[]) => void;
};

function StyleButtons({
  style,
  onPick,
}: {
  style: KanbanBottomStyle;
  onPick: (next: KanbanBottomStyle) => void;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onPick('grid')}
        className={`${compactBtn} ${
          style === 'grid'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'
        }`}
      >
        견적형
      </button>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onPick('line')}
        className={`${compactBtn} ${
          style === 'line'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600'
        }`}
      >
        한줄형
      </button>
    </span>
  );
}

function StageHeader({
  status,
  selected,
  canDelete,
  onToggleSelect,
  onLabelChange,
  onToggleVisibility,
  onDelete,
  dragHandle,
}: {
  status: JobStatusDefinition;
  selected: boolean;
  canDelete: boolean;
  onToggleSelect: (key: string) => void;
  onLabelChange: (key: string, label: string) => void;
  onToggleVisibility: (key: string) => void;
  onDelete: (key: string) => void;
  dragHandle?: {
    attributes: React.HTMLAttributes<HTMLElement>;
    listeners?: React.HTMLAttributes<HTMLElement>;
  };
}) {
  return (
    <div className={`flex items-center gap-1 p-1.5 shrink-0 ${selected ? 'ring-2 ring-indigo-400 ring-inset' : ''}`}>
      {dragHandle && (
        <span
          className="p-0.5 text-slate-400 cursor-grab active:cursor-grabbing shrink-0"
          title="끌어 위·아래 자리를 바꿉니다"
          {...dragHandle.attributes}
          {...dragHandle.listeners}
        >
          <GripVertical size={12} />
        </span>
      )}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(status.key)}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
        title="연결할 단계 선택 (2개)"
      />
      <input
        type="text"
        value={status.label}
        onChange={(e) => onLabelChange(status.key, e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        className="flex-1 min-w-0 px-1.5 py-1 border border-slate-300 dark:border-slate-600 rounded text-[12px] font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
      />
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onToggleVisibility(status.key)}
        className="p-0.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded shrink-0"
      >
        {status.isVisible !== false ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onDelete(status.key)}
        className="p-0.5 text-red-400 hover:text-red-600 rounded shrink-0"
        disabled={!canDelete}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function SortableStagePane({
  id,
  flexPercent,
  className,
  emptyClassName,
  children,
}: {
  id: string;
  flexPercent: number;
  className: string;
  emptyClassName: string;
  children: (dragHandle: {
    attributes: React.HTMLAttributes<HTMLElement>;
    listeners?: React.HTMLAttributes<HTMLElement>;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: `${flexPercent} 1 0%`,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`min-h-0 flex flex-col overflow-hidden ${className} ${isDragging ? 'opacity-40' : ''}`}
    >
      {children({ attributes, listeners })}
      <div className={`flex-1 min-h-[1.5rem] mx-1.5 mb-1 rounded-md border border-dashed cursor-grab active:cursor-grabbing ${emptyClassName}`} {...listeners} />
    </div>
  );
}

function SplitResizeColumn({
  top,
  bottom,
  pair,
  selectedKeys,
  canDelete,
  onToggleSelect,
  onLabelChange,
  onToggleVisibility,
  onDelete,
  onSplitPercentChange,
  onSplitPercentCommit,
  onSetBottomStyle,
}: {
  top: JobStatusDefinition;
  bottom: JobStatusDefinition;
  pair: KanbanSplitPair;
  selectedKeys: string[];
  canDelete: boolean;
  onToggleSelect: (key: string) => void;
  onLabelChange: (key: string, label: string) => void;
  onToggleVisibility: (key: string) => void;
  onDelete: (key: string) => void;
  onSplitPercentChange: (pair: KanbanSplitPair, percent: number) => void;
  onSplitPercentCommit: (pair: KanbanSplitPair, percent: number) => void;
  onSetBottomStyle: (pair: KanbanSplitPair, style: KanbanBottomStyle) => void;
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const [topPercent, setTopPercent] = useState(() => clampSplitTopPercent(pair.splitTopPercent ?? 65));
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startPercentRef = useRef(topPercent);
  const latestPercentRef = useRef(topPercent);

  useEffect(() => {
    if (dragging) return;
    const next = clampSplitTopPercent(pair.splitTopPercent ?? 65);
    setTopPercent(next);
    latestPercentRef.current = next;
  }, [pair.splitTopPercent, dragging]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    startYRef.current = e.clientY;
    startPercentRef.current = topPercent;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || !columnRef.current) return;
      const rect = columnRef.current.getBoundingClientRect();
      if (rect.height <= 0) return;
      const deltaPercent = ((e.clientY - startYRef.current) / rect.height) * 100;
      const next = clampSplitTopPercent(startPercentRef.current + deltaPercent);
      latestPercentRef.current = next;
      setTopPercent(next);
      onSplitPercentChange(pair, next);
    },
    [dragging, onSplitPercentChange, pair]
  );

  const handlePointerUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    onSplitPercentCommit(pair, latestPercentRef.current);
  }, [dragging, onSplitPercentCommit, pair]);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragging, handlePointerMove, handlePointerUp]);

  const bottomPercent = 100 - topPercent;
  const stageIds = [stageSortId(top.key), stageSortId(bottom.key)];

  return (
    <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
      <div ref={columnRef} className="flex-1 min-h-0 flex flex-col">
        <SortableStagePane
          id={stageSortId(top.key)}
          flexPercent={topPercent}
          className="bg-indigo-50/80 dark:bg-indigo-950/30"
          emptyClassName="border-indigo-200/80 dark:border-indigo-800/60 bg-white/40 dark:bg-slate-900/20"
        >
          {(dragHandle) => (
            <StageHeader
              status={top}
              selected={selectedKeys.includes(top.key)}
              canDelete={canDelete}
              onToggleSelect={onToggleSelect}
              onLabelChange={onLabelChange}
              onToggleVisibility={onToggleVisibility}
              onDelete={onDelete}
              dragHandle={dragHandle}
            />
          )}
        </SortableStagePane>
        <div
          className={`relative h-4 shrink-0 flex items-center justify-center cursor-row-resize z-10 ${
            dragging ? 'bg-indigo-500/20' : 'bg-indigo-100/80 dark:bg-indigo-950/50'
          }`}
          onPointerDown={handlePointerDown}
          title="위아래로 끌어 칸반과 같은 상·하 비율을 맞춥니다"
        >
          <div className="absolute inset-x-0 top-1/2 h-px bg-indigo-500" />
          <span className="relative inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-px rounded-full bg-indigo-600 text-white leading-none">
            <GripHorizontal size={10} />
            {topPercent}%
          </span>
        </div>
        <SortableStagePane
          id={stageSortId(bottom.key)}
          flexPercent={bottomPercent}
          className="bg-slate-50 dark:bg-slate-900/60"
          emptyClassName="border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/30"
        >
          {(dragHandle) => (
            <>
              <StageHeader
                status={bottom}
                selected={selectedKeys.includes(bottom.key)}
                canDelete={canDelete}
                onToggleSelect={onToggleSelect}
                onLabelChange={onLabelChange}
                onToggleVisibility={onToggleVisibility}
                onDelete={onDelete}
                dragHandle={dragHandle}
              />
              <div className="px-1.5 pb-1 flex items-center gap-1 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">아래 칸 모양</span>
                <StyleButtons style={resolveBottomStyle(pair)} onPick={(next) => onSetBottomStyle(pair, next)} />
              </div>
            </>
          )}
        </SortableStagePane>
      </div>
    </SortableContext>
  );
}

function SortablePreviewColumn({
  slot,
  accentClass,
  statuses,
  kanbanLayout,
  selectedKeys,
  canDelete,
  dragHandle,
  onToggleSelect,
  onLabelChange,
  onToggleVisibility,
  onDelete,
  onSwapPair,
  onRemovePair,
  onSetBottomStyle,
  onSplitPercentChange,
  onSplitPercentCommit,
}: {
  slot: KanbanColumnSlot;
  accentClass?: string;
  statuses: JobStatusDefinition[];
  kanbanLayout: KanbanLayoutConfig;
  selectedKeys: string[];
  canDelete: boolean;
  dragHandle?: boolean;
  onToggleSelect: (key: string) => void;
  onLabelChange: (key: string, label: string) => void;
  onToggleVisibility: (key: string) => void;
  onDelete: (key: string) => void;
  onSwapPair: (pair: KanbanSplitPair) => void;
  onRemovePair: (pair: KanbanSplitPair) => void;
  onSetBottomStyle: (pair: KanbanSplitPair, style: KanbanBottomStyle) => void;
  onSplitPercentChange: (pair: KanbanSplitPair, percent: number) => void;
  onSplitPercentCommit: (pair: KanbanSplitPair, percent: number) => void;
}) {
  const id = slotSortId(slot);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !dragHandle,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (slot.type === 'single') {
    const status = statuses.find((s) => s.key === slot.statusKey);
    if (!status) return null;
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`h-full flex-1 min-w-[148px] rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden flex flex-col ${
          isDragging ? 'opacity-40' : ''
        } ${status.isVisible === false ? 'opacity-50 border-dashed' : ''}`}
      >
        <div
          className="flex items-center gap-1 px-1.5 py-1 border-b border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing text-slate-400 shrink-0"
          {...attributes}
          {...listeners}
          title="좌우로 끌어 칸반 순서를 바꿉니다"
        >
          <GripVertical size={14} />
          <span className="text-[10px] font-bold">이동</span>
        </div>
        <StageHeader
          status={status}
          selected={selectedKeys.includes(status.key)}
          canDelete={canDelete}
          onToggleSelect={onToggleSelect}
          onLabelChange={onLabelChange}
          onToggleVisibility={onToggleVisibility}
          onDelete={onDelete}
        />
        <div className="flex-1 min-h-0 mx-1.5 mb-1.5 rounded-md border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 cursor-grab active:cursor-grabbing" {...listeners} />
      </div>
    );
  }

  const top = statuses.find((s) => s.key === slot.topKey);
  const bottom = statuses.find((s) => s.key === slot.bottomKey);
  const pair = findPairForKey(kanbanLayout, slot.topKey);
  if (!top || !bottom || !pair) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`h-full flex-1 min-w-[210px] rounded-xl border-2 overflow-hidden flex flex-col ${accentClass || 'border-indigo-500'} bg-white dark:bg-slate-800 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div
        className="flex items-center gap-1 px-1.5 py-1 cursor-grab active:cursor-grabbing text-slate-400 shrink-0 border-b border-slate-200 dark:border-slate-700"
        {...attributes}
        {...listeners}
        title="묶인 칸 전체를 좌우로 끌어 순서를 바꿉니다"
      >
        <GripVertical size={14} />
        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300">묶음 이동</span>
      </div>
      <div className="px-1.5 py-1.5 border-b border-slate-200 dark:border-slate-700 shrink-0 space-y-1">
        <div className="flex items-center gap-1 flex-nowrap overflow-x-auto">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onSwapPair(pair)}
            className={`${compactBtn} border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200`}
            title="위 단계와 아래 단계의 자리를 바꿉니다"
          >
            <ArrowUpDown size={11} /> 위아래
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRemovePair(pair)}
            className={`${compactBtn} text-rose-600 border-rose-200 dark:border-rose-800`}
            title="묶인 위·아래를 각각 독립된 칸으로 나눕니다"
          >
            <Unlink size={11} /> 분리
          </button>
        </div>
        <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          분리: 한 칸으로 묶인 두 단계를 다시 각각 칸으로 나눕니다.
        </p>
      </div>
      <SplitResizeColumn
        top={top}
        bottom={bottom}
        pair={pair}
        selectedKeys={selectedKeys}
        canDelete={canDelete}
        onToggleSelect={onToggleSelect}
        onLabelChange={onLabelChange}
        onToggleVisibility={onToggleVisibility}
        onDelete={onDelete}
        onSplitPercentChange={onSplitPercentChange}
        onSplitPercentCommit={onSplitPercentCommit}
        onSetBottomStyle={onSetBottomStyle}
      />
    </div>
  );
}

export const StatusKanbanPreview: React.FC<StatusKanbanPreviewProps> = ({
  statuses,
  kanbanLayout,
  selectedKeys,
  onToggleSelect,
  onLabelChange,
  onToggleVisibility,
  onDelete,
  onSwapPair,
  onRemovePair,
  onSetBottomStyle,
  onSplitPercentChange,
  onSplitPercentCommit,
  onReorderStatuses,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const previewSlots = useMemo(
    () => buildKanbanColumnSlots(statuses, kanbanLayout, []),
    [statuses, kanbanLayout]
  );
  const hiddenStatuses = statuses.filter((s) => s.isVisible === false);
  const slotIds = previewSlots.map(slotSortId);
  const canDelete = statuses.length > 2;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeStageKey = parseStageSortId(String(active.id));
    if (activeStageKey) {
      const overStageKey = parseStageSortId(String(over.id));
      const fromPair = findPairForKey(kanbanLayout, activeStageKey);
      let toKey = overStageKey;
      if (!toKey) {
        const overSlot = previewSlots.find((slot) => slotSortId(slot) === String(over.id));
        if (overSlot?.type === 'split' && slotContainsStatus(overSlot, activeStageKey)) {
          toKey = overSlot.topKey === activeStageKey ? overSlot.bottomKey : overSlot.topKey;
        }
      }
      if (
        fromPair &&
        toKey &&
        toKey !== activeStageKey &&
        (fromPair.topKey === toKey || fromPair.bottomKey === toKey)
      ) {
        onSwapPair(fromPair);
      }
      return;
    }

    let overSlotId = String(over.id);
    const overStageKey = parseStageSortId(overSlotId);
    if (overStageKey) {
      const parent = previewSlots.find((slot) => slotContainsStatus(slot, overStageKey));
      if (!parent) return;
      overSlotId = slotSortId(parent);
    }
    const oldIndex = slotIds.indexOf(String(active.id));
    const newIndex = slotIds.indexOf(overSlotId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    onReorderStatuses(reorderDefinitionsBySlots(statuses, arrayMove(previewSlots, oldIndex, newIndex)));
  };

  const activeSlot = previewSlots.find((slot) => slotSortId(slot) === activeId);
  const activeStageKey = activeId ? parseStageSortId(activeId) : null;
  const activeStage = activeStageKey ? statuses.find((s) => s.key === activeStageKey) : null;

  return (
    <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-900/50 p-2">
      <div className="px-1 mb-3 space-y-1">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">칸반 미리보기</p>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          칸을 좌우로 끌면 순서가 저장됩니다. 묶인 칸의 위·아래를 끌면 자리가 바뀌고, 가운데 선은 상하 비율입니다.
        </p>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <span className="font-bold text-indigo-600 dark:text-indigo-300">합치기</span>
          : 칸 앞 체크박스를 두 개 고른 뒤 합치기 — 한 칸의 위·아래로 묶입니다.{' '}
          <span className="font-bold text-rose-600 dark:text-rose-400">분리</span>
          : 묶인 칸의 분리 버튼 — 다시 각각 칸이 됩니다.
        </p>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={previewCollision}
        onDragStart={(event) => setActiveId(String(event.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="h-[32rem] min-h-[24rem] overflow-x-auto">
          <SortableContext items={slotIds} strategy={horizontalListSortingStrategy}>
            <div className="flex gap-2 h-full min-w-min items-stretch">
              {previewSlots.map((slot, idx) => (
                <SortablePreviewColumn
                  key={slotSortId(slot)}
                  slot={slot}
                  accentClass={PAIR_ACCENT[idx % PAIR_ACCENT.length]}
                  statuses={statuses}
                  kanbanLayout={kanbanLayout}
                  selectedKeys={selectedKeys}
                  canDelete={canDelete}
                  dragHandle
                  onToggleSelect={onToggleSelect}
                  onLabelChange={onLabelChange}
                  onToggleVisibility={onToggleVisibility}
                  onDelete={onDelete}
                  onSwapPair={onSwapPair}
                  onRemovePair={onRemovePair}
                  onSetBottomStyle={onSetBottomStyle}
                  onSplitPercentChange={onSplitPercentChange}
                  onSplitPercentCommit={onSplitPercentCommit}
                />
              ))}
              {hiddenStatuses.map((status) => (
                <div
                  key={`hidden-${status.key}`}
                  className="h-full flex-1 min-w-[148px] rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-white/60 dark:bg-slate-800/60 overflow-hidden flex flex-col"
                >
                  <div className="px-1.5 py-1 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-400">
                    숨김
                  </div>
                  <StageHeader
                    status={status}
                    selected={selectedKeys.includes(status.key)}
                    canDelete={canDelete}
                    onToggleSelect={onToggleSelect}
                    onLabelChange={onLabelChange}
                    onToggleVisibility={onToggleVisibility}
                    onDelete={onDelete}
                  />
                  <div className="flex-1 min-h-0 mx-1.5 mb-1.5 rounded-md border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30" />
                </div>
              ))}
            </div>
          </SortableContext>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeStage ? (
            <div className="h-20 w-40 rounded-xl border-2 border-indigo-400 bg-white dark:bg-slate-800 shadow-2xl p-3 opacity-90">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-100">{activeStage.label}</p>
              <p className="text-[10px] text-slate-400 mt-1">위·아래 자리 바꾸기</p>
            </div>
          ) : activeSlot ? (
            <div className="h-32 w-40 rounded-xl border-2 border-indigo-400 bg-white dark:bg-slate-800 shadow-2xl p-3 opacity-90">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-100">
                {activeSlot.type === 'single'
                  ? statuses.find((s) => s.key === activeSlot.statusKey)?.label || activeSlot.statusKey
                  : `${statuses.find((s) => s.key === activeSlot.topKey)?.label || activeSlot.topKey} / ${
                      statuses.find((s) => s.key === activeSlot.bottomKey)?.label || activeSlot.bottomKey
                    }`}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">칸 순서 이동</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};
