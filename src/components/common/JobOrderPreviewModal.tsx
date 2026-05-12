
import React, { useRef, useState } from 'react';
import { Job } from '../../types';
import { X, Printer, Loader2, FileImage, Download } from 'lucide-react';
import { JobOrderDocument } from './JobOrderDocument';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface JobOrderPreviewModalProps {
  job: Job;
  onClose: () => void;
}

export const JobOrderPreviewModal: React.FC<JobOrderPreviewModalProps> = ({ job, onClose }) => {
  const componentRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Renders the referenced component to a canvas, ensuring layout is stable.
   * This function clones the element, forces a browser reflow and waits for the next paint
   * cycle before capturing to prevent font/layout rendering race conditions.
   */
  const renderComponentToCanvas = async (element: HTMLDivElement): Promise<HTMLCanvasElement> => {
    const clone = element.cloneNode(true) as HTMLElement;
    
    // Add a specific class to the clone for export-only styling
    clone.classList.add('export-mode');
    
    clone.style.position = 'absolute';
    clone.style.left = '-9999px';
    clone.style.top = '0px';
    clone.style.width = element.offsetWidth + 'px';
    clone.style.height = 'auto';
    document.body.appendChild(clone);

    try {
        // A minimal delay to help ensure styles are applied by the browser.
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Force a browser reflow to ensure all styles are computed.
        const _ = clone.offsetHeight;

        // Wait for the next browser paint cycle to capture the final rendered state.
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // A final small delay as a safety net before capture.
        await new Promise(resolve => setTimeout(resolve, 50));

        const canvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            windowWidth: clone.scrollWidth,
            windowHeight: clone.scrollHeight,
        });
        return canvas;
    } finally {
        document.body.removeChild(clone);
    }
  };

  const handleOpenImage = async () => {
    if (!componentRef.current) return;
    setIsProcessing(true);
    try {
      const canvas = await renderComponentToCanvas(componentRef.current);
      const image = canvas.toDataURL("image/jpeg", 1.0);
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head><title>작업지시서 JPG 미리보기</title></head>
            <body style="margin:0; text-align: center; background-color: #f0f0f0;">
              <img src="${image}" style="max-width: 100%; height: auto;" alt="Job Order Preview"/>
            </body>
          </html>`);
        newWindow.document.close();
      }
    } catch (err) {
      console.error("이미지 생성 중 오류:", err);
      alert("이미지 생성 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
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
      
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      const ratio = canvasWidth / pdfWidth;
      const totalPDFHeight = canvasHeight / ratio;
      
      let position = 0;
      let pageCount = 1;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, totalPDFHeight);
      let heightLeft = totalPDFHeight - pdfHeight;

      while (heightLeft > 1) { // Add a 1mm tolerance to prevent blank pages
        position = -(pdfHeight * pageCount);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, totalPDFHeight);
        heightLeft -= pdfHeight;
        pageCount++;
      }
      
      window.open(pdf.output('bloburl'), '_blank');
    } catch (err) {
      console.error("PDF 생성 중 오류:", err);
      alert("PDF 생성 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-100 rounded-xl shadow-2xl w-full max-w-4xl h-[95vh] flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 bg-slate-800 text-white flex justify-between items-center shadow-md z-10 flex-none">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Printer className="text-blue-400" />
            작업 지시서 미리보기
          </h3>
          <div className="flex items-center gap-3">
             <button 
                  onClick={handleOpenImage}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
              >
                  {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <FileImage size={16} />}
                  JPG로 보기
              </button>
             <button 
                  onClick={handleOpenPDF}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
              >
                  {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <Download size={16} />}
                  PDF로 보기
              </button>
             <button onClick={onClose} className="ml-2 p-2 hover:bg-slate-700 rounded-full transition-colors text-slate-400 hover:text-white">
                <X size={24} />
             </button>
          </div>
        </div>

        {/* Preview Area */}
        <div className="flex-1 overflow-auto bg-slate-200 p-8 flex justify-center custom-scrollbar">
           {/* Wrapper to capture */}
           <div className="shadow-xl">
              <div ref={componentRef}>
                 <JobOrderDocument job={job} />
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
