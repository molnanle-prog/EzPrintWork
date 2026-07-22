import React, { ReactNode, RefObject } from 'react';
import { X, Printer, Download, Loader2 } from 'lucide-react';
import { PRINT_A4_BASE_CSS, printDocumentSimplex as printDocumentSimplexImpl } from '../../utils/printA4';

interface DocumentPreviewShellProps {
  title: string;
  titleIcon: ReactNode;
  toolbarExtra?: ReactNode;
  onClose: () => void;
  onPrint: () => void;
  onPdf: () => void;
  isProcessing: boolean;
  contentRef: RefObject<HTMLDivElement>;
  children: ReactNode;
  printLabel?: string;
  pdfLabel?: string;
}

/** 견적서·작업지시서 공통 — 전체화면 A4 미리보기 + 인쇄 */
export const DocumentPreviewShell: React.FC<DocumentPreviewShellProps> = ({
  title,
  titleIcon,
  toolbarExtra,
  onClose,
  onPrint,
  onPdf,
  isProcessing,
  contentRef,
  children,
  printLabel = '프린트하기',
  pdfLabel = 'PDF로 저장',
}) => {
  return (
    <div className="document-preview-shell h-screen w-screen bg-slate-100 flex flex-col overflow-hidden print:h-auto print:overflow-visible print:block">
      <style>{PRINT_A4_BASE_CSS}</style>

      <div className="p-4 bg-slate-800 text-white flex justify-between items-center shadow-md z-10 flex-none print:hidden">
        <h3 className="font-bold text-lg flex items-center gap-2">
          {titleIcon}
          {title}
        </h3>
        <div className="flex items-center gap-3">
          {toolbarExtra}
          <button
            onClick={onPrint}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            title="A4 단면 인쇄. 프린터 여백 '없음', 배율 '실제 크기' 권장"
          >
            <Printer size={16} />
            {printLabel}
          </button>
          <button
            onClick={onPdf}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            {pdfLabel}
          </button>
          <button
            onClick={onClose}
            className="ml-2 p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white"
            title="창 닫기"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-200 p-8 flex justify-center custom-scrollbar print:p-0 print:bg-white print:overflow-visible print:h-auto print:block">
        <div id="print-capture-area" className="shadow-xl print:shadow-none">
          <div ref={contentRef}>{children}</div>
        </div>
      </div>
    </div>
  );
};

export async function prepareDocumentPrint(): Promise<void> {
  window.scrollTo(0, 0);
  const scrollParent = document.querySelector('#print-capture-area')?.parentElement;
  if (scrollParent) scrollParent.scrollTop = 0;
}

/** Electron 단면 인쇄 + 다페이지 body 복제 출력 */
export async function printDocumentSimplex(): Promise<void> {
  return printDocumentSimplexImpl();
}
