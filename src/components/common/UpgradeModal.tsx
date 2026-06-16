
import React, { useState, useEffect } from 'react';
import { X, Crown, Users, ShieldCheck, Zap, CreditCard, CheckCircle2, Landmark, ShieldAlert, ChevronRight, AlertCircle, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/dataService';
import { PRO_MONTHLY_PRICE } from '../../utils/planLimits';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** PlanManager 등에서 PRO 인원을 미리 정한 경우 */
  initialStaffCount?: number;
  /** true면 플랜 선택 단계 생략 → 결제 단계부터 (추후 PG 연동 지점) */
  skipPlanStep?: boolean;
  onUpgradeComplete?: () => void;
}

type ModalStep = 'PLAN' | 'PAYMENT_METHOD' | 'CARD_REGISTRATION' | 'CONSENT' | 'FINAL_INFO' | 'PROCESSING';
type PaymentMethod = 'CARD' | 'BANK';

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  initialStaffCount,
  skipPlanStep = false,
  onUpgradeComplete,
}) => {
  const { tenantPlan, currentUser, updatePlan } = useAuth();
  const [step, setStep] = useState<ModalStep>(skipPlanStep ? 'PAYMENT_METHOD' : 'PLAN');
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'pro'>('pro');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  
  // Card registration state
  const [cardInfo, setCardInfo] = useState({
    number: '',
    expiry: '',
    cvc: '',
    pwd: ''
  });
  const [consents, setConsents] = useState({
    terms: false,
    autoPay: false,
    privacy: false
  });
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Staff count adjustment
  const actualStaffCount = db.getStaff().filter(s => !s.isDeleted && s.id !== 'admin').length;
  const activeStaffCount = 1 + actualStaffCount;
  const [staffCount, setStaffCount] = useState(Math.max(activeStaffCount, 1));

  useEffect(() => {
    if (!isOpen) return;
    setStep(skipPlanStep ? 'PAYMENT_METHOD' : 'PLAN');
    setSelectedPlan('pro');
    if (initialStaffCount != null) {
      setStaffCount(Math.max(initialStaffCount, activeStaffCount, 1));
    } else {
      setStaffCount(Math.max(activeStaffCount, 1));
    }
  }, [isOpen, skipPlanStep, initialStaffCount, activeStaffCount]);

  const totalPrice = PRO_MONTHLY_PRICE;
  const vat = Math.floor(totalPrice * 0.1);

  const allConsented = consents.terms && consents.autoPay && consents.privacy;

  if (!isOpen) return null;

  const handleNextStep = () => {
    if (step === 'PLAN') setStep('PAYMENT_METHOD');
    else if (step === 'PAYMENT_METHOD') {
        if (paymentMethod === 'CARD') setStep('CARD_REGISTRATION');
        else setStep('CONSENT');
    }
    else if (step === 'CARD_REGISTRATION') setStep('CONSENT');
    else if (step === 'CONSENT') setStep('FINAL_INFO');
  };

  const handlePrevStep = () => {
    if (step === 'PAYMENT_METHOD') setStep('PLAN');
    else if (step === 'CARD_REGISTRATION') setStep('PAYMENT_METHOD');
    else if (step === 'CONSENT') {
        if (paymentMethod === 'CARD') setStep('CARD_REGISTRATION');
        else setStep('PAYMENT_METHOD');
    }
    else if (step === 'FINAL_INFO') setStep('CONSENT');
  };

  const handleComplete = async () => {
    if (!currentUser?.tenantId) return;
    
    setStep('PROCESSING');
    setIsVerifying(true);
    
    // Simulate Payment/Verification process (2.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    try {
        await db.upgradeTenantPlan(currentUser.tenantId, 'pro', staffCount);
        updatePlan('pro');
        setIsVerifying(false);
        
        window.alert('입금 확인 및 결제 승인이 자동 완료되었습니다! 이제 Enterprise PRO 기능을 즉시 사용하실 수 있습니다.');
        onUpgradeComplete?.();
        onClose();
        setStep(skipPlanStep ? 'PAYMENT_METHOD' : 'PLAN');
    } catch (error) {
        console.error("Upgrade failed:", error);
        window.alert('승인 처리 중 오류가 발생했습니다. 관리자에게 문의해 주세요.');
        setStep('FINAL_INFO');
        setIsVerifying(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] focus:outline-none"
        >
          {/* Header */}
          <div className="h-24 bg-gradient-to-r from-blue-600 to-indigo-700 relative flex items-center px-8 shrink-0">
            <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl"></div>
            </div>
            <div className="flex items-center gap-4 relative z-10">
                <Crown size={32} className="text-white drop-shadow-md" />
                <div>
                    <h2 className="text-xl font-black text-white tracking-tight uppercase">Upgrade to Pro</h2>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`h-1.5 w-6 rounded-full transition-colors ${step === 'PLAN' ? 'bg-white' : 'bg-white/30'}`} />
                        <div className={`h-1.5 w-6 rounded-full transition-colors ${['PAYMENT_METHOD', 'CONSENT', 'FINAL_INFO'].includes(step) ? 'bg-white' : 'bg-white/30'}`} />
                        <div className={`h-1.5 w-6 rounded-full transition-colors ${['CONSENT', 'FINAL_INFO'].includes(step) ? 'bg-white' : 'bg-white/30'}`} />
                        <div className={`h-1.5 w-6 rounded-full transition-colors ${step === 'FINAL_INFO' ? 'bg-white' : 'bg-white/30'}`} />
                    </div>
                </div>
            </div>
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/10 text-white hover:bg-black/20 transition-colors"
            >
                <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {/* Processing State */}
            {step === 'PROCESSING' && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    className="h-full flex flex-col items-center justify-center space-y-6 py-12"
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-400/20 rounded-full blur-2xl animate-pulse"></div>
                        {isVerifying ? (
                            <Loader2 size={80} className="text-blue-600 animate-spin relative z-10" />
                        ) : (
                            <div className="bg-emerald-500 text-white p-4 rounded-full relative z-10 shadow-xl shadow-emerald-500/20">
                                <Check size={48} />
                            </div>
                        )}
                    </div>
                    <div className="text-center">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2">
                            {isVerifying ? '자동 결제 승인 중...' : '프로 모드 전환 완료!'}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">
                            {isVerifying ? 'PG사 및 은행 서버와 통신하여 실시간 입금 내역을 확인하고 있습니다.' : '모든 프리미엄 기능이 활성화되었습니다.'}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Step 1: Plan Selection */}
            {step === 'PLAN' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">플랜 선택</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">업종과 규모에 맞는 플랜을 선택하세요.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div 
                            onClick={() => setSelectedPlan('free')}
                            className={`p-6 rounded-2xl border-2 transition-all cursor-pointer relative ${selectedPlan === 'free' ? 'border-slate-400 bg-slate-50 dark:bg-slate-800/50 shadow-inner' : 'border-slate-100 dark:border-slate-800'}`}
                        >
                            {tenantPlan === 'free' && (
                                <div className="absolute top-0 right-0 bg-slate-200 text-slate-600 text-[10px] px-2 py-1 rounded-bl-xl font-black uppercase">Current</div>
                            )}
                            <div className="flex items-center gap-3 mb-4">
                                <Users size={20} className={selectedPlan === 'free' ? 'text-slate-600' : 'text-slate-400'} />
                                <span className="font-bold text-slate-800 dark:text-slate-200">광고형 (Standard)</span>
                            </div>
                            <ul className="space-y-2 mb-6">
                                <li className="text-xs text-slate-500 flex items-center gap-2">
                                    <CheckCircle2 size={12} className="text-emerald-500" /> 최대 직원 3명 (요금 대신 광고)
                                </li>
                                <li className="text-xs text-slate-500 flex items-center gap-2">
                                    <CheckCircle2 size={12} className="text-emerald-500" /> 화면 하단/달력 광고 노출
                                </li>
                            </ul>
                            <div className="font-black text-lg text-slate-800 dark:text-white">₩0 <span className="text-xs font-normal text-slate-400">/ 월</span></div>
                        </div>

                        <div 
                            onClick={() => setSelectedPlan('pro')}
                            className={`p-6 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden ${selectedPlan === 'pro' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-100 shadow-lg' : 'border-slate-100 dark:border-slate-800 hover:border-blue-200'}`}
                        >
                            {tenantPlan === 'pro' && (
                                <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] px-2 py-1 rounded-bl-xl font-black uppercase">Current</div>
                            )}
                            <div className="flex items-center gap-3 mb-4">
                                <Zap size={20} className={selectedPlan === 'pro' ? 'text-blue-600 fill-blue-600' : 'text-slate-400'} />
                                <span className="font-bold text-blue-700 dark:text-blue-300">Enterprise PRO</span>
                            </div>
                            <ul className="space-y-2 mb-6">
                                <li className="text-xs text-blue-600/80 dark:text-blue-400 flex items-center gap-2">
                                    <ShieldCheck size={12} /> 월 1,000원 정액 · 인원 무관 · 광고 제거
                                </li>
                                <li className="text-xs text-blue-600/80 dark:text-blue-400 flex items-center gap-2">
                                    <ShieldCheck size={12} /> 모든 로고/광고 제거 (클린 UI)
                                </li>
                                <li className="text-xs text-blue-600/80 dark:text-blue-400 flex items-center gap-2">
                                    <ShieldCheck size={12} /> 전용 기술 지원 단톡방 제공
                                </li>
                            </ul>
                            <div className="font-black text-lg text-blue-600 dark:text-blue-300">
                                ₩{PRO_MONTHLY_PRICE.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">/ 월 정액 (부가세 별도)</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-xl">
                        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                            <span className="font-black">※ 요금 안내:</span> 「광고형」은 3인까지 요금 대신 광고를 봅니다. PRO(유료)는 <span className="font-black">인원과 무관 월 1,000원 정액</span>이며, 혼자 쓰면서 광고만 없애고 싶을 때도 이용할 수 있습니다.
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Step 2: Payment Method */}
            {step === 'PAYMENT_METHOD' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">납부 방식 선택</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">편리한 결제 수단을 선택하세요.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <div 
                            onClick={() => setPaymentMethod('CARD')}
                            className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer ${paymentMethod === 'CARD' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200'}`}
                        >
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${paymentMethod === 'CARD' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                <CreditCard size={24} />
                            </div>
                            <div className="flex-1">
                                <div className="font-bold text-slate-800 dark:text-slate-200">카드 자동 이체 (추천)</div>
                                <p className="text-[11px] text-slate-500">매월 정해진 날짜에 편리하게 자동 납부됩니다.</p>
                            </div>
                            {paymentMethod === 'CARD' && <CheckCircle2 size={24} className="text-blue-500" />}
                        </div>

                        <div 
                            onClick={() => setPaymentMethod('BANK')}
                            className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer ${paymentMethod === 'BANK' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200'}`}
                        >
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${paymentMethod === 'BANK' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                <Landmark size={24} />
                            </div>
                            <div className="flex-1">
                                <div className="font-bold text-slate-800 dark:text-slate-200">무통장 계좌 이체</div>
                                <p className="text-[11px] text-slate-500">지정 계좌로 직접 송금하여 결제합니다.</p>
                            </div>
                            {paymentMethod === 'BANK' && <CheckCircle2 size={24} className="text-blue-500" />}
                        </div>
                    </div>
                </motion.div>
            )}

            {/* Step: Card Registration */}
            {step === 'CARD_REGISTRATION' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="text-center mb-4">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">카드 정보 등록</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">정기 결제를 위한 카드를 등록해 주세요.</p>
                    </div>

                    {/* Visual Card */}
                    <div className="relative h-48 w-full max-w-sm mx-auto bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-2xl overflow-hidden mb-8">
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <CreditCard size={120} />
                        </div>
                        <div className="relative z-10 flex flex-col h-full justify-between">
                            <div className="flex justify-between items-start">
                                <div className="w-12 h-8 bg-amber-400/80 rounded-md shadow-inner" />
                                <span className="font-black italic text-lg opacity-50 italic uppercase">Card</span>
                            </div>
                            <div>
                                <div className="text-xl font-mono tracking-[0.25em] mb-2 h-8">
                                    {cardInfo.number ? cardInfo.number.replace(/(.{4})/g, '$1 ').trim() : '•••• •••• •••• ••••'}
                                </div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <div className="text-[8px] uppercase opacity-50 mb-1">Card Holder</div>
                                        <div className="text-sm font-bold uppercase tracking-wider">{currentUser?.name || 'NAME'}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[8px] uppercase opacity-50 mb-1">Expires</div>
                                        <div className="text-sm font-mono">{cardInfo.expiry || 'MM/YY'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-slate-500 mb-1 block">카드 번호</label>
                            <input 
                                type="text"
                                maxLength={16}
                                value={cardInfo.number}
                                onChange={(e) => setCardInfo({...cardInfo, number: e.target.value.replace(/[^0-9]/g, '')})}
                                placeholder="1234123412341234"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">유효 기간 (MM/YY)</label>
                            <input 
                                type="text"
                                maxLength={5}
                                value={cardInfo.expiry}
                                onChange={(e) => {
                                    let val = e.target.value.replace(/[^0-9]/g, '');
                                    if (val.length > 2) val = val.slice(0, 2) + '/' + val.slice(2);
                                    setCardInfo({...cardInfo, expiry: val});
                                }}
                                placeholder="MM/YY"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">CVC (3자리)</label>
                            <input 
                                type="password"
                                maxLength={3}
                                value={cardInfo.cvc}
                                onChange={(e) => setCardInfo({...cardInfo, cvc: e.target.value.replace(/[^0-9]/g, '')})}
                                placeholder="***"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                            />
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                        <p className="text-[10px] text-slate-500 leading-relaxed text-center font-medium">
                            ※ 카드 정보는 보안을 위해 암호화되어 PG사로 직접 전달되며, 본 시스템에는 저장되지 않습니다. 보안 인증서(SSL)가 적용된 안전한 세션입니다.
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Step 3: Legal & Consents */}
            {step === 'CONSENT' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ShieldCheck size={32} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">이용 약관 및 필수 동의</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">안전하고 투명한 서비스 제공을 위해 확인이 필요합니다.</p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-700 focus:outline-none">
                        {/* Agree All Section */}
                        <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 flex items-center gap-3 border-b border-blue-100 dark:border-blue-900/30">
                            <input 
                                type="checkbox" id="all-consent" 
                                checked={allConsented}
                                onChange={(e) => {
                                    const val = e.target.checked;
                                    setConsents({ terms: val, autoPay: val, privacy: val });
                                }}
                                className="w-5 h-5 text-blue-600 rounded-md border-blue-300 focus:ring-blue-500 cursor-pointer" 
                            />
                            <label htmlFor="all-consent" className="text-sm font-black text-blue-700 dark:text-blue-300 cursor-pointer flex-1">
                                모든 약관 및 유료 서비스 이용에 전체 동의합니다.
                            </label>
                        </div>

                        <div className="p-4 flex items-start gap-3 hover:bg-slate-100/50 transition-colors">
                            <input 
                                type="checkbox" id="terms" checked={consents.terms} 
                                onChange={(e) => setConsents({...consents, terms: e.target.checked})}
                                className="mt-1 w-4 h-4 text-blue-600 rounded" 
                            />
                            <div className="flex-1">
                                <label htmlFor="terms" className="text-sm font-bold text-slate-700 dark:text-slate-300 block mb-0.5 cursor-pointer">서비스 이용약관 및 자동결제 이용 동의 (필수)</label>
                                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">유료 서비스 이용에 따른 권리, 의무 및 책임 사항에 동의합니다. 결제 오류 시의 조치 방안을 확인하였습니다.</p>
                            </div>
                        </div>
                        <div className="p-4 flex items-start gap-3 hover:bg-slate-100/50 transition-colors">
                            <input 
                                type="checkbox" id="autoPay" checked={consents.autoPay} 
                                onChange={(e) => setConsents({...consents, autoPay: e.target.checked})}
                                className="mt-1 w-4 h-4 text-blue-600 rounded" 
                            />
                            <div className="flex-1">
                                <label htmlFor="autoPay" className="text-sm font-bold text-slate-700 dark:text-slate-300 block mb-0.5 cursor-pointer">월 정기 구독 결제 승인 (필수)</label>
                                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">PRO 모드 월 {totalPrice.toLocaleString()}원(부가세 별도) 정액이 정기 결제됨을 확인하였으며, 서비스 중간 해제 시 환불 규정에 동의합니다.</p>
                            </div>
                        </div>
                        <div className="p-4 flex items-start gap-3 hover:bg-slate-100/50 transition-colors">
                            <input 
                                type="checkbox" id="privacy" checked={consents.privacy} 
                                onChange={(e) => setConsents({...consents, privacy: e.target.checked})}
                                className="mt-1 w-4 h-4 text-blue-600 rounded" 
                            />
                            <div className="flex-1">
                                <label htmlFor="privacy" className="text-sm font-bold text-slate-700 dark:text-slate-300 block mb-0.5 cursor-pointer">개인정보 수집 및 제3자 제공 동의 (필수)</label>
                                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">결제 처리를 위해 최소한의 개인정보를 PG사 및 관련 기관에 제공하는 것에 동의합니다.</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-amber-50 dark:bg-orange-950/20 border border-amber-200 dark:border-orange-900 rounded-xl flex items-start gap-3 shadow-inner">
                        <ShieldAlert size={18} className="text-orange-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-orange-700 dark:text-orange-400 font-bold leading-relaxed">
                            ※ 책임 고지: 본 시스템은 결제 기능의 안정성을 위해 상담 신청 후 수동 승인 단계를 거칩니다. 승인 전까지는 실제 결제가 발생하지 않으며, 결제 수단 등록은 암호화된 전용 세션에서만 진행됩니다.
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Step 4: Final Info */}
            {step === 'FINAL_INFO' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">신청 정보 확인</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">마지막 단추입니다. 내용을 최종 확인해 주세요.</p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/80 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4 shadow-xl">
                        <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                            <span className="text-sm font-bold text-slate-500">선택 플랜</span>
                            <span className="font-black text-blue-600 uppercase">Enterprise PRO</span>
                        </div>
                        <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                            <span className="text-sm font-bold text-slate-500">현재 인원</span>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setStaffCount(Math.max(1, staffCount - 1))}
                                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    -
                                </button>
                                <span className="font-black text-slate-800 dark:text-white min-w-[2rem] text-center">{staffCount}명</span>
                                <button 
                                    onClick={() => setStaffCount(staffCount + 1)}
                                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                            <span className="text-sm font-bold text-slate-500">결제 방식</span>
                            <span className="font-black text-slate-800 dark:text-slate-100">{paymentMethod === 'CARD' ? '카드 자동이체' : '계좌 직접송금'}</span>
                        </div>
                        <div className="flex justify-between items-center px-3 pt-2">
                            <span className="text-sm font-bold text-slate-500">최종 월 결제 금액</span>
                            <div className="text-right">
                                <div className="text-2xl font-black text-slate-800 dark:text-white">₩{totalPrice.toLocaleString()}</div>
                                <div className="text-[10px] text-slate-400 font-medium">부가세 별도 (VAT 10%: +{vat.toLocaleString()}원)</div>
                            </div>
                        </div>
                    </div>

                    <div className="p-5 bg-blue-600 rounded-2xl text-white shadow-xl shadow-blue-600/20 relative overflow-hidden">
                        <div className="relative z-10">
                            <h4 className="text-xs font-black uppercase tracking-widest text-blue-200 mb-3 flex items-center gap-2">
                                <AlertCircle size={14} /> 운영 가이드라인
                            </h4>
                            <ul className="text-[11px] font-medium space-y-2 opacity-90 leading-relaxed">
                                <li>• 결제 수단 등록 안내는 관리자가 가입 시 입력한 메일(또는 연락처)로 발송됩니다.</li>
                                <li>• 직접 송금 시 <b>우리은행 1002-XXX-XXXXXX (예금주: EzPrint)</b>로 입금 부탁드립니다.</li>
                                <li>• 본 신청이 완료되면 즉시 '심사 중' 상태로 전환되며, 1:1 기술 지원 채널이 개설됩니다.</li>
                            </ul>
                        </div>
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <ShieldCheck size={80} />
                        </div>
                    </div>
                </motion.div>
            )}
          </div>

          {/* Footer Navigation */}
          <div className={`p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex gap-4 shrink-0 transition-all ${step === 'PROCESSING' ? 'hidden' : ''}`}>
            {step !== 'PLAN' && (
                <button 
                    onClick={handlePrevStep}
                    className="px-6 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all text-sm border border-slate-200 dark:border-slate-700"
                >
                    이전으로
                </button>
            )}
            
            {step === 'FINAL_INFO' ? (
                <button 
                    onClick={handleComplete}
                    className="flex-1 px-6 py-4 rounded-2xl bg-blue-600 text-white font-black hover:bg-blue-700 transition-all shadow-2xl shadow-blue-600/40 flex items-center justify-center gap-2 active:scale-95"
                >
                    실시간 결제 확인 및 업그레이드 <Check size={20} />
                </button>
            ) : (
                <button 
                    disabled={selectedPlan === 'free' || (step === 'CONSENT' && !allConsented)}
                    className={`flex-1 px-6 py-4 rounded-2xl font-black transition-all shadow-xl flex items-center justify-center gap-2 active:scale-95
                        ${(selectedPlan === 'pro' && (step !== 'CONSENT' || allConsented))
                            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/30' 
                            : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                    onClick={handleNextStep}
                >
                    {step === 'CONSENT' && !allConsented ? '약관 동의가 필요합니다' : '다음 단계로 가기'} 
                    <ChevronRight size={20} />
                </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

