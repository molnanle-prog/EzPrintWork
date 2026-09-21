/**
 * 로컬 Firestore Emulator 공격 회귀 테스트.
 * 실제 프로젝트에는 절대 연결하지 않는다.
 */
import { initializeApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulatorHost) {
  console.error(
    'FIRESTORE_EMULATOR_HOST가 없습니다. npm run test:rules:emulator 로 실행해 주세요.'
  );
  process.exit(2);
}

const [host, portText] = emulatorHost.split(':');
const databaseId = 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755';
const app = initializeApp({
  projectId: 'gen-lang-client-0746903005',
  appId: 'rules-emulator-test',
  apiKey: 'fake-api-key',
});
const db = getFirestore(app, databaseId);
connectFirestoreEmulator(db, host, Number(portText || 8080));

const results = [];

async function expectDenied(name, operation) {
  try {
    await operation();
    results.push({ name, ok: false, message: '요청이 허용됨' });
    console.error(`✗ ${name}: 요청이 허용됨`);
  } catch (error) {
    const code = String(error?.code || '');
    const ok = code.includes('permission-denied');
    results.push({ name, ok, message: error?.message || String(error) });
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `: ${code}`}`);
  }
}

await expectDenied('비인증 tenants 전체 목록 차단', () =>
  getDocs(query(collection(db, 'tenants'), limit(5)))
);
await expectDenied('비인증 회사명 검색 차단', () =>
  getDocs(
    query(
      collection(db, 'tenants'),
      where('name', '>=', '가'),
      where('name', '<=', '가\uf8ff'),
      limit(5)
    )
  )
);
await expectDenied('비인증 tenant 단건 차단', () =>
  getDoc(doc(db, 'tenants', 'tenant-smoke'))
);
await expectDenied('비인증 staff loginId 조회 차단', () =>
  getDocs(
    query(
      collection(db, 'tenants/tenant-smoke/staff'),
      where('loginId', '==', 'staff'),
      limit(5)
    )
  )
);
await expectDenied('비인증 users 생성 차단', () =>
  setDoc(doc(db, 'users', 'attacker'), {
    email: 'attacker@example.com',
    tenantId: 'tenant-smoke',
    role: 'admin',
  })
);
await expectDenied('비인증 staff 생성 차단', () =>
  setDoc(doc(db, 'tenants/tenant-smoke/staff', 'attacker'), {
    name: 'attacker',
    loginId: 'attacker',
    active: true,
  })
);

const failed = results.filter((result) => !result.ok);
console.log(`\nFirestore Emulator 공격 테스트: ${results.length - failed.length}/${results.length} 통과`);
if (failed.length) process.exit(1);
