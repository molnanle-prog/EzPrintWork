/**
 * EzPrintWork — 코페이(Korpay) 인증결제 Cloud Functions (1st gen)
 *
 * Gen2 Cloud Run IAM(403) 이슈를 피하기 위해 https.onCall / onRequest (v1) 사용.
 * - korpayCreatePayment (callable)
 * - korpayConfirm (HTTPS POST returnUrl)
 */
const functions = require('firebase-functions/v1');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const crypto = require('crypto');

initializeApp();

const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755';

const db = getFirestore(undefined, FIRESTORE_DATABASE_ID);

const REGION = 'asia-northeast3';

/** PRO 1인당 월 요금 (원, 부가세 별도) — 프론트 planLimits.PRO_MONTHLY_PRICE 와 동일 */
const PRO_MONTHLY_PRICE = 1000;

function requireEnv(name) {
  let v = String(process.env[name] || '').trim();
  // .env에 따옴표가 포함되면 해시 검증 실패(E0xx)로 이어짐
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getMerchantConfig() {
  return {
    merchantId: requireEnv('KORPAY_MERCHANT_ID'),
    mkey: requireEnv('KORPAY_MKEY'),
    apiBase: (process.env.KORPAY_API_BASE || 'https://payments.korpay.com/v1').replace(/\/$/, ''),
    sdkBase: (process.env.KORPAY_SDK_BASE || 'https://payments.korpay.com/v1').replace(/\/$/, ''),
    appPublicUrl: (process.env.APP_PUBLIC_URL || 'https://ez-hub.kr/ezpw').replace(/\/$/, ''),
    functionsPublicUrl: String(process.env.FUNCTIONS_PUBLIC_URL || '').replace(/\/$/, ''),
    confirmUrl: String(process.env.KORPAY_CONFIRM_URL || '').replace(/\/$/, ''),
  };
}

/** 한국 시간(KST) 기준 yyyymmddHHmmss — Cloud Functions는 UTC라 로컬 Date 쓰면 시차 발생 */
function yyyymmddhhmmss(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

/** hashKey = SHA-256(merchantId + ediDate + amount + mkey) hex */
function buildHashKey(merchantId, ediDate, amount, mkey) {
  const raw = `${merchantId}${ediDate}${amount}${mkey}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function buildOrderNumber() {
  const ts = yyyymmddhhmmss();
  const rnd = Math.floor(Math.random() * 9000) + 1000;
  return `ezpw${ts}${rnd}`.slice(0, 40);
}

function chargeAmountWon(staffCount) {
  const seats = Math.max(1, Math.min(999, Math.floor(Number(staffCount) || 1)));
  const base = seats * PRO_MONTHLY_PRICE;
  const vat = Math.floor(base * 0.1);
  return base + vat;
}

function staffCountToPlanCode(staffCount) {
  const n = Math.max(1, Math.min(999, Math.floor(Number(staffCount) || 1)));
  return `u${n}`;
}

function addOneMonthIso(from = new Date()) {
  const d = new Date(from.getTime());
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

function frontendRedirect(appPublicUrl, path, orderNumber, extra = {}) {
  const q = new URLSearchParams({ orderNumber: orderNumber || '', ...extra });
  return `${appPublicUrl}/#${path}?${q.toString()}`;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = typeof req.rawBody === 'string'
    ? req.rawBody
    : Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : '';
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

/**
 * 로그인 사용자 → 결제창용 파라미터 발급
 */
exports.korpayCreatePayment = functions
  .region(REGION)
  .https.onCall(async (data, context) => {
    try {
      if (process.env.ENABLE_KORPAY_PAYMENTS !== 'true') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          '실결제는 비활성화되어 있습니다. 로컬 모의 결제를 사용해 주세요.'
        );
      }
      if (!context.auth?.uid) {
        throw new functions.https.HttpsError('unauthenticated', '로그인이 필요합니다.');
      }

      const uid = context.auth.uid;
      const tenantId = String(data?.tenantId || '').trim();
      const staffCount = Math.max(1, Math.min(999, Math.floor(Number(data?.staffCount) || 1)));
      const customerName = String(data?.customerName || '').slice(0, 30);
      const customerEmail = String(data?.customerEmail || '').slice(0, 60);
      const customerPhone = String(data?.customerPhone || '').replace(/[^0-9]/g, '').slice(0, 20);

      if (!tenantId) {
        throw new functions.https.HttpsError('invalid-argument', 'tenantId가 필요합니다.');
      }

      let cfg;
      try {
        cfg = getMerchantConfig();
      } catch (e) {
        console.error(e);
        throw new functions.https.HttpsError('failed-precondition', '결제 설정(KORPAY_*)이 없습니다.');
      }

      const returnUrl =
        cfg.confirmUrl ||
        (cfg.functionsPublicUrl ? `${cfg.functionsPublicUrl}/korpayConfirm` : '');
      if (!returnUrl) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'KORPAY_CONFIRM_URL 또는 FUNCTIONS_PUBLIC_URL 을 설정하세요.'
        );
      }

      const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
      if (!tenantSnap.exists) {
        throw new functions.https.HttpsError('not-found', '회사를 찾을 수 없습니다.');
      }
      const tenant = tenantSnap.data() || {};
      if (tenant.ownerId !== uid) {
        throw new functions.https.HttpsError(
          'permission-denied',
          '요금제 결제는 메인 관리자만 가능합니다.'
        );
      }

      const amount = chargeAmountWon(staffCount);
      const ediDate = yyyymmddhhmmss();
      const orderNumber = buildOrderNumber();
      const hashKey = buildHashKey(cfg.merchantId, ediDate, String(amount), cfg.mkey);
      const productName = 'EzPrintWork PRO';
      const now = new Date().toISOString();

      await db.doc(`paymentOrders/${orderNumber}`).set({
        orderNumber,
        tenantId,
        uid,
        staffCount,
        amount,
        productName,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      });

      // 5만원 미만은 일시불만 가능 (코페이 정책) — 할부 옵션 넣으면 결제창이 안 뜸
      const card =
        amount < 50000
          ? { installment: [0] }
          : { installment: [0, 2, 3, 4, 5, 6] };

      return {
        sdkBase: cfg.sdkBase,
        payment: {
          merchantId: cfg.merchantId,
          productName,
          orderNumber,
          amount,
          payMethod: 'card',
          returnUrl,
          ediDate,
          hashKey,
          customerName: customerName || undefined,
          customerEmail: customerEmail || undefined,
          customerPhone: customerPhone || undefined,
          language: 'ko',
          reserved: tenantId.slice(0, 255),
          card,
        },
      };
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      console.error('[korpayCreatePayment] unexpected', err);
      throw new functions.https.HttpsError(
        'internal',
        err instanceof Error ? err.message : '결제 준비 중 서버 오류가 발생했습니다.'
      );
    }
  });

