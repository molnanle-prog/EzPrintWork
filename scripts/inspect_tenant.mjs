/**
 * 테넌트 Firestore 데이터 현황 조회
 * 사용법: node scripts/inspect_tenant.mjs [tenantId]
 */
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: 'gen-lang-client-0746903005',
  appId: '1:19768956246:web:a6cc6b3ca6ffbd53e572f7',
  apiKey: 'AIzaSyB04AtEe56eeP40C4cDS7-uvvaPZHa3pkQ',
  authDomain: 'gen-lang-client-0746903005.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755',
};

const TENANT_ID = process.argv[2] || 'tenant-or73mu1cz';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function countCollection(tenantId, col) {
  const snap = await getDocs(collection(db, 'tenants', tenantId, col));
  return snap.size;
}

async function run() {
  console.log('=== EzPrintWork 테넌트 현황 ===\n');

  const tenantRef = doc(db, 'tenants', TENANT_ID);
  const tenantSnap = await getDoc(tenantRef);
  if (!tenantSnap.exists()) {
    const byName = await getDocs(
      query(collection(db, 'tenants'), where('name', '==', '춘천인쇄'), limit(3))
    );
    if (byName.empty) {
      console.error(`테넌트 ${TENANT_ID} 없음`);
      process.exit(1);
    }
    const t = byName.docs[0];
    console.log('이름으로 찾음:', t.id, t.data());
    return runFor(t.id, t.data());
  }
  await runFor(TENANT_ID, tenantSnap.data());
}

async function runFor(tenantId, tenantData) {
  console.log('테넌트 ID:', tenantId);
  console.log('회사명:', tenantData.name);
  console.log('joinCode:', tenantData.joinCode);
  console.log('plan:', tenantData.plan);
  console.log('dbPath:', tenantData.dbPath || '(없음)');
  console.log('');

  const cols = ['jobs', 'clients', 'staff', 'quotes', 'messages', 'leaves', 'papers', 'settings', 'backups'];
  for (const col of cols) {
    const n = await countCollection(tenantId, col);
    console.log(`${col.padEnd(12)} ${n}건`);
  }

  const settingsMain = await getDoc(doc(db, 'tenants', tenantId, 'settings', 'main'));
  if (settingsMain.exists()) {
    const d = settingsMain.data();
    console.log('\nsettings/main:');
    console.log('  companyInfo.name:', d.companyInfo?.name ?? '(없음)');
    console.log('  keys:', Object.keys(d).join(', '));
  } else {
    console.log('\nsettings/main: 없음');
  }

  const settingsSnap = await getDocs(collection(db, 'tenants', tenantId, 'settings'));
  if (settingsSnap.size > 1) {
    console.log('settings 하위 문서:', settingsSnap.docs.map((d) => d.id).join(', '));
  }

  const jobsSnap = await getDocs(query(collection(db, 'tenants', tenantId, 'jobs'), limit(3)));
  if (!jobsSnap.empty) {
    console.log('\njobs 샘플:');
    jobsSnap.docs.forEach((d) => {
      const j = d.data();
      console.log(`  - ${j.title || d.id} | ${j.clientName || '-'} | ${j.status}`);
    });
  }

  const usersSnap = await getDocs(
    query(collection(db, 'users'), where('tenantId', '==', tenantId), limit(10))
  );
  console.log(`\n연결 users: ${usersSnap.size}명`);
  usersSnap.docs.forEach((d) => {
    const u = d.data();
    console.log(`  - ${u.email || u.loginId || d.id} (${u.role || '-'})`);
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
