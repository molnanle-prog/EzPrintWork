/**
 * ccpdata 폴더(ezpw_*.json) → Firestore 테넌트 업로드
 *
 * 사용법:
 *   node scripts/migrate_ccpdata.mjs "C:\path\to\ccpdata" [tenantId]
 *
 * 폴더 규칙 (향후 동일 형식):
 *   ezpw_jobs.json, ezpw_clients.json, ezpw_staff.json, ezpw_settings.json, ...
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SETTINGS_ONLY = process.argv.includes('--settings-only');
const SOURCE_DIR = args[0];
const TENANT_ID = args[1] || 'tenant-or73mu1cz';
const DATABASE_ID = 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755';
const PROJECT_ID = 'gen-lang-client-0746903005';
const COLLECTION_MAP = {
  jobs: 'jobs',
  clients: 'clients',
  staff: 'staff',
  quotes: 'quotes',
  instructions: 'instructions',
  messages: 'messages',
  leaves: 'leaves',
  papers: 'papers',
};

const BATCH_SIZE = 200;
const LEGACY_SETTINGS_IDS = ['companyInfo', 'nasConfig', 'pricing', 'processingDefinitions', 'productDefinitions', 'roles', 'statusDefinitions'];

function readEzpwJson(dir, name) {
  const filePath = path.join(dir, `ezpw_${name}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw || raw === '[]' || raw === '{}') return [];
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') return [data];
  return [];
}

function loadFirebaseCliTokens() {
  const candidates = [
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
  ];
  for (const configPath of candidates) {
    if (!fs.existsSync(configPath)) continue;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config?.tokens?.access_token) return config.tokens;
  }
  return null;
}

async function getAccessToken() {
  const tokens = loadFirebaseCliTokens();
  if (!tokens?.access_token) {
    throw new Error('Firebase CLI 로그인 정보 없음. `firebase login` 실행 후 다시 시도하세요.');
  }
  if (tokens.expires_at && Date.now() > tokens.expires_at - 60_000) {
    throw new Error('Firebase CLI 토큰 만료. `firebase login --reauth` 후 다시 시도하세요.');
  }
  return tokens.access_token;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function docName(colName, docId) {
  return `projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/tenants/${TENANT_ID}/${colName}/${docId}`;
}

async function commitWrites(accessToken, writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore commit 실패 (${res.status}): ${errText.slice(0, 500)}`);
  }
}

async function uploadCollection(accessToken, colName, items) {
  if (!items?.length) {
    console.log('  (비어 있음 — 건너뜀)');
    return 0;
  }

  const writes = items.map((item) => {
    const docId = String(item.id || `${colName}-${Math.random().toString(36).slice(2, 10)}`);
    const payload = { ...item, id: docId };
    return {
      update: {
        name: docName(colName, docId),
        fields: toFirestoreFields(payload),
      },
    };
  });

  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const chunk = writes.slice(i, i + BATCH_SIZE);
    await commitWrites(accessToken, chunk);
    console.log(`  → ${Math.min(i + BATCH_SIZE, writes.length)} / ${writes.length}건`);
  }
  return items.length;
}

async function consolidateSettings(accessToken, settingsObj) {
  await commitWrites(accessToken, [{
    update: {
      name: docName('settings', 'main'),
      fields: toFirestoreFields(settingsObj),
    },
  }]);
  console.log('  ✓ settings/main 단일 문서로 정리');

  for (const legacyId of LEGACY_SETTINGS_IDS) {
    await commitWrites(accessToken, [{
      delete: docName('settings', legacyId),
    }]).catch(() => {});
    console.log(`  ✓ 구형 settings/${legacyId} 정리`);
  }
}

async function run() {
  if (!SOURCE_DIR || !fs.existsSync(SOURCE_DIR)) {
    console.error('사용법: node scripts/migrate_ccpdata.mjs "<ccpdata폴더경로>" [tenantId]');
    process.exit(1);
  }

  console.log('=== ccpdata → Firestore 마이그레이션 ===');
  console.log('소스:', SOURCE_DIR);
  console.log('테넌트:', TENANT_ID);
  console.log('');

  const accessToken = await getAccessToken();
  console.log('✓ Firebase CLI 인증 완료\n');

  const summary = {};

  if (!SETTINGS_ONLY) {
    for (const [fileKey, colName] of Object.entries(COLLECTION_MAP)) {
      const items = readEzpwJson(SOURCE_DIR, fileKey);
      summary[colName] = items.length;
      console.log(`[${colName}] ${items.length}건 업로드 중...`);
      await uploadCollection(accessToken, colName, items);
    }
  } else {
    console.log('(--settings-only) 컬렉션 업로드 생략\n');
  }

  const settingsList = readEzpwJson(SOURCE_DIR, 'settings');
  if (settingsList.length > 0) {
    const settingsObj = settingsList[0];
    summary.settings = 1;
    console.log('[settings] main 문서 정리 중...');
    console.log(`  companyInfo: ${settingsObj.companyInfo?.name || '(없음)'}`);
    await consolidateSettings(accessToken, settingsObj);
  } else {
    summary.settings = 0;
    console.log('[settings] (비어 있음)');
  }

  console.log('\n=== 완료 ===');
  Object.entries(summary).forEach(([k, v]) => console.log(`  ${k}: ${v}건`));
}

run().catch((err) => {
  console.error('\n마이그레이션 실패:', err.message || err);
  process.exit(1);
});
