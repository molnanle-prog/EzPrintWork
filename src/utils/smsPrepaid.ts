import type { SmsPrepaidState } from '../types';

/** 솔라피 공식 단가 (부가세 별도, 원) */
export const SMS_PREPAID_RATES = {
  SMS: 18,
  LMS: 45,
  MMS: 110,
} as const;

export const SMS_BYTE_LIMIT = 90;

export function smsByteLength(text: string): number {
  let n = 0;
  for (const ch of String(text || '')) {
    n += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  return n;
}

export function estimateSmsCost(text: string, hasMedia = false): number {
  if (hasMedia) return SMS_PREPAID_RATES.MMS;
  return smsByteLength(text) <= SMS_BYTE_LIMIT ? SMS_PREPAID_RATES.SMS : SMS_PREPAID_RATES.LMS;
}

export function smsTypeLabel(text: string, hasMedia = false): 'SMS' | 'LMS' | 'MMS' {
  if (hasMedia) return 'MMS';
  return smsByteLength(text) <= SMS_BYTE_LIMIT ? 'SMS' : 'LMS';
}

function hash36(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const SMS_PREPAID_CHARGE_AMOUNTS = [10000, 20000, 30000, 40000, 50000] as const;

/** 문자 요금 입금 받을 관리자 계좌 (매장이 입력하지 않음) */
export const SMS_PREPAID_RECEIVE_ACCOUNT = {
  bankName: '카카오뱅크',
  accountNo: '3333-35-8219913',
  accountHolder: '에이에스컴 종합몰',
} as const;

export function isPrepaidChargeAmount(amount: number): boolean {
  return (SMS_PREPAID_CHARGE_AMOUNTS as readonly number[]).includes(amount);
}

export function makeDepositName(tenantId: string | null | undefined): string {
  const seed = String(tenantId || '').trim() || 'ezpw';
  const code = (hash36(seed) + hash36(`sms:${seed}`)).slice(0, 6).padEnd(6, 'X');
  return `EZ${code}`;
}

export function isGeneratedDepositName(name: string): boolean {
  return /^EZ[A-Z0-9]{4,10}$/i.test(String(name || '').trim());
}

export function normalizeDepositor(name: string): string {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

export function depositorsMatch(a: string, b: string): boolean {
  const na = normalizeDepositor(a);
  const nb = normalizeDepositor(b);
  return !!na && na === nb;
}

export function newPrepaidId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function createDefaultSmsPrepaid(tenantId?: string | null): SmsPrepaidState {
  return {
    enabled: false,
    balance: 0,
    depositName: '',
    bankName: SMS_PREPAID_RECEIVE_ACCOUNT.bankName,
    accountNo: SMS_PREPAID_RECEIVE_ACCOUNT.accountNo,
    accountHolder: SMS_PREPAID_RECEIVE_ACCOUNT.accountHolder,
    ledger: [],
    pending: [],
    unmatched: [],
  };
}

export function normalizeSmsPrepaid(
  raw: unknown,
  tenantId?: string | null
): SmsPrepaidState {
  const base = createDefaultSmsPrepaid(tenantId);
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  const depositName =
    typeof o.depositName === 'string' ? o.depositName.trim().slice(0, 40) : '';
  return {
    enabled: o.enabled === true,
    balance: Math.max(0, Math.floor(Number(o.balance) || 0)),
    depositName,
    bankName: SMS_PREPAID_RECEIVE_ACCOUNT.bankName,
    accountNo: SMS_PREPAID_RECEIVE_ACCOUNT.accountNo,
    accountHolder: SMS_PREPAID_RECEIVE_ACCOUNT.accountHolder,
    ledger: Array.isArray(o.ledger) ? (o.ledger as SmsPrepaidState['ledger']).slice(-200) : [],
    pending: Array.isArray(o.pending) ? (o.pending as SmsPrepaidState['pending']).slice(-80) : [],
    unmatched: Array.isArray(o.unmatched) ? (o.unmatched as SmsPrepaidState['unmatched']).slice(-40) : [],
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
  };
}

export function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function buildTossTransferUrl(opts: {
  bankName: string;
  accountNo: string;
  amount: number;
  accountHolder?: string;
}): string {
  const params = new URLSearchParams({
    bank: opts.bankName || '카카오뱅크',
    accountNo: digitsOnly(opts.accountNo),
    amount: String(Math.max(0, Math.floor(opts.amount))),
  });
  if (opts.accountHolder) params.set('receiverName', opts.accountHolder);
  return `supertoss://send?${params.toString()}`;
}

/** 카메라 QR용 텍스트 (앱 스킴은 카메라가 못 여는 경우가 많음) */
export function buildChargeQrPayload(opts: {
  bankName: string;
  accountNo: string;
  accountHolder: string;
  amount: number;
  depositName: string;
}): string {
  const parts = [
    opts.bankName || '카카오뱅크',
    digitsOnly(opts.accountNo),
    `${Math.floor(opts.amount).toLocaleString('ko-KR')}원`,
    opts.accountHolder,
    `입금자명 ${opts.depositName}`,
  ].filter(Boolean);
  return parts.join(' ');
}

export function qrImageUrl(payload: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}`;
}

export function parseBankDepositSms(
  text: string
): { amount: number; depositor: string } | null {
  const raw = String(text || '').replace(/\r/g, '').trim();
  if (!raw) return null;

  const ez = raw.match(/\bEZ[A-Z0-9]{4,10}\b/i);
  const amountMatch =
    raw.match(/입금\s*([0-9,]+)\s*원/) ||
    raw.match(/(?:금액|이체)\s*([0-9,]+)\s*원/) ||
    raw.match(/([0-9,]+)\s*원/);
  if (!amountMatch) return null;
  const amount = Number(String(amountMatch[1]).replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let depositor = ez ? ez[0].toUpperCase() : '';
  if (!depositor) {
    const named = raw.match(/(?:입금자명?|보낸사람|보낸이|입금인)[:\s]*([A-Za-z0-9가-힣]+)/);
    if (named) depositor = named[1];
  }
  if (!depositor) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    const idx = lines.findIndex((l) => /입금/.test(l) && /원/.test(l));
    if (idx >= 0) {
      const next = lines.slice(idx + 1).find(
        (l) => !/잔액|출금|카카오|국민|농협|신한|토스|우리|하나|기업|은행|Web발신|\[Web/i.test(l)
      );
      if (next) depositor = next.replace(/님$/, '').trim();
    }
  }
  return { amount, depositor };
}

export const PHONE_LINK_SETTINGS_URL = 'ms-settings:mobile-devices-addphone-direct';
export const PHONE_LINK_FALLBACK_URL = 'ms-settings:mobile-devices';
