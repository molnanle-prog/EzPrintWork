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

function runCommand(command, cwd, extraEnv = {}) {
  log(`\n> 실행 중: ${command}`, colors.cyan);
  try {
    const output = execSync(command, {
      stdio: 'pipe',
      cwd,
      env: { ...process.env, ...extraEnv },
    });
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
  const releaseDir = path.join(currentDir, process.env.ELECTRON_BUILD_OUTPUT || 'release');
  const releaseDirName = path.basename(releaseDir);
  const deployExeDirect = process.env.DEPLOY_SETUP_ZIP !== '1';
  const MIN_SETUP_BYTES = 15 * 1024 * 1024;
  const GITHUB_EXE_URL = 'https://github.com/molnanle-prog/EzPrintWork/releases/latest/download/EzPrintWork-Setup.exe';
  const appVersion = require(path.join(currentDir, 'package.json')).version;
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  log('===================================================', colors.bold + colors.green);
  log('   🚀 EzPrintWork 앱 링킹 & 원클릭 통합 배포 가동', colors.bold + colors.green);
  log('===================================================', colors.bold + colors.green);
  log(`* 홈페이지 경로: ${homepageDir}`, colors.cyan);
  if (deployExeDirect) {
    log('* exe 다운로드: GitHub Releases (Firebase Spark exe 호스팅 불가)', colors.green);
    log(`* ${GITHUB_EXE_URL}`, colors.cyan);
  } else {
    log('* .zip 배포 모드 (DEPLOY_SETUP_ZIP=1 — 압축 해제 후 설치)', colors.yellow);
  }

  // 0. 파일 점유 에러 예방을 위해 powershell 강제 삭제 구동
  if (fs.existsSync(distDir) && process.env.DEPLOY_SKIP_BUILD !== '1') {
    log('\n[0/5] 기존 dist 빌드 폴더를 깨끗하게 청소 중...', colors.cyan);
    try {
      execSync('powershell -Command "if (Test-Path dist) { Remove-Item -Recurse -Force dist }"', { stdio: 'ignore', cwd: currentDir });
      log('✓ 이전 빌드 폴더 삭제 완료!', colors.green);
    } catch (err) {
      log(`* 경고: 기존 dist 삭제에 실패했으나 계속 진행합니다: ${err.message}`, colors.yellow);
    }
  }

  // 1. EzPrintWork 빌드 (Vite & Type Check 우회)
  if (process.env.DEPLOY_SKIP_BUILD === '1') {
    log('\n[1/5] 웹 빌드 생략 (DEPLOY_SKIP_BUILD=1)', colors.yellow);
  } else {
    log('\n[1/5] EzPrintWork 웹 컴파일 중...', colors.yellow);
    runCommand('npm run build', currentDir);
  }

  // 2. Electron 설치본 빌드 + GitHub Release 업로드 (자동 업데이트용)
  if (process.env.DEPLOY_SKIP_ELECTRON === '1') {
    log('\n[2/5] Electron 빌드/Release 생략 (DEPLOY_SKIP_ELECTRON=1)', colors.yellow);
  } else {
    log('\n[2/5] PC용 설치 프로그램 (.exe) 빌드 및 GitHub Release 업로드...', colors.yellow);
    const builderOutputFlag = `-c.directories.output=${releaseDirName}`;
    runCommand(`npx electron-builder --publish never "${builderOutputFlag}"`, currentDir);
    if (ghToken) {
      log('* GitHub Release 업로드 중...', colors.green);
      log(`* Release: https://github.com/molnanle-prog/EzPrintWork/releases/tag/v${appVersion}`, colors.cyan);
      runCommand('node scripts/publish-github-release.js', currentDir, {
        GH_TOKEN: ghToken,
        ELECTRON_BUILD_OUTPUT: releaseDirName,
      });
    } else {
      log('* GitHub Release 업로드 생략 (GH_TOKEN 없음)', colors.yellow);
      log('* 업로드: set GH_TOKEN=... && npm run publish:release', colors.yellow);
    }
  }

  // 3. 다운로드 manifest + 웹앱 이식 (exe는 GitHub Releases — Firebase Spark exe 호스팅 불가)
  log('\n[3/5] download-manifest 갱신 및 웹앱 홈페이지 연동...', colors.yellow);
  try {
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const files = fs.readdirSync(releaseDir);
    const setupCandidates = files
      .filter(f => f.endsWith('.exe') && /EzPrintWork-Setup/i.test(f))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(releaseDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const setupFile = setupCandidates[0]?.name;

    if (setupFile) {
      const sourcePath = path.join(releaseDir, setupFile);
      const sourceStat = fs.statSync(sourcePath);
      const setupExeName = 'EzPrintWork-Setup.exe';
      const githubDownloadUrl =
        `https://github.com/molnanle-prog/EzPrintWork/releases/latest/download/${setupExeName}`;
      const githubVersionUrl =
        `https://github.com/molnanle-prog/EzPrintWork/releases/download/v${appVersion}/${setupExeName}`;

      log(`* 감지된 설치 파일: ${setupFile} (${formatBytes(sourceStat.size)})`, colors.cyan);

      if (sourceStat.size < MIN_SETUP_BYTES) {
        throw new Error(
          `설치 파일 용량이 비정상적으로 작습니다 (${formatBytes(sourceStat.size)}). electron-builder 빌드를 다시 확인해 주세요.`
        );
      }

      // Firebase Hosting(Spark)에 exe/zip 올리면 배포 실패 — 로컬 copies 제거
      for (const name of fs.readdirSync(downloadsDir)) {
        if (/\.(exe|zip)$/i.test(name)) {
          fs.unlinkSync(path.join(downloadsDir, name));
          log(`* Hosting 제한: downloads/${name} 제거 (GitHub Release 사용)`, colors.yellow);
        }
      }

      fs.writeFileSync(
        path.join(downloadsDir, 'download-manifest.json'),
        JSON.stringify({
          version: appVersion,
          setupFile: setupExeName,
          latestSetupFile: setupExeName,
          setupExeName,
          setupBytes: sourceStat.size,
          exeBytes: sourceStat.size,
          downloadUrl: githubDownloadUrl,
          latestDownloadUrl: githubDownloadUrl,
          githubReleaseUrl: `https://github.com/molnanle-prog/EzPrintWork/releases/tag/v${appVersion}`,
          githubReleaseLatest: 'https://github.com/molnanle-prog/EzPrintWork/releases/latest',
          githubVersionDownloadUrl: githubVersionUrl,
          downloadType: 'exe',
          host: 'github-releases',
          updatedAt: new Date().toISOString(),
          installHint: '다운로드 후 EzPrintWork-Setup.exe 설치 프로그램을 실행하세요.',
        }, null, 2)
      );
      log(`✓ GitHub exe 다운로드: ${githubDownloadUrl}`, colors.green);

      const latestYmlSource = path.join(releaseDir, 'latest.yml');
      if (fs.existsSync(latestYmlSource)) {
        let yml = fs.readFileSync(latestYmlSource, 'utf-8');
        // path는 파일명만 — 전체 URL이면 Windows가 바탕화면/다운로드 폴더에 exe를 저장할 수 있음
        yml = yml.replace(/^path: .+$/m, `path: ${setupExeName}`);
        yml = yml.replace(/^(\s+- url: ).+$/m, `$1${githubDownloadUrl}`);
        fs.writeFileSync(path.join(downloadsDir, 'latest.yml'), yml);
        log('✓ latest.yml → ez-hub.kr/downloads/ (앱 자동업데이트용)', colors.green);
      }

      if (ghToken) {
        log('* GitHub Release는 electron-builder --publish always 로 업로드됨', colors.cyan);
      } else {
        log('* GitHub Release 수동 업로드: set GH_TOKEN=... && node scripts/publish-github-release.js', colors.yellow);
      }
    } else {
      throw new Error(`${releaseDirName} 폴더에서 EzPrintWork .exe 설치 파일을 찾을 수 없습니다.`);
    }

    // 웹앱용 리액트 소스도 이식
    copyFolderSync(distDir, targetDir);

    const versionManifestPath = path.join(targetDir, 'version.json');
    const distVersionPath = path.join(distDir, 'version.json');
    let buildId = `${appVersion}-${Date.now()}`;
    if (fs.existsSync(distVersionPath)) {
      try {
        const distManifest = JSON.parse(fs.readFileSync(distVersionPath, 'utf-8'));
        if (distManifest.buildId) buildId = distManifest.buildId;
      } catch (_) { /* use fresh buildId */ }
    }
    fs.writeFileSync(
      versionManifestPath,
      JSON.stringify({
        version: appVersion,
        buildId,
        builtAt: new Date().toISOString(),
      }, null, 2)
    );

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
