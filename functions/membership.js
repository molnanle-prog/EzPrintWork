const { getAuth } = require('firebase-admin/auth');

const DEFAULT_MAX_STAFF = 2;
const MAX_SEARCH_RESULTS = 20;
const rateBuckets = new Map();

function cleanText(value, max = 100) {
  return String(value || '').trim().slice(0, max);
}

function validId(value) {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(String(value || ''));
}

function staffLoginEmail(loginId) {
  const id = cleanText(loginId, 64).toLowerCase();
  return id.includes('@') ? id : `${id}@ez-hub.kr`;
}

function activeSeatCount(staffDocs, ownerId) {
  const active = staffDocs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((staff) => staff.active !== false && staff.isDeleted !== true);
  const nonOwner = active.filter((staff) => (staff.uid || staff.id) !== ownerId);
  return 1 + nonOwner.length;
}

function enforcePublicRequestGuards(context, bucket, max = 30) {
  if (process.env.ENFORCE_APP_CHECK === 'true' && !context?.app) {
    throw new Error('app-check-required');
  }
  const ip = cleanText(context?.rawRequest?.ip || 'unknown', 100);
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || now >= current.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > max) throw new Error('rate-limit-exceeded');
}

function defaultSettings(companyName, businessNumber, phone) {
  return {
    productDefinitions: { definitions: [] },
    statusDefinitions: { definitions: [] },
    processingDefinitions: { definitions: [] },
    pricing: { baseLaborCost: 10000, printColorCost: 50, marginRate: 1.6 },
    companyInfo: {
      name: companyName,
      businessNumber: businessNumber || '',
      phone: phone || '',
    },
    roles: {
      roles: ['관리자', '디자이너', '인쇄기장', '후가공', '배송', '실장', '부장', '과장', '대리', '사원'],
    },
  };
}

