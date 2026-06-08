const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 색상 출력을 위한 헬퍼
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, cwd) {
  const nodeExe = 'C:\\Users\\user\\Desktop\\EZPRIN~1\\node_portable\\node.exe';
  const npmCli = 'C:\\Users\\user\\Desktop\\EZPRIN~1\\node_portable\\node_modules\\npm\\bin\\npm-cli.js';
  const npxCli = 'C:\\Users\\user\\Desktop\\EZPRIN~1\\node_portable\\node_modules\\npm\\bin\\npx-cli.js';

  let translated = command;
  if (command.startsWith('npm ')) {
    translated = `"${nodeExe}" "${npmCli}" ${command.substring(4)}`;
  } else if (command.startsWith('npx ')) {
    translated = `"${nodeExe}" "${npxCli}" ${command.substring(4)}`;
  } else if (command.startsWith('node ')) {
    translated = `"${nodeExe}" ${command.substring(5)}`;
  }

  log(`\n> 실행 중: ${translated}`, colors.cyan);
  try {
    execSync(translated, { stdio: 'inherit', cwd });
  } catch (error) {
    log(`[에러 발생] 명령어 실행 실패: ${translated}`, colors.red);
    process.exit(1);
  }
}


function copyFolderSync(from, to) {
  if (fs.existsSync(to)) {
    try {
      execSync(`powershell -Command "if (Test-Path '${to}') { Remove-Item -Recurse -Force '${to}' }"`);
    } catch (e) {
      // 파워쉘 삭제 실패 시 예외 회피를 위해 fs.rmSync 폴백
      fs.rmSync(to, { recursive: true, force: true });
    }
  }
  fs.mkdirSync(to, { recursive: true });
  
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

async function main() {
  const currentDir = path.resolve(__dirname, '..');
  const homepageDir = path.resolve(currentDir, '..', 'ez-hub-homepage');
  const targetDir = path.join(homepageDir, 'public', 'ezpw');
  const distDir = path.join(currentDir, 'dist');

  log('===================================================', colors.bold + colors.green);
  log('   🚀 EzPrintWork 원클릭 자동 연동 배포 시스템 가동', colors.bold + colors.green);
  log('===================================================', colors.bold + colors.green);

  // 0. 파일 점유 에러 예방을 위해 powershell 강제 삭제 구동
  if (fs.existsSync(distDir)) {
    log('\n[0/4] 기존 dist 빌드 폴더를 깨끗하게 청소 중...', colors.cyan);
    try {
      execSync('powershell -Command "if (Test-Path dist) { Remove-Item -Recurse -Force dist }"', { stdio: 'ignore', cwd: currentDir });
      log('✓ 이전 빌드 폴더 삭제 완료!', colors.green);
    } catch (err) {
      log(`* 경고: 기존 dist 삭제에 실패했으나 계속 진행합니다: ${err.message}`, colors.yellow);
    }
  }

  // 1. EzPrintWork 빌드
  log('\n[1/4] EzPrintWork 웹 버전 컴파일 중...', colors.yellow);
  runCommand('npm run build', currentDir);

  // 2. 홈페이지 연동 폴더로 복사
  log('\n[2/4] 빌드 완료된 파일을 홈페이지 연동 폴더로 이식 중...', colors.yellow);
  log(`* 복사처: ${targetDir}`, colors.cyan);
  try {
    copyFolderSync(distDir, targetDir);
    log('✓ 파일 복사 완료!', colors.green);
  } catch (err) {
    log(`[에러] 복사 실패: ${err.message}`, colors.red);
    process.exit(1);
  }

  // 3. 홈페이지 통합 컴파일
  if (fs.existsSync(path.join(homepageDir, 'package.json'))) {
    log('\n[3/4] 홈페이지 전체 통합 빌드 컴파일 중...', colors.yellow);
    runCommand('npm run build', homepageDir);
  } else {
    log('\n[3/4] 홈페이지 빌드 생략 (package.json 없음)', colors.yellow);
  }

  // 4. 구글 파이어베이스 호스팅 업로드
  log('\n[4/4] 구글 파이어베이스 클라우드로 최종 업로드(배포) 중...', colors.yellow);
  runCommand('node C:\\Users\\user\\Desktop\\EZPRIN~1\\EzPrintWork\\node_modules\\firebase-tools\\lib\\bin\\firebase.js deploy --only hosting', homepageDir);

  log('\n===================================================', colors.bold + colors.green);
  log('   🎉 [성공] 홈페이지 실시간 업로드가 완료되었습니다!', colors.bold + colors.green);
  log('   도메인 주소로 접속해 변경사항을 즉시 확인해 보세요.', colors.bold + colors.green);
  log('===================================================', colors.bold + colors.green);
}

main();
