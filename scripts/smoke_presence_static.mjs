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
check('startConfigPolling exists', data.includes('startConfigPolling()'));
check(
  'local/web uses config poll instead of onSnapshot pulse',
  /isLocalPrimaryMode\(\)\s*\|\|\s*this\.isWebMirrorMode\(\)[\s\S]{0,160}startConfigPolling/.test(data)
);
check('presenceSessionService wired in dataService', data.includes('presenceSessionService'));

const firebase = fs.readFileSync('src/services/firebase.ts', 'utf8');
check('firebase presence uses NAS service', firebase.includes('presenceSessionService'));
check('firebase presence has no Firestore setDoc', !firebase.includes('setDoc('));
check('heartbeat skips hidden tab', firebase.includes("visibilityState === 'hidden'"));

const auth = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');
check('AuthContext session watch uses NAS', auth.includes('presenceSessionService.readEntry'));
check('AuthContext release uses NAS', auth.includes('releaseStaffSessionOnNas'));

const login = fs.readFileSync('src/pages/LoginPage.tsx', 'utf8');
check('LoginPage claims on NAS', login.includes('claimStaffSessionOnNas'));
check('LoginPage conflict check uses NAS', login.includes('presenceSessionService.readEntry'));

const gateway = fs.readFileSync('electron/localGateway.js', 'utf8');
check('gateway GET /api/v1/presence', gateway.includes("pathname === '/api/v1/presence'") && gateway.includes("req.method === 'GET'"));
check('gateway POST /api/v1/presence', gateway.includes("pathname === '/api/v1/presence'") && gateway.includes("req.method === 'POST'"));
check('presence file name', gateway.includes('presence-sessions.json'));

const failed = checks.filter((c) => !c.ok);
console.log(`\n[smoke] static paths ${failed.length ? 'FAILED' : 'PASSED'} (${checks.length - failed.length}/${checks.length})`);
process.exit(failed.length ? 1 : 0);
