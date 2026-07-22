import React, { useRef, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Job } from '../../types';
import { formatJobNumber } from '../../services/dataService';
import { JobOrderDocument } from './JobOrderDocument';
import { DocumentPreviewShell, printDocumentSimplex } from './DocumentPreviewShell';
import { exportA4DocumentPdf } from '../../utils/printA4';

interface JobOrderPreviewPanelProps {
  job: Job;
  onClose: () => void;
}

export const JobOrderPreviewPanel: React.FC<JobOrderPreviewPanelProps> = ({ job, onClose }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleDirectPrint = () => {
    void printDocumentSimplex();
  };

  const handleOpenPDF = async () => {
    setIsProcessing(true);
    try {
      const fileName = `작업지시서_${formatJobNumber(job).replace(/[^\w\-]/g, '_')}.pdf`;
      await exportA4DocumentPdf(fileName);
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
