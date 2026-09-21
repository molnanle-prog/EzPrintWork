import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../../services/dataService';
import { SmsPrepaidPending, SmsPrepaidState } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useDialog } from '../../contexts/DialogContext';
import { getLocalGatewayInfo } from '../../services/gatewayBridge';
import { getGatewayAuthToken } from '../../utils/gatewayToken';
import {
  SMS_PREPAID_CHARGE_AMOUNTS,
  SMS_PREPAID_RATES,
  SMS_PREPAID_RECEIVE_ACCOUNT,
  buildChargeQrPayload,
  buildTossTransferUrl,
  isGeneratedDepositName,
  qrImageUrl,
} from '../../utils/smsPrepaid';
import { Copy, Loader2, QrCode, RefreshCw, Wallet } from 'lucide-react';

const fieldClass =
  'w-full h-9 px-3 text-base font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

export const SmsPrepaidPanel: React.FC = () => {
  const { currentUser, canAccessAdminSettings } = useAuth();
  const { showAlert, showConfirm } = useDialog();
  const isAdmin = currentUser?.role === 'admin' || canAccessAdminSettings;
  const [prepaid, setPrepaid] = useState<SmsPrepaidState>(() => db.getSmsPrepaid());
  const [amount, setAmount] = useState<(typeof SMS_PREPAID_CHARGE_AMOUNTS)[number]>(10000);
  const [depositor, setDepositor] = useState(() => {
    const name = db.getSmsPrepaid().depositName;
    return isGeneratedDepositName(name) ? '' : name;
  });
  const [busy, setBusy] = useState(false);
  const [smsPaste, setSmsPaste] = useState('');
  const [chargePending, setChargePending] = useState<SmsPrepaidPending | null>(null);
  const [hookUrl, setHookUrl] = useState('');

  const refresh = useCallback(() => {
    const next = db.getSmsPrepaid();
    setPrepaid(next);
    if (next.depositName && !isGeneratedDepositName(next.depositName)) {
      setDepositor(next.depositName);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = window.setInterval(() => {
      if (!db.isSmsPrepaidEnabled()) {
        refresh();
        return;
      }
      void db.drainSmsPrepaidGatewayInbox().then(() => refresh());
    }, 8000);
    return () => window.clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const info = await getLocalGatewayInfo();
      const tenantId = db.getTenantId();
      const token = getGatewayAuthToken(tenantId);
      const base = (info?.lanUrls?.[0] || info?.baseUrl || '').replace(/\/$/, '');
      if (!cancelled && base && token) {
        setHookUrl(`${base}/api/v1/sms-prepaid-notice?token=${encodeURIComponent(token)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPending = useMemo(
    () => prepaid.pending.filter((p) => p.status === 'pending').slice().reverse(),
    [prepaid.pending]
  );
  const recentLedger = useMemo(() => prepaid.ledger.slice(-6).reverse(), [prepaid.ledger]);

  const shownCharge =
    chargePending && openPending.some((p) => p.id === chargePending.id)
      ? chargePending
      : openPending[0] || null;

  const qrName = shownCharge?.depositor || depositor || prepaid.depositName;
  const qrPayload = shownCharge
    ? buildChargeQrPayload({
        bankName: SMS_PREPAID_RECEIVE_ACCOUNT.bankName,
        accountNo: SMS_PREPAID_RECEIVE_ACCOUNT.accountNo,
        accountHolder: SMS_PREPAID_RECEIVE_ACCOUNT.accountHolder,
        amount: shownCharge.amount,
        depositName: qrName,
      })
    : '';

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      await showAlert(`${label}을(를) 복사했습니다.`);
    } catch {
      await showAlert('복사에 실패했습니다. 직접 선택해서 복사해 주세요.');
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    if (!isAdmin) {
      await showAlert('관리자만 켜거나 끌 수 있습니다.');
      return;
    }
    if (enabled) {
      const ok = await showConfirm(
        '문자 선불 크레딧을 켜면 API 자동 발송 때 요금이 잔액에서 빠집니다. 휴대폰과 연결(무료)은 그대로입니다. 켤까요?'
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await db.setSmsPrepaidEnabled(enabled);
      refresh();
    } catch (e: any) {
      await showAlert(e?.message || '설정을 바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const startCharge = async () => {
    if (!isAdmin) {
      await showAlert('관리자만 충전할 수 있습니다.');
      return;
    }
    setBusy(true);
    try {
      await db.saveSmsPrepaid({
        depositName: depositor.trim(),
      });
      const res = await db.requestSmsPrepaidCharge(amount, depositor);
      setChargePending(res.pending);
      refresh();
    } catch (e: any) {
      await showAlert(e?.message || '충전 요청을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const confirmOne = async (id: string) => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await db.confirmSmsPrepaidPending(id);
      if (chargePending?.id === id) setChargePending(null);
      refresh();
    } catch (e: any) {
      await showAlert(e?.message || '확인 실패');
    } finally {
      setBusy(false);
    }
  };

  const cancelOne = async (id: string) => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await db.cancelSmsPrepaidPending(id);
      if (chargePending?.id === id) setChargePending(null);
      refresh();
    } catch (e: any) {
      await showAlert(e?.message || '취소 실패');
    } finally {
      setBusy(false);
    }
  };

  const applyPaste = async () => {
    if (!isAdmin) return;
    if (!smsPaste.trim()) {
      await showAlert('입금 문자를 붙여넣어 주세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await db.ingestSmsPrepaidNotice(smsPaste.trim(), 'paste');
      setSmsPaste('');
      refresh();
      if (res.matched) await showAlert(`${res.amount?.toLocaleString('ko-KR')}원 입금을 확인했습니다.`);
      else await showAlert(`자동 확인하지 못했습니다. ${res.reason}`);
    } catch (e: any) {
      await showAlert(e?.message || '반영 실패');
    } finally {
      setBusy(false);
    }
  };

  const openToss = () => {
    if (!shownCharge) return;
    const url = buildTossTransferUrl({
      bankName: SMS_PREPAID_RECEIVE_ACCOUNT.bankName,
      accountNo: SMS_PREPAID_RECEIVE_ACCOUNT.accountNo,
      amount: shownCharge.amount,
      accountHolder: SMS_PREPAID_RECEIVE_ACCOUNT.accountHolder,
    });
    if (window.electron?.openExternal) void window.electron.openExternal(url);
    else window.location.href = url;
  };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Wallet size={18} className="text-blue-600" />
          문자 선불 크레딧
        </h4>
        <label className="relative inline-flex items-center cursor-pointer select-none">
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300 mr-2">
            {prepaid.enabled ? '사용 중' : '꺼짐'}
          </span>
          <input
            type="checkbox"
            className="sr-only peer"
            checked={prepaid.enabled}
            disabled={!isAdmin || busy}
            onChange={(e) => void toggleEnabled(e.target.checked)}
          />
          <div className="w-11 h-6 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 relative" />
        </label>
      </div>

      {!prepaid.enabled ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          끄면 지금처럼 휴대폰과 연결(무료)만 쓰면 됩니다.
        </p>
      ) : (
        <>
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">남은 문자 요금</p>
            <p className="text-3xl font-black tabular-nums text-slate-900 dark:text-white">
              {prepaid.balance.toLocaleString('ko-KR')}
              <span className="text-lg ml-0.5">원</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              SMS {SMS_PREPAID_RATES.SMS}원 · LMS {SMS_PREPAID_RATES.LMS}원 · MMS {SMS_PREPAID_RATES.MMS}원
              (부가세 별도). 휴대폰과 연결은 이 잔액과 상관없습니다.
            </p>
          </div>

          <section className="space-y-1">
            <p className="text-sm font-black text-slate-800 dark:text-slate-100">1. 충전 금액</p>
            <div className="grid grid-cols-5 gap-1.5">
              {SMS_PREPAID_CHARGE_AMOUNTS.map((won) => (
                <button
                  key={won}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setAmount(won)}
                  className={`h-9 rounded-lg text-base font-black border transition-colors ${
                    amount === won
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 hover:border-blue-400'
                  }`}
                >
                  {won / 10000}만원
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-1">
            <label className="text-sm font-black text-slate-800 dark:text-slate-100" htmlFor="sms-prepaid-depositor">
              2. 입금자명
            </label>
            <input
              id="sms-prepaid-depositor"
              value={depositor}
              onChange={(e) => setDepositor(e.target.value)}
              disabled={!isAdmin}
              maxLength={40}
              placeholder="통장에 찍힐 이름 (가게 이름 또는 본인 이름)"
              className={fieldClass}
            />
          </section>

          <section className="space-y-1">
            <p className="text-sm font-black text-slate-800 dark:text-slate-100">입금 계좌</p>
            <div className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                {SMS_PREPAID_RECEIVE_ACCOUNT.bankName} {SMS_PREPAID_RECEIVE_ACCOUNT.accountNo}
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  {' '}({SMS_PREPAID_RECEIVE_ACCOUNT.accountHolder})
                </span>
              </p>
              <button
                type="button"
                onClick={() => void copyText(SMS_PREPAID_RECEIVE_ACCOUNT.accountNo, '계좌번호')}
                className="shrink-0 text-xs font-bold text-blue-600"
              >
                복사
              </button>
            </div>
          </section>

          <button
            type="button"
            onClick={() => void startCharge()}
            disabled={!isAdmin || busy}
            className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-base font-black disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : `${(amount / 10000).toFixed(0)}만원 충전하기`}
          </button>

          {shownCharge && (
            <div className="rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-white dark:bg-slate-800 p-4 flex flex-wrap gap-4 items-start">
              <img
                src={qrImageUrl(qrPayload)}
                alt="입금 QR"
                width={168}
                height={168}
                className="rounded-xl border border-slate-200 bg-white"
              />
              <div className="space-y-2 min-w-[220px] flex-1">
                <p className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-1">
                  <QrCode size={16} /> 이 계좌로 {shownCharge.amount.toLocaleString('ko-KR')}원 보내세요
                </p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  {SMS_PREPAID_RECEIVE_ACCOUNT.bankName} {SMS_PREPAID_RECEIVE_ACCOUNT.accountNo}
                  {SMS_PREPAID_RECEIVE_ACCOUNT.accountHolder ? ` (${SMS_PREPAID_RECEIVE_ACCOUNT.accountHolder})` : ''}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  입금자명 <strong className="text-slate-900 dark:text-white">{qrName}</strong>
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void copyText(SMS_PREPAID_RECEIVE_ACCOUNT.accountNo, '계좌번호')}
                    className="h-10 px-3 rounded-lg border font-bold text-sm inline-flex items-center gap-1"
                  >
                    <Copy size={14} /> 계좌 복사
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(qrName, '입금자명')}
                    className="h-10 px-3 rounded-lg border font-bold text-sm"
                  >
                    입금자명 복사
                  </button>
                  <button type="button" onClick={openToss} className="h-10 px-3 rounded-lg border font-bold text-sm">
                    토스로 열기
                  </button>
                </div>
              </div>
            </div>
          )}

          {isAdmin && (
            <details className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/40 p-3">
              <summary className="text-sm font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                입금 확인 (관리용)
              </summary>
              <div className="mt-3 space-y-3">
                {openPending.length === 0 ? (
                  <p className="text-xs text-slate-400">대기 중인 충전이 없습니다.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {openPending.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2"
                      >
                        <span>
                          <strong className="tabular-nums">{p.amount.toLocaleString('ko-KR')}원</strong>
                          {p.depositor ? <span className="ml-2 text-slate-500">{p.depositor}</span> : null}
                        </span>
                        <span className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => void confirmOne(p.id)}
                            className="h-9 px-3 rounded-lg bg-emerald-600 text-white font-bold text-xs"
                          >
                            입금 확인
                          </button>
                          <button
                            type="button"
                            onClick={() => void cancelOne(p.id)}
                            className="h-9 px-3 rounded-lg border font-bold text-xs"
                          >
                            취소
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={smsPaste}
                  onChange={(e) => setSmsPaste(e.target.value)}
                  rows={3}
                  placeholder="은행 입금 문자를 붙여넣으면 입금자명·금액이 맞을 때 확인됩니다."
                  className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void applyPaste()}
                    disabled={busy}
                    className="h-10 px-4 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-50"
                  >
                    입금 문자 반영
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void db.drainSmsPrepaidGatewayInbox().then((n) => {
                        refresh();
                        void showAlert(n > 0 ? `알림 ${n}건을 반영했습니다.` : '새 알림이 없습니다.');
                      });
                    }}
                    className="h-10 px-3 rounded-lg border text-sm font-bold inline-flex items-center gap-1"
                  >
                    <RefreshCw size={14} /> 새로고침
                  </button>
                </div>
                {prepaid.unmatched.length > 0 && (
                  <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    {prepaid.unmatched.slice(-4).reverse().map((u) => (
                      <p key={u.id}>{u.reason}</p>
                    ))}
                  </div>
                )}
                {hookUrl && (
                  <p className="text-[10px] text-slate-400 break-all select-all">{hookUrl}</p>
                )}
              </div>
            </details>
          )}

          {recentLedger.length > 0 && (
            <ul className="text-xs space-y-1 text-slate-500 dark:text-slate-400">
              {recentLedger.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>
                    {e.type === 'charge' ? '충전' : e.type === 'debit' ? '사용' : e.type === 'refund' ? '환불' : '조정'}
                  </span>
                  <span className="tabular-nums">
                    {e.type === 'debit' ? '-' : '+'}
                    {e.amount.toLocaleString('ko-KR')}원
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
