
import React, { useCallback, useEffect, useRef } from 'react';

interface UsePrintOptions {
  contentRef: React.RefObject<HTMLElement | null>;
  documentTitle?: string;
}

export const usePrint = ({ contentRef, documentTitle }: UsePrintOptions) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Listen for 'close' message from any print iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'close-print-overlay') {
        const iframes = document.querySelectorAll('iframe[data-print="true"]');
        iframes.forEach(el => el.remove());
        iframeRef.current = null;
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handlePrint = useCallback(() => {
    console.log("🖨️ [usePrint] 1. 인쇄 시작 요청됨 (Blob URL 방식)");

    const content = contentRef.current;
    if (!content) {
      console.error("❌ [usePrint] 오류: contentRef가 null입니다.");
      return;
    }

    // Clean up previous iframe
    if (iframeRef.current) {
      iframeRef.current.remove();
    }
    
    // --- NEW LOGIC: Construct a full HTML document as a string ---
    const stylesArray: string[] = [];
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(style => {
      stylesArray.push(style.outerHTML);
    });
    const tailwindScript = document.querySelector('script[src*="tailwindcss"]');
    if (tailwindScript) {
        stylesArray.push(tailwindScript.outerHTML);
    }
    const stylesHtml = stylesArray.join('\n');

    const contentClone = content.cloneNode(true) as HTMLElement;
    if (contentClone.children.length > 0) {
        Array.from(contentClone.children).forEach((child: any) => {
            if (child.classList) child.classList.add('paper-content');
        });
    } else {
        contentClone.classList.add('paper-content');
    }

    const printHtml = `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <title>${documentTitle || 'Print'}</title>
        ${stylesHtml}
        <style>
          /* Screen (Preview) Styles */
          body { margin: 0; padding: 0; background-color: #525659; display: flex; flex-direction: column; align-items: center; height: 100vh; font-family: 'Noto Sans KR', sans-serif; overflow: hidden; }
          .print-header { flex: none; width: 100%; height: 60px; background-color: #323639; color: white; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 1000; box-sizing: border-box; }
          .header-title { font-weight: bold; font-size: 18px; display: flex; align-items: center; gap: 10px; }
          #preview-scroll-area { flex: 1; width: 100%; overflow-y: auto; padding: 40px 0; display: flex; flex-direction: column; align-items: center; gap: 30px; }
          button { cursor: pointer; border: none; border-radius: 4px; padding: 8px 16px; font-weight: bold; font-size: 14px; transition: background 0.2s; }
          .btn-print { background-color: #8ab4f8; color: #202124; }
          .btn-print:hover { background-color: #aecbfa; }
          .btn-close { background-color: transparent; color: #e8eaed; border: 1px solid #5f6368; margin-left: 10px; }
          .btn-close:hover { background-color: rgba(255,255,255,0.1); }
          .paper-content { box-shadow: 0 4px 16px rgba(0,0,0,0.5); background: white; }
          
          /* Print Styles (Actual Output) */
          @media print {
            body { background-color: white !important; display: block; height: auto; overflow: visible; }
            #preview-scroll-area { overflow: visible; padding: 0; display: block; }
            .print-header { display: none !important; }
            .paper-content { box-shadow: none !important; margin: 0 !important; page-break-after: always; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        </style>
      </head>
      <body>
        <div class="print-header no-print">
          <div class="header-title">
            <span>🖨️ 인쇄 미리보기</span>
          </div>
          <div>
            <button class="btn-print" id="do-print-btn" onclick="console.log('🖱️ [Iframe] Print button clicked. Calling window.print().'); window.print();">
              🖨️ 인쇄하기
            </button>
            <button class="btn-close" onclick="window.parent.postMessage('close-print-overlay', '*')">닫기</button>
          </div>
        </div>
        <div id="preview-scroll-area">
          ${contentClone.outerHTML}
        </div>
        <script>
            window.onload = () => {
                console.log("✅ [Iframe] Blob URL 문서 로드 완료. 인쇄 버튼이 준비되었습니다.");
            };
        </script>
      </body>
      </html>
    `;

    // --- Create iframe with Blob URL ---
    const iframe = document.createElement('iframe');
    iframeRef.current = iframe;

    iframe.setAttribute('data-print', 'true');
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100vw';
    iframe.style.height = '100vh';
    iframe.style.zIndex = '9999';
    iframe.style.border = 'none';
    iframe.style.backgroundColor = '#525659';

    const blob = new Blob([printHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    iframe.src = url;

    // Clean up the object URL after the iframe is loaded to prevent memory leaks
    iframe.onload = () => {
      console.log("✅ [usePrint] 3. Iframe이 Blob URL로부터 로드되었습니다. URL을 메모리에서 해제합니다.");
      URL.revokeObjectURL(url);
    };

    document.body.appendChild(iframe);
    console.log("✅ [usePrint] 2. Iframe이 body에 추가됨. 이제 Blob URL 로드를 기다립니다.");

  }, [contentRef, documentTitle]);

  return handlePrint;
};
