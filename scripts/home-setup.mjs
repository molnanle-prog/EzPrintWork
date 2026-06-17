/**
 * 다른 PC(집 등)에서 clone 후 한 번 실행: npm run setup:home
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveHomepageDir } = require('./resolve-homepage-dir');

const projectRoot = path.resolve(__dirname, '..');

function run(cmd, cwd = projectRoot) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
}

console.log('=== EzPrintWork 집/다른 PC 초기 설정 ===\n');

const parentDir = path.resolve(projectRoot, '..');
const parentPkg = path.join(parentDir, 'package.json');
const workspaceTemplate = path.join(projectRoot, 'workspace-root.package.json');
if (!fs.existsSync(parentPkg) && fs.existsSync(workspaceTemplate)) {
  fs.copyFileSync(workspaceTemplate, parentPkg);
  console.log('* 상위 폴더 package.json 생성 (Cursor npm 스크립트용)');
}
const parentVscodeDir = path.join(parentDir, '.vscode');
const localVscodeSettings = path.join(projectRoot, '.vscode', 'settings.json');
if (fs.existsSync(localVscodeSettings)) {
  fs.mkdirSync(parentVscodeDir, { recursive: true });
  fs.copyFileSync(localVscodeSettings, path.join(parentVscodeDir, 'settings.json'));
}

if (!fs.existsSync(path.join(projectRoot, 'node_modules'))) {
  console.log('[1/3] npm install (EzPrintWork)…');
  run('npm install');
} else {
  console.log('[1/3] node_modules 있음 — install 생략');
}

let homepageDir;
try {
  homepageDir = resolveHomepageDir();
  console.log(`\n* 홈페이지: ${homepageDir}`);
  if (!fs.existsSync(path.join(homepageDir, 'node_modules'))) {
    console.log('[2/3] npm install (ez-hub-homepage)…');
    run('npm install', homepageDir);
  } else {
    console.log('[2/3] ez-hub-homepage node_modules 있음 — install 생략');
  }
} catch {
  console.log('[2/3] ez-hub-homepage 없음 — 건너뜀');
  console.log('   clone: git clone https://github.com/molnanle-prog/ez-hub-homepage.git');
  console.log('   권장 경로: Desktop/ez-hub-homepage');
}

console.log('\n[3/3] GitHub Release ↔ downloads 메타 동기화…');
run('node scripts/sync-github-latest-yml.mjs');

console.log('\n=== 준비 완료 ===');
console.log('권장: EzPrintWork/EzPrintWork.code-workspace 로 열기 (npm 스크립트 안정)');
console.log('웹 개발:     npm run dev');
console.log('PC 앱 실행:  npm run build && npm start');
console.log('PC 설치파일: https://github.com/molnanle-prog/EzPrintWork/releases/latest');
console.log('통합 배포:   npm run deploy:app');
console.log('');
