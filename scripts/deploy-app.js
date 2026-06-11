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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const { resolveHomepageDir } = require('./resolve-homepage-dir');
  const currentDir = path.resolve(__dirname, '..');
  const homepageDir = resolveHomepageDir();
  const targetDir = path.join(homepageDir, 'public', 'ezpw');
  const downloadsDir = path.join(homepageDir, 'public', 'downloads');
  const distDir = path.join(currentDir, 'dist');
  const releaseDir = path.join(currentDir, 'release');
  const deployExeDirect = process.env.DEPLOY_SETUP_EXE === '1';
  const MIN_SETUP_BYTES = 15 * 1024 * 1024;

  log('===================================================', colors.bold + colors.green);
  log('   🚀 EzPrintWork 앱 링킹 & 원클릭 통합 배포 가동', colors.bold + colors.green);
  log('===================================================', colors.bold + colors.green);
  log(`* 홈페이지 경로: ${homepageDir}`, colors.cyan);
  if (deployExeDirect) {
    log('* .exe 직접 배포 모드 (Firebase Blaze 요금제 필요)', colors.yellow);
  } else {
    log('* .zip 배포 모드 (Spark 무료 요금제 호환 — 압축 해제 후 설치)', colors.cyan);
  }

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
    const setupCandidates = files
      .filter(f => f.endsWith('.exe') && f.includes('Setup'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(releaseDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const setupFile = setupCandidates[0]?.name;

    if (setupFile) {
      const sourcePath = path.join(releaseDir, setupFile);
      const targetZipPath = path.join(downloadsDir, 'EzPrintWork-Setup.zip');
      const targetExePath = path.join(downloadsDir, 'EzPrintWork-Setup.exe');
      const sourceStat = fs.statSync(sourcePath);

      log(`* 감지된 원본 파일: ${setupFile}`, colors.cyan);
      log(`* 설치 파일 용량: ${formatBytes(sourceStat.size)}`, colors.cyan);

      if (sourceStat.size < MIN_SETUP_BYTES) {
        throw new Error(
          `설치 파일 용량이 비정상적으로 작습니다 (${formatBytes(sourceStat.size)}). electron-builder 빌드를 다시 확인해 주세요.`
        );
      }

      if (fs.existsSync(targetZipPath)) fs.unlinkSync(targetZipPath);
      if (fs.existsSync(targetExePath)) fs.unlinkSync(targetExePath);

      log('* 데스크톱 설치 파일을 Zip으로 압축 중...', colors.cyan);
      execSync(`powershell -Command "Compress-Archive -Path '${sourcePath}' -DestinationPath '${targetZipPath}' -Force"`);

      const zipStat = fs.statSync(targetZipPath);
      log(`* Zip 용량: ${formatBytes(zipStat.size)} (원본 ${formatBytes(sourceStat.size)})`, colors.cyan);

      if (zipStat.size < sourceStat.size * 0.4) {
        throw new Error('Zip 압축 결과 용량 검증 실패 — 손상된 파일일 수 있습니다.');
      }
      log('✓ EzPrintWork-Setup.zip 생성 완료', colors.green);

      let downloadUrl = '/downloads/EzPrintWork-Setup.zip';
      let downloadType = 'zip';

      if (deployExeDirect) {
        fs.copyFileSync(sourcePath, targetExePath);
        const exeStat = fs.statSync(targetExePath);
        if (exeStat.size !== sourceStat.size) {
          throw new Error('.exe 복사 후 용량이 일치하지 않습니다.');
        }
        downloadUrl = '/downloads/EzPrintWork-Setup.exe';
        downloadType = 'exe';
        log(`✓ EzPrintWork-Setup.exe 직접 배포 (${formatBytes(exeStat.size)})`, colors.green);
      } else {
        log('* Spark 요금제 호환: .exe는 zip 안에 포함됩니다. 압축 해제 후 설치 프로그램을 실행하세요.', colors.cyan);
      }

      fs.writeFileSync(
        path.join(downloadsDir, 'download-manifest.json'),
        JSON.stringify({
          version: require(path.join(currentDir, 'package.json')).version,
          setupFile: deployExeDirect ? 'EzPrintWork-Setup.exe' : 'EzPrintWork-Setup.zip',
          setupBytes: deployExeDirect ? fs.statSync(targetExePath).size : zipStat.size,
          exeBytes: sourceStat.size,
          downloadUrl,
          downloadType,
          updatedAt: new Date().toISOString(),
          installHint: deployExeDirect
            ? '다운로드 후 바로 설치 프로그램을 실행하세요.'
            : 'zip을 압축 해제한 뒤 EzPrintWork-Setup.exe를 실행하세요.',
        }, null, 2)
      );
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

  // 4.5. Hosting 저장 한도 방지 — 오래된 릴리스 정리 (최신 3개만 유지, 실패해도 배포 계속)
  log('\n[4.5/5] Firebase Hosting 오래된 배포본 정리 중...', colors.yellow);
  try {
    execSync('node scripts/cleanup_hosting_releases.mjs gen-lang-client-0746903005 3', { stdio: 'inherit', cwd: currentDir });
  } catch (e) {
    log('* 경고: Hosting 릴리스 정리 실패 — 배포는 계속 시도합니다.', colors.yellow);
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
