/**
 * NAS presence/session 로직 스모크 (배포 전 로컬 검증)
 * 실행: npx tsx scripts/smoke_presence_session.ts
 */
import assert from 'node:assert/strict';
import {
  SESSION_STALE_MS,
  resolveStaffOnline,
  isRemoteStaffSessionActive,
  isRemoteSessionNewerThanLocal,
  isSameMachineOrLegacyGhost,
  createStaffSessionId,
} from '../src/utils/staffSession';

function ok(label: string) {
  console.log(`  ✓ ${label}`);
}

function run() {
  console.log('[smoke] presence/session helpers');

  assert.ok(SESSION_STALE_MS >= 4 * 60_000, 'stale window should cover NAS heartbeat');
  ok(`SESSION_STALE_MS=${SESSION_STALE_MS}`);

  const now = new Date().toISOString();
  const stale = new Date(Date.now() - SESSION_STALE_MS - 10_000).toISOString();

  assert.equal(
    resolveStaffOnline({ isOnline: true, lastActive: now }),
    true
  );
  ok('online + fresh lastActive → true');

  assert.equal(
    resolveStaffOnline({ isOnline: true, lastActive: stale }),
    false
  );
  ok('online + stale lastActive → false');

  const localSid = createStaffSessionId();
  const remoteSid = createStaffSessionId();
  assert.notEqual(localSid, remoteSid);
  ok('createStaffSessionId unique');

  const remoteMachineId = `remote-${Date.now()}`;
  assert.equal(
    isRemoteStaffSessionActive(
      {
        activeSessionId: remoteSid,
        isOnline: true,
        lastActive: now,
        clientType: 'electron',
        machineId: remoteMachineId,
      },
      localSid
    ),
    true
  );
  ok('remote different session active');

  assert.equal(
    isRemoteStaffSessionActive(
      { activeSessionId: localSid, isOnline: true, lastActive: now },
      localSid
    ),
    false
  );
  ok('same session not treated as remote');

  assert.equal(
    isSameMachineOrLegacyGhost({
      activeSessionId: remoteSid,
      isOnline: true,
      lastActive: now,
      clientType: 'electron',
    }),
    true
  );
  assert.equal(
    isRemoteStaffSessionActive(
      {
        activeSessionId: remoteSid,
        isOnline: true,
        lastActive: now,
        clientType: 'electron',
      },
      localSid
    ),
    false
  );
  ok('legacy record without machineId is a ghost, not another PC');

  const localClaimed = new Date(Date.now() - 60_000).toISOString();
  const remoteNewer = new Date().toISOString();
  assert.equal(
    isRemoteSessionNewerThanLocal(
      {
        activeSessionId: remoteSid,
        activeSessionAt: remoteNewer,
        isOnline: true,
        lastActive: remoteNewer,
        clientType: 'electron',
        machineId: remoteMachineId,
      },
      localSid,
      localClaimed
    ),
    true
  );
  ok('newer remote session kicks');

  assert.equal(
    isRemoteSessionNewerThanLocal(
      {
        activeSessionId: remoteSid,
        activeSessionAt: localClaimed,
        isOnline: true,
        lastActive: localClaimed,
        clientType: 'electron',
        machineId: remoteMachineId,
      },
      localSid,
      remoteNewer
    ),
    false
  );
  ok('older remote session does not kick');

  const heartbeatNewer = new Date().toISOString();
  assert.equal(
    isRemoteSessionNewerThanLocal(
      {
        activeSessionId: remoteSid,
        activeSessionAt: localClaimed,
        isOnline: true,
        lastActive: heartbeatNewer,
        clientType: 'electron',
        machineId: remoteMachineId,
      },
      localSid,
      localClaimed
    ),
    false
  );
  ok('heartbeat lastActive alone does not kick');

  assert.equal(
    isRemoteSessionNewerThanLocal(
      {
        activeSessionId: remoteSid,
        isOnline: true,
        lastActive: now,
        clientType: 'electron',
      },
      localSid,
      localClaimed
    ),
    false
  );
  ok('post-update ghost without machineId does not kick');

  assert.equal(
    isRemoteSessionNewerThanLocal(
      {
        activeSessionId: remoteSid,
        activeSessionAt: remoteNewer,
        isOnline: true,
        lastActive: remoteNewer,
        clientType: 'electron',
        machineId: remoteMachineId,
      },
      localSid,
      null
    ),
    false
  );
  ok('missing local claimedAt does not kick');

  assert.equal(
    resolveStaffOnline({
      isOnline: false,
      online: false,
      activeSessionId: remoteSid,
      lastActive: now,
    }),
    false
  );
  ok('logout leftover with isOnline false is not online');

  assert.equal(
    isRemoteStaffSessionActive(
      {
        activeSessionId: remoteSid,
        isOnline: false,
        lastActive: now,
        clientType: 'electron',
        machineId: remoteMachineId,
      },
      localSid
    ),
    false
  );
  ok('closed session does not block another PC login');

  assert.equal(
    isRemoteStaffSessionActive(
      {
        activeSessionId: '',
        isOnline: false,
        lastActive: now,
        clientType: 'electron',
        machineId: remoteMachineId,
      },
      localSid
    ),
    false
  );
  ok('released claim (empty session id) is not treated as remote login');

  assert.equal(
    isRemoteStaffSessionActive(
      {
        activeSessionId: remoteSid,
        isOnline: true,
        lastActive: now,
        clientType: 'electron',
        machineId: remoteMachineId,
      },
      localSid
    ),
    true
  );
  ok('live session on another PC still blocks same id');

  console.log('[smoke] presence/session helpers PASSED\n');
}

run();
