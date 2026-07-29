import { getFunctions, httpsCallable } from 'firebase/functions';
import type { PaymentData } from '@korpay/sdk';
import { app } from './firebase';
import { setPaymentInProgress } from '../utils/staffSession';

const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'asia-northeast3';

const functions = getFunctions(app, region);

export type KorpayCreatePaymentResult = {
  sdkBase: string;
  payment: PaymentData;
};

export async function createKorpayPayment(input: {
  tenantId: string;
  staffCount: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<KorpayCreatePaymentResult> {
  const callable = httpsCallable(functions, 'korpayCreatePayment');
  try {
    const res = await callable(input);
    return res.data as KorpayCreatePaymentResult;
  } catch (err: unknown) {
    const anyErr = err as { code?: string; message?: string; details?: unknown };
    const code = String(anyErr?.code || '').replace(/^functions\//, '');
    const message = String(anyErr?.message || '결제 준비에 실패했습니다.');
    throw new Error(code && code !== 'internal' ? `[${code}] ${message}` : message);
  }
}

type CheckoutCallbacks = {
  onStart?: () => void;
  onError?: (error: string) => void;
  onClose?: () => void;
};

/** 5만원 미만은 일시불만 — 서버 응답이 옛 버전이어도 클라에서 보정 */
function ensureLumpSumUnder50k(payment: PaymentData): PaymentData {
  const amount = Number(payment.amount) || 0;
  if (amount <= 0 || amount >= 50000) return payment;
  return {
    ...payment,
    card: {
      ...(payment.card && typeof payment.card === 'object' ? payment.card : {}),
      installment: [0],
    } as PaymentData['card'],
  };
}

function isConfirmReturnAction(action: string): boolean {
  return /korpayConfirm|cloudfunctions\.net/i.test(action);
}

function isKorpayPaymentAction(action: string): boolean {
  return /payments\.korpay\.com/i.test(action) && /\/payment\/?$/i.test(action);
}

function installKorpaySubmitGuard(callbacks?: CheckoutCallbacks): () => void {
  const proto = HTMLFormElement.prototype;
  const nativeSubmit = proto.submit;

  const handleConfirm = (form: HTMLFormElement, action: string) => {
    const body = new FormData(form);
    void fetch(action, { method: 'POST', body, redirect: 'follow', credentials: 'omit' })
      .then(async (res) => {
        const url = res.url || '';
        if (/payment\/success/i.test(url) || /#\/payment\/success/i.test(url)) {
          const q = url.includes('?') ? url.slice(url.indexOf('?')) : '';
          window.location.hash = `#/payment/success${q}`;
          return;
        }
        if (/payment\/fail/i.test(url) || /#\/payment\/fail/i.test(url)) {
          const q = url.includes('?') ? url.slice(url.indexOf('?')) : '';
          window.location.hash = `#/payment/fail${q}`;
          return;
        }
        callbacks?.onError?.(
          '결제 결과 페이지를 확인하지 못했습니다. 요금제 화면을 새로고침해 주세요.'
        );
      })
      .catch((err) => {
        callbacks?.onError?.(err instanceof Error ? err.message : '결제 승인 요청에 실패했습니다.');
      });
  };

  proto.submit = function patchedSubmit(this: HTMLFormElement) {
    const action = String(this.getAttribute('action') || this.action || '');
    if (isKorpayPaymentAction(action)) {
      return nativeSubmit.call(this);
    }
    if (isConfirmReturnAction(action)) {
      handleConfirm(this, action);
      return;
    }
    return nativeSubmit.call(this);
  };

  const onSubmitEvent = (event: Event) => {
    const form = event.target as HTMLFormElement | null;
    if (!form || form.tagName !== 'FORM') return;
    const action = String(form.getAttribute('action') || form.action || '');
    if (!isConfirmReturnAction(action) || isKorpayPaymentAction(action)) return;
    event.preventDefault();
    event.stopPropagation();
    handleConfirm(form, action);
  };

  document.addEventListener('submit', onSubmitEvent, true);

  return () => {
    document.removeEventListener('submit', onSubmitEvent, true);
    proto.submit = nativeSubmit;
  };
}

async function openKorpayCheckoutInElectron(
  sdkBase: string,
  payment: PaymentData,
  callbacks?: CheckoutCallbacks
): Promise<void> {
  const electron = (
    window as unknown as {
      electron?: {
        openKorpayPayment?: (payload: unknown) => Promise<{
          ok?: boolean;
          error?: string;
          closed?: boolean;
          result?: string;
        }>;
        setPaymentNavigationLock?: (locked: boolean) => Promise<void>;
      };
    }
  ).electron;

  if (!electron?.openKorpayPayment) {
    // IPC 없으면 웹과 동일 경로 (iframe)
    await openKorpayCheckoutInPage(sdkBase, payment, callbacks);
    return;
  }

  callbacks?.onStart?.();
  setPaymentInProgress(true);
  try {
    await electron.setPaymentNavigationLock?.(true);
  } catch {
    /* optional */
  }

  try {
    const result = await electron.openKorpayPayment({
      sdkBase,
      payment: ensureLumpSumUnder50k(payment),
    });
    if (result?.error) {
      callbacks?.onError?.(result.error);
      return;
    }
    callbacks?.onClose?.();
  } finally {
    window.setTimeout(() => setPaymentInProgress(false), 60_000);
    try {
      await electron.setPaymentNavigationLock?.(false);
    } catch {
      /* optional */
    }
  }
}

async function openKorpayCheckoutInPage(
  sdkBase: string,
  payment: PaymentData,
  callbacks?: CheckoutCallbacks
): Promise<void> {
  setPaymentInProgress(true);
  const uninstallGuard = installKorpaySubmitGuard(callbacks);

  const cleanup = () => {
    uninstallGuard();
    window.setTimeout(() => setPaymentInProgress(false), 60_000);
  };

  try {
    const KorpaySdk = (await import('@korpay/sdk')).default;
    KorpaySdk.payment(sdkBase, ensureLumpSumUnder50k(payment), {
      onStart: () => callbacks?.onStart?.(),
      onError: (err) => {
        cleanup();
        callbacks?.onError?.(err);
      },
      onClose: () => {
        cleanup();
        callbacks?.onClose?.();
      },
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}

/**
 * Electron: 별도 창(localhost 브릿지) — 메인 iframe은 Electron에서 로드 실패하는 경우가 많음.
 * 웹: 현재 창 iframe + form.submit 가드.
 */
export async function openKorpayCheckout(
  sdkBase: string,
  payment: PaymentData,
  callbacks?: CheckoutCallbacks
): Promise<void> {
  const isElectron = typeof window !== 'undefined' && !!(window as { electron?: unknown }).electron;
  if (isElectron) {
    await openKorpayCheckoutInElectron(sdkBase, payment, callbacks);
    return;
  }
  await openKorpayCheckoutInPage(sdkBase, payment, callbacks);
}
