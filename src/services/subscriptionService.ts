import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
export type SubscriptionEvent =
  | 'START_TRIAL'
  | 'ACTIVATE'
  | 'RENEW_SUCCESS'
  | 'RENEW_FAILED'
  | 'RETRY_SUCCESS'
  | 'CANCEL'
  | 'EXPIRE'
  | 'REFUND'
  | 'CHARGEBACK'
  | 'CHANGE_SEATS';

const functions = getFunctions(app, 'asia-northeast3');

export const isMockBillingEnabled =
  import.meta.env.VITE_BILLING_TEST_MODE === 'true';
export const isRealBillingEnabled =
  import.meta.env.VITE_ENABLE_REAL_PAYMENTS === 'true';

export async function runMockSubscription(input: {
  tenantId: string;
  event: SubscriptionEvent;
  seats: number;
  amount: number;
  consent: {
    terms: boolean;
    privacy: boolean;
    recurring: boolean;
    termsVersion: string;
    privacyVersion: string;
    recurringVersion: string;
  };
}): Promise<{ id: string; status: SubscriptionStatus }> {
  if (!isMockBillingEnabled) {
    throw new Error('모의 결제 모드가 활성화되지 않았습니다.');
  }
  const call = httpsCallable<
    typeof input & { idempotencyKey: string },
    { id: string; status: SubscriptionStatus }
  >(functions, 'runMockSubscription');
  const idempotencyKey = `${input.event}-${input.tenantId}-${input.seats}-${Date.now()}`;
  const result = await call({ ...input, idempotencyKey });
  return result.data;
}
