import React, { useState, useEffect } from 'react';
import { Quote, PricingConfig } from '../../types';
import { db, calculateEstimate, EstimateResult } from '../../services/dataService';
import { 
  Calculator, User, Calendar, FileText, Check, X, ShieldCheck, 
  ArrowRight, CreditCard, Tag, PenTool, Printer, Layers, Info
} from 'lucide-react';

interface QuoteDetailModalProps {
  quote: Quote;
  onClose: () => void;
  onUpdate: (quote: Quote) => void;
}

const PREMIUM_PAPERS = ['반누보', '랑데뷰', '아르떼', '휘라레', '띤또레또'];
const STANDARD_PAPERS = ['스노우지(일반)', '아트지', '모조지'];

const PREMIUM_WEIGHTS = ['190g', '210g', '240g', '250g', '310g'];
const STANDARD_WEIGHTS = ['80g', '100g', '120g', '150g', '180g', '250g', '300g'];

const CLIENT_TIERS = [
    { name: '일반 고객', discount: 0, color: 'text-slate-500' },
    { name: '실버 (신규업체)', discount: 0.1, color: 'text-blue-500' },
    { name: '골드 (우수거래처)', discount: 0.2, color: 'text-yellow-600' },
    { name: 'VIP (프랜차이즈)', discount: 0.3, color: 'text-purple-600' }
];

