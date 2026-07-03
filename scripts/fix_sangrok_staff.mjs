/**
 * 상록인쇄기획 staff 중복·유실 정리
 *
 * 사용법:
 *   node scripts/fix_sangrok_staff.mjs           # dry-run (변경 미적용)
 *   node scripts/fix_sangrok_staff.mjs --apply   # Firestore 반영
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const TENANT_ID = process.argv.includes('--tenant')
  ? process.argv[process.argv.indexOf('--tenant') + 1]
  : 'LXn4O7u7yOUreqzZTtwC';
const APPLY = process.argv.includes('--apply');
const DATABASE_ID = 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755';
const PROJECT_ID = 'gen-lang-client-0746903005';
const BACKUP_PATH = path.join(
  os.homedir(),
  'Documents',
  `firestore_backup_${TENANT_ID}.json`
);

let adminInitialized = false;

function initAdmin() {
  if (adminInitialized) return;
  const keyPaths = [
    path.join(process.cwd(), 'serviceAccountKey.json'),
    path.join(os.homedir(), 'serviceAccountKey.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean);

  for (const keyPath of keyPaths) {
    if (keyPath && fs.existsSync(keyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      admin.initializeApp({
        credential: admin.cert(serviceAccount),
        projectId: PROJECT_ID,
      });
      adminInitialized = true;
      console.log(`✓ 서비스 계정: ${keyPath}`);
      return;
    }
  }

  admin.initializeApp({
    credential: admin.applicationDefault(),
    projectId: PROJECT_ID,
  });
  adminInitialized = true;
  console.log('✓ Application Default Credentials');
}

function scoreStaffDoc(data) {
  let score = 0;
  if (data.active !== false) score += 10;
  if (data.isDeleted !== true) score += 10;
  if (data.loginId) score += 5;
  if (data.password) score += 3;
  if (data.uid) score += 3;
  if (data.extensionNumber) score += 2;
  if (data.phone || data.phoneCompany) score += 1;
  return score;
}

function pickCanonicalDoc(docs) {
  return [...docs].sort((a, b) => scoreStaffDoc(b.data()) - scoreStaffDoc(a.data()))[0];
}

async function run() {
  initAdmin();
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const db = getFirestore(admin.getApp(), DATABASE_ID);

  const tenantSnap = await db.collection('tenants').doc(TENANT_ID).get();
  if (!tenantSnap.exists) {
    console.error(`테넌트 ${TENANT_ID} 없음`);
    process.exit(1);
  }
  const tenant = tenantSnap.data();
  const ownerId = String(tenant.ownerId || '');
  console.log(`\n=== ${tenant.name || TENANT_ID} (${TENANT_ID}) ===`);
  console.log(`ownerId: ${ownerId}`);
  console.log(`mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const staffSnap = await db.collection('tenants').doc(TENANT_ID).collection('staff').get();
  const staffDocs = staffSnap.docs.map((d) => ({ id: d.id, data: d.data() }));

  console.log(`현재 staff ${staffDocs.length}건`);
  staffDocs.forEach(({ id, data }) => {
    console.log(
      `  - ${id} | ${data.name || '-'} | loginId=${data.loginId || '-'} | active=${data.active !== false} | deleted=${data.isDeleted === true}`
    );
  });

  const byLoginId = new Map();
  const byName = new Map();
  for (const row of staffDocs) {
    const login = String(row.data.loginId || '').trim().toLowerCase();
    if (login) {
      if (!byLoginId.has(login)) byLoginId.set(login, []);
      byLoginId.get(login).push(row);
    }
    const name = String(row.data.name || '').trim();
    if (name) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(row);
    }
  }

  const updates = [];

  // loginId 중복 → canonical 1개만 유지
  for (const [loginId, rows] of byLoginId.entries()) {
    if (rows.length <= 1) continue;
    const keep = pickCanonicalDoc(rows);
    for (const row of rows) {
      if (row.id === keep.id) continue;
      updates.push({
        ref: db.collection('tenants').doc(TENANT_ID).collection('staff').doc(row.id),
        patch: { isDeleted: true, active: false, deletedAt: new Date().toISOString() },
        reason: `loginId 중복 제거 (${loginId}) → keep ${keep.id}`,
      });
    }
  }

  // 이름 중복(로그인 없는 유령 카드) → loginId 있는 canonical 우선
  for (const [name, rows] of byName.entries()) {
    if (rows.length <= 1) continue;
    const activeRows = rows.filter((r) => r.data.isDeleted !== true);
    if (activeRows.length <= 1) continue;
    const keep = pickCanonicalDoc(activeRows);
    for (const row of activeRows) {
      if (row.id === keep.id) continue;
      if (updates.some((u) => u.ref.path.endsWith(`/${row.id}`))) continue;
      updates.push({
        ref: db.collection('tenants').doc(TENANT_ID).collection('staff').doc(row.id),
        patch: { isDeleted: true, active: false, deletedAt: new Date().toISOString() },
        reason: `이름 중복 제거 (${name}) → keep ${keep.id}`,
      });
    }
  }

  // 백업에서 누락 staff 복원
  if (fs.existsSync(BACKUP_PATH)) {
    const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
    const backupStaff = Array.isArray(backup.staff) ? backup.staff : [];
    const liveIds = new Set(staffDocs.map((s) => s.id));
    const liveLoginIds = new Set(
      staffDocs
        .filter((s) => s.data.isDeleted !== true && s.data.active !== false)
        .map((s) => String(s.data.loginId || '').trim().toLowerCase())
        .filter(Boolean)
    );

    for (const s of backupStaff) {
      if (s.isDeleted === true) continue;
      const login = String(s.loginId || '').trim().toLowerCase();
      if (login && liveLoginIds.has(login)) continue;
      if (liveIds.has(s.id)) continue;
      if (ownerId && (s.id === ownerId || s.uid === ownerId)) continue;

      updates.push({
        ref: db.collection('tenants').doc(TENANT_ID).collection('staff').doc(s.id),
        patch: { ...s, isDeleted: false, active: s.active !== false },
        reason: `백업 복원 (${s.name || s.id})`,
        merge: true,
      });
    }
  } else {
    console.warn(`\n백업 없음: ${BACKUP_PATH}`);
  }

  console.log(`\n예정 작업 ${updates.length}건:`);
  updates.forEach((u, i) => console.log(`  ${i + 1}. ${u.reason}`));

  if (!APPLY) {
    console.log('\n--apply 옵션으로 실제 반영하세요.');
    return;
  }

  for (const u of updates) {
    await u.ref.set(u.patch, { merge: u.merge !== false });
    console.log(`✓ ${u.reason}`);
  }

  console.log('\n완료. 관리 화면 새로고침 후 확인하세요.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
