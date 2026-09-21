
import React, { useState, useEffect } from 'react';
import { X, Crown, Users, ShieldCheck, Zap, CreditCard, CheckCircle2, Landmark, ShieldAlert, ChevronRight, AlertCircle, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/dataService';
import { AD_TIER_MAX, PRO_MONTHLY_PRICE, countActiveStaffSeats, proMonthlyCharge } from '../../utils/planLimits';
import { createKorpayPayment, openKorpayCheckout } from '../../services/korpayPayment';
import { setPaymentInProgress } from '../../utils/staffSession';
import {
  isMockBillingEnabled,
  isRealBillingEnabled,
  runMockSubscription,
} from '../../services/subscriptionService';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** PlanManager 등에서 PRO 인원을 미리 정한 경우 */
  initialStaffCount?: number;
  /** true면 플랜 선택 단계 생략 → 결제 단계부터 */
  skipPlanStep?: boolean;
  onUpgradeComplete?: () => void;
}

type ModalStep = 'PLAN' | 'PAYMENT_METHOD' | 'CONSENT' | 'FINAL_INFO' | 'PROCESSING';
type PaymentMethod = 'CARD' | 'BANK';

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  initialStaffCount,
  skipPlanStep = false,
  onUpgradeComplete,
}) => {
  const { currentUser, tenantOwnerId } = useAuth();
  const [step, setStep] = useState<ModalStep>(skipPlanStep ? 'PAYMENT_METHOD' : 'PLAN');
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'pro'>('pro');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [consents, setConsents] = useState({
    terms: false,
    autoPay: false,
    privacy: false
  });
  const [isVerifying, setIsVerifying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const activeStaffCount = countActiveStaffSeats(db.getStaff(), tenantOwnerId);
  const [staffCount, setStaffCount] = useState(Math.max(activeStaffCount, 1));

  useEffect(() => {
    if (!isOpen) return;
    setStep(skipPlanStep ? 'PAYMENT_METHOD' : 'PLAN');
    setSelectedPlan('pro');
    setPayError(null);
    setIsVerifying(false);
    if (initialStaffCount != null) {
      setStaffCount(Math.max(initialStaffCount, activeStaffCount, 1));
    } else {
      setStaffCount(Math.max(activeStaffCount, 1));
    }
  }, [isOpen, skipPlanStep, initialStaffCount, activeStaffCount]);

  const { base: totalPrice, vat, total: chargeTotal } = proMonthlyCharge(staffCount);

  const allConsented = consents.terms && consents.autoPay && consents.privacy;

  if (!isOpen) return null;

  const handleNextStep = () => {
    if (step === 'PLAN') setStep('PAYMENT_METHOD');
    else if (step === 'PAYMENT_METHOD') setStep('CONSENT');
    else if (step === 'CONSENT') setStep('FINAL_INFO');
  };

  const handlePrevStep = () => {
    if (step === 'PAYMENT_METHOD') setStep('PLAN');
    else if (step === 'CONSENT') setStep('PAYMENT_METHOD');
    else if (step === 'FINAL_INFO') setStep('CONSENT');
  };

  const handleComplete = async () => {
    if (!currentUser?.tenantId) return;

    if (paymentMethod === 'BANK') {
      window.alert(
        '무통장 입금은 입금 확인 후 관리자가 수동으로 PRO를 활성화합니다.\n신청 내용은 저장되지 않으며, 카드 결제를 이용하면 즉시 활성화됩니다.'
      );
      return;
    }

    setStep('PROCESSING');
    setIsVerifying(true);
    setPayError(null);
    setPaymentInProgress(true);

    try {
      if (isMockBillingEnabled) {
        const order = await runMockSubscription({
          tenantId: currentUser.tenantId,
          event: 'ACTIVATE',
          seats: staffCount,
          amount: chargeTotal,
          consent: {
            terms: consents.terms,
            privacy: consents.privacy,
            recurring: consents.autoPay,
            termsVersion: 'draft-2026-09',
            privacyVersion: 'draft-2026-09',
            recurringVersion: 'draft-2026-09',
          },
        });
        setPaymentInProgress(false);
        setIsVerifying(false);
        window.alert(`모의 결제 완료 (${order.status}) — 실제 카드 청구는 발생하지 않았습니다.`);
        onUpgradeComplete?.();
        onClose();
        return;
      }
      if (!isRealBillingEnabled) {
        throw new Error(
          '실결제는 현재 비활성화되어 있습니다. 공식 빌링 API와 약관 확정 후에만 활성화할 수 있습니다.'
        );
      }
      const { sdkBase, payment } = await createKorpayPayment({
        tenantId: currentUser.tenantId,
        staffCount,
        customerName: currentUser.name || undefined,
        customerEmail: currentUser.email || undefined,
        customerPhone: String((currentUser as { contactInfo?: string }).contactInfo || '').replace(/[^0-9]/g, '') || undefined,
      });

      await openKorpayCheckout(sdkBase, payment, {
        onStart: () => setIsVerifying(true),
        onError: (err) => {
          setPaymentInProgress(false);
          setPayError(err || '결제창 호출에 실패했습니다.');
          setStep('FINAL_INFO');
          setIsVerifying(false);
        },
        onClose: () => {
          // onClose만으로 킥 가드를 바로 끄지 않음 (닫힘 오탐 시 로그인 튕김 방지)
          setStep('FINAL_INFO');
          setIsVerifying(false);
          window.setTimeout(() => setPaymentInProgress(false), 60_000);
        },
      });
      // 승인 성공 시 Functions가 /payment/success 로 리다이렉트
      onUpgradeComplete?.();
    } catch (error) {
      console.error('Korpay payment start failed:', error);
      setPaymentInProgress(false);
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String((error as { message: unknown }).message)
            : '결제 준비 중 오류가 발생했습니다.';
      setPayError(msg);
      window.alert(msg);
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
          className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="p-8 pb-4 flex justify-between items-start shrink-0">
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
                    <Crown size={24} fill="currentColor" />
                </div>
                <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">PRO 업그레이드</h2>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">EzPrintWork Enterprise</p>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400">
              <X size={20} />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-8 py-4 custom-scrollbar">
            {step === 'PROCESSING' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 flex flex-col items-center text-center space-y-6">
                    <div className="relative">
                        <div className="w-24 h-24 border-4 border-blue-100 dark:border-blue-900/30 rounded-full"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 size={48} className="text-blue-600 animate-spin" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">
                            {isVerifying ? '결제창을 여는 중…' : '처리 완료'}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm px-8 leading-relaxed">
                            {isVerifying
                              ? '코페이 안전한 결제창으로 이동합니다. 카드 정보는 PG사에서만 처리됩니다.'
                              : '결제가 완료되면 PRO가 바로 활성화됩니다.'}
                        </p>
                    </div>
                </motion.div>
            )}

            {step === 'PLAN' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white">요금제 선택</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">비즈니스에 맞는 플랜을 선택하세요.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div 
                            onClick={() => setSelectedPlan('pro')}
                            className={`relative p-6 rounded-3xl border-2 transition-all cursor-pointer ${selectedPlan === 'pro' ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200'}`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-2">
                                    <Zap className={selectedPlan === 'pro' ? 'text-blue-600' : 'text-slate-400'} size={20} fill="currentColor" />
                                    <span className="font-black text-lg text-slate-800 dark:text-white">Enterprise PRO</span>
                                </div>
                                {selectedPlan === 'pro' && <div className="bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded-full uppercase">Recommended</div>}
                            </div>
                            <div className="flex items-baseline gap-1 mb-4">
                                <span className="text-3xl font-black text-slate-800 dark:text-white">₩{PRO_MONTHLY_PRICE.toLocaleString()}</span>
                                <span className="text-sm text-slate-500 font-bold">/인·월 (VAT 별도)</span>
                            </div>
                            <ul className="space-y-3">
                                {[
                                    '광고 없는 깔끔한 작업 화면',
                                    '인원 수 자유롭게 확장',
                                    '우선 기술 지원',
                                    '고급 통계 및 백업'
                                ].map((item, i) => (
                                    <li key={i} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 font-medium">
                                        <CheckCircle2 size={16} className="text-blue-500" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div 
                            onClick={() => setSelectedPlan('free')}
                            className={`p-6 rounded-3xl border-2 transition-all cursor-pointer ${selectedPlan === 'free' ? 'border-slate-400 bg-slate-50 dark:bg-slate-800/50' : 'border-slate-100 dark:border-slate-800 opacity-60 hover:opacity-100'}`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Users className="text-slate-400" size={20} />
                                <span className="font-bold text-slate-700 dark:text-slate-200">광고형 (기본)</span>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">최대 {AD_TIER_MAX}인 · 화면 광고 표시. 지금 사용 중인 모드입니다.</p>
                        </div>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-xl">
                        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                            <span className="font-black">※ 요금 안내:</span> PRO는 <span className="font-black">1인당 월 {PRO_MONTHLY_PRICE.toLocaleString()}원</span>(부가세 별도)입니다. 카드 결제 시 즉시 활성화됩니다.
                        </p>
                    </div>
                </motion.div>
            )}

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
                                <div className="font-bold text-slate-800 dark:text-slate-200">카드 결제 (코페이)</div>
                                <p className="text-[11px] text-slate-500">안전한 PG 결제창에서 결제합니다. 카드번호는 본 앱에 저장되지 않습니다.</p>
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
                                <p className="text-[11px] text-slate-500">입금 확인 후 수동 활성화 (즉시 반영 아님)</p>
                            </div>
                            {paymentMethod === 'BANK' && <CheckCircle2 size={24} className="text-blue-500" />}
                        </div>
                    </div>
                </motion.div>
            )}

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
                                <label htmlFor="terms" className="text-sm font-bold text-slate-700 dark:text-slate-300 block mb-0.5 cursor-pointer">서비스 이용약관 및 결제 이용 동의 (필수)</label>
                                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">유료 서비스 이용에 따른 권리, 의무 및 책임 사항에 동의합니다.</p>
                            </div>
                        </div>
                        <div className="p-4 flex items-start gap-3 hover:bg-slate-100/50 transition-colors">
                            <input 
                                type="checkbox" id="autoPay" checked={consents.autoPay} 
                                onChange={(e) => setConsents({...consents, autoPay: e.target.checked})}
                                className="mt-1 w-4 h-4 text-blue-600 rounded" 
                            />
                            <div className="flex-1">
                                <label htmlFor="autoPay" className="text-sm font-bold text-slate-700 dark:text-slate-300 block mb-0.5 cursor-pointer">유료 구독 결제 승인 (필수)</label>
                                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">PRO 모드 {staffCount}명 × {PRO_MONTHLY_PRICE.toLocaleString()}원 + VAT {vat.toLocaleString()}원 = {chargeTotal.toLocaleString()}원 결제를 확인했습니다.</p>
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
                                <p className="text-[10px] text-slate-500 leading-relaxed font-medium">결제 처리를 위해 최소한의 개인정보를 PG사(코페이)에 제공하는 것에 동의합니다.</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-amber-50 dark:bg-orange-950/20 border border-amber-200 dark:border-orange-900 rounded-xl flex items-start gap-3 shadow-inner">
                        <ShieldAlert size={18} className="text-orange-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-orange-700 dark:text-orange-400 font-bold leading-relaxed">
                            ※ 카드 정보는 코페이 결제창에서만 입력되며, EzPrintWork 서버에는 저장되지 않습니다.
                        </p>
                    </div>
                </motion.div>
            )}

            {step === 'FINAL_INFO' && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="text-center mb-8">
                        <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">신청 정보 확인</h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm">내용을 확인한 뒤 결제를 진행해 주세요.</p>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-800/80 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4 shadow-xl">
                        <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                            <span className="text-sm font-bold text-slate-500">선택 플랜</span>
                            <span className="font-black text-blue-600 uppercase">Enterprise PRO</span>
                        </div>
                        <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                            <span className="text-sm font-bold text-slate-500">이용 인원</span>
                            <div className="flex items-center gap-3">
                                <button 
                                    type="button"
                                    onClick={() => setStaffCount(Math.max(1, staffCount - 1))}
                                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    -
                                </button>
                                <span className="font-black text-slate-800 dark:text-white min-w-[2rem] text-center">{staffCount}명</span>
                                <button 
                                    type="button"
                                    onClick={() => setStaffCount(staffCount + 1)}
                                    className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                            <span className="text-sm font-bold text-slate-500">결제 방식</span>
                            <span className="font-black text-slate-800 dark:text-slate-100">{paymentMethod === 'CARD' ? '카드 결제 (코페이)' : '계좌 직접송금'}</span>
                        </div>
                        <div className="flex justify-between items-center px-3 pt-2">
                            <span className="text-sm font-bold text-slate-500">이번 결제 금액</span>
                            <div className="text-right">
                                <div className="text-2xl font-black text-slate-800 dark:text-white">₩{chargeTotal.toLocaleString()}</div>
                                <div className="text-[10px] text-slate-400 font-medium">{staffCount}명 × {PRO_MONTHLY_PRICE.toLocaleString()}원 + VAT {vat.toLocaleString()}원</div>
                            </div>
                        </div>
                    </div>

                    {payError && (
                      <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-bold leading-relaxed">
                        결제창 오류: {payError}
                        {/할부|5만|50000|일시불/i.test(payError) && (
                          <>
                            <br />
                            <span className="font-medium opacity-80">5만원 미만은 일시불만 가능합니다. 다시 시도해 주세요.</span>
                          </>
                        )}
                        {/불러올 수 없습니다|IFRAME|timeout|시간/i.test(payError) && (
                          <>
                            <br />
                            <span className="font-medium opacity-80">결제창 로드에 실패했습니다. 앱을 재시작한 뒤 다시 시도해 주세요.</span>
                          </>
                        )}
                      </div>
                    )}

                    <div className="p-5 bg-blue-600 rounded-2xl text-white shadow-xl shadow-blue-600/20 relative overflow-hidden">
                        <div className="relative z-10">
                            <h4 className="text-xs font-black uppercase tracking-widest text-blue-200 mb-3 flex items-center gap-2">
                                <AlertCircle size={14} /> 안내
                            </h4>
                            <ul className="text-[11px] font-medium space-y-2 opacity-90 leading-relaxed">
                                <li>• 카드 결제 성공 시 PRO가 즉시 활성화되고, 라이선스는 약 1개월간 유지됩니다.</li>
                                <li>• 테스트 MID 사용 중이며, 실제 청구 여부는 코페이 테스트 정책을 따릅니다.</li>
                                <li>• 무통장 입금 선택 시 별도 확인 후 활성화됩니다.</li>
                            </ul>
                        </div>
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <ShieldCheck size={80} />
                        </div>
                    </div>
                </motion.div>
            )}
          </div>

          <div className={`p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex gap-4 shrink-0 transition-all ${step === 'PROCESSING' ? 'hidden' : ''}`}>
            {step !== 'PLAN' && (
                <button 
                    type="button"
                    onClick={handlePrevStep}
                    className="px-6 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all text-sm border border-slate-200 dark:border-slate-700"
                >
                    이전으로
                </button>
            )}
            
            {step === 'FINAL_INFO' ? (
                <button 
                    type="button"
                    onClick={handleComplete}
                    className="flex-1 px-6 py-4 rounded-2xl bg-blue-600 text-white font-black hover:bg-blue-700 transition-all shadow-2xl shadow-blue-600/40 flex items-center justify-center gap-2 active:scale-95"
                >
                    {paymentMethod === 'CARD' ? '코페이 결제창 열기' : '무통장 안내 확인'} <Check size={20} />
                </button>
            ) : (
                <button 
                    type="button"
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
