
import React, { useRef, useState } from 'react';
import { Quote } from '../../types';
import { X, Download, FileText, Loader2, Printer } from 'lucide-react';
import { QuoteDocument } from './QuoteDocument';
import { db } from '../../services/dataService';
import { getQuotePdfFileName } from '../../utils/quoteJobSync';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface QuotePreviewPanelProps {
  quote: Quote;
  onClose: () => void;
}

export const QuotePreviewPanel: React.FC<QuotePreviewPanelProps> = ({ quote, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [documentType, setDocumentType] = useState<'quote' | 'statement'>('quote');
  const quoteRef = useRef<HTMLDivElement>(null);

  const docLabel = documentType === 'statement' ? '거래명세서' : '견적서';

  const renderComponentToCanvas = async (element: HTMLDivElement): Promise<HTMLCanvasElement> => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.classList.add('export-mode');
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0px';
    clone.style.width = element.offsetWidth + 'px';
    clone.style.height = 'auto';
    document.body.appendChild(clone);

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const _ = clone.offsetHeight;
      await new Promise((resolve) => requestAnimationFrame(resolve));

      return html2canvas(clone, {
        scale: 2,
        useCORS: true,
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight,
      });
    } finally {
      document.body.removeChild(clone);
    }
  };

  const handleDirectPrint = () => {
    window.print();
  };

  const handleOpenPDF = async () => {
    if (!quoteRef.current) return;
    setIsProcessing(true);
    try {
      const canvas = await renderComponentToCanvas(quoteRef.current);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const fileName = getQuotePdfFileName(quote, db.getAllJobs(), documentType);
      pdf.save(fileName);
    } catch (err) {
      console.error('PDF 생성 중 오류:', err);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-100 flex flex-col overflow-hidden">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          body {
            margin: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body * {
            visibility: hidden !important;
          }
          #print-capture-area, #print-capture-area * {
            visibility: visible !important;
          }
          #print-capture-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            background: white !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            zoom: 1 !important;
          }
          #print-capture-area .printable-document {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="p-4 bg-slate-800 text-white flex justify-between items-center shadow-md z-10 flex-none print:hidden">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <FileText className="text-blue-400" />
          {docLabel} 미리보기
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-600 overflow-hidden">
            <button
              onClick={() => setDocumentType('quote')}
              className={`px-3 py-2 text-xs font-bold transition-colors ${
                documentType === 'quote'
                  ? 'bg-slate-100 text-slate-900'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              견적서
            </button>
            <button
              onClick={() => setDocumentType('statement')}
              className={`px-3 py-2 text-xs font-bold transition-colors ${
                documentType === 'statement'
                  ? 'bg-slate-100 text-slate-900'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              거래명세서
            </button>
          </div>
          <button
            onClick={handleDirectPrint}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
            title="윈도우 인쇄 창을 열어 화면과 동일하게 출력합니다"
          >
            <Printer size={16} />
            프린트하기
          </button>
          <button
            onClick={handleOpenPDF}
            disabled={isProcessing}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            PDF로 보기
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

      <div className="flex-1 overflow-auto bg-slate-200 p-8 flex justify-center custom-scrollbar print:p-0 print:bg-white print:overflow-visible">
        <div id="print-capture-area" className="shadow-xl print:shadow-none">
          <div ref={quoteRef}>
            <QuoteDocument quote={quote} documentType={documentType} />
          </div>
        </div>
      </div>
    </div>
  );
};
