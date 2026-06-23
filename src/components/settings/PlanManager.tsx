import React, { useState, useMemo, useCallback } from 'react';
import {
  Crown,
  Users,
  Save,
  Minus,
  Plus,
  Megaphone,
  ShieldCheck,
  Loader2,
  RefreshCw,
  CreditCard,
  X,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/dataService';
import {
  planCodeToStaffCount,
  paymentStatusToTier,
  getTenantFacingTierLabel,
  AD_TIER_MAX,
  PlanTier,
  PRO_MONTHLY_PRICE,
  TENANT_SELECTABLE_PLAN_TIERS,
  countActiveStaffSeats,
} from '../../utils/planLimits';
import { useDialog } from '../../contexts/DialogContext';
import { UpgradeModal } from '../common/UpgradeModal';

type SelectableTier = Exclude<PlanTier, 'gift'>;

interface TierStaffMemory {
  ad: number;
  paid: number;
}

function buildStaffMemory(
  appliedTier: PlanTier,
  appliedStaff: number,
  activeStaffCount: number
): TierStaffMemory {
  const paidDefault = Math.max(activeStaffCount, appliedTier === 'paid' ? appliedStaff : 1);
  const adDefault =
    appliedTier === 'ad'
      ? Math.min(Math.max(appliedStaff, 1), AD_TIER_MAX)
      : Math.min(activeStaffCount, AD_TIER_MAX);

  return {
    ad: adDefault,
    paid: appliedTier === 'paid' ? appliedStaff : paidDefault,
  };
}

export const PlanManager: React.FC = () => {
  const {
    currentUser,
    tenantPlan,
    tenantPlanCode,
    tenantPaymentStatus,
    maxStaff,
    tenantOwnerId,
  } = useAuth();
  const { showAlert, showConfirm } = useDialog();

  const activeStaffCount = countActiveStaffSeats(db.getStaff(), tenantOwnerId);

  const appliedTier = paymentStatusToTier(tenantPaymentStatus);
  const appliedStaff = planCodeToStaffCount(tenantPlanCode);
  const isOnGiftPlan = appliedTier === 'gift';
  const showsAds = tenantPlan === 'free';

  const [isPlanChangeOpen, setIsPlanChangeOpen] = useState(false);
  const [pendingTier, setPendingTier] = useState<SelectableTier>('ad');
  const [staffByTier, setStaffByTier] = useState<TierStaffMemory>(() =>
    buildStaffMemory(appliedTier, appliedStaff, activeStaffCount)
  );
  const [isApplyingPlan, setIsApplyingPlan] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const statusLabel = (() => {
    if (appliedTier === 'gift') return '특별 혜택 · 광고 없음';
    if (appliedTier === 'paid') return 'PRO(유료) · 광고 없음';
    return '광고형 · 광고 표시';
  })();

  const appliedSelectableTier: SelectableTier | null =
    appliedTier === 'gift' ? null : appliedTier;

  const pendingStaff = staffByTier[pendingTier];
  const pendingStaffMax = pendingTier === 'ad' ? AD_TIER_MAX : 999;

  const planChangeDirty = useMemo(() => {
    if (!isPlanChangeOpen) return false;
    if (appliedSelectableTier == null) {
      return true;
    }
    if (pendingTier !== appliedSelectableTier) return true;
    return pendingStaff !== appliedStaff;
  }, [isPlanChangeOpen, appliedSelectableTier, pendingTier, pendingStaff, appliedStaff]);

  const needsPaymentForPending =
    pendingTier === 'paid' &&
    (appliedSelectableTier !== 'paid' || pendingStaff !== appliedStaff);

  const openPlanChange = () => {
    setStaffByTier(buildStaffMemory(appliedTier, appliedStaff, activeStaffCount));
    setPendingTier(
      appliedSelectableTier ?? 'ad'
    );
    setIsPlanChangeOpen(true);
  };

  const closePlanChange = () => {
    setIsPlanChangeOpen(false);
    setStaffByTier(buildStaffMemory(appliedTier, appliedStaff, activeStaffCount));
  };

  const handlePendingTierSelect = (next: SelectableTier) => {
    setPendingTier(next);
  };

  const updatePendingStaff = (next: number) => {
    setStaffByTier((prev) => ({
      ...prev,
      [pendingTier]:
        pendingTier === 'ad'
          ? Math.max(1, Math.min(AD_TIER_MAX, next))
          : Math.max(1, Math.min(999, next)),
    }));
  };

  const validateStaffCount = useCallback(
    async (count: number) => {
      if (count < activeStaffCount) {
        await showAlert(
          `현재 등록된 직원이 ${activeStaffCount}명(대표 포함)입니다.\n` +
            `플랜 인원(${count}명)보다 많으면 먼저 직원을 정리해 주세요.`
        );
        return false;
      }
      return true;
    },
    [activeStaffCount, showAlert]
  );

  const applyPlanChangeDirect = async (tier: SelectableTier, staffCount: number) => {
    if (!currentUser?.tenantId) return;

    const saveStaff = tier === 'ad' ? Math.min(staffCount, AD_TIER_MAX) : staffCount;
    if (!(await validateStaffCount(saveStaff))) return;

    const confirmed = await showConfirm(
      `요금제를 아래와 같이 변경하시겠습니까?\n\n` +
        `• 플랜 유형: ${getTenantFacingTierLabel(tier)}\n` +
        `• 최대 인원: ${saveStaff}명 (대표 포함)\n` +
        (tier === 'ad'
          ? `• 화면에 광고가 표시됩니다.\n`
          : `• 광고가 표시되지 않습니다.\n`)
    );
    if (!confirmed) return;

    setIsApplyingPlan(true);
    try {
      await db.updateTenantPlanSettings(currentUser.tenantId, {
        staffCount: saveStaff,
        tier,
      });
      await showAlert('요금제가 변경되었습니다.\n잠시 후 화면에 반영됩니다.');
      closePlanChange();
    } catch (e) {
      console.error(e);
      await showAlert('변경 중 오류가 발생했습니다.');
    } finally {
      setIsApplyingPlan(false);
    }
  };

  const handleApplyPlanChange = async () => {
    if (!planChangeDirty) return;

    if (needsPaymentForPending) {
      if (!(await validateStaffCount(staffByTier.paid))) return;
      setShowPaymentModal(true);
      return;
    }

    await applyPlanChangeDirect(pendingTier, pendingStaff);
  };

  const applyButtonLabel = (() => {
    if (needsPaymentForPending) {
      return appliedSelectableTier === 'paid' ? 'PRO 결제하고 인원 변경' : 'PRO 결제하고 변경';
    }
    if (pendingTier === 'ad' && appliedSelectableTier === 'paid') return '광고형으로 변경';
    return '변경 확정';
  })();

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-2xl transition-colors">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
          <Crown className="text-amber-500" />
          요금제 / 인원 관리
        </h3>
        <p className="text-xs text-slate-500 mb-6">
          최대 인원은 아래 요약에서만 확인할 수 있습니다. 인원·플랜 변경은 <b>「플랜 변경」</b> 안에서만 가능하며, PRO는 결제 후 반영됩니다.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">현재 플랜</p>
            <p className="text-lg font-black text-slate-800 dark:text-white">{tenantPlanCode}</p>
            <p className="text-xs text-slate-500 mt-1">{getTenantFacingTierLabel(appliedTier)}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">최대 인원</p>
            <p className="text-lg font-black text-slate-800 dark:text-white">{maxStaff}명</p>
            <p className="text-xs text-slate-500 mt-1">대표 포함</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">사용 중</p>
            <p className="text-lg font-black text-slate-800 dark:text-white">{activeStaffCount}명</p>
            <p className={`text-xs mt-1 font-bold ${showsAds ? 'text-amber-500' : 'text-emerald-500'}`}>
              {statusLabel}
            </p>
          </div>
        </div>

        {isOnGiftPlan && (
          <div className="mb-6 p-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800">
            <p className="text-sm text-emerald-800 dark:text-emerald-200 font-medium">
              현재 <b>특별 혜택 플랜</b>이 적용되어 있습니다. (광고 없음)
            </p>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-1">
              다른 요금제로 바꾸려면 아래 <b>플랜 변경</b>을 이용하세요.
            </p>
          </div>
        )}

        {/* 현재 플랜 — 읽기 전용 */}
        <div className="mb-6 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">적용 중인 플랜</p>
          <div className="flex items-start gap-3">
            {appliedTier === 'paid' || isOnGiftPlan ? (
              <ShieldCheck size={20} className="text-blue-500 shrink-0 mt-0.5" />
            ) : (
              <Megaphone size={20} className="text-amber-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 dark:text-slate-100">
                {getTenantFacingTierLabel(appliedTier)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {isOnGiftPlan
                  ? `최대 ${maxStaff}명 · 광고 없음 · 특별 적용`
                  : appliedTier === 'paid'
                    ? `최대 ${maxStaff}명 · 월 ${PRO_MONTHLY_PRICE.toLocaleString()}원 정액 · 광고 없음`
                    : `최대 ${maxStaff}명 · 광고 표시`}
              </p>
            </div>
            {!isPlanChangeOpen && (
              <button
                type="button"
                onClick={openPlanChange}
                className="shrink-0 px-4 py-2 rounded-lg bg-slate-800 dark:bg-slate-600 text-white text-sm font-bold hover:bg-slate-700 flex items-center gap-1.5"
              >
                <RefreshCw size={14} />
                플랜 변경
              </button>
            )}
          </div>
        </div>

        {/* 플랜 변경 패널 — 버튼으로만 진입 */}
        {isPlanChangeOpen && (
          <div className="mb-6 p-4 rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">플랜 변경</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  미리보기만 됩니다. 하단 <b>{applyButtonLabel}</b>을 눌러야 실제 반영됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={closePlanChange}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/80 dark:hover:bg-slate-800"
                title="취소"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-5">
              {TENANT_SELECTABLE_PLAN_TIERS.map((selectableTier) => {
                const isAd = selectableTier === 'ad';
                const isPreview = pendingTier === selectableTier;
                const previewStaff = staffByTier[selectableTier];
                return (
                  <button
                    key={selectableTier}
                    type="button"
                    onClick={() => handlePendingTierSelect(selectableTier)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      isPreview
                        ? isAd
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-200/50'
                          : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200/50'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        {isAd ? (
                          <Megaphone size={18} className="text-amber-500" />
                        ) : (
                          <ShieldCheck size={18} className="text-blue-500" />
                        )}
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          {isAd ? '광고형' : 'PRO (유료)'}
                        </span>
                      </div>
                      {isPreview && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-white">
                          선택됨
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {isAd ? (
                        <>
                          요금 대신 광고 · 최대 {AD_TIER_MAX}인
                          {isPreview && (
                            <span className="ml-1 text-amber-600 font-bold">
                              (미리보기 {previewStaff}명)
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          월 {PRO_MONTHLY_PRICE.toLocaleString()}원 정액 · 광고 없음
                          {isPreview && (
                            <span className="ml-1 text-blue-600 font-bold">
                              (미리보기 {previewStaff}명)
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mb-4">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <Users size={16} />
                {pendingTier === 'ad' ? '광고형' : 'PRO'} 최대 인원
              </p>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => updatePendingStaff(pendingStaff - 1)}
                  disabled={pendingStaff <= 1}
                  className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-600 flex items-center justify-center disabled:opacity-30"
                >
                  <Minus size={18} />
                </button>
                <div className="flex-1 text-center">
                  <span className="text-3xl font-black text-slate-800 dark:text-white">{pendingStaff}</span>
                  <span className="text-sm text-slate-500 ml-1">명</span>
                </div>
                <button
                  type="button"
                  onClick={() => updatePendingStaff(pendingStaff + 1)}
                  disabled={pendingStaff >= pendingStaffMax}
                  className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-600 flex items-center justify-center disabled:opacity-30"
                >
                  <Plus size={18} />
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                {pendingTier === 'ad'
                  ? `광고형은 최대 ${AD_TIER_MAX}명까지 선택할 수 있습니다. PRO 인원(${staffByTier.paid}명)은 따로 기억됩니다.`
                  : `PRO 인원은 광고형(${staffByTier.ad}명)과 별도로 유지됩니다.`}
              </p>
            </div>

            {needsPaymentForPending && (
              <div className="mb-4 p-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 flex gap-2">
                <CreditCard size={18} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                  <b>PRO 전환 시 결제가 필요합니다.</b> 아래 버튼을 누르면 결제 화면으로 이동합니다.
                  (추후 실제 PG 결제 페이지 연동 예정)
                </div>
              </div>
            )}

            {pendingTier === 'ad' && appliedSelectableTier === 'paid' && (
              <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 flex gap-2">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  PRO에서 광고형으로 바꾸면 <b>화면에 광고가 표시</b>되고, 인원은 최대 {AD_TIER_MAX}명입니다.
                  PRO 인원 설정({staffByTier.paid}명)은 다시 PRO로 돌아올 때 복원됩니다.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t border-blue-100 dark:border-blue-900/40">
              <button
                type="button"
                onClick={closePlanChange}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleApplyPlanChange}
                disabled={!planChangeDirty || isApplyingPlan}
                className={`ml-auto px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  needsPaymentForPending
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-slate-800 dark:bg-slate-600 text-white hover:bg-slate-700'
                }`}
              >
                {isApplyingPlan ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : needsPaymentForPending ? (
                  <CreditCard size={16} />
                ) : (
                  <Save size={16} />
                )}
                {isApplyingPlan ? '처리 중...' : applyButtonLabel}
              </button>
            </div>
          </div>
        )}
      </div>

      <UpgradeModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        initialStaffCount={staffByTier.paid}
        skipPlanStep
        onUpgradeComplete={() => {
          setShowPaymentModal(false);
          closePlanChange();
        }}
      />
    </>
  );
};