function registerMembershipFunctions(functions, db) {
  const HttpsError = functions.https.HttpsError;

  const searchTenantsPublic = functions
    .region('asia-northeast3')
    .https.onCall(async (data, context) => {
      try {
        enforcePublicRequestGuards(context, 'tenant-search', 40);
      } catch (error) {
        throw new HttpsError(
          error.message === 'app-check-required' ? 'failed-precondition' : 'resource-exhausted',
          '요청이 너무 많거나 앱 검증이 필요합니다.'
        );
      }
      const term = cleanText(data?.nameQuery, 100);
      if (term.length < 1) {
        throw new HttpsError('invalid-argument', '회사명을 입력해 주세요.');
      }
      const snap = await db
        .collection('tenants')
        .where('name', '>=', term)
        .where('name', '<=', `${term}\uf8ff`)
        .limit(MAX_SEARCH_RESULTS)
        .get();
      return {
        tenants: snap.docs.map((doc) => ({ id: doc.id, name: cleanText(doc.data().name, 100) })),
      };
    });

  const resolveStaffLogin = functions
    .region('asia-northeast3')
    .https.onCall(async (data, context) => {
      try {
        enforcePublicRequestGuards(context, 'staff-resolve', 30);
      } catch (error) {
        throw new HttpsError(
          error.message === 'app-check-required' ? 'failed-precondition' : 'resource-exhausted',
          '요청이 너무 많거나 앱 검증이 필요합니다.'
        );
      }
      const tenantId = cleanText(data?.tenantId, 128);
      const loginId = cleanText(data?.loginId, 64).toLowerCase();
      if (!validId(tenantId) || loginId.length < 2) {
        throw new HttpsError('invalid-argument', '회사와 로그인 아이디를 확인해 주세요.');
      }
      const snap = await db
        .collection(`tenants/${tenantId}/staff`)
        .where('loginId', '==', loginId)
        .limit(5)
        .get();
      const row = snap.docs.find((doc) => {
        const value = doc.data();
        return value.active !== false && value.isDeleted !== true;
      });
      if (!row) throw new HttpsError('not-found', '직원 계정을 찾을 수 없습니다.');
      const staff = row.data();
      return {
        staffDocId: row.id,
        uid: cleanText(staff.uid || row.id, 128),
        loginId,
        authEmail: cleanText(staff.email || staffLoginEmail(loginId), 256).toLowerCase(),
        name: cleanText(staff.name || staff.userName || '사원', 50),
        role: cleanText(staff.role || staff.position || '사원', 50),
        isCompanyAdmin: staff.isCompanyAdmin === true,
        avatarUrl: cleanText(staff.avatarUrl, 1000),
      };
    });

  const secureCreateTenant = functions
    .region('asia-northeast3')
    .https.onCall(async (data, context) => {
      if (!context.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
      if (context.auth.token.email_verified !== true) {
        throw new HttpsError('failed-precondition', '이메일 인증이 필요합니다.');
      }

      const uid = context.auth.uid;
      const name = cleanText(data?.name, 100);
      const businessNumber = cleanText(data?.businessNumber, 30);
      const ownerPhone = cleanText(data?.ownerPhone, 30);
      const joinCode = cleanText(data?.joinCode, 64);
      if (!name || joinCode.length < 6 || !ownerPhone) {
        throw new HttpsError('invalid-argument', '회사명·연락처·입장 코드를 확인해 주세요.');
      }

      const userRef = db.doc(`users/${uid}`);
      const existingUser = await userRef.get();
      if (existingUser.exists && existingUser.data()?.tenantId) {
        throw new HttpsError('already-exists', '이미 소속된 회사가 있습니다.');
      }

      const tenantRef = db.collection('tenants').doc();
      const now = new Date().toISOString();
      const ownerEmail = cleanText(context.auth.token.email, 256).toLowerCase();
      const ownerName = cleanText(
        context.auth.token.name || ownerEmail.split('@')[0] || '대표',
        50
      );
      const maxStaff = DEFAULT_MAX_STAFF;
      const batch = db.batch();
      batch.set(tenantRef, {
        id: tenantRef.id,
        name,
        ownerId: uid,
        plan: 'lite',
        paymentStatus: 'AD',
        maxStaff,
        activeSeatCount: 1,
        createdAt: now,
        lastActiveAt: now,
        businessNumber,
        joinCode,
        ownerPhone,
        contactPhone: ownerPhone,
      });
      batch.set(userRef, {
        uid,
        id: uid,
        email: ownerEmail,
        displayName: ownerName,
        name: ownerName,
        contactInfo: ownerPhone,
        tenantId: tenantRef.id,
        role: 'admin',
        createdAt: now,
      }, { merge: true });
      batch.set(db.doc(`tenants/${tenantRef.id}/staff/${uid}`), {
        id: uid,
        uid,
        name: ownerName,
        role: '관리자',
        phone: ownerPhone,
        active: true,
        email: ownerEmail,
        loginId: ownerEmail,
        joinDate: now,
      });
      batch.set(
        db.doc(`tenants/${tenantRef.id}/settings/main`),
        defaultSettings(name, businessNumber, ownerPhone)
      );
      await batch.commit();
      return { tenantId: tenantRef.id };
    });

  const secureStaffSignup = functions
    .region('asia-northeast3')
    .https.onCall(async (data, context) => {
      try {
        enforcePublicRequestGuards(context, 'staff-signup', 10);
      } catch (error) {
        throw new HttpsError(
          error.message === 'app-check-required' ? 'failed-precondition' : 'resource-exhausted',
          '요청이 너무 많거나 앱 검증이 필요합니다.'
        );
      }
      const companyName = cleanText(data?.companyName, 100);
      const joinCode = cleanText(data?.joinCode, 64);
      const loginId = cleanText(data?.loginId, 64).toLowerCase();
      const password = String(data?.password || '').trim();
      const staffName = cleanText(data?.staffName, 50);
      const staffPhone = cleanText(data?.staffPhone, 30);
      const staffRole = cleanText(data?.staffRole || '사원', 50);
      if (!companyName || joinCode.length < 6 || loginId.length < 2 || password.length < 6) {
        throw new HttpsError('invalid-argument', '가입 정보를 확인해 주세요.');
      }

      const tenantSnap = await db
        .collection('tenants')
        .where('name', '==', companyName)
        .where('joinCode', '==', joinCode)
        .limit(1)
        .get();
      if (tenantSnap.empty) {
        throw new HttpsError('permission-denied', '회사명 또는 입장 코드가 일치하지 않습니다.');
      }
      const tenantDoc = tenantSnap.docs[0];
      const tenantId = tenantDoc.id;
      const tenant = tenantDoc.data();
      const duplicate = await db
        .collection(`tenants/${tenantId}/staff`)
        .where('loginId', '==', loginId)
        .limit(1)
        .get();
      if (!duplicate.empty) throw new HttpsError('already-exists', '이미 사용 중인 아이디입니다.');

      const auth = getAuth();
      const email = staffLoginEmail(loginId);
      let createdUser = null;
      try {
        createdUser = await auth.createUser({
          email,
          password,
          displayName: staffName,
          emailVerified: true,
        });

        const activeStaff = await db
          .collection(`tenants/${tenantId}/staff`)
          .where('active', '==', true)
          .limit(1000)
          .get();
        const observedSeats = activeSeatCount(activeStaff.docs, tenant.ownerId);
        const maxStaff = Math.max(1, Math.min(999, Number(tenant.maxStaff) || DEFAULT_MAX_STAFF));
        const tenantRef = tenantDoc.ref;
        const staffRef = db.doc(`tenants/${tenantId}/staff/${createdUser.uid}`);
        const userRef = db.doc(`users/${createdUser.uid}`);
        const now = new Date().toISOString();

        await db.runTransaction(async (tx) => {
          const freshTenant = await tx.get(tenantRef);
          const fresh = freshTenant.data() || {};
          const currentSeats = Number.isFinite(fresh.activeSeatCount)
            ? Number(fresh.activeSeatCount)
            : observedSeats;
          const currentMax = Math.max(1, Math.min(999, Number(fresh.maxStaff) || maxStaff));
          if (currentSeats >= currentMax) {
            throw new HttpsError('resource-exhausted', `요금제 인원 제한(${currentMax}명)에 도달했습니다.`);
          }
          tx.set(userRef, {
            uid: createdUser.uid,
            id: createdUser.uid,
            email,
            tenantId,
            loginId,
            role: 'staff',
            userName: staffName,
            name: staffName,
            position: staffRole,
            contactInfo: staffPhone,
            createdAt: now,
          });
          tx.set(staffRef, {
            id: createdUser.uid,
            uid: createdUser.uid,
            name: staffName,
            role: staffRole,
            phone: staffPhone,
            active: true,
            isCompanyAdmin: false,
            email,
            loginId,
            joinDate: now,
          });
          tx.set(tenantRef, { activeSeatCount: currentSeats + 1 }, { merge: true });
        });
      } catch (error) {
        if (createdUser?.uid) {
          await auth.deleteUser(createdUser.uid).catch(() => {});
        }
        if (error instanceof HttpsError) throw error;
        if (error?.code === 'auth/email-already-exists') {
          throw new HttpsError('already-exists', '이미 등록된 아이디입니다.');
        }
        console.error('[secureStaffSignup]', error);
        throw new HttpsError('internal', '직원 가입 처리에 실패했습니다.');
      }

      return { tenantId, uid: createdUser.uid, email };
    });

  return {
    searchTenantsPublic,
    resolveStaffLogin,
    secureCreateTenant,
    secureStaffSignup,
  };
}

module.exports = { registerMembershipFunctions, activeSeatCount, staffLoginEmail };
