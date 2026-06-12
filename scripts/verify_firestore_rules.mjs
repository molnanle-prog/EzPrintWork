/**
 * Firestore rules 배포 후 직원 가입/로그인·회사 검색 동작을 검증합니다.
 * 사용법: node scripts/verify_firestore_rules.mjs
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  limit,
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'gen-lang-client-0746903005',
  appId: '1:19768956246:web:a6cc6b3ca6ffbd53e572f7',
  apiKey: 'AIzaSyB04AtEe56eeP40C4cDS7-uvvaPZHa3pkQ',
  authDomain: 'gen-lang-client-0746903005.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✅ ${name}`);
  } catch (err) {
    const code = err?.code || 'unknown';
    const msg = err?.message || String(err);
    results.push({ name, ok: false, code, msg });
    console.log(`❌ ${name} — [${code}] ${msg}`);
  }
}

async function run() {
  console.log('=== EzPrintWork Firestore Rules 검증 ===');
  console.log(`Project: ${firebaseConfig.projectId}`);
  console.log(`Database: ${firebaseConfig.firestoreDatabaseId}`);
  console.log('(비인증 클라이언트 기준 — 직원 로그인/가입 흐름)\n');

  let sampleTenantId = null;
  let sampleTenantName = null;
  let sampleJoinCode = null;

  await test('1. tenants 목록 조회 (회사 검색)', async () => {
    const snap = await getDocs(query(collection(db, 'tenants'), limit(5)));
    if (snap.empty) {
      console.log('   → 테넌트 없음 (규칙은 통과, 데이터 없음)');
      return;
    }
    const first = snap.docs[0];
    sampleTenantId = first.id;
    sampleTenantName = first.data().name;
    sampleJoinCode = first.data().joinCode;
    console.log(`   → 샘플 테넌트: ${sampleTenantName} (${sampleTenantId})`);
  });

  await test('2. tenant 단건 조회 (직원 로그인 후 plan 확인)', async () => {
    if (!sampleTenantId) {
      console.log('   → 스킵 (테넌트 없음)');
      return;
    }
    const snap = await getDoc(doc(db, 'tenants', sampleTenantId));
    if (!snap.exists()) throw new Error('tenant not found');
    console.log(`   → plan: ${snap.data().plan || 'free'}`);
  });

  await test('3. name+joinCode 테넌트 쿼리 (직원 가입 1단계)', async () => {
    if (!sampleTenantName || !sampleJoinCode) {
      console.log('   → 스킵 (joinCode 없는 테넌트)');
      return;
    }
    const snap = await getDocs(
      query(
        collection(db, 'tenants'),
        where('name', '==', sampleTenantName),
        where('joinCode', '==', sampleJoinCode),
        limit(1)
      )
    );
    if (snap.empty) throw new Error('tenant query returned empty');
    console.log(`   → 일치 테넌트: ${snap.docs[0].id}`);
  });

  await test('4a. staff loginId 단일 쿼리 (직원 로그인 v1.2.5+)', async () => {
    if (!sampleTenantId) {
      console.log('   → 스킵 (테넌트 없음)');
      return;
    }
    const snap = await getDocs(
      query(
        collection(db, `tenants/${sampleTenantId}/staff`),
        where('loginId', '==', '__nonexistent_test__'),
        limit(10)
      )
    );
    console.log(`   → 쿼리 허용됨 (결과 ${snap.size}건 — 권한 오류 없음)`);
  });

  await test('5. users tenantId+loginId 중복 체크 쿼리 (직원 가입)', async () => {
    if (!sampleTenantId) {
      console.log('   → 스킵 (테넌트 없음)');
      return;
    }
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('tenantId', '==', sampleTenantId),
        where('loginId', '==', '__nonexistent_test__'),
        limit(1)
      )
    );
    console.log(`   → 쿼리 허용됨 (결과 ${snap.size}건)`);
  });

  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n=== 결과: ${passed} 통과 / ${failed} 실패 ===`);

  if (failed > 0) {
    console.log('\n⚠️  firestore.rules 배포가 필요하거나 규칙-앱 불일치가 남아 있습니다.');
    console.log('   배포: firebase deploy --only firestore:rules,firestore:indexes');
    process.exit(1);
  }
  console.log('\n✅ 비인증 직원 가입/로그인·회사 검색에 필요한 Firestore 규칙이 정상 동작합니다.');
}

run();
