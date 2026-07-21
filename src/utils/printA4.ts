/** A4 인쇄·PDF·화면 미리보기 공통 기준 (96dpi) */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const A4_WIDTH_PX = Math.round((A4_WIDTH_MM / 25.4) * 96);
export const A4_HEIGHT_PX = Math.round((A4_HEIGHT_MM / 25.4) * 96);

export const EZPW_PRINT_ROOT_ID = 'ezpw-print-root';

/** 화면 미리보기 — 견적서·작업지시서 동일 A4 실크기 */
export const A4_SCREEN_PREVIEW_CSS = `
  #print-capture-area {
    width: ${A4_WIDTH_MM}mm;
    flex-shrink: 0;
  }
  #print-capture-area .printable-document {
    width: ${A4_WIDTH_MM}mm;
    box-sizing: border-box;
    background: white;
  }
  #print-capture-area .page-container {
    width: ${A4_WIDTH_MM}mm;
    height: ${A4_HEIGHT_MM}mm;
    min-height: ${A4_HEIGHT_MM}mm;
    box-sizing: border-box;
    background: white;
    margin-bottom: 12px;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.12);
  }
  #print-capture-area .page-container:last-child {
    margin-bottom: 0;
  }
  #${EZPW_PRINT_ROOT_ID} {
    display: none;
  }
`;

/** 인쇄 전용 — body에 복제한 루트만 출력 (overflow 잘림 방지) */
const PRINT_ONLY_ROOT_CSS = `
  @media print {
    @page {
      size: ${A4_WIDTH_MM}mm ${A4_HEIGHT_MM}mm;
      margin: 0 !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${A4_WIDTH_MM}mm !important;
      height: auto !important;
      overflow: visible !important;
      background: white !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* 미리보기 UI·스크롤 셸 전부 숨김 */
    body > *:not(#${EZPW_PRINT_ROOT_ID}) {
      display: none !important;
    }
    #${EZPW_PRINT_ROOT_ID} {
      display: block !important;
      position: static !important;
      width: ${A4_WIDTH_MM}mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: white !important;
      overflow: visible !important;
      box-shadow: none !important;
    }
    #${EZPW_PRINT_ROOT_ID} .page-container {
      display: block !important;
      width: ${A4_WIDTH_MM}mm !important;
      height: ${A4_HEIGHT_MM}mm !important;
      min-height: ${A4_HEIGHT_MM}mm !important;
      max-height: ${A4_HEIGHT_MM}mm !important;
      margin: 0 !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      box-shadow: none !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      position: relative !important;
      float: none !important;
      flex: none !important;
    }
    #${EZPW_PRINT_ROOT_ID} .page-container:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
  }
`;

/** @media print 공통 — 미리보기 셸 overflow 해제 + 복제 루트 */
export const PRINT_A4_BASE_CSS = `
  ${A4_SCREEN_PREVIEW_CSS}
  ${PRINT_ONLY_ROOT_CSS}
  @media print {
    /* 복제 루트가 없을 때 대비: 캡처 영역 조상 잘림 해제 */
    html, body {
      height: auto !important;
      overflow: visible !important;
    }
    body, body * {
      max-height: none !important;
    }
    .document-preview-shell,
    .document-preview-shell * {
      overflow: visible !important;
      height: auto !important;
      max-height: none !important;
    }
  }
`;

function cleanupPrintRoot(): void {
  document.getElementById(EZPW_PRINT_ROOT_ID)?.remove();
  document.getElementById('ezpw-print-style')?.remove();
}

/**
 * 화면의 .page-container를 body 직속으로 복제 후 인쇄.
 * h-screen/overflow-hidden 때문에 2페이지가 잘리는 문제를 피한다.
 */
export async function printDocumentSimplex(): Promise<void> {
  window.scrollTo(0, 0);
  const scrollParent = document.querySelector('#print-capture-area')?.parentElement;
  if (scrollParent) scrollParent.scrollTop = 0;

  cleanupPrintRoot();

  const source = document.querySelector('#print-capture-area');
  if (!source) {
    window.print();
    return;
  }

  const pages = Array.from(source.querySelectorAll('.page-container')) as HTMLElement[];
  const printRoot = document.createElement('div');
  printRoot.id = EZPW_PRINT_ROOT_ID;

  if (pages.length > 0) {
    pages.forEach((page) => {
      const clone = page.cloneNode(true) as HTMLElement;
      clone.classList.add('page-container');
      // 인라인 스타일이 인쇄 CSS와 충돌하지 않도록 크기만 맞춤
      clone.style.width = `${A4_WIDTH_MM}mm`;
      clone.style.height = `${A4_HEIGHT_MM}mm`;
      clone.style.minHeight = `${A4_HEIGHT_MM}mm`;
      clone.style.margin = '0';
      clone.style.boxSizing = 'border-box';
      clone.style.boxShadow = 'none';
      printRoot.appendChild(clone);
    });
  } else {
    const clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    printRoot.appendChild(clone);
  }

  const style = document.createElement('style');
  style.id = 'ezpw-print-style';
  style.textContent = PRINT_ONLY_ROOT_CSS;
  document.head.appendChild(style);
  document.body.appendChild(printRoot);

  // 레이아웃 반영 대기
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 50));

  const finish = () => {
    cleanupPrintRoot();
    window.removeEventListener('afterprint', finish);
  };
  window.addEventListener('afterprint', finish);

  try {
    const electronPrint = (window as Window & { electron?: { printDocument?: () => Promise<unknown> } })
      .electron?.printDocument;
    if (typeof electronPrint === 'function') {
      await electronPrint();
    } else {
      window.print();
    }
  } catch (err) {
    console.warn('[print] Electron print error, fallback to window.print:', err);
    window.print();
  } finally {
    // Electron은 afterprint가 안 올 수 있어 지연 정리
    setTimeout(finish, 1500);
  }
}

export async function renderElementToCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;
  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.add('export-mode');
  clone.style.position = 'absolute';
  clone.style.left = '-9999px';
  clone.style.top = '0';
  clone.style.width = `${element.offsetWidth || A4_WIDTH_PX}px`;
  clone.style.height = 'auto';
  clone.style.background = 'white';
  document.body.appendChild(clone);

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    void clone.offsetHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));

    return await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: clone.scrollWidth,
      windowHeight: clone.scrollHeight,
    });
  } finally {
    document.body.removeChild(clone);
  }
}

export async function renderA4PageToCanvas(pageEl: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = `${A4_WIDTH_PX}px`;
  wrapper.style.height = `${A4_HEIGHT_PX}px`;
  wrapper.style.background = 'white';

  const pageClone = pageEl.cloneNode(true) as HTMLElement;
  pageClone.classList.add('export-mode');
  pageClone.style.width = `${A4_WIDTH_PX}px`;
  pageClone.style.height = `${A4_HEIGHT_PX}px`;
  pageClone.style.minHeight = `${A4_HEIGHT_PX}px`;
  pageClone.style.margin = '0';
  pageClone.style.boxSizing = 'border-box';
  pageClone.style.background = 'white';

  wrapper.appendChild(pageClone);
  document.body.appendChild(wrapper);

  try {
    await new Promise((resolve) => setTimeout(resolve, 50));
    void wrapper.offsetHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));

    return await html2canvas(wrapper, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: A4_WIDTH_PX,
      height: A4_HEIGHT_PX,
      windowWidth: A4_WIDTH_PX,
      windowHeight: A4_HEIGHT_PX,
    });
  } finally {
    document.body.removeChild(wrapper);
  }
}
