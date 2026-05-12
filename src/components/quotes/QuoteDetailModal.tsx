import React, { useState, useEffect } from 'react';
import { Quote, JobSpecs } from '../../types';
import { calculateEstimate, EstimateResult } from '../../services/dataService';
import { X, FileText, User, DollarSign, Calendar, CheckCircle, Calculator, ChevronDown, ChevronUp, Briefcase, Zap, Percent, Printer, Save, Trash2, ArrowRight, Eye } from 'lucide-react';
import { useDialog } from '../../contexts/DialogContext';
import { QuotePreviewModal } from './QuotePreviewModal';

interface QuoteDetailModalProps {
  quote: Quote;
  onClose: () => void;
  onUpdate: (quote: Quote) => void;
  onDelete: (id: string) => void;
}

const PAPER_TYPES = ['스노우지', '아트지', '모조지', '랑데뷰', '아르떼', '크라프트지', 'NCR지'];

// Dynamic Weights
const STANDARD_WEIGHTS = ['80g', '100g', '120g', '150g', '180g', '200g', '250g', '300g'];
const PREMIUM_WEIGHTS = ['90g', '105g', '130g', '160g', '190g', '210g', '240g']; // 랑데뷰, 아르떼

const PRINT_SIZES = ['A4', 'A3', 'A5', 'B4', 'B5', '명함(90x50)', '엽서(100x150)', 'A2', '규격외'];
const PRINT_COLORS = ['단면 4도(컬러)', '양면 8도(컬러)', '단면 1도(흑백)', '양면 2도(흑백)', '별색 1도'];
const PROCESSINGS = ['무광코팅', '유광코팅', '오시', '미싱', '접지', '제본', '박가공'];

const CLIENT_TIERS = [
  { label: '일반 고객', discount: 0, color: 'bg-slate-100 text-slate-600' },
  { label: '협력업체 (10%)', discount: 0.1, color: 'bg-blue-100 text-blue-700' },
  { label: 'VIP (20%)', discount: 0.2, color: 'bg-purple-100 text-purple-700' },
  { label: '지인/가족 (30%)', discount: 0.3, color: 'bg-emerald-100 text-emerald-700' },
];

const PRESETS = [
    { name: '일반 명함', specs: { paperType: '스노우지', paperWeight: '250g', size: '명함(90x50)', printColor: '양면 8도(컬러)', quantity: '500매', processing: ['무광코팅'] } },
    { name: '전단지 A4', specs: { paperType: '아트지', paperWeight: '100g', size: 'A4', printColor: '단면 4도(컬러)', quantity: '4000매', processing: [] } },
    { name: '리플렛 A4 (3단)', specs: { paperType: '스노우지', paperWeight: '150g', size: 'A4', printColor: '양면 8도(컬러)', quantity: '1000매', processing: ['접지', '오시'] } },
    { name: '봉투 (대)', specs: { paperType: '모조지', paperWeight: '120g', size: '규격외', printColor: '단면 1도(흑백)', quantity: '1000매', processing: [] } },
];

