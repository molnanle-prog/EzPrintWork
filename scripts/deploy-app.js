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
  log(`\n> 실행 중: ${command}`, colors.cyan);
  try {
    const output = execSync(command, { stdio: 'pipe', cwd });
    console.log(output.toString());
  } catch (error) {
    log(`[에러 발생] 명령어 실행 실패: ${command}`, colors.red);
    if (error.stdout) console.log(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
    process.exit(1);
  }
}


function copyFolderSync(from, to) {
  if (fs.existsSync(to)) {
    try {
      execSync(`powershell -Command "if (Test-Path '${to}') { Remove-Item -Recurse -Force '${to}' }"`);
    } catch (e) {
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
  const os = require('os');
  const currentDir = path.resolve(__dirname, '..');
  const homepageDir = path.join(os.homedir(), 'Desktop', 'ez-hub-homepage');
  const targetDir = path.join(homepageDir, 'public', 'ezpw');
  const downloadsDir = path.join(homepageDir, 'public', 'downloads');
  const distDir = path.join(currentDir, 'dist');
  const releaseDir = path.join(currentDir, 'release');

  log('===================================================', colors.bold + colors.green);
  log('   🚀 EzPrintWork 앱 링킹 & 원클릭 통합 배포 가동', colors.bold + colors.green);
  log('===================================================', colors.bold + colors.green);

  // 0. 파일 점유 에러 예방을 위해 powershell 강제 삭제 구동
  if (fs.existsSync(distDir)) {
    log('\n[0/5] 기존 dist 빌드 폴더를 깨끗하게 청소 중...', colors.cyan);
    try {
      execSync('powershell -Command "if (Test-Path dist) { Remove-Item -Recurse -Force dist }"', { stdio: 'ignore', cwd: currentDir });
      log('✓ 이전 빌드 폴더 삭제 완료!', colors.green);
    } catch (err) {
      log(`* 경고: 기존 dist 삭제에 실패했으나 계속 진행합니다: ${err.message}`, colors.yellow);
    }
  }

  // 1. EzPrintWork 빌드 (Vite & Type Check 우회)
  log('\n[1/5] EzPrintWork 웹 컴파일 중...', colors.yellow);
  runCommand('npm run build', currentDir);

  // 2. 일렉트론 데스크톱 설치 패키지 (.exe) 패키징 구동
  log('\n[2/5] PC용 데스크톱 설치 프로그램 (.exe) 패키징 컴파일 중...', colors.yellow);
  log('* 이 작업은 다소 시간이 소요될 수 있습니다 (약 30초~1분)...', colors.cyan);
  runCommand('npx electron-builder', currentDir);

  // 3. 빌드된 설치 파일 감지 및 리네임하여 홈페이지 다운로드 폴더로 이식
  log('\n[3/5] 빌드된 설치 파일을 홈페이지 다운로드 디렉토리로 연동 중...', colors.yellow);
  try {
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const files = fs.readdirSync(releaseDir);
    const setupFile = files.find(f => f.endsWith('.exe') && f.includes('EzPrintWork'));

    if (setupFile) {
      const sourcePath = path.join(releaseDir, setupFile);
      const targetPath = path.join(downloadsDir, 'EzPrintWork-Setup.zip');
      
      log(`* 감지된 원본 파일: ${setupFile}`, colors.cyan);
      log(`* 최종 압축 파일명: EzPrintWork-Setup.zip`, colors.cyan);
      
      // 혹시 남아있을 수 있는 이전 .exe 파일 제거 (Firebase 업로드 에러 사전 차단)
      const legacyExe = path.join(downloadsDir, 'EzPrintWork-Setup.exe');
      if (fs.existsSync(legacyExe)) {
        try {
          fs.unlinkSync(legacyExe);
          log('✓ 기존 레거시 .exe 설치 파일 안전하게 제거 완료', colors.green);
        } catch (e) {
          log(`* 경고: 레거시 .exe 제거 중 예외 발생: ${e.message}`, colors.yellow);
        }
      }
      
      if (fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch (e) {}
      }
      // PowerShell을 사용하여 초고속 압축
      log('* 데스크톱 앱을 초고속 Zip 파일로 압축 중...', colors.cyan);
      execSync(`powershell -Command "Compress-Archive -Path '${sourcePath}' -DestinationPath '${targetPath}' -Force"`);
      log('✓ 최신 데스크톱 설치본 Zip 압축 및 링킹 완료!', colors.green);

      // Firebase Spark 요금제 제한(실행 파일 업로드 불가)으로 인해 
      // .exe 설치본 복사는 비활성화하고 .zip 압축본만 서빙합니다.
      const targetExePath = path.join(downloadsDir, 'EzPrintWork-Setup.exe');
      if (fs.existsSync(targetExePath)) {
        try {
          fs.unlinkSync(targetExePath);
          log('✓ Firebase 업로드 에러 방지를 위해 기존 레거시 .exe를 삭제했습니다.', colors.green);
        } catch (e) {}
      }
    } else {
      throw new Error('release 폴더에서 EzPrintWork .exe 설치 파일을 찾을 수 없습니다.');
    }

    // 웹앱용 리액트 소스도 이식
    copyFolderSync(distDir, targetDir);
    log('✓ 웹 애플리케이션 리액트 소스 복사 완료!', colors.green);
  } catch (err) {
    log(`[에러] 연동 및 이식 실패: ${err.message}`, colors.red);
    process.exit(1);
  }

  // 4. 홈페이지 통합 컴파일 (설치본 다운로드 자산 포함 빌드)
  if (fs.existsSync(path.join(homepageDir, 'package.json'))) {
    log('\n[4/5] 홈페이지 전체 통합 빌드 컴파일 중...', colors.yellow);
    runCommand('npm run build', homepageDir);
  } else {
    log('\n[4/5] 홈페이지 빌드 생략 (package.json 없음)', colors.yellow);
  }

  // 5. 구글 파이어베이스 호스팅 업로드
  log('\n[5/5] 구글 파이어베이스 클라우드로 최종 업로드(배포) 중...', colors.yellow);
  runCommand('npx -y firebase-tools deploy --only hosting', homepageDir);

  log('\n===================================================', colors.bold + colors.green);
  log('   🎉 [성공] 앱 다운로드 링킹 및 실시간 홈페이지 업로드 완료!', colors.bold + colors.green);
  log('   도메인 주소로 접속해 변경사항을 즉시 확인해 보세요.', colors.bold + colors.green);
  log('===================================================', colors.bold + colors.green);
}

main();
