/**
 * Firestore backups 컬렉션 누적 문서 일괄 삭제 (무료 한도 절약)
 * 사용법: node scripts/cleanup_firestore_backups.mjs [tenantId|--all]
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TARGET = process.argv[2] || 'tenant-or73mu1cz';
const DATABASE_ID = 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755';
const PROJECT_ID = 'gen-lang-client-0746903005';
const BATCH_SIZE = 200;

function loadAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) throw new Error('firebase login 필요');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config?.tokens?.access_token) throw new Error('액세스 토큰 없음');
  if (config.tokens.expires_at && Date.now() > config.tokens.expires_at - 60_000) {
    throw new Error('토큰 만료 — firebase login --reauth');
  }
  return config.tokens.access_token;
}

async function listBackupIds(token, tenantId) {
  const parent = `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/tenants/${tenantId}`;
  const url = `https://firestore.googleapis.com/v1/${parent}/backups?pageSize=300`;
  const ids = [];
  let pageToken = '';
  do {
    const res = await fetch(pageToken ? `${url}&pageToken=${pageToken}` : url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    for (const doc of data.documents || []) {
      ids.push(doc.name.split('/').pop());
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return ids;
}

async function listTenants(token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/tenants?pageSize=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.documents || []).map((d) => d.name.split('/').pop());
}

async function deleteBatch(token, tenantId, ids) {
  const writes = ids.map((id) => ({
    delete: `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/tenants/${tenantId}/backups/${id}`,
  }));
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) throw new Error((await res.text()).slice(0, 400));
}

async function cleanupTenant(token, tenantId) {
  const ids = await listBackupIds(token, tenantId);
  if (!ids.length) {
    console.log(`  ${tenantId}: 백업 없음`);
    return 0;
  }
  console.log(`  ${tenantId}: ${ids.length}건 삭제 중...`);
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    await deleteBatch(token, tenantId, ids.slice(i, i + BATCH_SIZE));
    console.log(`    → ${Math.min(i + BATCH_SIZE, ids.length)} / ${ids.length}`);
  }
  return ids.length;
}

async function run() {
  console.log('=== Firestore backups 정리 ===');
  const token = loadAccessToken();
  const tenants = TARGET === '--all' ? await listTenants(token) : [TARGET];
  let total = 0;
  for (const tenantId of tenants) {
    try {
      total += await cleanupTenant(token, tenantId);
    } catch (e) {
      console.error(`  ${tenantId} 실패:`, e.message);
    }
  }
  console.log(`\n완료: 총 ${total}건 삭제`);
}

run().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
