import fs from 'node:fs';

const checks = [];
function check(name, ok) {
  checks.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}`);
}

const data = fs.readFileSync('src/services/dataService.ts', 'utf8');
check(
  'calendar guard blocks Firestore jobs',
  data.includes('async ensureCalendarJobsSync') &&
    /ensureCalendarJobsSync[\s\S]{0,400}this\.isFirestoreJobsForbidden\(\)\)\s*return/.test(data)
);
check(
  'bumpMirrorSyncPulse is no-op',
  /bumpMirrorSyncPulse\(\)\s*\{[\s\S]*?return;\s*\}/.test(data)
);
check(
  'local/web uses onSnapshot sync pulse instead of config polling',
  data.includes('private subscribeSyncPulse()') &&
    data.includes('this.syncPulseUnsub = onSnapshot(') &&
    !data.includes('startConfigPolling()')
);
check('presenceSessionService wired in dataService', data.includes('presenceSessionService'));

const firebase = fs.readFileSync('src/services/firebase.ts', 'utf8');
check('firebase presence uses NAS service', firebase.includes('presenceSessionService'));
check('firebase presence has no Firestore setDoc', !firebase.includes('setDoc('));
check(
  'heartbeat continues while hidden for session freshness',
  !firebase.includes("visibilityState === 'hidden'")
);

const auth = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');
check('AuthContext session watch uses NAS', auth.includes('presenceSessionService.readEntry'));
check('AuthContext release uses NAS', auth.includes('releaseStaffSessionOnNas'));

const login = fs.readFileSync('src/pages/LoginPage.tsx', 'utf8');
check('LoginPage claims on NAS', login.includes('claimStaffSessionOnNas'));
check('LoginPage conflict check uses NAS', login.includes('presenceSessionService.readEntry'));

const persistence = fs.readFileSync('src/utils/authPersistence.ts', 'utf8');
check(
  'desktop always uses local auth persistence',
  persistence.includes('isDesktopElectron()') && persistence.includes('browserLocalPersistence')
);

const session = fs.readFileSync('src/utils/staffSession.ts', 'utf8');
check('ghost sessions are not treated as remote kicks', session.includes('isSameMachineOrLegacyGhost'));

const gasPing = fs.readFileSync('src/services/gasPresencePing.ts', 'utf8');
check('presence offline ping exists', gasPing.includes("action: 'presenceOffline'"));
check(
  'GAS presence is once per session, not a 5-minute loop',
  gasPing.includes('세션당 1회') && !gasPing.includes('setInterval')
);

const lifecycle = fs.readFileSync('src/utils/appSessionLifecycle.ts', 'utf8');
check(
  'session end releases NAS before tenant report',
  lifecycle.indexOf('releaseStaffSessionOnNas') < lifecycle.indexOf('reportTenantSessionEnd')
);

const presenceSvc = fs.readFileSync('src/services/presenceSessionService.ts', 'utf8');
check(
  'logout/close clears NAS session claim',
  /else if \(!opts\.online\)[\s\S]{0,240}activeSessionId = ''/.test(presenceSvc)
);

const gateway = fs.readFileSync('electron/localGateway.js', 'utf8');
check('gateway GET /api/v1/presence', gateway.includes("pathname === '/api/v1/presence'") && gateway.includes("req.method === 'GET'"));
check('gateway POST /api/v1/presence', gateway.includes("pathname === '/api/v1/presence'") && gateway.includes("req.method === 'POST'"));
check('presence file name', gateway.includes('presence-sessions.json'));

const failed = checks.filter((c) => !c.ok);
console.log(`\n[smoke] static paths ${failed.length ? 'FAILED' : 'PASSED'} (${checks.length - failed.length}/${checks.length})`);
process.exit(failed.length ? 1 : 0);
