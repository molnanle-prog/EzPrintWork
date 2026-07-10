
import React, { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import jsPDF from 'jspdf';
import { Quote } from '../../types';
import { QuoteDocument } from './QuoteDocument';
import { db } from '../../services/dataService';
import { getQuotePdfFileName } from '../../utils/quoteJobSync';
import { renderElementToCanvas } from '../../utils/printA4';
import { DocumentPreviewShell, prepareDocumentPrint } from '../common/DocumentPreviewShell';

interface QuotePreviewPanelProps {
  quote: Quote;
  onClose: () => void;
}

export const QuotePreviewPanel: React.FC<QuotePreviewPanelProps> = ({ quote, onClose }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [documentType, setDocumentType] = useState<'quote' | 'statement'>('quote');
  const quoteRef = useRef<HTMLDivElement>(null);

  const docLabel = documentType === 'statement' ? '거래명세서' : '견적서';

  const handleDirectPrint = () => {
    prepareDocumentPrint();
    window.print();
  };

  const handleOpenPDF = async () => {
    if (!quoteRef.current) return;
    setIsProcessing(true);
    try {
      const canvas = await renderElementToCanvas(quoteRef.current);
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
    <DocumentPreviewShell
      title={`${docLabel} 미리보기`}
      titleIcon={<FileText className="text-blue-400" />}
      onClose={onClose}
      onPrint={handleDirectPrint}
      onPdf={handleOpenPDF}
      isProcessing={isProcessing}
      contentRef={quoteRef}
      toolbarExtra={
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
      }
    >
      <QuoteDocument quote={quote} documentType={documentType} />
    </DocumentPreviewShell>
  );
};
