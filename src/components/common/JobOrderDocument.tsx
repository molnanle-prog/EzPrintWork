
import React from 'react';
import { Job, JobItem } from '../../types';
import { FileText, Calendar, User, Phone } from 'lucide-react';

interface JobOrderDocumentProps {
  job: Job;
  id?: string;
}

export const JobOrderDocument: React.FC<JobOrderDocumentProps> = ({ job, id }) => {
  const today = new Date().toLocaleDateString('ko-KR');
  const dueDate = new Date(job.dueDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const isUrgent = job.priority !== '일반';
  
  // Normalize items
  const allJobItems = job.subJobs && job.subJobs.length > 0 
      ? job.subJobs 
      : [{ id: '1', type: job.type, specs: job.specs }];

  // Pagination Logic: Max 5 items per page
  const ITEMS_PER_PAGE = 5;
  const pages: JobItem[][] = [];
  for (let i = 0; i < allJobItems.length; i += ITEMS_PER_PAGE) {
      pages.push(allJobItems.slice(i, i + ITEMS_PER_PAGE));
  }

  return (
    <>
      <style>{`.export-mode .lift-text { position: relative; top: -8px; display: inline-block; }`}</style>
      <div id={id} className="printable-document">
        {pages.map((pageItems, pageIndex) => {
          // Dynamic Styling Logic based on item count in current page
          // If items >= 4, switch to "Compact Mode" to fit in one page
          const itemCount = pageItems.length;
          const isCompact = itemCount >= 4;

          // Dynamic Classes
          const styles = {
              sectionGap: isCompact ? 'mb-2' : 'mb-6',
              headerMb: isCompact ? 'mb-2 pb-2' : 'mb-6 pb-4',
              titleText: isCompact ? 'text-xl' : 'text-3xl',
              subTitleText: isCompact ? 'text-sm' : 'text-lg',
              infoBoxPadding: isCompact ? 'p-2' : 'p-4',
              infoLabelText: isCompact ? 'text-sm' : 'text-lg',
              infoValueText: isCompact ? 'text-xl' : 'text-3xl',
              tableHeaderBg: 'bg-slate-100',
              tableText: isCompact ? 'text-sm' : 'text-lg',
              tableCellPadding: isCompact ? 'p-1.5' : 'p-2', // Increased padding for 5 items
              itemHeaderPadding: isCompact ? 'py-1 px-2 text-sm' : 'py-1.5 px-3 text-lg',
              // Remove margin if using justify-between for filling space
              itemMargin: isCompact ? '' : 'mb-4', 
              signatureHeight: isCompact ? 'h-20' : 'h-24'
          };

          return (
            <div 
              key={pageIndex} 
              className="bg-white text-black mx-auto flex flex-col relative" 
              style={{ 
                  width: '210mm', 
                  height: '297mm', // Fixed A4 Height
                  padding: '10mm', // Standard Margin
                  boxSizing: 'border-box',
                  pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto'
              }}
            >
              {/* 1. Header */}
              <div className={`flex justify-between items-center border-b-[4px] border-black flex-none ${styles.headerMb}`}>
                <div>
                  <h1 className={`font-bold tracking-tight text-black ${isCompact ? 'text-4xl' : 'text-5xl'}`}><span className="lift-text">작업 지시서</span></h1>
                  <p className={`font-bold text-slate-600 mt-1 tracking-widest ${styles.subTitleText}`}>
                      <span className="lift-text">JOB ORDER SHEET {pages.length > 1 && `(${pageIndex + 1}/${pages.length})`}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold text-black tracking-normal ${isCompact ? 'text-2xl' : 'text-4xl'}`}><span className="lift-text">{job.id}</span></div>
                  <div className={`text-slate-600 mt-1 font-bold flex flex-col gap-0.5 text-right leading-tight ${isCompact ? 'text-[11px]' : 'text-[13px]'}`}>
                    <span className="lift-text">접수일: {new Date(job.createdAt).toLocaleDateString('ko-KR').replace(/\.$/, '')}</span>
                    <span className="lift-text">납품일: {new Date(job.dueDate).toLocaleDateString('ko-KR').replace(/\.$/, '')}</span>
                  </div>
                </div>
              </div>

              {/* 2. Top Info Grid */}
              <div className={`grid grid-cols-2 gap-4 ${styles.sectionGap} flex-none`}>
                {/* Left: Deadline */}
                <div className={`border-[3px] rounded-xl flex flex-col justify-center relative overflow-hidden ${styles.infoBoxPadding} ${isUrgent ? 'border-red-600 bg-red-50' : 'border-slate-800'}`}>
                   {isUrgent && (
                       <div className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                           <span className="lift-text">긴급</span>
                       </div>
                   )}
                   <div className={`font-bold text-slate-600 mb-1 flex items-center gap-2 ${styles.infoLabelText}`}>
                       <Calendar size={isCompact ? 16 : 24}/> <span className="lift-text">납기일</span>
                   </div>
                   <div className={`font-bold tracking-tight leading-none ${isUrgent ? 'text-red-600' : 'text-black'} ${styles.infoValueText}`}>
                       <span className="lift-text">{dueDate}</span>
                   </div>
                   <div className={`font-bold text-slate-700 mt-1 ${isCompact ? 'text-lg' : 'text-xl'}`}>
                       <span className="lift-text">{new Date(job.dueDate).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 까지</span>
                   </div>
                </div>

                {/* Right: Client Info */}
                <div className={`border-[3px] border-slate-300 rounded-xl ${styles.infoBoxPadding}`}>
                    <div className={`font-bold text-slate-500 mb-1 flex items-center gap-2 ${styles.infoLabelText}`}>
                        <User size={isCompact ? 16 : 24}/> <span className="lift-text">고객 정보</span>
                    </div>
                    <div className={`font-bold text-black mb-1 leading-tight tracking-tight truncate ${styles.infoValueText}`}>
                        <span className="lift-text">{job.clientName}</span>
                    </div>
                    <div className={`flex flex-col text-slate-900 font-bold gap-0.5 ${isCompact ? 'text-base' : 'text-lg'}`}>
                        <span className="truncate"><span className="lift-text">담당: {job.contactPerson || '-'}</span></span>
                        <span className="flex items-center gap-2"><Phone size={isCompact ? 14 : 20}/> <span className="lift-text">{job.clientPhone || '-'}</span></span>
                    </div>
                </div>
              </div>

              {/* 3. Job Title */}
              <div className={`${styles.sectionGap} flex-none`}>
                  <div className="text-sm font-bold text-slate-500 mb-1 border-b-2 border-slate-300 pb-1"><span className="lift-text">통합 작업명</span></div>
                  <div className={`font-bold text-black py-1 leading-tight truncate ${styles.titleText}`}><span className="lift-text">{job.title}</span></div>
              </div>

              {/* 4. Specs Loop (Dynamic Content Area) */}
              <div className="flex-1 overflow-hidden flex flex-col">
                  <h3 className={`font-bold text-black mb-2 flex items-center gap-2 border-l-[6px] border-blue-600 pl-2 flex-none ${isCompact ? 'text-lg' : 'text-xl'}`}>
                      <span className="lift-text">제작 사양 목록 (Page {pageIndex + 1})</span>
                  </h3>
                  
                  <div className={`flex-1 flex flex-col ${isCompact ? 'justify-between' : 'justify-start'}`}>
                      {pageItems.map((item, idx) => {
                          // Global index calculation
                          const globalIdx = (pageIndex * ITEMS_PER_PAGE) + idx + 1;
                          const hasInner = !!item.specs.paperTypeInner;

                          return (
                              <div key={idx} className={`${styles.itemMargin} break-inside-avoid w-full`}>
                                  <div className={`bg-slate-800 text-white font-bold flex justify-between items-center rounded-t-md ${styles.itemHeaderPadding}`}>
                                      <span className="lift-text">#{globalIdx}. {item.type}</span>
                                  </div>
                                  <table className={`w-full border-collapse border-[2px] border-slate-400 ${styles.tableText} table-fixed`}>
                                      <tbody>
                                          <tr>
                                              <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} w-[15%] text-left font-bold text-slate-900 align-middle`}><span className="lift-text">수량</span></th>
                                              <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} w-[35%] font-bold text-blue-700 align-middle`}><span className="lift-text">{item.specs.quantity}</span></td>
                                              <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} w-[15%] text-left font-bold text-slate-900 align-middle`}><span className="lift-text">규격</span></th>
                                              <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} w-[35%] font-bold align-middle`}><span className="lift-text">{item.specs.size}</span></td>
                                          </tr>
                                          
                                          {/* Case A: Standard Job (Single Paper) */}
                                          {!hasInner && (
                                            <tr>
                                                <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">용지</span></th>
                                                <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold align-middle`}>
                                                    <span className="lift-text">{item.specs.paperType} <span className="text-slate-600 font-normal text-[0.9em]">({item.specs.paperWeight})</span></span>
                                                </td>
                                                <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">도수</span></th>
                                                <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold align-middle`}><span className="lift-text">{item.specs.printColor}</span></td>
                                            </tr>
                                          )}

                                          {/* Case B: Booklet Job (Cover & Inner) */}
                                          {hasInner && (
                                            <>
                                                <tr>
                                                    <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">표지</span></th>
                                                    <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold align-middle`} colSpan={3}>
                                                        <span className="lift-text">{item.specs.paperType} {item.specs.paperWeight} / {item.specs.printColor}</span>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">내지</span></th>
                                                    <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold align-middle`} colSpan={3}>
                                                        <span className="lift-text">{item.specs.paperTypeInner} {item.specs.paperWeightInner} / {item.specs.printColorInner}</span>
                                                    </td>
                                                </tr>
                                            </>
                                          )}

                                          <tr>
                                              <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">후가공</span></th>
                                              <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold text-red-600 align-middle`} colSpan={3}>
                                                  <span className="lift-text">{item.specs.processing.length > 0 ? item.specs.processing.join(', ') : <span className="text-slate-400">없음</span>}</span>
                                              </td>
                                          </tr>
                                          {item.specs.memo && (
                                              <tr>
                                                  <th className={`bg-yellow-50 border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}>
                                                      <span className="flex items-center gap-1">
                                                          <FileText size={isCompact ? 12 : 16}/> <span className="lift-text">메모</span>
                                                      </span>
                                                  </th>
                                                  <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold text-slate-800 bg-yellow-50 align-middle`} colSpan={3}>
                                                      <span className="lift-text">{item.specs.memo}</span>
                                                  </td>
                                              </tr>
                                          )}
                                      </tbody>
                                  </table>
                              </div>
                          );
                      })}
                  </div>
              </div>

              {/* 6. Process Check Grid - Fixed at Bottom */}
              <div className="mt-auto break-inside-avoid flex-none pt-2">
                  <div className="grid grid-cols-4 border-[3px] border-black">
                      {['디자인/판짜기', '인쇄', '후가공', '포장/납품'].map((step) => (
                          <div key={step} className="border-r-[3px] border-black last:border-r-0">
                              <div className={`bg-slate-100 p-1 text-center font-bold border-b-[3px] border-black ${isCompact ? 'text-sm' : 'text-lg'}`}><span className="lift-text">{step}</span></div>
                              <div className={`${styles.signatureHeight} flex items-end justify-center pb-2`}>
                                  <span className="text-slate-300 font-bold text-sm"><span className="lift-text">(서명)</span></span>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* Footer */}
              <div className="mt-2 flex justify-between items-end text-[10px] text-slate-500 flex-none">
                  <div><span className="lift-text">EzPrintWork v1.2.0</span></div>
                  <div className="font-bold text-slate-200 text-xl tracking-widest uppercase"><span className="lift-text">Original</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
