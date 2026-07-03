import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Job, JobStatusDefinition } from '../../types';
import { KanbanColumn } from './KanbanColumn';
import { CompactTraySection } from './KanbanColumn';
import { useTheme } from '../../contexts/ThemeContext';
import { clampSplitTopPercent } from '../../utils/kanbanLayout';

interface KanbanSplitColumnProps {
  topDef: JobStatusDefinition;
  bottomDef: JobStatusDefinition;
  topJobs: Job[];
  bottomJobs: Job[];
  splitTopPercent: number;
  bottomCompact: boolean;
  onSplitTopPercentChange?: (percent: number) => void;
  onSplitTopPercentCommit?: (percent: number) => void;
  getStaffName: (job?: Job) => string;
  onSelectJob: (job: Job) => void;
  onRightClickJob?: (job: Job) => void;
  onStatusChange: (job: Job, direction: 'next' | 'prev') => void;
  currentUserId?: string;
  resolveIsMyJob?: (job: Job) => boolean;
  isTvMode?: boolean;
}

export const KanbanSplitColumn: React.FC<KanbanSplitColumnProps> = ({
  topDef,
  bottomDef,
  topJobs,
  bottomJobs,
  splitTopPercent,
  bottomCompact,
  onSplitTopPercentChange,
  onSplitTopPercentCommit,
  getStaffName,
  onSelectJob,
  onRightClickJob,
  onStatusChange,
  currentUserId,
  resolveIsMyJob,
  isTvMode = false,
}) => {
  const { theme } = useTheme();
  const [topPercent, setTopPercent] = useState(splitTopPercent);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);
  const startPercentRef = useRef(splitTopPercent);
  const latestPercentRef = useRef(splitTopPercent);
  const columnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTopPercent(splitTopPercent);
    latestPercentRef.current = splitTopPercent;
  }, [splitTopPercent]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    startYRef.current = e.clientY;
    startPercentRef.current = topPercent;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || !columnRef.current) return;
      const rect = columnRef.current.getBoundingClientRect();
      const deltaY = e.clientY - startYRef.current;
      const deltaPercent = (deltaY / rect.height) * 100;
      const next = clampSplitTopPercent(startPercentRef.current + deltaPercent);
      latestPercentRef.current = next;
      setTopPercent(next);
      onSplitTopPercentChange?.(next);
    },
    [dragging, onSplitTopPercentChange]
  );

  const handlePointerUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    onSplitTopPercentCommit?.(latestPercentRef.current);
  }, [dragging, onSplitTopPercentCommit]);

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

  return (
    <div
      ref={columnRef}
      className={`flex-1 flex flex-col h-full min-w-[200px] rounded-xl border overflow-hidden ${
        theme === 'trello'
          ? 'bg-[#1d2d44] border-[#2c3e56]'
          : 'bg-slate-100/80 dark:bg-slate-800/80 border-slate-200/60 dark:border-slate-700'
      }`}
    >
      <div className="min-h-0 flex flex-col" style={{ flex: `${topPercent} 1 0%` }}>
        <KanbanColumn
          statusDef={topDef}
          jobs={topJobs}
          getStaffName={getStaffName}
          onSelectJob={onSelectJob}
          onRightClickJob={onRightClickJob}
          onStatusChange={onStatusChange}
          currentUserId={currentUserId}
          resolveIsMyJob={resolveIsMyJob}
          isTvMode={isTvMode}
          embedded
        />
      </div>

      <div className="min-h-0 flex flex-col p-1" style={{ flex: `${bottomPercent} 1 0%` }}>
        {bottomCompact ? (
          <CompactTraySection
            statusDef={bottomDef}
            jobs={bottomJobs}
            getStaffName={getStaffName}
            onSelectJob={onSelectJob}
            onRightClickJob={onRightClickJob}
            onStatusChange={onStatusChange}
            currentUserId={currentUserId}
            resolveIsMyJob={resolveIsMyJob}
            isTvMode={isTvMode}
            fillHeight
            resizeHandle={{
              dragging,
              onPointerDown: handlePointerDown,
              title: '드래그하여 상·하 비율 조절',
            }}
          />
        ) : (
          <KanbanColumn
            statusDef={bottomDef}
            jobs={bottomJobs}
            getStaffName={getStaffName}
            onSelectJob={onSelectJob}
            onRightClickJob={onRightClickJob}
            onStatusChange={onStatusChange}
            currentUserId={currentUserId}
            resolveIsMyJob={resolveIsMyJob}
            isTvMode={isTvMode}
            embedded
            resizeHandle={{
              dragging,
              onPointerDown: handlePointerDown,
              title: '드래그하여 상·하 비율 조절',
            }}
          />
        )}
      </div>
    </div>
  );
};
