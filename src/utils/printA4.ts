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
      display: flex !important;
      flex-direction: column !important;
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

/** 미리보기 .page-container를 body 직속 인쇄 루트로 복제 (인쇄·PDF 공통) */
async function mountPrintRoot(): Promise<boolean> {
  window.scrollTo(0, 0);
  const scrollParent = document.querySelector('#print-capture-area')?.parentElement;
  if (scrollParent) scrollParent.scrollTop = 0;

  cleanupPrintRoot();

  const source = document.querySelector('#print-capture-area');
  if (!source) return false;

  const pages = Array.from(source.querySelectorAll('.page-container')) as HTMLElement[];
  const printRoot = document.createElement('div');
  printRoot.id = EZPW_PRINT_ROOT_ID;

  if (pages.length > 0) {
    pages.forEach((page) => {
      const clone = page.cloneNode(true) as HTMLElement;
      clone.classList.add('page-container');
      clone.style.display = 'flex';
      clone.style.flexDirection = 'column';
      clone.style.position = 'relative';
      clone.style.width = `${A4_WIDTH_MM}mm`;
      clone.style.height = `${A4_HEIGHT_MM}mm`;
      clone.style.minHeight = `${A4_HEIGHT_MM}mm`;
      clone.style.margin = '0';
      clone.style.boxSizing = 'border-box';
      clone.style.boxShadow = 'none';
      clone.style.overflow = 'hidden';
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

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 50));
  return true;
}

/**
 * 화면의 .page-container를 body 직속으로 복제 후 인쇄.
 * h-screen/overflow-hidden 때문에 2페이지가 잘리는 문제를 피한다.
 */
export async function printDocumentSimplex(): Promise<void> {
  const mounted = await mountPrintRoot();
  if (!mounted) {
    window.print();
    return;
  }

  const finish = () => {
    cleanupPrintRoot();
    window.removeEventListener('afterprint', finish);
  };
  window.addEventListener('afterprint', finish);

  try {
    const electronPrint = window.electron?.printDocument;
    if (typeof electronPrint === 'function') {
      await electronPrint();
    } else {
      window.print();
    }
  } catch (err) {
    console.warn('[print] Electron print error, fallback to window.print:', err);
    window.print();
  } finally {
    setTimeout(finish, 1500);
  }
}

/**
 * PDF 저장 — 인쇄와 동일한 복제 DOM + Chromium printToPDF.
 * html2canvas 미사용 → 미리보기·인쇄와 100% 동일 레이아웃.
 */
export async function exportA4DocumentPdf(fileName: string): Promise<void> {
  const mounted = await mountPrintRoot();
  if (!mounted) {
    throw new Error('no-print-source');
  }

  try {
    const electronPdf = window.electron?.printDocumentToPdf;
    if (typeof electronPdf === 'function') {
      const result = await electronPdf(fileName);
      if (result?.canceled) return;
      if (!result?.success) {
        throw new Error(result?.error || 'pdf-failed');
      }
      return;
    }

    // 브라우저(Vite): 인쇄 대화상자에서 'PDF로 저장' — 동일 Chromium 렌더
    await new Promise<void>((resolve) => {
      const finish = () => {
        window.removeEventListener('afterprint', finish);
        resolve();
      };
      window.addEventListener('afterprint', finish);
      window.print();
      setTimeout(finish, 2000);
    });
  } finally {
    cleanupPrintRoot();
  }
}

/** @deprecated PDF는 exportA4DocumentPdf 사용. 호환용 유지 */
export async function renderElementToCanvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  if (element.classList.contains('page-container')) {
    return renderA4PageToCanvas(element);
  }
  const html2canvas = (await import('html2canvas')).default;
  await document.fonts.ready;
  return html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });
}

/** @deprecated PDF는 exportA4DocumentPdf 사용 */
export async function renderA4PageToCanvas(pageEl: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;
  await document.fonts.ready;
  pageEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const prevShadow = pageEl.style.boxShadow;
  pageEl.style.boxShadow = 'none';
  try {
    const w = Math.max(1, Math.round(pageEl.offsetWidth || A4_WIDTH_PX));
    const h = Math.max(1, Math.round(pageEl.offsetHeight || A4_HEIGHT_PX));
    return await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: w,
      height: h,
    });
  } finally {
    pageEl.style.boxShadow = prevShadow;
  }
}
