
import React from 'react';
import { Quote } from '../../types';

interface QuoteDocumentProps {
  quote: Quote;
  id?: string;
}

export const QuoteDocument: React.FC<QuoteDocumentProps> = ({ quote, id }) => {
  // Calculate Tax (Assuming totalAmount is Supply Price as per previous UI "VAT Excluded")
  const supplyPrice = quote.totalAmount;
  const tax = Math.round(supplyPrice * 0.1);
  const grandTotal = supplyPrice + tax;
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });

  return (
    <>
      <style>{`.export-mode .lift-text { position: relative; top: -8px; display: inline-block; }`}</style>
      <div id={id} className="printable-document bg-white text-slate-800 p-10 mx-auto shadow-sm" style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}>
        {/* 1. Header */}
        <div className="flex justify-between items-end border-b-4 border-slate-800 pb-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold tracking-widest text-slate-900"><span className="lift-text">견 적 서</span></h1>
            <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-wider"><span className="lift-text">ESTIMATE SHEET</span></p>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-slate-500"><span className="lift-text">견적번호 : </span><span className="text-slate-800 font-bold lift-text">{quote.id}</span></div>
            <div className="text-sm font-medium text-slate-500"><span className="lift-text">발행일자 : </span><span className="text-slate-800 font-bold lift-text">{today}</span></div>
          </div>
        </div>

        {/* 2. Recipient & Supplier Info */}
        <div className="flex justify-between gap-8 mb-8">
          {/* Recipient */}
          <div className="w-1/2 border border-slate-300 rounded-sm p-4 relative">
            <div className="absolute -top-3 left-3 bg-white px-2 text-sm font-bold text-slate-500"><span className="lift-text">수신 (To)</span></div>
            <div className="mt-2 text-xl font-bold border-b border-slate-200 pb-2 mb-2 flex justify-between items-center">
               <span><span className="lift-text">{quote.clientName} </span><span className="text-base font-normal lift-text">귀하</span></span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              <span className="lift-text">아래와 같이 견적합니다.</span><br/>
              <span className="lift-text">견적 유효기간 : 발행일로부터 14일</span>
            </p>
          </div>

          {/* Supplier */}
          <div className="w-1/2 border border-slate-300 rounded-sm p-4 relative">
            <div className="absolute -top-3 left-3 bg-white px-2 text-sm font-bold text-slate-500"><span className="lift-text">공급자 (From)</span></div>
            <ul className="mt-1 space-y-1 text-sm">
              <li className="flex"><span className="w-16 font-bold text-slate-500 lift-text">상호</span> <span className="font-bold lift-text">EzPrintWork</span></li>
              <li className="flex"><span className="w-16 font-bold text-slate-500 lift-text">대표자</span> <span className="lift-text">김대표</span></li>
              <li className="flex"><span className="w-16 font-bold text-slate-500 lift-text">사업자번호</span> <span className="lift-text">123-45-67890</span></li>
              <li className="flex"><span className="w-16 font-bold text-slate-500 lift-text">주소</span> <span className="lift-text">서울시 강남구 테헤란로 123</span></li>
              <li className="flex"><span className="w-16 font-bold text-slate-500 lift-text">담당자</span> <span className="lift-text">관리팀 (02-1234-5678)</span></li>
            </ul>
            {/* Stamp Placeholder */}
            <div className="absolute bottom-4 right-4 w-16 h-16 border-2 border-red-500 rounded-full flex items-center justify-center text-red-500 font-serif font-bold text-sm opacity-50 rotate-[-15deg]">
              <span className="lift-text">(인)</span>
            </div>
          </div>
        </div>

        {/* 3. Total Amount */}
        <div className="bg-slate-100 border-y-2 border-slate-800 p-4 mb-8 flex justify-between items-center">
           <span className="font-bold text-lg lift-text">합계금액 (Total)</span>
           <div className="text-2xl font-bold flex items-center gap-1">
              <span className="text-slate-500 text-lg lift-text">₩</span>
              <span className="lift-text">{grandTotal.toLocaleString()}</span>
              <span className="text-base font-normal ml-1 lift-text">(부가세 포함)</span>
           </div>
        </div>

        {/* 4. Details Table */}
        <table className="w-full mb-8 border-collapse">
          <thead>
            <tr className="bg-blue-50 border-y border-blue-200 text-sm text-blue-900">
              <th className="py-2 px-2 text-center w-12 border-r border-blue-100 align-middle"><span className="lift-text">No</span></th>
              <th className="py-2 px-4 text-left border-r border-blue-100 align-middle"><span className="lift-text">품목 / 사양 (Description)</span></th>
              <th className="py-2 px-2 text-center w-16 border-r border-blue-100 align-middle"><span className="lift-text">수량</span></th>
              <th className="py-2 px-3 text-right w-28 border-r border-blue-100 align-middle"><span className="lift-text">공급가액</span></th>
              <th className="py-2 px-3 text-right w-24 border-r border-blue-100 align-middle"><span className="lift-text">세액</span></th>
              <th className="py-2 px-3 text-right w-28 align-middle"><span className="lift-text">비고</span></th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {/* Main Item */}
            <tr className="border-b border-slate-200">
              <td className="py-4 text-center text-slate-500 align-middle"><span className="lift-text">1</span></td>
              <td className="py-4 px-4 font-bold text-slate-800 align-middle">
                  <span className="lift-text">{quote.items}</span>
              </td>
              <td className="py-4 text-center align-middle"><span className="lift-text">1식</span></td>
              <td className="py-4 px-3 text-right align-middle"><span className="lift-text">{supplyPrice.toLocaleString()}</span></td>
              <td className="py-4 px-3 text-right text-slate-500 align-middle"><span className="lift-text">{tax.toLocaleString()}</span></td>
              <td className="py-4 px-3 text-right text-slate-400 align-middle"></td>
            </tr>
            
            {/* Empty Rows for visual layout */}
            {[2,3,4,5].map(num => (
               <tr key={num} className="border-b border-slate-100 h-12">
                  <td className="text-center text-slate-300 text-xs align-middle"><span className="lift-text">{num}</span></td>
                  <td className="align-middle"></td>
                  <td className="align-middle"></td>
                  <td className="align-middle"></td>
                  <td className="align-middle"></td>
                  <td className="align-middle"></td>
               </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-bold text-sm">
             <tr>
               <td colSpan={3} className="py-3 px-4 text-right border-r border-slate-200 align-middle"><span className="lift-text">소 계</span></td>
               <td className="py-3 px-3 text-right text-blue-600 align-middle"><span className="lift-text">{supplyPrice.toLocaleString()}</span></td>
               <td className="py-3 px-3 text-right text-slate-500 align-middle"><span className="lift-text">{tax.toLocaleString()}</span></td>
               <td className="align-middle"></td>
             </tr>
          </tfoot>
        </table>

        {/* 5. Footer Notes */}
        <div className="border border-slate-300 rounded-sm p-4 text-xs text-slate-600 bg-white">
          <h4 className="font-bold mb-2 text-slate-800"><span className="lift-text">[ 특이사항 및 결제정보 ]</span></h4>
          <ul className="list-disc pl-4 space-y-1">
            <li><span className="lift-text">위 금액은 부가가치세(VAT)가 포함되지 않은 금액일 경우, 세금계산서 발행 시 10%가 별도 부과됩니다. (상단 합계는 포함 기준)</span></li>
            <li><span className="lift-text">작업 진행 후 취소 시 공정률에 따라 위약금이 발생할 수 있습니다.</span></li>
            <li><span className="lift-text">입금계좌: <strong>OO은행 123-456-7890 예금주: 인쇄마스터</strong></span></li>
          </ul>
        </div>

        <div className="mt-16 text-center text-slate-400 text-xs">
          <span className="lift-text">Thank you for your business. | EzPrintWork System</span>
        </div>
      </div>
    </>
  );
};
