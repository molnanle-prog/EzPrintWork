import React, { useState, useEffect } from 'react';
import { Crown, Users, Save, Minus, Plus, Megaphone, ShieldCheck, Loader2, Gift } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/dataService';
import {
  planCodeToStaffCount,
  paymentStatusToTier,
  getTierLabel,
  AD_TIER_MAX,
  PlanTier,
  PRO_MONTHLY_PRICE,
} from '../../utils/planLimits';
import { useDialog } from '../../contexts/DialogContext';

export const PlanManager: React.FC = () => {
  const {
    currentUser,
    tenantPlan,
    tenantPlanCode,
    tenantPaymentStatus,
    maxStaff,
  } = useAuth();
  const { showAlert, showConfirm } = useDialog();

  const activeStaffCount =
    1 + db.getStaff().filter(s => !s.isDeleted && s.active !== false && s.id !== 'admin').length;

  const currentTier = paymentStatusToTier(tenantPaymentStatus);

  const [staffCount, setStaffCount] = useState(() => planCodeToStaffCount(tenantPlanCode));
  const [tier, setTier] = useState<PlanTier>(() => currentTier);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setStaffCount(planCodeToStaffCount(tenantPlanCode));
    setTier(paymentStatusToTier(tenantPaymentStatus));
  }, [tenantPlanCode, tenantPaymentStatus]);

  const effectiveMax = tier === 'ad' ? AD_TIER_MAX : 999;
  const monthlyPrice = tier === 'paid' ? PRO_MONTHLY_PRICE : 0;
  const showsAds = tenantPlan === 'free';

  const statusLabel = (() => {
    if (currentTier === 'gift') return '무료(선물) · 광고 없음';
    if (currentTier === 'paid') return 'PRO(유료) · 광고 없음';
    return '광고형 · 광고 표시';
  })();

  const hasChanges =
    staffCount !== planCodeToStaffCount(tenantPlanCode) ||
    tier !== currentTier;

  const handleTierChange = (next: PlanTier) => {
    setTier(next);
    if (next === 'ad' && staffCount > AD_TIER_MAX) {
      setStaffCount(AD_TIER_MAX);
    }
  };

  const handleSave = async () => {
    if (!currentUser?.tenantId) return;

    const saveStaffCount = tier === 'ad' ? Math.min(staffCount, AD_TIER_MAX) : staffCount;

    if (saveStaffCount < activeStaffCount) {
      await showAlert(
        `현재 등록된 직원이 ${activeStaffCount}명(대표 포함)입니다.\n` +
          `플랜 인원(${saveStaffCount}명)보다 많으면 먼저 직원을 정리해 주세요.`
      );
      return;
    }

    const confirmed = await showConfirm(
      `요금제를 아래와 같이 변경하시겠습니까?\n\n` +
        `• 최대 인원: ${saveStaffCount}명 (대표 포함)\n` +
        `• 플랜 유형: ${getTierLabel(tier)}\n` +
        (tier === 'ad' ? `• 화면에 광고가 표시됩니다.\n` : `• 광고가 표시되지 않습니다.\n`) +
        (monthlyPrice > 0 ? `• 예상 월 요금: ${monthlyPrice.toLocaleString()}원 (부가세 별도)\n` : '')
    );
    if (!confirmed) return;

    setIsSaving(true);
    try {
      await db.updateTenantPlanSettings(currentUser.tenantId, { staffCount: saveStaffCount, tier });
      await showAlert('요금제 설정이 저장되었습니다.\n잠시 후 화면에 반영됩니다.');
    } catch (e) {
      console.error(e);
      await showAlert('저장 중 오류가 발생했습니다. 다시 로그인 후 시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 max-w-2xl transition-colors">
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
        <Crown className="text-amber-500" />
        요금제 / 인원 관리
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">현재 플랜</p>
          <p className="text-lg font-black text-slate-800 dark:text-white">{tenantPlanCode}</p>
          <p className="text-xs text-slate-500 mt-1">{getTierLabel(currentTier)}</p>
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

      <div className="mb-8">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">플랜 유형</p>
        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => handleTierChange('gift')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              tier === 'gift'
                ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Gift size={18} className="text-emerald-500" />
              <span className="font-bold text-slate-800 dark:text-slate-100">무료 (선물)</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              아는 분께 드리는 complimentary 플랜입니다. <b>광고 없음</b>, 인원 자유 설정 (예: u9 + FREE).
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleTierChange('ad')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              tier === 'ad'
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Megaphone size={18} className="text-amber-500" />
              <span className="font-bold text-slate-800 dark:text-slate-100">광고형</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              요금 대신 <b>광고를 보는</b> 일반 플랜입니다. <b>최대 3인</b> (대표 포함), 화면에 광고 표시.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleTierChange('paid')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              tier === 'paid'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={18} className="text-blue-500" />
              <span className="font-bold text-slate-800 dark:text-slate-100">PRO (유료)</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              인원과 무관 <b>월 1,000원 정액</b>. 1인만 써도 광고만 제거하고 싶을 때 선택.
            </p>
          </button>
        </div>
      </div>

      <div className="mb-8">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
          <Users size={16} />
          최대 직원 수 (대표 포함)
          {tier === 'ad' && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
              광고형 최대 {AD_TIER_MAX}인
            </span>
          )}
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setStaffCount(c => Math.max(1, c - 1))}
            disabled={staffCount <= 1}
            className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
          >
            <Minus size={18} />
          </button>
          <div className="flex-1 text-center">
            <span className="text-4xl font-black text-slate-800 dark:text-white">{staffCount}</span>
            <span className="text-sm text-slate-500 ml-1">명</span>
          </div>
          <button
            type="button"
            onClick={() => setStaffCount(c => Math.min(effectiveMax, c + 1))}
            disabled={staffCount >= effectiveMax}
            className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-30"
          >
            <Plus size={18} />
          </button>
        </div>

        {tier === 'gift' && staffCount > 3 && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-lg p-3">
            무료(선물) 플랜 · {staffCount}명까지 · plan u{staffCount} · <b>광고 없음</b>
          </p>
        )}
        {tier === 'ad' && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-lg p-3">
            광고형은 최대 {AD_TIER_MAX}인까지입니다. 요금 대신 화면에 <b>광고가 표시</b>됩니다.
          </p>
        )}
        {tier === 'paid' && (
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-3">
            PRO(유료)는 인원 수와 관계없이 <b>월 {PRO_MONTHLY_PRICE.toLocaleString()}원 정액</b>입니다. 혼자 쓰면서 광고만 없애도 됩니다.
          </p>
        )}
        {monthlyPrice > 0 && (
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-3 text-center font-medium">
            예상 월 요금: <span className="font-black text-slate-800 dark:text-white">{monthlyPrice.toLocaleString()}원</span>
            <span className="text-xs text-slate-400"> (부가세 별도)</span>
          </p>
        )}
      </div>

      <div className="pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving || !hasChanges}
          className="bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-md transition-all active:scale-95"
        >
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {isSaving ? '저장 중...' : '플랜 저장'}
        </button>
      </div>
    </div>
  );
};
