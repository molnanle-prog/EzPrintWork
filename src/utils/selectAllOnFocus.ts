const SELECTABLE_INPUT_TYPES = new Set([
  'text',
  'search',
  'tel',
  'url',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
]);

let pendingMouseFocus = false;

function isSelectableField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
    return false;
  }
  if (target.disabled) return false;
  if (target.dataset.noSelectAll !== undefined) return false;

  if (target instanceof HTMLTextAreaElement) return true;

  const type = (target.type || 'text').toLowerCase();
  return SELECTABLE_INPUT_TYPES.has(type);
}

function selectField(el: HTMLInputElement | HTMLTextAreaElement) {
  try {
    el.select();
  } catch {
    // date/number 등 일부 타입은 환경에 따라 select 미지원
  }
}

/**
 * 입력란(텍스트·숫자 등) 포커스 시 내용 전체 선택.
 * 이미 포커스된 칸을 다시 클릭하면 커서 위치 이동은 그대로 둡니다.
 * 제외: data-no-select-all 속성, checkbox/radio/file 등
 */
export function installSelectAllOnFocus(): () => void {
  const onMouseDown = (event: MouseEvent) => {
    pendingMouseFocus = isSelectableField(event.target);
  };

  const onFocusIn = (event: FocusEvent) => {
    const el = event.target;
    if (!isSelectableField(el)) return;

    if (pendingMouseFocus) {
      const onMouseUp = (mouseEvent: MouseEvent) => {
        mouseEvent.preventDefault();
        el.removeEventListener('mouseup', onMouseUp);
      };
      el.addEventListener('mouseup', onMouseUp);
      pendingMouseFocus = false;
    }

    queueMicrotask(() => selectField(el));
  };

  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('focusin', onFocusIn, true);

  return () => {
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('focusin', onFocusIn, true);
  };
}
