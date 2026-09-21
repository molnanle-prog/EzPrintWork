const crypto = require('crypto');

const SUBSCRIPTION_STATES = new Set(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']);
const EVENT_TARGET = {
  START_TRIAL: 'TRIAL',
  ACTIVATE: 'ACTIVE',
  RENEW_SUCCESS: 'ACTIVE',
  RENEW_FAILED: 'PAST_DUE',
  RETRY_SUCCESS: 'ACTIVE',
  CANCEL: 'CANCELED',
  EXPIRE: 'EXPIRED',
  REFUND: 'CANCELED',
  CHARGEBACK: 'PAST_DUE',
  CHANGE_SEATS: '__KEEP__',
};

function transitionSubscription(current, event, now = new Date().toISOString()) {
  const previous = SUBSCRIPTION_STATES.has(current?.status) ? current.status : 'EXPIRED';
  const target = EVENT_TARGET[event];
  if (!target) throw new Error(`invalid-subscription-event:${event}`);
  const allowed = {
    EXPIRED: ['START_TRIAL', 'ACTIVATE'],
    TRIAL: ['ACTIVATE', 'CANCEL', 'EXPIRE', 'CHANGE_SEATS'],
    ACTIVE: ['RENEW_SUCCESS', 'RENEW_FAILED', 'CANCEL', 'REFUND', 'CHARGEBACK', 'CHANGE_SEATS'],
    PAST_DUE: ['RETRY_SUCCESS', 'RENEW_FAILED', 'CANCEL', 'EXPIRE', 'REFUND', 'CHANGE_SEATS'],
    CANCELED: ['ACTIVATE', 'EXPIRE', 'REFUND'],
  };
  if (!allowed[previous]?.includes(event)) {
    throw new Error(`invalid-subscription-transition:${previous}:${event}`);
  }
  return {
    ...current,
    status: target === '__KEEP__' ? previous : target,
    previousStatus: previous,
    lastEvent: event,
    updatedAt: now,
    ...(event === 'CANCEL' ? { canceledAt: now } : {}),
    ...(event === 'RENEW_FAILED' ? { pastDueAt: now } : {}),
    ...(event === 'REFUND' ? { refundedAt: now } : {}),
    ...(event === 'CHARGEBACK' ? { chargebackAt: now, pastDueAt: now } : {}),
    ...(['ACTIVATE', 'RENEW_SUCCESS', 'RETRY_SUCCESS'].includes(event)
      ? { lastPaidAt: now, retryCount: 0 }
      : {}),
  };
}

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function registerSubscriptionFunctions(functions, db) {
  const HttpsError = functions.https.HttpsError;

  const runMockSubscription = functions
    .region('asia-northeast3')
    .https.onCall(async (data, context) => {
      if (process.env.FUNCTIONS_EMULATOR !== 'true' && process.env.ENABLE_MOCK_BILLING !== 'true') {
        throw new HttpsError('failed-precondition', '모의 결제는 로컬 테스트에서만 사용할 수 있습니다.');
      }
      if (!context.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
      const tenantId = clean(data?.tenantId, 128);
      const event = clean(data?.event, 40);
      const idempotencyKey = clean(data?.idempotencyKey, 128);
      const seats = Math.max(1, Math.min(999, Number(data?.seats) || 1));
      if (!tenantId || !idempotencyKey || !EVENT_TARGET[event]) {
        throw new HttpsError('invalid-argument', '모의 결제 요청이 올바르지 않습니다.');
      }
      const profile = await db.doc(`users/${context.auth.uid}`).get();
      if (!profile.exists || profile.data()?.tenantId !== tenantId || profile.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', '회사 관리자만 결제를 테스트할 수 있습니다.');
      }

      const consent = data?.consent || {};
      if (['ACTIVATE', 'START_TRIAL'].includes(event)) {
        if (consent.terms !== true || consent.privacy !== true || consent.recurring !== true) {
          throw new HttpsError('failed-precondition', '필수 약관 동의가 필요합니다.');
        }
      }

      const subscriptionRef = db.doc(`tenants/${tenantId}/billing/subscription`);
      const orderId = crypto.createHash('sha256').update(`${tenantId}:${idempotencyKey}`).digest('hex');
      const orderRef = db.doc(`tenants/${tenantId}/billingOrders/${orderId}`);
      const tenantRef = db.doc(`tenants/${tenantId}`);
      const result = await db.runTransaction(async (tx) => {
        const priorOrder = await tx.get(orderRef);
        if (priorOrder.exists) return priorOrder.data();
        const subscriptionSnap = await tx.get(subscriptionRef);
        const now = new Date().toISOString();
        let next;
        try {
          next = transitionSubscription(subscriptionSnap.data() || { status: 'EXPIRED' }, event, now);
        } catch (error) {
          throw new HttpsError('failed-precondition', error.message);
        }
        next = {
          ...next,
          tenantId,
          seats,
          provider: 'mock',
          amountSnapshot: Math.max(0, Number(data?.amount) || 0),
          consentSnapshot: {
            terms: consent.terms === true,
            privacy: consent.privacy === true,
            recurring: consent.recurring === true,
            termsVersion: clean(consent.termsVersion || 'local-draft', 50),
            privacyVersion: clean(consent.privacyVersion || 'local-draft', 50),
            recurringVersion: clean(consent.recurringVersion || 'local-draft', 50),
            agreedAt: now,
            agreedBy: context.auth.uid,
          },
        };
        const order = {
          id: orderId,
          tenantId,
          event,
          status: next.status,
          provider: 'mock',
          idempotencyKey,
          amount: next.amountSnapshot,
          seats,
          createdAt: now,
        };
        tx.set(subscriptionRef, next);
        tx.set(orderRef, order);
        tx.set(tenantRef, {
          subscriptionStatus: next.status,
          ...(next.status === 'ACTIVE'
            ? { plan: 'pro', paymentStatus: 'PAID', maxStaff: seats }
            : {}),
        }, { merge: true });
        return order;
      });
      return result;
    });

  const getSubscriptionState = functions
    .region('asia-northeast3')
    .https.onCall(async (data, context) => {
      if (!context.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
      const tenantId = clean(data?.tenantId, 128);
      const profile = await db.doc(`users/${context.auth.uid}`).get();
      if (!profile.exists || profile.data()?.tenantId !== tenantId) {
        throw new HttpsError('permission-denied', '소속 회사만 조회할 수 있습니다.');
      }
      const snap = await db.doc(`tenants/${tenantId}/billing/subscription`).get();
      return snap.exists ? snap.data() : { tenantId, status: 'EXPIRED', provider: null };
    });

  return { runMockSubscription, getSubscriptionState };
}

module.exports = {
  SUBSCRIPTION_STATES,
  transitionSubscription,
  registerSubscriptionFunctions,
};
