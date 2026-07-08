import { useCallback, useMemo } from 'react';
import { Job } from '../../types';
import { isTouchPrimaryDevice } from '../../utils/touchDevice';

type InteractionOptions = {
    job: Job;
    isDragOverlay?: boolean;
    onSelect: (job: Job) => void;
    onRightClick?: (job: Job) => void;
};

/** PC: 좌클릭=간단보기, 우클릭=상세 | 터치: 탭=상세보기, 길게누름=드래그 */
export function useKanbanCardInteraction({
    job,
    isDragOverlay = false,
    onSelect,
    onRightClick,
}: InteractionOptions) {
    const touchPrimary = useMemo(() => isTouchPrimaryDevice(), []);

    const sortableTouchAction: React.CSSProperties['touchAction'] = touchPrimary ? 'none' : 'manipulation';

    const handleCardClick = useCallback(() => {
        if (isDragOverlay) return;
        if (touchPrimary) {
            if (onRightClick) onRightClick(job);
            else onSelect(job);
            return;
        }
        onSelect(job);
    }, [isDragOverlay, job, onRightClick, onSelect, touchPrimary]);

    const handleCardContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (isDragOverlay) return;
            e.preventDefault();
            if (touchPrimary) return;
            if (onRightClick) onRightClick(job);
            else onSelect(job);
        },
        [isDragOverlay, job, onRightClick, onSelect, touchPrimary]
    );

    const handleOpenDetail = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (onRightClick) onRightClick(job);
            else onSelect(job);
        },
        [job, onRightClick, onSelect]
    );

    const stopDragPropagation = useCallback((e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
        e.stopPropagation();
    }, []);

    const cardSurfaceClass = touchPrimary ? 'select-none [-webkit-touch-callout:none]' : '';

    return {
        touchPrimary,
        sortableTouchAction,
        handleCardClick,
        handleCardContextMenu,
        handleOpenDetail,
        stopDragPropagation,
        cardSurfaceClass,
    };
}
