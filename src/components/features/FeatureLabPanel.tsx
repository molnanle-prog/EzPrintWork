import React, { useMemo, useState } from 'react';
import { Beaker, QrCode, Calculator, Boxes, FileSpreadsheet, LayoutTemplate, Shield, Activity, Inbox, Repeat, Webhook, BarChart3, Globe } from 'lucide-react';
import { db } from '../../services/dataService';
import { useAuth } from '../../contexts/AuthContext';
import {
  FEATURE_FLAG_KEYS,
  FEATURE_FLAG_LABELS,
  isFeatureEnabled,
  isFeatureLabUnlocked,
  setFeatureEnabled,
  setFeatureLabUnlocked,
  type FeatureFlagKey,
} from '../../features/featureFlags';
import {
  buildMgmtReport,
  buildPermissionMatrix,
  buildQrTrackingPayload,
  buildTaxInvoiceDraft,
  calculateCostMargin,
  createCustomerPortalSession,
  dispatchMockWebhook,
  encodeQrTrackingPayload,
  listIndustryTemplates,
  listReorderCandidates,
  suggestInventoryAfterJob,
} from '../../features/commercialFeatures';

function formatWon(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

export const FeatureLabPanel: React.FC = () => {
  const [, setTick] = useState(0);
  const unlocked = isFeatureLabUnlocked();
  const refresh = () => setTick((value) => value + 1);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Beaker className="text-violet-600" size={20} />
          실험 기능
        </h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          기본값은 모두 꺼져 있습니다. 켜진 기능만 추가 메뉴로 나타나며, 기존 화면은 그대로 둡니다.
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={unlocked}
            onChange={(event) => {
              setFeatureLabUnlocked(event.target.checked);
              refresh();
            }}
          />
          이 PC에서만 실험실 잠금 해제
        </label>
      </div>
      {unlocked && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-3">
          {FEATURE_FLAG_KEYS.map((key) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-slate-700 dark:text-slate-200">{FEATURE_FLAG_LABELS[key]}</span>
              <input
                type="checkbox"
                checked={isFeatureEnabled(key)}
                onChange={(event) => {
                  setFeatureEnabled(key, event.target.checked);
                  refresh();
                }}
              />
            </label>
          ))}
          <p className="text-xs text-slate-400">메뉴가 바로 안 보이면 새로고침해 주세요.</p>
        </div>
      )}
    </div>
  );
};

