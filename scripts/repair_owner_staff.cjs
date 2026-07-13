/**
 * Repair soft-deleted owner staff for a tenant (read+patch).
 * Usage: node scripts/repair_owner_staff.cjs [이름일부]
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { UserRefreshClient } = require('google-auth-library');

const PROJECT_ID = 'gen-lang-client-0746903005';
const DB_ID = 'ai-studio-9c19ea8d-a769-47dc-b3b1-5cc0b25fe755';
const NAME_HINT = process.argv[2] || '춘천';
const FIREBASE_CLI_CLIENT_SECRET = 'ZmssLNjJy1332hLbbY76EAOq';

function loadAuth() {
  const p = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    accessToken: raw.tokens.access_token,
    refreshToken: raw.tokens.refresh_token,
    expiresAt: Number(raw.tokens.expires_at || 0),
    clientId: raw.user?.azp || raw.user?.aud,
  };
}

async function getToken() {
  const auth = loadAuth();
  if (auth.accessToken && auth.expiresAt > Date.now() + 60_000) return auth.accessToken;
  const client = new UserRefreshClient(auth.clientId, FIREBASE_CLI_CLIENT_SECRET, auth.refreshToken);
  const res = await client.getAccessToken();
  if (!res.token) throw new Error('token refresh failed');
  return res.token;
}

function fromV(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('mapValue' in v) {
    const o = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) o[k] = fromV(val);
    return o;
  }
  return null;
}

function docObj(doc) {
  if (!doc) return null;
  const id = String(doc.name || '').split('/').pop();
  const data = {};
  for (const [k, v] of Object.entries(doc.fields || {})) data[k] = fromV(v);
  return { id, name: doc.name, data };
}

async function listDocs(token, col) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(DB_ID)}/documents/${col}?pageSize=300`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(await resp.text());
  return (await resp.json()).documents || [];
}

async function patchOwner(token, docName) {
  const url =
    `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=isDeleted&updateMask.fieldPaths=active&updateMask.fieldPaths=isCompanyAdmin`;
  const body = {
    fields: {
      isDeleted: { booleanValue: false },
      active: { booleanValue: true },
      isCompanyAdmin: { booleanValue: true },
    },
  };
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

async function run() {
  const token = await getToken();
  const tenants = (await listDocs(token, 'tenants')).map(docObj);
  const matches = tenants.filter((t) => String(t.data.name || '').includes(NAME_HINT));
  if (!matches.length) {
    console.log('No tenant for', NAME_HINT);
    return;
  }

  for (const t of matches) {
    const ownerId = String(t.data.ownerId || '');
    console.log('Tenant', t.data.name, 'owner', ownerId.slice(0, 6) + '…');
    const staff = (await listDocs(token, `tenants/${t.id}/staff`)).map(docObj);
    const ownerRows = staff.filter(
      (s) => s.id === ownerId || s.data.uid === ownerId || s.data.id === ownerId
    );
    if (!ownerRows.length) {
      console.log('No owner staff row');
      continue;
    }
    for (const row of ownerRows) {
      console.log('Before:', {
        id: row.id,
        name: row.data.name,
        isDeleted: row.data.isDeleted,
        active: row.data.active,
        isCompanyAdmin: row.data.isCompanyAdmin,
      });
      await patchOwner(token, row.name);
      console.log('Repaired owner staff → isDeleted=false, active=true, isCompanyAdmin=true');
    }
  }
}

run().catch((e) => {
  console.error('FAILED', e.message || e);
  process.exit(1);
});
