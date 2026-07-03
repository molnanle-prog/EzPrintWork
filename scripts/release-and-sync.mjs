/**
 * GitHub Release 업로드 + latest.yml(sha512) 동기화 + Hosting 배포
 *
 * 최초 1회: powershell scripts/setup-deploy-token.ps1
 * 사용: npm run release:all
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);
const { loadDeployEnv } = require('./load-deploy-env.js');
const { resolveHomepageDir } = require('./resolve-homepage-dir.js');

loadDeployEnv(root);

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('\n[오류] GH_TOKEN이 없습니다.');
  console.error('  최초 1회: powershell scripts/setup-deploy-token.ps1');
  console.error('  또는 EzPrintWork/.env.deploy 에 GH_TOKEN=... 저장');
  process.exit(1);
}

const version = require(path.join(root, 'package.json')).version;
const releaseExe = path.join(root, 'release', 'EzPrintWork-Setup.exe');
if (!fs.existsSync(releaseExe)) {
  console.error('\n[오류] release/EzPrintWork-Setup.exe 없음 — 먼저 npm run deploy:app 또는 electron-builder 실행');
  process.exit(1);
}

console.log(`\n=== EzPrintWork Release + latest.yml + Hosting (v${version}) ===\n`);

console.log('[1/4] GitHub Release 업로드...');
execSync('node scripts/publish-github-release.js', { cwd: root, stdio: 'inherit', env: process.env });

console.log('\n[2/4] latest.yml GitHub Release 자산에서 동기화...');
execSync('node scripts/sync-github-latest-yml.mjs', { cwd: root, stdio: 'inherit', env: process.env });

const homepageDir = resolveHomepageDir();
const downloadsDir = path.join(homepageDir, 'public', 'downloads');
const ymlPath = path.join(downloadsDir, 'latest.yml');
if (!fs.existsSync(ymlPath)) {
  console.error('[오류] public/downloads/latest.yml 생성 실패');
  process.exit(1);
}
const yml = fs.readFileSync(ymlPath, 'utf-8');
if (!yml.includes(`version: ${version}`)) {
  console.warn(`* 경고: latest.yml 버전이 package.json(${version})과 다를 수 있습니다.`);
}

console.log('\n[3/4] 홈페이지 빌드...');
execSync('npm run build', { cwd: homepageDir, stdio: 'inherit' });

const distDownloads = path.join(homepageDir, 'dist', 'downloads');
fs.mkdirSync(distDownloads, { recursive: true });
for (const name of ['latest.yml', 'download-manifest.json']) {
  const src = path.join(downloadsDir, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDownloads, name));
  }
}

console.log('\n[4/4] Firebase Hosting 배포...');
execSync('npx -y firebase-tools deploy --only hosting', { cwd: homepageDir, stdio: 'inherit' });

console.log('\n✓ PC 자동업데이트(latest.yml) + Hosting 배포 완료');
console.log(`  https://ez-hub.kr/downloads/latest.yml`);
