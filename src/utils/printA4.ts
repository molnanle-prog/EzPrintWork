/** A4 인쇄·PDF·화면 미리보기 공통 기준 (96dpi) */
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const A4_WIDTH_PX = Math.round((A4_WIDTH_MM / 25.4) * 96);
export const A4_HEIGHT_PX = Math.round((A4_HEIGHT_MM / 25.4) * 96);

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
`;

/** @media print 공통 — 견적서·작업지시서 동일 */
export const PRINT_A4_BASE_CSS = `
  ${A4_SCREEN_PREVIEW_CSS}
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
      background: white !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body * {
      visibility: hidden !important;
    }
    #print-capture-area,
    #print-capture-area * {
      visibility: visible !important;
    }
    /* fixed 금지 — 다페이지가 1장만 인쇄되는 원인 */
    #print-capture-area {
      position: static !important;
      left: auto !important;
      top: auto !important;
      width: ${A4_WIDTH_MM}mm !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      background: white !important;
      box-shadow: none !important;
      border-radius: 0 !important;
      zoom: 1 !important;
      transform: none !important;
      overflow: visible !important;
    }
    #print-capture-area .printable-document {
      width: ${A4_WIDTH_MM}mm !important;
      min-height: unset !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      background: white !important;
    }
    #print-capture-area .page-container {
      width: ${A4_WIDTH_MM}mm !important;
      height: ${A4_HEIGHT_MM}mm !important;
      min-height: ${A4_HEIGHT_MM}mm !important;
      max-width: ${A4_WIDTH_MM}mm !important;
      margin: 0 !important;
      padding: 10mm !important;
      box-sizing: border-box !important;
      page-break-after: always;
      break-after: page;
      overflow: hidden !important;
      box-shadow: none !important;
      position: relative !important;
    }
    #print-capture-area .page-container:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  }
`;

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
