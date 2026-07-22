
import React from 'react';
import { Job, JobItem } from '../../types';
import { FileText, Calendar, User, Phone } from 'lucide-react';
import { formatJobNumber } from '../../services/dataService';
import { APP_VERSION } from '../../utils/autoUpdate';
import { A4_WIDTH_MM, A4_HEIGHT_MM } from '../../utils/printA4';

interface JobOrderDocumentProps {
  job: Job;
  id?: string;
}

/** 짧은 사양 ≈ 1, 길수록 증가. 페이지 예산 4 → 짧은 품목 최대 4개, 넘치면 다음 페이지 */
function estimateJobItemCost(item: JobItem): number {
  const s = item.specs;
  let cost = 1;

  const hasInner = !!(s.paperTypeInner || (s.innerPages && s.innerPages.length > 0));
  if (hasInner) cost += 1.2;

  if ((s.processingCover && s.processingCover.length > 0) || (s.processingInner && s.processingInner.length > 0)) {
    cost += 0.7;
  }

  const procText = [
    ...(s.processing || []),
    ...(s.processingCover || []),
    ...(s.processingInner || []),
  ].join(', ');
  if (procText.length > 48) cost += 0.55;
  else if (procText.length > 16) cost += 0.25;

  const memo = (s.memo || '').trim();
  if (memo) {
    cost += 0.4;
    if (memo.length > 60) cost += 0.45;
    if (memo.length > 120) cost += 0.45;
  }

  return Math.min(Math.max(cost, 1), 4);
}

function paginateJobItems(items: JobItem[]): JobItem[][] {
  /** 짧은 명함형 ≈1 → 최대 4개. 긴 사양은 cost로 더 일찍 다음 페이지 */
  const PAGE_BUDGET = 4;
  const MAX_PER_PAGE = 4;
  const pages: JobItem[][] = [];
  let current: JobItem[] = [];
  let used = 0;

  for (const item of items) {
    const cost = estimateJobItemCost(item);
    const exceeds =
      current.length > 0 &&
      (current.length >= MAX_PER_PAGE || used + cost > PAGE_BUDGET + 0.05);

    if (exceeds) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += cost;
  }

  if (current.length > 0) pages.push(current);
  if (pages.length === 0) pages.push([]);
  return pages;
}

