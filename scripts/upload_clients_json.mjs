/**
 * clients.json → Firestore tenants/{tenantId}/clients 업로드
 *
 * 사용법:
 *   node scripts/upload_clients_json.mjs "<clients.json 경로>" [tenantId]
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const args = process.argv.slice(2);
const SOURCE_FILE = args[0];
const TENANT_ID = args[1] || 'tenant-or73mu1cz';
const DATABASE_ID = 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755';
const PROJECT_ID = 'gen-lang-client-0746903005';
const BATCH_SIZE = 200;

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
    throw new Error('Firebase CLI 로그인 정보 없음. `npx firebase-tools login` 실행 후 다시 시도하세요.');
  }
  if (tokens.expires_at && Date.now() > tokens.expires_at - 60_000) {
    throw new Error('Firebase CLI 토큰 만료. `npx firebase-tools login --reauth` 후 다시 시도하세요.');
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

function buildContacts(raw) {
  const contacts = [];
  const primaryPhone = (raw.phone || '').trim();
  const mobile = (raw.mobile || '').trim();
  const contactPerson = (raw.contactPerson || '').trim();
  const email = (raw.email || '').trim();

  if (contactPerson || primaryPhone || email) {
    contacts.push({
      name: contactPerson,
      phone: primaryPhone || mobile,
      email: email || undefined,
      department: '담당자',
    });
  }

  if (mobile && mobile !== primaryPhone) {
    contacts.push({
      name: contactPerson || '휴대',
      phone: mobile,
      department: '휴대',
    });
  }

  if (contacts.length === 0 && (primaryPhone || mobile)) {
    contacts.push({
      name: '',
      phone: primaryPhone || mobile,
      department: '담당자',
    });
  }

  return contacts;
}

function normalizeClient(raw, index) {
  const contacts = buildContacts(raw);
  const primary = contacts[0];
  const noteParts = [
    raw.memo,
    raw.businessType ? `업태: ${raw.businessType}` : '',
    raw.businessItem ? `종목: ${raw.businessItem}` : '',
    raw.fax ? `팩스: ${raw.fax}` : '',
  ].filter(Boolean);

  const id = String(raw.id || `client-${index}-${Date.now().toString(36)}`);
  const phone = (raw.phone || raw.mobile || primary?.phone || '').trim();

  return {
    id,
    name: (raw.name || phone || '이름 없음').trim(),
    businessRegistrationNumber: (raw.businessNumber || raw.businessRegistrationNumber || '').trim(),
    contactPerson: (raw.contactPerson || primary?.name || '').trim(),
    phone,
    email: (raw.email || primary?.email || '').trim(),
    address: (raw.address || '').trim(),
    note: noteParts.join('\n'),
    contacts,
    sendSmsOnComplete: raw.sendSmsOnComplete !== false,
    customSmsNumber: (raw.customSmsNumber || '').trim(),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

async function uploadClients(accessToken, clients) {
  const writes = clients.map((client) => ({
    update: {
      name: docName('clients', client.id),
      fields: toFirestoreFields(client),
    },
  }));

  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const chunk = writes.slice(i, i + BATCH_SIZE);
    await commitWrites(accessToken, chunk);
    console.log(`  → ${Math.min(i + BATCH_SIZE, writes.length)} / ${writes.length}건`);
  }
}

async function run() {
  if (!SOURCE_FILE || !fs.existsSync(SOURCE_FILE)) {
    console.error('사용법: node scripts/upload_clients_json.mjs "<clients.json 경로>" [tenantId]');
    process.exit(1);
  }

  console.log('=== clients.json → Firestore 업로드 ===');
  console.log('소스:', SOURCE_FILE);
  console.log('테넌트:', TENANT_ID);
  console.log('');

  const raw = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error('clients.json은 배열 형식이어야 합니다.');
  }

  const clients = raw.map((item, index) => normalizeClient(item, index));
  console.log(`변환 완료: ${clients.length}건`);
  console.log('샘플:', clients[0].name, '|', clients[0].phone);
  console.log('');

  const accessToken = await getAccessToken();
  console.log('✓ Firebase CLI 인증 완료');
  console.log('[clients] 업로드 중...');
  await uploadClients(accessToken, clients);

  console.log('\n=== 완료 ===');
  console.log(`  clients: ${clients.length}건 업로드`);
}

run().catch((err) => {
  console.error('\n업로드 실패:', err.message || err);
  process.exit(1);
});
