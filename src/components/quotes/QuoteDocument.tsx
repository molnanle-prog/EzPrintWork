
import React from 'react';
import { Quote } from '../../types';
import { db } from '../../services/dataService';
import { getQuoteJobNumber, formatQuoteClientLabel, resolveQuoteJob, resolveQuoteLinesForDisplay } from '../../utils/quoteJobSync';
import { formatKoreanWonAmount } from '../../utils/koreanAmount';

interface QuoteDocumentProps {
  quote: Quote;
  documentType?: 'quote' | 'statement';
  id?: string;
}

const MIN_TABLE_ROWS = 5;
const SPEC_PREVIEW_MAX = 72;

function getSpecPreview(description?: string): string {
  const text = (description || '').trim();
  if (!text) return '';
  if (text.includes('표지:') || text.includes('내지')) {
    return text.length > SPEC_PREVIEW_MAX ? `${text.slice(0, SPEC_PREVIEW_MAX)}…` : text;
  }
  const tokens = text.split(/[\/,|]/).map((part) => part.trim()).filter(Boolean);
  const base = tokens.length > 0 ? tokens.slice(0, 2).join(' / ') : text;
  return base.length > SPEC_PREVIEW_MAX ? `${base.slice(0, SPEC_PREVIEW_MAX)}…` : base;
}

