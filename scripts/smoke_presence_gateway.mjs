/**
 * localGateway presence 엔드포인트 스모크
 * 실행: node scripts/smoke_presence_gateway.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LocalGateway } = require('../electron/localGateway.js');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ezpw-presence-'));
const gateway = new LocalGateway();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('[smoke] gateway presence endpoints');
  console.log('  tmp:', tmpRoot);

  gateway.setConfig({
    archiveRoot: tmpRoot,
    tenantId: 'tenant-smoke',
    gatewayToken: 'smoke-token',
  });

  const info = await gateway.start();
  assert(info?.baseUrl, 'gateway baseUrl missing');
  const base = info.baseUrl.replace(/\/$/, '');
  console.log('  listening:', base);

  const headers = {
    'Content-Type': 'application/json',
    'X-Ezpw-Gateway-Token': 'smoke-token',
  };

  // GET empty
  {
    const res = await fetch(`${base}/api/v1/presence?tenantId=tenant-smoke`, { headers });
    assert(res.ok, `GET empty failed: ${res.status}`);
    const body = await res.json();
    assert(body.sessions && typeof body.sessions === 'object', 'sessions object missing');
    console.log('  ✓ GET empty presence');
  }

  // POST claim
  const now = new Date().toISOString();
  const payload = {
    version: 1,
    tenantId: 'tenant-smoke',
    updatedAt: now,
    sessions: {
      'uid-1': {
        uid: 'uid-1',
        loginId: 'sr302',
        isOnline: true,
        online: true,
        lastActive: now,
        activeSessionId: 'sess-a',
        activeSessionAt: now,
      },
    },
  };
  {
    const res = await fetch(`${base}/api/v1/presence`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    assert(res.ok, `POST failed: ${res.status}`);
    const body = await res.json();
    assert(body.ok === true, 'POST ok false');
    console.log('  ✓ POST presence claim');
  }

  // file on disk
  const filePath = path.join(tmpRoot, 'presence-sessions.json');
  assert(fs.existsSync(filePath), 'presence-sessions.json not written');
  const disk = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert(disk.sessions['uid-1']?.activeSessionId === 'sess-a', 'disk session mismatch');
  console.log('  ✓ NAS file written');

  // GET after write
  {
    const res = await fetch(`${base}/api/v1/presence?tenantId=tenant-smoke`, { headers });
    assert(res.ok, `GET after write failed: ${res.status}`);
    const body = await res.json();
    assert(body.sessions['uid-1']?.isOnline === true, 'online flag missing');
    console.log('  ✓ GET after write');
  }

  // unauthorized
  {
    const res = await fetch(`${base}/api/v1/presence?tenantId=tenant-smoke`);
    assert(res.status === 401, `expected 401, got ${res.status}`);
    console.log('  ✓ unauthorized rejected');
  }

  gateway.stop();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log('[smoke] gateway presence PASSED\n');
}

main().catch((err) => {
  console.error('[smoke] gateway presence FAILED', err);
  try { gateway.stop(); } catch {}
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