export const FeatureWorkspace: React.FC<{ feature: FeatureFlagKey }> = ({ feature }) => {
  const { currentUser, tenantOwnerId } = useAuth();
  const jobs = db.getAllJobs();
  const clients = db.getClients();
  const staff = db.getStaff();
  const papers = db.getPapers();
  const pricing = db.getPricingConfig();
  const sampleJob = jobs[0];

  const body = useMemo(() => {
    if (feature === 'costMargin' && sampleJob) {
      const result = calculateCostMargin(sampleJob, pricing, papers[0]);
      return (
        <div className="space-y-2 text-sm">
          <p>공급가 {formatWon(result.price)}</p>
          <p>원가 {formatWon(result.totalCost)}</p>
          <p>마진 {formatWon(result.margin)} ({Math.round(result.marginRate * 100)}%)</p>
        </div>
      );
    }
    if (feature === 'inventoryAuto' && sampleJob) {
      const rows = suggestInventoryAfterJob(sampleJob, papers);
      return rows.length ? (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.paperName}>
              {row.paperName}: {row.sheetsUsed}매 사용 예상 → {row.nextLevel}
              {row.shouldReorder ? ' / 발주 필요' : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">재고와 연결된 작업이 없습니다.</p>
      );
    }
    if (feature === 'qrTracking' && sampleJob) {
      const payload = buildQrTrackingPayload(currentUser?.tenantId || 'local', sampleJob);
      return <p className="text-sm break-all">{encodeQrTrackingPayload(payload)}</p>;
    }
    if (feature === 'taxAccounting' && sampleJob) {
      const draft = buildTaxInvoiceDraft(sampleJob);
      return (
        <p className="text-sm">
          {draft.clientName} / 공급가 {formatWon(draft.supplyAmount)} / 부가세 {formatWon(draft.vatAmount)}
        </p>
      );
    }
    if (feature === 'industryTemplates') {
      return (
        <ul className="space-y-1 text-sm">
          {listIndustryTemplates().map((item) => (
            <li key={item.id}>{item.name}: {item.products.join(', ')}</li>
          ))}
        </ul>
      );
    }
    if (feature === 'permissionMatrix') {
      const matrix = buildPermissionMatrix({
        userUid: currentUser?.uid,
        userRole: currentUser?.role,
        tenantOwnerId,
        userEmail: currentUser?.email,
      });
      return (
        <ul className="space-y-1 text-sm">
          <li>회사 관리: {matrix.companyAdmin ? '가능' : '불가'}</li>
          <li>직원 관리: {matrix.staffAdmin ? '가능' : '불가'}</li>
          <li>루트 설정: {matrix.rootSettings ? '가능' : '불가'}</li>
        </ul>
      );
    }
    if (feature === 'syncDiagnostics') {
      return (
        <p className="text-sm">
          상태 {db.getSyncStatus()} / 클라우드 저하 {db.isCloudDegraded() ? '예' : '아니오'}
        </p>
      );
    }
    if (feature === 'conflictInbox') {
      return <p className="text-sm text-slate-500">보관된 충돌이 없습니다. 충돌 시 이 함에만 쌓입니다.</p>;
    }
    if (feature === 'crmReorder') {
      const rows = listReorderCandidates(jobs);
      return rows.length ? (
        <ul className="space-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.lastJobId}>{row.clientName} — {row.lastTitle}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">재주문 후보가 없습니다.</p>
      );
    }
    if (feature === 'apiWebhook') {
      const event = dispatchMockWebhook({
        type: 'job.updated',
        tenantId: currentUser?.tenantId || 'local',
        entityId: sampleJob?.id || 'none',
        payload: { mock: true },
      });
      return <p className="text-sm">모의 Webhook 준비됨 ({event.event.type})</p>;
    }
    if (feature === 'mgmtReports') {
      const report = buildMgmtReport(jobs, staff, clients);
      return (
        <div className="space-y-1 text-sm">
          <p>작업 {report.jobCount}건 / 완료 {report.completedCount}건</p>
          <p>매출 {formatWon(report.revenue)} / 미수 {formatWon(report.outstanding)}</p>
        </div>
      );
    }
    if (feature === 'customerPortal') {
      const session = createCustomerPortalSession(clients[0]?.name || sampleJob?.clientName || '거래처', jobs);
      return (
        <p className="text-sm">
          로컬 미리보기 세션 {session.token} · 작업 {session.jobIds.length}건 · 공개 URL 없음
        </p>
      );
    }
    return <p className="text-sm text-slate-500">이 기능을 확인할 데이터가 아직 없습니다.</p>;
  }, [clients, currentUser?.email, currentUser?.role, currentUser?.tenantId, currentUser?.uid, feature, jobs, papers, pricing, sampleJob, staff, tenantOwnerId]);

  const icons: Record<FeatureFlagKey, React.ReactNode> = {
    customerPortal: <Globe size={18} />,
    qrTracking: <QrCode size={18} />,
    costMargin: <Calculator size={18} />,
    inventoryAuto: <Boxes size={18} />,
    taxAccounting: <FileSpreadsheet size={18} />,
    industryTemplates: <LayoutTemplate size={18} />,
    permissionMatrix: <Shield size={18} />,
    syncDiagnostics: <Activity size={18} />,
    conflictInbox: <Inbox size={18} />,
    crmReorder: <Repeat size={18} />,
    apiWebhook: <Webhook size={18} />,
    mgmtReports: <BarChart3 size={18} />,
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-0">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {icons[feature]}
          {FEATURE_FLAG_LABELS[feature]}
        </h3>
        <p className="text-xs text-slate-400">기능 플래그가 켜진 PC에서만 보이는 미리보기입니다. 실제 운영 화면은 그대로입니다.</p>
        {body}
      </div>
    </div>
  );
};
