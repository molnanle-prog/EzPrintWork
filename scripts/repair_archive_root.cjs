/**
 * Inspect / repair tenant archiveRootPath from legacy dbPath.
 * Usage:
 *   node scripts/repair_archive_root.cjs 춘천              # inspect only
 *   node scripts/repair_archive_root.cjs 춘천 --apply     # set archiveRootPath = dbPath (or override)
 *   node scripts/repair_archive_root.cjs 춘천 --apply --path "Z:\\3_회사서류\\ccpdata"
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { UserRefreshClient } = require('google-auth-library');

const PROJECT_ID = 'gen-lang-client-0746903005';
const DB_ID = 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755';
const FIREBASE_CLI_CLIENT_SECRET = 'ZmssLNjJy1332hLbbY76EAOq';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const nameHint = args.find((a) => !a.startsWith('--')) || '춘천';
const pathIdx = args.indexOf('--path');
const PATH_OVERRIDE = pathIdx >= 0 ? String(args[pathIdx + 1] || '').trim() : '';

function loadFirebaseCliAuth() {
  const candidates = [
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
    path.join(process.env.APPDATA || '', 'configstore', 'firebase-tools.json'),
  ];
  for (const p of candidates) {
    if (!p || !fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (raw?.tokens?.access_token || raw?.tokens?.refresh_token) {
      return {
        accessToken: raw.tokens.access_token || null,
        refreshToken: raw.tokens.refresh_token || null,
        expiresAt: Number(raw.tokens.expires_at || 0),
        clientId: raw.user?.azp || raw.user?.aud || '32555940559.apps.googleusercontent.com',
      };
    }
  }
  return null;
}

async function getAccessToken() {
  const auth = loadFirebaseCliAuth();
  if (!auth) throw new Error('Firebase CLI login not found. Run: firebase login');
  if (auth.accessToken && auth.expiresAt > Date.now() + 60_000) return auth.accessToken;
  if (!auth.refreshToken) throw new Error('Firebase access token expired. Run: firebase login');
  const client = new UserRefreshClient(auth.clientId, FIREBASE_CLI_CLIENT_SECRET, auth.refreshToken);
  const res = await client.getAccessToken();
  if (!res.token) throw new Error('Failed to refresh Firebase CLI access token');
  return res.token;
}

async function firestoreGet(accessToken, docPath) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/${encodeURIComponent(DB_ID)}/documents/${docPath}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`GET ${docPath} → ${resp.status}: ${(await resp.text()).slice(0, 240)}`);
  return resp.json();
}

async function firestoreList(accessToken, colPath, pageSize = 300) {
  let pageToken = '';
  const all = [];
  do {
    const qs = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) qs.set('pageToken', pageToken);
    const url =
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
      `/databases/${encodeURIComponent(DB_ID)}/documents/${colPath}?${qs}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) throw new Error(`LIST ${colPath} → ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const json = await resp.json();
    all.push(...(json.documents || []));
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return all;
}

async function firestorePatch(accessToken, docPath, fields, maskFields) {
  const qs = new URLSearchParams();
  for (const f of maskFields) qs.append('updateMask.fieldPaths', f);
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/${encodeURIComponent(DB_ID)}/documents/${docPath}?${qs}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!resp.ok) throw new Error(`PATCH ${docPath} → ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  return resp.json();
}

function fromFirestoreValue(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) {
    const fields = v.mapValue.fields || {};
    const out = {};
    for (const [k, val] of Object.entries(fields)) out[k] = fromFirestoreValue(val);
    return out;
  }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  return null;
}

function docToObject(doc) {
  if (!doc) return null;
  const id = String(doc.name || '').split('/').pop();
  const fields = doc.fields || {};
  const data = {};
  for (const [k, v] of Object.entries(fields)) data[k] = fromFirestoreValue(v);
  return { id, data };
}

async function run() {
  const token = await getAccessToken();
  const tenantDocs = await firestoreList(token, 'tenants');
  const matches = tenantDocs
    .map(docToObject)
    .filter((t) => t && String(t.data.name || '').includes(nameHint));

  if (!matches.length) {
    console.log('No tenant matched:', nameHint);
    return;
  }

  for (const t of matches) {
    console.log('\n========== TENANT ==========');
    console.log('id:', t.id);
    console.log('name:', t.data.name);

    const settingsDoc = await firestoreGet(token, `tenants/${t.id}/settings/main`);
    const settings = docToObject(settingsDoc);
    const archiveRootPath = settings?.data?.archiveRootPath ?? null;
    const dbPath = settings?.data?.dbPath ?? null;
    const storeGatewayUrl = settings?.data?.storeGatewayUrl ?? null;

    console.log('archiveRootPath:', archiveRootPath || '(null)');
    console.log('dbPath:', dbPath || '(null)');
    console.log('storeGatewayUrl:', storeGatewayUrl || '(null)');

    const target = PATH_OVERRIDE || dbPath;
    if (!APPLY) {
      console.log('\n(inspect only) To repair:');
      if (target) {
        console.log(`  node scripts/repair_archive_root.cjs ${nameHint} --apply --path "${target}"`);
      } else {
        console.log('  No dbPath fallback — pass --path explicitly');
      }
      continue;
    }

    if (!target) {
      console.log('SKIP: no target path (dbPath empty and no --path)');
      continue;
    }

    if (archiveRootPath && archiveRootPath.replace(/[\\/]+$/, '') === target.replace(/[\\/]+$/, '')) {
      console.log('OK: archiveRootPath already set to', archiveRootPath);
      continue;
    }

    console.log('APPLY: set archiveRootPath →', target);
    await firestorePatch(
      token,
      `tenants/${t.id}/settings/main`,
      { archiveRootPath: { stringValue: target } },
      ['archiveRootPath']
    );

    const after = docToObject(await firestoreGet(token, `tenants/${t.id}/settings/main`));
    console.log('DONE: archiveRootPath =', after?.data?.archiveRootPath || '(null)');
  }
}

run().catch((e) => {
  console.error('FAILED:', e.message || e);
  process.exit(1);
});
