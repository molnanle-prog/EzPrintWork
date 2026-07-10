
import React, { useRef, useState } from 'react';
import { Job } from '../../types';
import { X, Printer, Loader2, Download } from 'lucide-react';
import { JobOrderDocument } from './JobOrderDocument';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/** A4 폭(mm) — 바로 인쇄 / PDF 공통 기준 */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
/** 96dpi 기준 210mm ≈ 794px — PDF 캡처도 이 폭으로 고정해 바로 인쇄와 동일 스케일 */
const A4_WIDTH_PX = Math.round((A4_WIDTH_MM / 25.4) * 96);

interface JobOrderPreviewModalProps {
  job: Job;
  onClose: () => void;
}

export const JobOrderPreviewModal: React.FC<JobOrderPreviewModalProps> = ({ job, onClose }) => {
  const componentRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * 화면 미리보기 zoom(0.62)과 무관하게 A4 실크기(210mm)로 캡처.
   * 바로 인쇄와 PDF가 같은 비율로 나오도록 폭을 고정한다.
   */
  const renderComponentToCanvas = async (element: HTMLDivElement): Promise<HTMLCanvasElement> => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.classList.add('export-mode');
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0';
    clone.style.width = `${A4_WIDTH_PX}px`;
    clone.style.maxWidth = `${A4_WIDTH_PX}px`;
    clone.style.height = 'auto';
    clone.style.zoom = '1';
    clone.style.transform = 'none';
    document.body.appendChild(clone);

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      void clone.offsetHeight;
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => setTimeout(resolve, 50));

      return await html2canvas(clone, {
        scale: 2,
        useCORS: true,
        width: A4_WIDTH_PX,
        windowWidth: A4_WIDTH_PX,
        windowHeight: clone.scrollHeight,
      });
    } finally {
      document.body.removeChild(clone);
    }
  };

  const handleOpenPDF = async () => {
    if (!componentRef.current) return;
    setIsProcessing(true);
    try {
      const canvas = await renderComponentToCanvas(componentRef.current);
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // 폭을 A4에 맞추고, 높이는 비율 유지 (바로 인쇄와 동일 스케일)
      const imgHeightMm = (canvas.height / canvas.width) * pdfWidth;
      let heightLeft = imgHeightMm;
      let position = 0;
      let page = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightMm);
      heightLeft -= pdfHeight;

      while (heightLeft > 1) {
        page += 1;
        position = -(pdfHeight * page);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeightMm);
        heightLeft -= pdfHeight;
      }

      window.open(pdf.output('bloburl'), '_blank');
    } catch (err) {
      console.error('PDF 생성 중 오류:', err);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 print:static print:inset-auto print:bg-white print:p-0 print:backdrop-blur-none">
      <style>{`
        .job-order-screen-scale {
          zoom: 0.62;
        }
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
          #print-capture-area,
          #print-capture-area * {
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
            transform: none !important;
            overflow: visible !important;
          }
          #print-capture-area .job-order-screen-scale {
            zoom: 1 !important;
            transform: none !important;
          }
          #print-capture-area .printable-document {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            background: white !important;
          }
          #print-capture-area .page-container {
            width: 210mm !important;
            min-height: 297mm !important;
            height: 297mm !important;
            max-width: 210mm !important;
            margin: 0 !important;
            padding: 10mm !important;
            box-sizing: border-box !important;
            page-break-after: always;
            break-after: page;
          }
          #print-capture-area .page-container:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <div className="bg-slate-100 rounded-xl shadow-2xl w-full max-w-[550px] h-[80vh] flex flex-col overflow-hidden transition-all duration-300 print:max-w-none print:h-auto print:rounded-none print:shadow-none print:w-full print:overflow-visible">
        <div className="p-4 bg-slate-800 text-white flex justify-between items-center shadow-md z-10 flex-none print:hidden">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Printer className="text-blue-400" />
            작업 지시서 미리보기
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDirectPrint}
              disabled={isProcessing}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
              title="A4 실크기로 바로 인쇄합니다. 프린터 설정에서 여백 '없음', 배율 '실제 크기'를 권장합니다."
            >
              <Printer size={16} />
              바로 인쇄
            </button>

            <button
              onClick={handleOpenPDF}
              disabled={isProcessing}
              className="flex items-center gap-2 px-3.5 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
              title="바로 인쇄와 같은 A4 비율로 PDF를 만듭니다"
            >
              {isProcessing ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              PDF
            </button>
            <button
              onClick={onClose}
              className="ml-1.5 p-1.5 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-200 p-4 md:p-6 flex justify-center items-start custom-scrollbar min-h-0 print:p-0 print:bg-white print:overflow-visible">
          <div id="print-capture-area" className="shadow-2xl bg-white rounded-lg flex-none my-2 print:shadow-none print:rounded-none print:my-0">
            <div ref={componentRef} className="job-order-screen-scale">
              <JobOrderDocument job={job} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
