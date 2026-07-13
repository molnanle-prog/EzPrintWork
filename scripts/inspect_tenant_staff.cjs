/**
 * Read-only tenant staff diagnostics via Firebase CLI stored tokens + Firestore REST.
 * Usage: node scripts/inspect_tenant_staff.cjs [이름일부]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { UserRefreshClient } = require('google-auth-library');

const PROJECT_ID = 'gen-lang-client-0746903005';
const DB_ID = 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755';
const NAME_HINT = process.argv[2] || '춘천';
const FIREBASE_CLI_CLIENT_SECRET = 'ZmssLNjJy1332hLbbY76EAOq';

function short(v) {
  const s = String(v || '');
  if (s.length <= 14) return s;
  return s.slice(0, 6) + '…' + s.slice(-4);
}

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

  const stillValid = auth.accessToken && auth.expiresAt > Date.now() + 60_000;
  if (stillValid) {
    console.log('Auth: Firebase CLI access_token (cached)');
    return auth.accessToken;
  }

  if (!auth.refreshToken) {
    throw new Error('Firebase access token expired. Run: firebase login');
  }

  console.log('Auth: refreshing Firebase CLI token');
  const client = new UserRefreshClient(
    auth.clientId,
    FIREBASE_CLI_CLIENT_SECRET,
    auth.refreshToken
  );
  const res = await client.getAccessToken();
  if (!res.token) throw new Error('Failed to refresh Firebase CLI access token');
  return res.token;
}

async function firestoreGet(accessToken, docPath) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/${encodeURIComponent(DB_ID)}/documents/${docPath}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Firestore GET ${docPath} → ${resp.status}: ${text.slice(0, 240)}`);
  }
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
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Firestore LIST ${colPath} → ${resp.status}: ${text.slice(0, 300)}`);
    }
    const json = await resp.json();
    all.push(...(json.documents || []));
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return all;
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

async function diagnose(accessToken) {
  const tenantDocs = await firestoreList(accessToken, 'tenants');
  const tenants = tenantDocs.map(docToObject).filter(Boolean);
  const matches = tenants.filter((t) => String(t.data.name || '').includes(NAME_HINT));

  if (matches.length === 0) {
    console.log('No tenant matched:', NAME_HINT);
    console.log('Sample names:', tenants.slice(0, 25).map((t) => t.data.name).join(', '));
    return;
  }

  for (const t of matches) {
    const ownerId = String(t.data.ownerId || '');
    console.log('\n========== TENANT ==========');
    console.log('id:', t.id);
    console.log('name:', t.data.name);
    console.log('ownerId:', short(ownerId));
    console.log('plan:', t.data.plan, 'payment:', t.data.paymentStatus);

    let ownerUser = null;
    if (ownerId) {
      const uDoc = await firestoreGet(accessToken, `users/${ownerId}`);
      const u = docToObject(uDoc);
      if (u) {
        ownerUser = u.data;
        console.log('owner user.role:', ownerUser.role);
        console.log('owner user.email:', ownerUser.email || '(none)');
        console.log(
          'owner user.name:',
          ownerUser.name || ownerUser.displayName || ownerUser.userName || '(none)'
        );
      } else {
        console.log('owner user doc: MISSING');
      }
    }

    const staffDocs = await firestoreList(accessToken, `tenants/${t.id}/staff`);
    const staff = staffDocs.map(docToObject).filter(Boolean);
    console.log('\n--- staff docs:', staff.length, '---');

    let ownerStaffFound = false;
    let ownerVisible = false;
    let ownerDeleted = false;

    for (const sDoc of staff) {
      const s = sDoc.data;
      const ownerEmail = String(ownerUser?.email || '').toLowerCase();
      const isOwner =
        sDoc.id === ownerId ||
        s.uid === ownerId ||
        s.id === ownerId ||
        (!!ownerEmail && String(s.email || '').toLowerCase() === ownerEmail) ||
        (!!ownerEmail && String(s.loginId || '').toLowerCase() === ownerEmail);

      const deleted = s.isDeleted === true || s.deleted === true;
      const hidden = sDoc.id === 'admin' || sDoc.id === 'dev-admin';
      const visible = !deleted && !hidden && s.active !== false;

      if (isOwner) {
        ownerStaffFound = true;
        if (deleted) ownerDeleted = true;
        if (visible) ownerVisible = true;
      }

      console.log({
        docId: short(sDoc.id),
        name: s.name,
        role: s.role,
        isCompanyAdmin: s.isCompanyAdmin ?? null,
        uid: short(s.uid),
        loginId: s.loginId || '',
        active: s.active,
        isDeleted: deleted,
        isOwner,
        wouldShowInStaffManager: visible,
      });
    }

    console.log('\n=== VERDICT ===');
    console.log('owner staff row present:', ownerStaffFound);
    console.log('owner would show in StaffManager:', ownerVisible);
    if (!ownerStaffFound) {
      console.log('CAUSE: owner has NO staff document → login self-heal CREATE should fix');
      console.log('FIX_CONFIDENCE: HIGH');
    } else if (ownerDeleted) {
      console.log('CAUSE: owner staff isDeleted=true → login self-heal RESTORE should fix');
      console.log('FIX_CONFIDENCE: HIGH');
    } else if (!ownerVisible) {
      console.log('CAUSE: owner staff inactive/hidden → login self-heal should fix');
      console.log('FIX_CONFIDENCE: HIGH');
    } else {
      console.log('CAUSE: data already visible in Firestore — local cache/UI sync more likely');
      console.log('FIX_CONFIDENCE: LOW for this bug report (data already OK)');
    }
  }
}

async function run() {
  const accessToken = await getAccessToken();
  await diagnose(accessToken);
}

run().catch((e) => {
  console.error('FAILED:', e.message || e);
  process.exit(1);
});
