import {
  CollisionDetection,
  DragEndEvent,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core';
import { Job } from '../../types';

export const COLUMN_DROPPABLE_PREFIX = 'column:';

const isColumnId = (id: string | number) => String(id).startsWith(COLUMN_DROPPABLE_PREFIX);

/**
 * 칸반 전용 충돌 감지: 손가락/커서 위치 기준으로 컬럼·카드를 판별합니다.
 */
export const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);

  if (pointerCollisions.length > 0) {
    const cardHit = pointerCollisions.find((c) => !isColumnId(c.id));
    if (cardHit) return [cardHit];

    const columnHit = pointerCollisions.find((c) => isColumnId(c.id));
    if (columnHit) return [columnHit];

    return pointerCollisions;
  }

  const { pointerCoordinates, droppableContainers } = args;
  if (pointerCoordinates) {
    const columns = droppableContainers.filter((c) => isColumnId(c.id));

    for (const column of columns) {
      const rect = column.rect.current;
      if (!rect) continue;

      const { x, y } = pointerCoordinates;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;

      const cardsInColumn = droppableContainers.filter((c) => {
        if (isColumnId(c.id)) return false;
        const cardRect = c.rect.current;
        if (!cardRect) return false;
        return cardRect.left >= rect.left - 4 && cardRect.right <= rect.right + 4;
      });

      const cardUnderPointer = cardsInColumn
        .filter((c) => {
          const r = c.rect.current!;
          return y >= r.top && y <= r.bottom;
        })
        .sort((a, b) => {
          const aMid = (a.rect.current!.top + a.rect.current!.bottom) / 2;
          const bMid = (b.rect.current!.top + b.rect.current!.bottom) / 2;
          return Math.abs(y - aMid) - Math.abs(y - bMid);
        })[0];

      if (cardUnderPointer) {
        return [{ id: cardUnderPointer.id }];
      }

      return [{ id: column.id }];
    }
  }

  const fallback = rectIntersection(args);
  if (fallback.length > 0) {
    const cardHit = fallback.find((c) => !isColumnId(c.id));
    if (cardHit) return [cardHit];
    const columnHit = fallback.find((c) => isColumnId(c.id));
    if (columnHit) return [columnHit];
  }

  return fallback;
};

export const resolveKanbanDropTarget = (
  overId: string,
  allJobs: Job[],
  visibleStatusKeys: string[],
  extraDropKeys: string[] = ['QUOTE']
): { newStatusKey: string; targetJobId?: string } | null => {
  const allowedKeys = new Set([...visibleStatusKeys, ...extraDropKeys]);

  if (isColumnId(overId)) {
    const statusKey = overId.slice(COLUMN_DROPPABLE_PREFIX.length);
    if (!allowedKeys.has(statusKey)) return null;
    return { newStatusKey: statusKey, targetJobId: undefined };
  }

  const overJob = allJobs.find((j) => j.id === overId);
  if (!overJob) return null;
  if (!allowedKeys.has(overJob.status)) return null;
  return { newStatusKey: overJob.status, targetJobId: overId };
};

/** 드롭 시 포인터 Y 기준으로 컬럼 내 삽입 위치(0-based) 계산 */
export function computeKanbanInsertIndex(
  pointerY: number,
  statusKey: string,
  sortedJobIds: string[],
  excludeJobId: string
): number {
  const ids = sortedJobIds.filter((id) => id !== excludeJobId);
  if (ids.length === 0) return 0;

  const columnEl = document.querySelector(`[data-kanban-column="${statusKey}"]`);
  if (!columnEl) return ids.length;

  for (let i = 0; i < ids.length; i++) {
    const cardEl = columnEl.querySelector(`[data-job-id="${ids[i]}"]`);
    if (!cardEl) continue;
    const rect = cardEl.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (pointerY < mid) {
      return i;
    }
  }

  return ids.length;
}

export function getDragPointerY(event: DragEndEvent): number | null {
  const translated = event.active.rect.current.translated;
  if (translated) {
    return translated.top + translated.height / 2;
  }

  if (event.over?.rect) {
    return event.over.rect.top + event.over.rect.height / 2;
  }

  return null;
}
