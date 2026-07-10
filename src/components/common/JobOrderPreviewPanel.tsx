import React, { useRef, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import jsPDF from 'jspdf';
import { Job } from '../../types';
import { formatJobNumber } from '../../services/dataService';
import { JobOrderDocument } from './JobOrderDocument';
import { DocumentPreviewShell, prepareDocumentPrint } from './DocumentPreviewShell';
import { renderA4PageToCanvas } from '../../utils/printA4';

interface JobOrderPreviewPanelProps {
  job: Job;
  onClose: () => void;
}

export const JobOrderPreviewPanel: React.FC<JobOrderPreviewPanelProps> = ({ job, onClose }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDirectPrint = () => {
    prepareDocumentPrint();
    window.print();
  };

  const handleOpenPDF = async () => {
    if (!contentRef.current) return;
    setIsProcessing(true);
    try {
      const pageEls = Array.from(
        contentRef.current.querySelectorAll('.page-container')
      ) as HTMLElement[];

      if (pageEls.length === 0) {
        throw new Error('no pages');
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pageEls.length; i++) {
        if (i > 0) pdf.addPage();
        const canvas = await renderA4PageToCanvas(pageEls[i]);
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH);
      }

      const fileName = `작업지시서_${formatJobNumber(job).replace(/[^\w\-]/g, '_')}.pdf`;
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
      title="작업 지시서 미리보기"
      titleIcon={<ClipboardList className="text-blue-400" />}
      onClose={onClose}
      onPrint={handleDirectPrint}
      onPdf={handleOpenPDF}
      isProcessing={isProcessing}
      contentRef={contentRef}
    >
      <JobOrderDocument job={job} />
    </DocumentPreviewShell>
  );
};