export const QuoteDetailModal: React.FC<QuoteDetailModalProps> = ({ quote, onClose, onUpdate, onDelete }) => {
  const [editedQuote, setEditedQuote] = useState<Quote>(quote);
  const [showPreview, setShowPreview] = useState(false);
  const { showConfirm } = useDialog();
  
  // Smart Calculator State
  const [specs, setSpecs] = useState<JobSpecs>({
      paperType: '스노우지',
      paperWeight: '250g',
      size: 'A4',
      quantity: '500매',
      processing: [],
      printColor: '양면 8도(컬러)',
      memo: ''
  });
  
  const [estimate, setEstimate] = useState<EstimateResult>({
      paperCost: 0, printCost: 0, processingCost: 0, totalCost: 0, recommendedPrice: 0
  });

  const [marginRate, setMarginRate] = useState(1.6); // 1.6 = 60% Margin
  const [selectedTierIndex, setSelectedTierIndex] = useState(0);
  const [manualOverridePrice, setManualOverridePrice] = useState<number | null>(null);

  // Initialize specs from quote items string if possible (simple parsing for now, or default)
  useEffect(() => {
     // In a real app, quote.items would be JSON. Here we just init with defaults or previous values if we could parse them.
     // For this demo, we start with defaults or presets.
  }, []);

  // Recalculate whenever specs or margin change
  useEffect(() => {
    const result = calculateEstimate(specs, marginRate);
    setEstimate(result);
  }, [specs, marginRate]);

  // Determine available weights based on current paper type
  const availableWeights = ['랑데뷰', '아르떼'].includes(specs.paperType) 
    ? PREMIUM_WEIGHTS 
    : STANDARD_WEIGHTS;

  // Update final price based on Tier Discount
  const finalCalculatedPrice = Math.round(estimate.recommendedPrice * (1 - CLIENT_TIERS[selectedTierIndex].discount) / 100) * 100;
  const displayPrice = manualOverridePrice !== null ? manualOverridePrice : finalCalculatedPrice;

  const handleSave = () => {
    // Generate a descriptive string for the 'items' field
    const processingStr = specs.processing.length > 0 ? ` / ${specs.processing.join(', ')}` : '';
    const desc = `[${specs.paperType} ${specs.paperWeight}] ${specs.size} / ${specs.quantity} / ${specs.printColor}${processingStr}`;
    
    onUpdate({
        ...editedQuote,
        items: desc,
        totalAmount: displayPrice
    });
  };

  const applyPreset = (preset: any) => {
      setSpecs({
          ...specs,
          ...preset.specs
      });
      setManualOverridePrice(null); // Reset manual override
  };

  const toggleProcessing = (proc: string) => {
      if (specs.processing.includes(proc)) {
          setSpecs({...specs, processing: specs.processing.filter(p => p !== proc)});
      } else {
          setSpecs({...specs, processing: [...specs.processing, proc]});
      }
  };

  const handleDelete = async () => {
    if (await showConfirm('정말 이 견적서를 삭제하시겠습니까?')) {
      onDelete(quote.id);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[90vh]">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 flex-none">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 text-white p-2 rounded-lg">
                  <Calculator size={24} />
              </div>
              <div>
                  <h2 className="text-xl font-bold text-slate-800">스마트 견적 산출 시스템</h2>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                      <span>견적번호: {quote.id}</span>
                      <span>•</span>
                      <span>{new Date(quote.date).toLocaleDateString()}</span>
                  </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X size={24} className="text-slate-500" />
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
              {/* Left Column: Inputs */}
              <div className="w-1/2 overflow-y-auto p-6 border-r border-slate-200 bg-white custom-scrollbar">
                  
                  {/* 1. Client Info */}
                  <div className="space-y-4 mb-8">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                          <User size={16} className="text-blue-600"/> 고객 정보
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-500">고객/업체명</label>
                              <input 
                                  type="text"
                                  value={editedQuote.clientName}
                                  onChange={(e) => setEditedQuote({...editedQuote, clientName: e.target.value})}
                                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold"
                                  placeholder="고객명 입력"
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-500">할인 등급 적용</label>
                              <select 
                                  value={selectedTierIndex}
                                  onChange={(e) => setSelectedTierIndex(Number(e.target.value))}
                                  className={`w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold cursor-pointer outline-none ${CLIENT_TIERS[selectedTierIndex].color}`}
                              >
                                  {CLIENT_TIERS.map((tier, idx) => (
                                      <option key={idx} value={idx}>{tier.label}</option>
                                  ))}
                              </select>
                          </div>
                      </div>
                  </div>

                  {/* 2. Specs Inputs */}
                  <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                              <Briefcase size={16} className="text-blue-600"/> 제작 사양
                          </h3>
                          {/* Quick Presets */}
                          <div className="flex gap-1">
                              {PRESETS.map((preset, idx) => (
                                  <button 
                                      key={idx}
                                      onClick={() => applyPreset(preset)}
                                      className="px-2 py-1 text-[10px] bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 rounded border border-slate-200 font-bold transition-colors"
                                  >
                                      {preset.name}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-500">용지 종류</label>
                              <select 
                                  value={specs.paperType}
                                  onChange={(e) => setSpecs({...specs, paperType: e.target.value})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                              >
                                  {PAPER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                          </div>
                          <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-500">평량 (두께)</label>
                              <select 
                                  value={specs.paperWeight}
                                  onChange={(e) => setSpecs({...specs, paperWeight: e.target.value})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                              >
                                  {availableWeights.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                          </div>
                          <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-500">규격 (사이즈)</label>
                              <select 
                                  value={specs.size}
                                  onChange={(e) => setSpecs({...specs, size: e.target.value})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                              >
                                  {PRINT_SIZES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                          </div>
                          <div className="space-y-1">
                              <label className="text-xs font-semibold text-slate-500">인쇄 도수</label>
                              <select 
                                  value={specs.printColor}
                                  onChange={(e) => setSpecs({...specs, printColor: e.target.value})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                              >
                                  {PRINT_COLORS.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                          </div>
                          <div className="col-span-2 space-y-1">
                              <label className="text-xs font-semibold text-slate-500">수량 (직접입력)</label>
                              <input 
                                  type="text"
                                  value={specs.quantity}
                                  onChange={(e) => setSpecs({...specs, quantity: e.target.value})}
                                  className="w-full p-2 border border-slate-300 rounded-lg text-sm font-bold"
                                  placeholder="예: 500매, 10건"
                              />
                          </div>
                      </div>
                  </div>

                  {/* 3. Processing */}
                  <div className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                          <Zap size={16} className="text-blue-600"/> 후가공 선택
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                          {PROCESSINGS.map(proc => (
                              <label key={proc} className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer transition-colors ${specs.processing.includes(proc) ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                                  <input 
                                      type="checkbox"
                                      checked={specs.processing.includes(proc)}
                                      onChange={() => toggleProcessing(proc)}
                                      className="rounded text-blue-600 focus:ring-blue-500"
                                  />
                                  {proc}
                              </label>
                          ))}
                      </div>
                  </div>
              </div>

              {/* Right Column: Calculation Result (Receipt Style) */}
              <div className="w-1/2 bg-slate-50 p-6 flex flex-col border-l border-slate-200 shadow-inner">
                  <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col relative overflow-hidden">
                      {/* Decorative Receipt Header */}
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400"></div>
                      
                      <h3 className="text-lg font-bold text-slate-800 mb-6 flex justify-between items-center">
                          <span>견적 산출 내역서</span>
                          <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded">Auto-Calculated</span>
                      </h3>

                      {/* Breakdown List */}
                      <div className="space-y-3 flex-1 text-sm">
                          <div className="flex justify-between items-center text-slate-600">
                              <span>용지 비용 (Paper)</span>
                              <span className="font-mono">{estimate.paperCost.toLocaleString()} 원</span>
                          </div>
                          <div className="flex justify-between items-center text-slate-600">
                              <span>인쇄 비용 (Print)</span>
                              <span className="font-mono">{estimate.printCost.toLocaleString()} 원</span>
                          </div>
                          <div className="flex justify-between items-center text-slate-600">
                              <span>후가공 비용 (Processing)</span>
                              <span className="font-mono">{estimate.processingCost.toLocaleString()} 원</span>
                          </div>
                          
                          <div className="my-4 border-t border-dashed border-slate-300"></div>
                          
                          <div className="flex justify-between items-center text-slate-800 font-bold">
                              <span>제작 원가 합계 (Cost)</span>
                              <span className="font-mono">{estimate.totalCost.toLocaleString()} 원</span>
                          </div>
                      </div>

                      {/* Margin Control */}
                      <div className="mt-6 pt-6 border-t border-slate-200">
                          <div className="flex justify-between items-center mb-2">
                              <label className="text-xs font-bold text-slate-500 flex items-center gap-1">
                                  <Percent size={12}/> 마진율 조정 ({(marginRate * 100 - 100).toFixed(0)}%)
                              </label>
                              <span className="text-xs text-blue-600 font-bold">권장 공급가: {estimate.recommendedPrice.toLocaleString()}원</span>
                          </div>
                          <input 
                              type="range"
                              min="1.1"
                              max="3.0"
                              step="0.1"
                              value={marginRate}
                              onChange={(e) => setMarginRate(parseFloat(e.target.value))}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                          />
                      </div>

                      {/* Final Price Block */}
                      <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                          {/* Tier Discount Info */}
                          {CLIENT_TIERS[selectedTierIndex].discount > 0 && (
                              <div className="flex justify-between items-center mb-2 text-xs text-red-500 font-medium">
                                  <span>{CLIENT_TIERS[selectedTierIndex].label} 할인 적용</span>
                                  <span>- {(estimate.recommendedPrice * CLIENT_TIERS[selectedTierIndex].discount).toLocaleString()} 원</span>
                              </div>
                          )}

                          <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-bold text-slate-700">최종 견적 금액</span>
                              <button 
                                  onClick={() => setManualOverridePrice(null)}
                                  className={`text-[10px] underline ${manualOverridePrice ? 'text-red-500' : 'text-slate-400 invisible'}`}
                              >
                                  자동계산 복귀
                              </button>
                          </div>
                          
                          <div className="flex items-center gap-2">
                              <input 
                                  type="number"
                                  value={displayPrice}
                                  onChange={(e) => setManualOverridePrice(Number(e.target.value))}
                                  className="w-full text-right text-2xl font-extrabold text-blue-700 bg-transparent border-b-2 border-blue-200 focus:border-blue-600 focus:outline-none p-1"
                              />
                              <span className="text-lg font-bold text-slate-700">원</span>
                          </div>
                          <div className="text-right text-xs text-slate-400 mt-1">
                              (부가세 별도)
                          </div>
                      </div>
                  </div>

                  {/* Footer Buttons */}
                  <div className="mt-4 space-y-3">
                      <div className="flex gap-2">
                          <button 
                              onClick={() => setShowPreview(true)}
                              className="w-full py-2.5 bg-slate-800 text-white rounded-lg font-bold hover:bg-slate-900 shadow-sm transition-colors flex items-center justify-center gap-2"
                          >
                              <Eye size={18} /> 견적서 보기
                          </button>
                      </div>
                      
                      <div className="flex gap-2">
                          <button 
                              onClick={handleDelete}
                              className="p-3 text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-100 transition-colors"
                              title="삭제"
                          >
                              <Trash2 size={20} />
                          </button>
                          <button 
                              onClick={onClose}
                              className="flex-1 py-3 bg-white text-slate-600 font-bold border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                              취소
                          </button>
                          <button 
                              onClick={handleSave}
                              className="flex-[2] py-3 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
                          >
                              <Save size={18} />
                              저장
                          </button>
                      </div>
                  </div>
              </div>
          </div>
        </div>
      </div>

      {showPreview && (
          <QuotePreviewModal 
              quote={{
                  ...editedQuote,
                  items: `[${specs.paperType} ${specs.paperWeight}] ${specs.size} / ${specs.quantity} / ${specs.printColor}${specs.processing.length > 0 ? ` / ${specs.processing.join(', ')}` : ''}`,
                  totalAmount: displayPrice
              }}
              onClose={() => setShowPreview(false)}
          />
      )}
    </>
  );
};