export const JobOrderDocument: React.FC<JobOrderDocumentProps> = ({ job, id }) => {
  const dueDate = new Date(job.dueDate).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const isUrgent = job.priority !== '일반';

  const allJobItems: JobItem[] = job.subJobs && job.subJobs.length > 0
      ? job.subJobs
      : [{ id: '1', type: job.type, specs: job.specs }];

  const pages = paginateJobItems(allJobItems);

  return (
    <>
      <div
        id={id}
        className="printable-document bg-white text-black mx-auto"
        style={{ width: `${A4_WIDTH_MM}mm`, boxSizing: 'border-box' }}
      >
        {pages.map((pageItems, pageIndex) => {
          const startIndex = pages.slice(0, pageIndex).reduce((n, p) => n + p.length, 0);

          // 페이지·품목 수와 무관 — 표/폰트/서명판 크기 고정 (넘치면 다음 페이지)
          const styles = {
              sectionGap: 'mb-1.5',
              headerMb: 'mb-2 pb-1.5',
              titleText: 'text-3xl',
              subTitleText: 'text-lg',
              infoBoxPadding: 'p-2.5',
              infoLabelText: 'text-lg',
              infoValueText: 'text-3xl',
              tableHeaderBg: 'bg-slate-100',
              tableText: 'text-lg',
              tableCellPadding: 'py-1 px-1.5',
              itemHeaderPadding: 'py-0.5 px-2.5 text-lg',
              itemMargin: 'mb-2',
              signatureHeight: 'h-14',
              signatureHeadText: 'text-sm',
              listTitleText: 'text-xl',
              jobNoText: 'text-3xl',
              dateText: 'text-[12px]',
              iconLg: 20,
              iconMd: 16,
              iconSm: 14,
          };

          return (
            <div
              key={pageIndex}
              className="page-container bg-white text-black mx-auto flex flex-col relative"
              style={{
                width: `${A4_WIDTH_MM}mm`,
                height: `${A4_HEIGHT_MM}mm`,
                minHeight: `${A4_HEIGHT_MM}mm`,
                padding: '10mm 10mm 7mm 10mm',
                boxSizing: 'border-box',
                pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto',
              }}
            >
              {/* 1. Header */}
              <div className={`flex justify-between items-center border-b-[3px] border-black flex-none ${styles.headerMb}`}>
                <div>
                  <h1 className="font-bold tracking-tight text-black text-4xl"><span className="lift-text">작업 지시서</span></h1>
                  <p className={`font-bold text-slate-600 mt-1 tracking-widest ${styles.subTitleText}`}>
                      <span className="lift-text">JOB ORDER SHEET{pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : ''}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className={`font-mono font-bold text-black tracking-normal ${styles.jobNoText}`}><span className="lift-text">{formatJobNumber(job)}</span></div>
                  <div className={`text-slate-600 mt-1 font-bold flex flex-col gap-0.5 text-right leading-tight ${styles.dateText}`}>
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
                       <Calendar size={styles.iconLg}/> <span className="lift-text">납기일</span>
                   </div>
                   <div className={`font-bold tracking-tight leading-none ${isUrgent ? 'text-red-600' : 'text-black'} ${styles.infoValueText}`}>
                       <span className="lift-text">{dueDate}</span>
                   </div>
                   <div className="font-bold text-slate-700 mt-1 text-lg">
                       <span className="lift-text">{new Date(job.dueDate).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 까지</span>
                   </div>
                </div>

                {/* Right: Client Info */}
                <div className={`border-[3px] border-slate-300 rounded-xl ${styles.infoBoxPadding}`}>
                    <div className={`font-bold text-slate-500 mb-1 flex items-center gap-2 ${styles.infoLabelText}`}>
                        <User size={styles.iconLg}/> <span className="lift-text">고객 정보</span>
                    </div>
                    <div className={`font-bold text-black mb-1 leading-tight tracking-tight truncate ${styles.infoValueText}`}>
                        <span className="lift-text">{job.clientName}</span>
                    </div>
                    <div className="flex flex-col text-slate-900 font-bold gap-0.5 text-base">
                        <span className="truncate"><span className="lift-text">담당: {job.contactPerson || '-'}</span></span>
                        <span className="flex items-center gap-2"><Phone size={styles.iconSm}/> <span className="lift-text">{job.clientPhone || '-'}</span></span>
                    </div>
                </div>
              </div>

              {/* 3. Job Title */}
              <div className={`${styles.sectionGap} flex-none`}>
                  <div className="text-sm font-bold text-slate-500 mb-1 border-b-2 border-slate-300 pb-1"><span className="lift-text">통합 작업명</span></div>
                  <div className={`font-bold text-black py-1 leading-tight truncate ${styles.titleText}`}><span className="lift-text">{job.title}</span></div>
              </div>

              {/* 4. Specs — 목록은 위에서 붙이고, 남는 공간은 서명판 위. 넘치면 잘려 겹치지 않음 */}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <h3 className={`font-bold text-black mb-1.5 flex items-center gap-2 border-l-[6px] border-blue-600 pl-2 flex-none ${styles.listTitleText}`}>
                      <span className="lift-text">제작 사양 목록 (Page {pageIndex + 1})</span>
                  </h3>
                  
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-start">
                      {pageItems.map((item, idx) => {
                          const globalIdx = startIndex + idx + 1;
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
                                            <tr>
                                                <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">표지</span></th>
                                                <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold align-middle`} colSpan={3}>
                                                    <span className="lift-text">
                                                        {item.specs.paperType} {item.specs.paperWeight} / {item.specs.printColor}
                                                        {item.specs.hasCoverWing && (
                                                            <span className="ml-2 bg-red-100 text-red-600 px-1.5 py-0.5 rounded text-xs font-black border border-red-200" style={{ display: 'inline-block', transform: 'translateY(-2px)' }}>
                                                                ★날개 표지 있음
                                                            </span>
                                                        )}
                                                    </span>
                                                </td>
                                            </tr>
                                          )}
                                          {hasInner && (() => {
                                              const innerPages = item.specs.innerPages && item.specs.innerPages.length > 0 
                                                  ? item.specs.innerPages 
                                                  : [{
                                                      paperType: item.specs.paperTypeInner || '-',
                                                      paperWeight: item.specs.paperWeightInner || '',
                                                      printColor: item.specs.printColorInner || '-',
                                                      pagesCount: '0'
                                                    }];
                                              let innerCount = 0;
                                              let dividerCount = 0;
                                              return innerPages.map((ip: any, idx: number) => {
                                                  if (ip.isDivider) {
                                                      dividerCount++;
                                                      return (
                                                          <tr key={ip.id || idx}>
                                                              <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}>
                                                                  <span className="lift-text">간지 {dividerCount}</span>
                                                              </th>
                                                              <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold align-middle`} colSpan={3}>
                                                                  <span className="lift-text">
                                                                      색상: {ip.dividerColor || '지정안함'} / 수량: {ip.dividerQuantity || '0'}장
                                                                  </span>
                                                              </td>
                                                          </tr>
                                                      );
                                                  } else {
                                                      innerCount++;
                                                      return (
                                                          <tr key={ip.id || idx}>
                                                              <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}>
                                                                  <span className="lift-text">내지 {innerCount}</span>
                                                              </th>
                                                              <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold align-middle`} colSpan={3}>
                                                                  <span className="lift-text">
                                                                      {ip.paperType} {ip.paperWeight} / {ip.printColor}
                                                                      {ip.pagesCount && ip.pagesCount !== '0' && ` (${ip.pagesCount}p)`}
                                                                  </span>
                                                              </td>
                                                          </tr>
                                                      );
                                                  }
                                              });
                                          })()}

                                          {hasInner ? (
                                              <>
                                                  {item.specs.processing && item.specs.processing.length > 0 && (
                                                      <tr>
                                                          <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">제본/공통</span></th>
                                                          <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold text-slate-700 align-middle`} colSpan={3}>
                                                              <span className="lift-text">{item.specs.processing.join(', ')}</span>
                                                          </td>
                                                      </tr>
                                                  )}
                                                  {item.specs.processingCover && item.specs.processingCover.length > 0 && (
                                                      <tr>
                                                          <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">표지 후가공</span></th>
                                                          <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold text-blue-600 align-middle`} colSpan={3}>
                                                              <span className="lift-text">{item.specs.processingCover.join(', ')}</span>
                                                          </td>
                                                      </tr>
                                                  )}
                                                  {item.specs.processingInner && item.specs.processingInner.length > 0 && (
                                                      <tr>
                                                          <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">내지 후가공</span></th>
                                                          <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold text-emerald-600 align-middle`} colSpan={3}>
                                                              <span className="lift-text">{item.specs.processingInner.join(', ')}</span>
                                                          </td>
                                                      </tr>
                                                  )}
                                                  {(!item.specs.processing || item.specs.processing.length === 0) &&
                                                   (!item.specs.processingCover || item.specs.processingCover.length === 0) &&
                                                   (!item.specs.processingInner || item.specs.processingInner.length === 0) && (
                                                      <tr>
                                                          <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">후가공</span></th>
                                                          <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold text-slate-400 align-middle`} colSpan={3}>
                                                              <span className="lift-text">없음</span>
                                                          </td>
                                                      </tr>
                                                  )}
                                              </>
                                          ) : (
                                              <tr>
                                                  <th className={`${styles.tableHeaderBg} border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}><span className="lift-text">후가공</span></th>
                                                  <td className={`border-[2px] border-slate-400 ${styles.tableCellPadding} font-bold text-red-600 align-middle`} colSpan={3}>
                                                      <span className="lift-text">{item.specs.processing && item.specs.processing.length > 0 ? item.specs.processing.join(', ') : <span className="text-slate-400">없음</span>}</span>
                                                  </td>
                                              </tr>
                                          )}
                                          {item.specs.memo && (
                                              <tr>
                                                  <th className={`bg-yellow-50 border-[2px] border-slate-400 ${styles.tableCellPadding} text-left font-bold text-slate-900 align-middle`}>
                                                      <span className="flex items-center gap-1">
                                                          <FileText size={14}/> <span className="lift-text">메모</span>
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

              {/* 서명표 + 푸터 — 사양표와 동일 선(2px), 남는 여백은 서명판 위만 */}
              <div
                className="mt-auto flex-none w-full flex flex-col"
                style={{ marginBottom: 0 }}
              >
                  <div className="w-full break-inside-avoid">
                      <table className="w-full border-collapse border-[2px] border-slate-400 table-fixed">
                          <colgroup>
                              <col style={{ width: '25%' }} />
                              <col style={{ width: '25%' }} />
                              <col style={{ width: '25%' }} />
                              <col style={{ width: '25%' }} />
                          </colgroup>
                          <thead>
                              <tr>
                                  {['디자인/판짜기', '인쇄', '후가공', '포장/납품'].map((step) => (
                                      <th
                                          key={step}
                                          className={`bg-slate-100 border-[2px] border-slate-400 p-1 text-center font-bold ${styles.signatureHeadText}`}
                                      >
                                          <span className="lift-text">{step}</span>
                                      </th>
                                  ))}
                              </tr>
                          </thead>
                          <tbody>
                              <tr>
                                  {['디자인/판짜기', '인쇄', '후가공', '포장/납품'].map((step) => (
                                      <td
                                          key={`sig-${step}`}
                                          className={`border-[2px] border-slate-400 ${styles.signatureHeight} align-bottom text-center pb-2`}
                                      >
                                          <span className="text-slate-300 font-bold text-sm">
                                              <span className="lift-text">(서명)</span>
                                          </span>
                                      </td>
                                  ))}
                              </tr>
                          </tbody>
                      </table>
                  </div>
                  <div className="relative mt-0.5 w-full flex justify-between items-end text-[10px] text-slate-500">
                      <div className="z-[1]"><span className="lift-text">EzPrintWork v{APP_VERSION}</span></div>
                      <div className="absolute left-1/2 -translate-x-1/2 font-bold text-slate-700 text-xs tracking-wide whitespace-nowrap">
                        <span className="lift-text">{pageIndex + 1} / {pages.length}</span>
                      </div>
                      <div className="z-[1] font-bold text-slate-200 text-xl tracking-widest uppercase"><span className="lift-text">Original</span></div>
                  </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