export const QuoteDocument: React.FC<QuoteDocumentProps> = ({ quote, documentType = 'quote', id }) => {
  const company = db.getCompanyInfo();
  const template = db.getQuoteTemplate();
  const headerHeightMm = template.headerHeightMm ?? 17;
  const jobs = db.getAllJobs();
  const linkedJob = resolveQuoteJob(quote, jobs);
  const clientLabel = formatQuoteClientLabel(quote, jobs);

  const rawLines = quote.lines && quote.lines.length > 0
    ? quote.lines
    : [{
        id: 'legacy',
        productType: quote.items || '품목',
        description: quote.items || '',
        quantity: '1',
        unitPrice: quote.totalAmount,
        amount: quote.totalAmount,
      }];

  const { lines, amounts } = resolveQuoteLinesForDisplay(rawLines, quote, linkedJob);
  const vatIncluded = amounts.vatIncluded;
  const supplyPrice = amounts.supplyAmount;
  const tax = amounts.vatAmount;
  const grandTotal = amounts.totalAmount;

  const today = new Date(quote.date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const jobNo = getQuoteJobNumber(quote, jobs);
  const statusLabel = quote.status === '승인' ? '승인됨' : quote.status === '거절' ? '거절됨' : '대기';
  const emptyRowCount = Math.max(MIN_TABLE_ROWS - lines.length, 0);
  const vatNote = vatIncluded ? '(부가세 포함)' : '(부가세 별도)';
  const docTitle = documentType === 'statement' ? '명 세 표' : '견 적 서';
  const docSubtitle = documentType === 'statement' ? 'STATEMENT' : 'ESTIMATE SHEET';

  return (
    <>
      <style>{`.export-mode .lift-text { position: relative; top: -8px; display: inline-block; }`}</style>
      <div
        id={id}
        className="printable-document bg-white text-slate-800 mx-auto shadow-sm flex flex-col"
        style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}
      >
        {template.headerImageUrl ? (
          <div className="shrink-0" style={{ width: '210mm', height: `${headerHeightMm}mm`, overflow: 'hidden' }}>
            <img
              src={template.headerImageUrl}
              alt="견적서 헤더"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
            />
          </div>
        ) : (
          <div className="shrink-0 px-10 pt-4 pb-2">
            <div className="flex justify-between items-end border-b-4 border-slate-800 pb-2 mb-2">
              <div>
                <h1 className="text-4xl font-bold tracking-widest text-slate-900">
                  <span className="lift-text">{docTitle}</span>
                </h1>
                <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-wider">
                  <span className="lift-text">{docSubtitle}</span>
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-slate-500">
                  <span className="lift-text">작업번호 : </span>
                  <span className="text-slate-800 font-bold lift-text">{jobNo}</span>
                </div>
                <div className="text-sm font-medium text-slate-500">
                  <span className="lift-text">발행일자 : </span>
                  <span className="text-slate-800 font-bold lift-text">{today}</span>
                </div>
                <div className="text-sm font-medium text-slate-500">
                  <span className="lift-text">상태 : </span>
                  <span className="text-slate-800 font-bold lift-text">{statusLabel}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          className="flex flex-col flex-1 px-10 pb-8"
          style={{ paddingTop: template.headerImageUrl ? '3mm' : 0, minHeight: 0 }}
        >
          {template.headerImageUrl && (
            <div className="shrink-0 flex justify-end gap-6 text-sm text-slate-600 mb-4">
              <span><span className="lift-text">작업번호: </span><strong className="lift-text">{jobNo}</strong></span>
              <span><span className="lift-text">발행일: </span><strong className="lift-text">{today}</strong></span>
              <span><span className="lift-text">상태: </span><strong className="lift-text">{statusLabel}</strong></span>
            </div>
          )}

          {/* 수신 / 공급자 */}
          <div className="shrink-0 flex justify-between gap-8 mb-6">
            <div className="w-1/2 border border-slate-300 rounded-sm p-4 relative">
              <div className="absolute -top-3 left-3 bg-white px-2 text-sm font-bold text-slate-500">
                <span className="lift-text">수신 (To)</span>
              </div>
              <div className="mt-2 text-xl font-bold border-b border-slate-200 pb-2 mb-2">
                <span className="lift-text">{clientLabel} </span>
                <span className="text-base font-normal lift-text">귀하</span>
              </div>
              {quote.clientPhone && (
                <p className="text-sm text-slate-600 mb-1">
                  <span className="lift-text">연락처: {quote.clientPhone}</span>
                </p>
              )}
              <p className="text-sm text-slate-600 leading-relaxed">
                <span className="lift-text">아래와 같이 견적합니다.</span><br />
                <span className="lift-text">견적 유효기간 : 발행일로부터 14일</span>
              </p>
            </div>

            <div className="w-1/2 border border-slate-300 rounded-sm p-4 relative">
              <div className="absolute -top-3 left-3 bg-white px-2 text-sm font-bold text-slate-500">
                <span className="lift-text">공급자 (From)</span>
              </div>
              <dl
                className="mt-2 text-sm grid gap-y-1.5 items-start"
                style={{ gridTemplateColumns: '5.25rem 1fr' }}
              >
                <dt className="font-bold text-slate-500 whitespace-nowrap lift-text">상호</dt>
                <dd className="font-bold text-slate-800 m-0 lift-text">{company.name || '미등록'}</dd>

                {company.ceoName && (
                  <>
                    <dt className="font-bold text-slate-500 whitespace-nowrap lift-text">대표자</dt>
                    <dd className="m-0 lift-text">{company.ceoName}</dd>
                  </>
                )}
                {company.businessNumber && (
                  <>
                    <dt className="font-bold text-slate-500 whitespace-nowrap lift-text">사업자번호</dt>
                    <dd className="m-0 font-mono lift-text">{company.businessNumber}</dd>
                  </>
                )}
                {company.address && (
                  <>
                    <dt className="font-bold text-slate-500 whitespace-nowrap lift-text pt-px">주소</dt>
                    <dd
                      className="m-0 leading-snug break-words lift-text"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {company.address}
                    </dd>
                  </>
                )}
                {company.phone && (
                  <>
                    <dt className="font-bold text-slate-500 whitespace-nowrap lift-text">연락처</dt>
                    <dd className="m-0 lift-text">{company.phone}</dd>
                  </>
                )}
              </dl>
            </div>
          </div>

          {/* 중간 합계금액 배너 */}
          <div className="shrink-0 bg-slate-100 border-y-2 border-slate-800 px-4 py-2 mb-5 flex items-center gap-3 whitespace-nowrap">
            <span className="font-bold text-lg lift-text shrink-0">합계금액 (Total)</span>
            <span className="text-base font-bold text-slate-700 tracking-wide lift-text whitespace-nowrap leading-none">
              {formatKoreanWonAmount(grandTotal)}
            </span>
            <div className="text-2xl font-bold flex items-center justify-end gap-1 ml-auto shrink-0 leading-none">
              <span className="text-slate-500 text-lg lift-text">₩</span>
              <span className="lift-text">{grandTotal.toLocaleString()}</span>
              <span className="text-base font-normal ml-1 lift-text">{vatNote}</span>
            </div>
          </div>

          {/* 품목 표 (빈 줄 자동 채움) */}
          <div className="flex-1 min-h-0 mb-4">
            <table className="w-full border-collapse h-full">
              <thead>
                <tr className="bg-blue-50 border-y border-blue-200 text-sm text-blue-900">
                  <th className="py-2 px-2 text-center w-12 border-r border-blue-100 align-middle">
                    <span className="lift-text">No</span>
                  </th>
                  <th className="py-2 px-3 text-center border-r border-blue-100 align-middle w-44">
                    <span className="lift-text">품목</span>
                  </th>
                  <th className="py-2 px-3 text-center border-r border-blue-100 align-middle">
                    <span className="lift-text">사양</span>
                  </th>
                  <th className="py-2 px-2 text-center w-16 border-r border-blue-100 align-middle">
                    <span className="lift-text">수량</span>
                  </th>
                  <th className="py-2 px-3 text-right w-28 align-middle">
                    <span className="lift-text">금액</span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {lines.map((line, idx) => (
                  <tr key={line.id} className="border-b border-slate-200">
                    <td className="py-3 text-center text-slate-500 align-middle">
                      <span className="lift-text">{idx + 1}</span>
                    </td>
                    <td className="py-3 px-3 align-middle border-r border-slate-100">
                      <div className="font-bold text-slate-800">
                        <span className="lift-text">{line.productType}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 align-middle">
                      {line.description ? (
                        <div className="text-xs text-slate-500">
                          <span className="lift-text">{getSpecPreview(line.description)}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 text-center align-middle">
                      <span className="lift-text">{line.quantity}</span>
                    </td>
                    <td className="py-3 px-3 text-right align-middle">
                      <span className="lift-text">{(line.amount || 0).toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
                {emptyRowCount > 0 &&
                  [...Array(emptyRowCount)].map((_, i) => (
                    <tr key={`empty-${i}`} className="border-b border-slate-100" style={{ height: '2.5rem' }}>
                      <td className="align-middle text-center text-slate-300 text-xs">
                        <span className="lift-text">{lines.length + i + 1}</span>
                      </td>
                      <td className="align-middle" />
                      <td className="align-middle" />
                      <td className="align-middle" />
                      <td className="align-middle" />
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* 하단 고정: 합계 요약 + 특이사항 */}
          <div className="shrink-0 mt-auto">
            <div className="border border-slate-300 bg-slate-50 text-sm mb-3">
              <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-200">
                <span className="font-bold text-slate-700 lift-text">공급가액</span>
                <span className="font-bold text-slate-800 font-mono lift-text">{supplyPrice.toLocaleString()}원</span>
              </div>
              {vatIncluded ? (
                <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-200">
                  <span className="font-bold text-slate-700 lift-text">부가세 (10%)</span>
                  <span className="font-bold text-slate-600 font-mono lift-text">{tax.toLocaleString()}원</span>
                </div>
              ) : (
                <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-200">
                  <span className="font-bold text-slate-500 lift-text">부가세</span>
                  <span className="font-bold text-slate-500 lift-text">별도</span>
                </div>
              )}
              <div className="flex justify-between items-center px-4 py-3 bg-blue-50">
                <span className="font-bold text-blue-900 text-base lift-text">합계</span>
                <span className="font-bold text-blue-700 text-base font-mono lift-text">
                  {grandTotal.toLocaleString()}원
                  <span className="text-xs font-normal text-blue-600 ml-2 lift-text">{vatNote}</span>
                </span>
              </div>
            </div>

            <div className="border border-slate-300 rounded-sm p-4 text-xs text-slate-600 bg-white">
              <h4 className="font-bold mb-2 text-slate-800">
                <span className="lift-text">[ 특이사항 및 결제정보 ]</span>
              </h4>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <span className="lift-text">
                    {vatIncluded
                      ? '위 금액은 부가가치세(10%)가 포함된 금액입니다.'
                      : '위 금액은 부가가치세(10%)가 별도입니다.'}
                  </span>
                </li>
                {company.bankAccount && (
                  <li>
                    <span className="lift-text">
                      입금계좌: <strong>{company.bankAccount}</strong>
                    </span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