export const QuoteDetailModal: React.FC<QuoteDetailModalProps> = ({ quote, onClose, onUpdate }) => {
  const [editedQuote, setEditedQuote] = useState<Quote>({ ...quote });
  const [specs, setSpecs] = useState({
      paperType: '스노우지(일반)',
      paperWeight: '250g',
      size: 'A4 (210x297)',
      quantity: '500매',
      processing: [] as string[],
      printColor: '양면 8도(컬러)',
      memo: ''
  });
  
  const [estimate, setEstimate] = useState<EstimateResult>({
      paperCost: 0, 
      printCost: 0, 
      processingCost: 0, 
      totalCost: 0, 
      recommendedPrice: 0,
      subtotal: 0,
      tax: 0,
      total: 0,
      details: []
  });

  const [marginRate, setMarginRate] = useState(1.6); // 1.6 = 60% Margin
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const [manualOverridePrice, setManualOverridePrice] = useState<number | null>(null);

  // Recalculate whenever specs change
  useEffect(() => {
    // We pass the global pricing config but we can override margin with local rate
    const config = db.getPricingConfig();
    const result = calculateEstimate(specs, { ...config, marginRate });
    setEstimate(result);
  }, [specs, marginRate]);

  // Update final price based on Tier Discount
  const finalCalculatedPrice = Math.round(estimate.recommendedPrice * (1 - CLIENT_TIERS[selectedTierIndex].discount) / 100) * 100;
  const displayPrice = manualOverridePrice !== null ? manualOverridePrice : finalCalculatedPrice;

  const handleSave = () => {
    const processingStr = specs.processing.length > 0 ? ` / ${specs.processing.join(', ')}` : '';
    const desc = `[${specs.paperType} ${specs.paperWeight}] ${specs.size} / ${specs.quantity} / ${specs.printColor}${processingStr}`;
    
    onUpdate({
        ...editedQuote,
        items: desc,
        totalAmount: displayPrice
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[85vh] flex overflow-hidden border border-slate-200">
          
          {/* Left Column: Spec Configuration */}
          <div className="w-1/2 flex flex-col p-8 bg-white overflow-y-auto">
              <div className="flex items-center gap-4 mb-8">
                  <div className="bg-blue-100 p-3 rounded-2xl text-blue-600">
                    <Calculator size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">지능형 견적 산출기</h2>
                    <p className="text-slate-500 text-sm font-medium">실시간 원가 분석 및 추천 판매가 계산</p>
                  </div>
              </div>

              <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">상호명</label>
                          <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                              <input 
                                  value={editedQuote.clientName}
                                  onChange={e => setEditedQuote({...editedQuote, clientName: e.target.value})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold text-slate-700"
                              />
                          </div>
                      </div>
                      <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">상태</label>
                          <select 
                              value={editedQuote.status}
                              onChange={e => setEditedQuote({...editedQuote, status: e.target.value as any})}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all font-bold text-slate-700 appearance-none"
                          >
                              <option>대기</option>
                              <option>승인</option>
                              <option>거절</option>
                          </select>
                      </div>
                  </div>

                  {/* Paper Specs */}
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                      <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <Layers size={18} className="text-blue-500" /> 용지 및 규격 설정
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 ml-1">용지 종류</label>
                              <select 
                                  value={specs.paperType}
                                  onChange={e => setSpecs({...specs, paperType: e.target.value})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold outline-none"
                              >
                                  <optgroup label="일반지">
                                    {STANDARD_PAPERS.map(p => <option key={p} value={p}>{p}</option>)}
                                  </optgroup>
                                  <optgroup label="수입지/고급지">
                                    {PREMIUM_PAPERS.map(p => <option key={p} value={p}>{p}</option>)}
                                  </optgroup>
                              </select>
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 ml-1">평량 (두께)</label>
                              <select 
                                  value={specs.paperWeight}
                                  onChange={e => setSpecs({...specs, paperWeight: e.target.value})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold outline-none"
                              >
                                  {(PREMIUM_PAPERS.includes(specs.paperType) ? PREMIUM_WEIGHTS : STANDARD_WEIGHTS).map(w => (
                                      <option key={w} value={w}>{w}</option>
                                  ))}
                              </select>
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 ml-1">작업 사이즈</label>
                              <input 
                                  value={specs.size}
                                  onChange={e => setSpecs({...specs, size: e.target.value})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold outline-none"
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 ml-1">수량</label>
                              <input 
                                  value={specs.quantity}
                                  onChange={e => setSpecs({...specs, quantity: e.target.value})}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold outline-none"
                              />
                          </div>
                      </div>
                  </div>

                  {/* Print & Process */}
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                      <h4 className="text-sm font-black text-slate-800 flex items-center gap-2">
                        <Printer size={18} className="text-blue-500" /> 인쇄 및 후가공
                      </h4>
                      <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 ml-1">인쇄 방식/도수</label>
                          <select 
                              value={specs.printColor}
                              onChange={e => setSpecs({...specs, printColor: e.target.value})}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-semibold outline-none"
                          >
                              <option>단면 4도(컬러)</option>
                              <option>양면 8도(컬러)</option>
                              <option>단면 1도(흑백)</option>
                              <option>양면 2도(흑백)</option>
                              <option>단면 무인쇄</option>
                          </select>
                      </div>
                      
                      <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 ml-1">후가공 선택</label>
                          <div className="flex flex-wrap gap-2">
                              {['코팅', '접지', '미싱', '도수', '귀도리', '넘버링'].map(p => (
                                  <button 
                                      key={p}
                                      onClick={() => {
                                          const next = specs.processing.includes(p) 
                                            ? specs.processing.filter(x => x !== p)
                                            : [...specs.processing, p];
                                          setSpecs({...specs, processing: next});
                                      }}
                                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                          specs.processing.includes(p)
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                      }`}
                                  >
                                      {p}
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>

                  {/* Memo */}
                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">특이사항 메모</label>
                    <textarea 
                        value={specs.memo}
                        onChange={e => setSpecs({...specs, memo: e.target.value})}
                        placeholder="박 가공 위치 등 세부 요청 내용을 입력하세요"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[80px]"
                    />
                  </div>
              </div>
          </div>

          {/* Right Column: Calculation Result (Receipt Style) */}
          <div className="w-1/2 bg-slate-100 p-8 flex flex-col border-l border-slate-200">
              <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-xl p-8 flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-400 via-purple-500 to-indigo-600"></div>
                  
                  <div className="text-center mb-8">
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">작업 견적 상세 명세서</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Quotation Breakdown</p>
                  </div>
                  
                  {/* Item Breakdown */}
                  <div className="space-y-4 flex-1 font-medium">
                      <div className="flex justify-between items-center text-slate-600 group">
                          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> 용지 비용</span>
                          <span className="font-mono text-slate-900">{(estimate.paperCost || 0).toLocaleString()} 원</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 group">
                          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> 인쇄 비용</span>
                          <span className="font-mono text-slate-900">{(estimate.printCost || 0).toLocaleString()} 원</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 group">
                          <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div> 후가공 비용</span>
                          <span className="font-mono text-slate-900">{(estimate.processingCost || 0).toLocaleString()} 원</span>
                      </div>
                      
                      <div className="py-4 border-t border-dashed border-slate-200"></div>

                      <div className="flex justify-between items-center text-slate-400 text-xs">
                          <span>합계 원가 (Cost)</span>
                          <span className="font-mono">{(estimate.totalCost || 0).toLocaleString()} 원</span>
                      </div>

                      <div className="space-y-3 pt-6">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block text-center">거래처 할인 등급</label>
                        <div className="flex justify-between gap-1 overflow-x-auto pb-2 no-scrollbar">
                           {CLIENT_TIERS.map((tier, idx) => (
                               <button 
                                  key={tier.name}
                                  onClick={() => setSelectedTierIndex(idx)}
                                  className={`flex-1 min-w-0 px-2 py-2 rounded-xl border text-[10px] font-bold transition-all ${
                                      selectedTierIndex === idx 
                                        ? 'bg-slate-900 border-slate-900 text-white shadow-lg scale-105' 
                                        : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'
                                  }`}
                               >
                                   <div className="truncate">{tier.name}</div>
                                   <div className={selectedTierIndex === idx ? 'text-blue-400' : tier.color}>-{tier.discount * 100}%</div>
                               </button>
                           ))}
                        </div>
                      </div>

                      <div className="mt-8 bg-blue-50 dark:bg-blue-900/10 rounded-2xl p-6 border border-blue-100 dark:border-blue-900/30 text-center relative">
                          <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1">최종 제안 가격</p>
                          <div className="flex items-center justify-center gap-2">
                             <span className="text-3xl font-black text-slate-900 dark:text-white tabular-nums">
                                {displayPrice.toLocaleString()}
                             </span>
                             <span className="font-bold text-slate-500">원</span>
                          </div>
                      </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-8 flex gap-3">
                      <button 
                        onClick={onClose}
                        className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl transition-all flex items-center justify-center gap-2"
                      >
                        <X size={18} /> 취소
                      </button>
                      <button 
                        onClick={handleSave}
                        className="flex-[2] py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl shadow-xl shadow-blue-500/20 transition-all flex items-center justify-center gap-2 group"
                      >
                        <Check size={18} /> 견적 확정 <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};