/**
 * 코페이 → returnUrl POST (x-www-form-urlencoded)
 */
exports.korpayConfirm = functions
  .region(REGION)
  .https.onRequest(async (req, res) => {
    if (process.env.ENABLE_KORPAY_PAYMENTS !== 'true') {
      res.status(503).send('Payments disabled');
      return;
    }
    const origin = String(req.get('Origin') || '');
    const allowedOrigins = new Set([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://ez-hub.kr',
    ]);
    if (allowedOrigins.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    const cfg = (() => {
      try {
        return getMerchantConfig();
      } catch (e) {
        console.error(e);
        res.status(500).send('Payment config missing');
        return null;
      }
    })();
    if (!cfg) return;

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const body = parseBody(req);
    const resultCode = String(body.resultCode ?? 'E999');
    const message = String(body.message ?? '');
    const orderNumber = String(body.orderNumber ?? '');
    const paymentKey = String(body.paymentKey ?? '');
    const authAmount = String(body.amount ?? '');

    const failUrl = frontendRedirect(cfg.appPublicUrl, '/payment/fail', orderNumber, {
      reason: resultCode || 'auth_fail',
      message: String(message || '').slice(0, 120),
    });
    const successUrl = frontendRedirect(cfg.appPublicUrl, '/payment/success', orderNumber);

    const isAuthSuccess = resultCode === '0000' && !!paymentKey;
    if (!isAuthSuccess) {
      console.error('[korpayConfirm] auth failed', { resultCode, message, orderNumber });
      res.redirect(303, failUrl);
      return;
    }

    const orderRef = db.doc(`paymentOrders/${orderNumber}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      console.error('[korpayConfirm] unknown order', orderNumber);
      res.redirect(303, failUrl);
      return;
    }

    const order = orderSnap.data() || {};
    if (order.status === 'PAID') {
      res.redirect(303, successUrl);
      return;
    }

    if (authAmount && String(order.amount) !== String(authAmount)) {
      console.error('[korpayConfirm] amount mismatch', {
        expected: order.amount,
        got: authAmount,
        orderNumber,
      });
      await orderRef.set(
        { status: 'FAILED', failReason: 'amount_mismatch', updatedAt: new Date().toISOString() },
        { merge: true }
      );
      res.redirect(303, failUrl);
      return;
    }

    let httpCode = 0;
    let result = null;
    try {
      const query = new URLSearchParams({ paymentKey }).toString();
      const response = await fetch(`${cfg.apiBase}/payments/confirm?${query}`, {
        method: 'POST',
        headers: {
          'User-Agent': 'EzPrintWork-Korpay-Client',
          Accept: 'application/json',
        },
      });
      httpCode = response.status;
      const text = await response.text();
      try {
        result = JSON.parse(text);
      } catch {
        result = { resultCode: 'E999', message: text?.slice(0, 200) || 'invalid json' };
      }
    } catch (err) {
      console.error('[korpayConfirm] confirm fetch error', err);
      result = { resultCode: 'E999', message: 'confirm fetch failed' };
    }

    console.log('[korpayConfirm] API', { httpCode, resultCode: result?.resultCode, orderNumber });

    const isApiSuccess = httpCode === 200 && result?.resultCode === '3001';
    if (!isApiSuccess) {
      await orderRef.set(
        {
          status: 'FAILED',
          failReason: result?.resultCode || `http_${httpCode}`,
          failMessage: result?.message || '',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      res.redirect(303, failUrl);
      return;
    }

    const paidAmount = Number(result.amount ?? order.amount);
    if (Number.isFinite(paidAmount) && paidAmount !== Number(order.amount)) {
      console.error('[korpayConfirm] approved amount mismatch', {
        expected: order.amount,
        got: paidAmount,
      });
      await orderRef.set(
        {
          status: 'FAILED',
          failReason: 'approved_amount_mismatch',
          updatedAt: new Date().toISOString(),
          confirmResult: result,
        },
        { merge: true }
      );
      res.redirect(303, failUrl);
      return;
    }

    const plan = staffCountToPlanCode(order.staffCount);
    const maxStaff = Math.max(1, Math.floor(Number(order.staffCount) || 1));
    const licenseExpiresAt = addOneMonthIso();
    const now = new Date().toISOString();

    const tenantRef = db.doc(`tenants/${order.tenantId}`);
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(orderRef);
      if (fresh.exists && fresh.data()?.status === 'PAID') return;

      tx.set(
        tenantRef,
        {
          plan,
          paymentStatus: 'PAID',
          maxStaff,
          licenseExpiresAt,
          lastPaymentAt: now,
          lastPaymentOrderNumber: orderNumber,
          lastPaymentTid: result.tid || '',
        },
        { merge: true }
      );

      tx.set(
        orderRef,
        {
          status: 'PAID',
          tid: result.tid || '',
          approvedAt: result.approvedAt || now,
          confirmResult: {
            resultCode: result.resultCode,
            amount: result.amount,
            payMethod: result.payMethod,
            card: result.card || null,
          },
          updatedAt: now,
          paidAt: now,
        },
        { merge: true }
      );
    });

    res.redirect(303, successUrl);
  });

const { registerMembershipFunctions } = require('./membership');
Object.assign(exports, registerMembershipFunctions(functions, db));
const { registerSubscriptionFunctions } = require('./subscriptionCore');
Object.assign(exports, registerSubscriptionFunctions(functions, db));
