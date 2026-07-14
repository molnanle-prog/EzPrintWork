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

function runCommandOptional(command, cwd) {
  try {
    execSync(command, { stdio: 'pipe', cwd, encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/** 로컬 GH_TOKEN 없을 때 — git tag push → GitHub Actions가 exe Release 자동 업로드 */
function tryTriggerGithubActionsRelease(appVersion, projectRoot) {
  const tag = `v${appVersion}`;
  log(`* 로컬 GH_TOKEN 없음 → GitHub Actions 자동 업로드 경로 사용 (${tag})`, colors.cyan);
  log('  (GitHub 서버가 토큰을 제공하므로 PC에 GH_TOKEN 설정 불필요)', colors.cyan);

  const remoteHasTag = runCommandOptional(`git rev-parse refs/remotes/origin/${tag}`, projectRoot);
  if (remoteHasTag) {
    log(`✓ 원격 태그 ${tag} 이미 존재 — Actions Release 확인`, colors.green);
    log(`  https://github.com/molnanle-prog/EzPrintWork/releases/tag/${tag}`, colors.cyan);
    return;
  }

  log('* main 푸시 및 태그 생성으로 Actions 트리거 시도...', colors.yellow);
  runCommandOptional('git push origin main', projectRoot);
  runCommandOptional(`git tag -f ${tag} -m "EzPrintWork ${appVersion}"`, projectRoot);
  if (runCommandOptional(`git push -f origin ${tag}`, projectRoot)) {
    log(`✓ ${tag} 푸시 완료 — GitHub Actions가 exe를 자동 업로드합니다`, colors.green);
    log('  https://github.com/molnanle-prog/EzPrintWork/actions', colors.cyan);
  } else {
    log(`* 태그 푸시 실패 — 수동: git tag ${tag} && git push origin ${tag}`, colors.yellow);
    log('  또는 최초 1회: powershell scripts/setup-deploy-token.ps1', colors.yellow);
  }
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

function removeHostingBinaryDownloads(downloadsDir, log, colors) {
  for (const name of fs.readdirSync(downloadsDir)) {
    if (/\.(exe|zip)$/i.test(name)) {
      fs.unlinkSync(path.join(downloadsDir, name));
      log(`* Hosting 제한: downloads/${name} 제거 (GitHub Release 사용)`, colors.yellow);
    }
  }
}

function writeDownloadManifest({
  appVersion,
  setupExeName,
  setupBytes,
  githubDownloadUrl,
  githubVersionUrl,
  downloadsDir,
  log,
  colors,
}) {
  removeHostingBinaryDownloads(downloadsDir, log, colors);
  fs.writeFileSync(
    path.join(downloadsDir, 'download-manifest.json'),
    JSON.stringify({
      version: appVersion,
      setupFile: setupExeName,
      latestSetupFile: setupExeName,
      setupExeName,
      setupBytes,
      exeBytes: setupBytes,
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
}

function fetchGithubReleaseAsset(tag, assetName) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.get(
      `https://api.github.com/repos/molnanle-prog/EzPrintWork/releases/tags/${tag}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'EzPrintWork-Deploy',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`GitHub Release ${tag} 조회 실패 (${res.statusCode})`));
            return;
          }
          try {
            const release = JSON.parse(data);
            const asset = (release.assets || []).find((a) => a.name === assetName);
            if (!asset) {
              reject(new Error(`GitHub Release ${tag}에 ${assetName} 없음`));
              return;
            }
            resolve({
              size: asset.size,
              releaseDate: release.published_at,
            });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
  });
}

async function writeDownloadManifestFromGithub({
  appVersion,
  setupExeName,
  githubDownloadUrl,
  githubVersionUrl,
  downloadsDir,
  log,
  colors,
}) {
  const tag = `v${appVersion}`;
  const { size, releaseDate } = await fetchGithubReleaseAsset(tag, setupExeName);
  writeDownloadManifest({
    appVersion,
    setupExeName,
    setupBytes: size,
    githubDownloadUrl,
    githubVersionUrl,
    downloadsDir,
    log,
    colors,
  });

  const ymlPath = path.join(downloadsDir, 'latest.yml');
  const ymlDownloadUrl =
    `https://github.com/molnanle-prog/EzPrintWork/releases/download/${tag}/latest.yml`;
  try {
    const ymlAsset = await new Promise((resolve, reject) => {
      const https = require('https');
      const fetchUrl = (url, redirects = 0) => {
        https.get(
          url,
          { headers: { 'User-Agent': 'EzPrintWork-Deploy' } },
          (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              if (redirects > 5) {
                reject(new Error('latest.yml redirect 과다'));
                return;
              }
              fetchUrl(res.headers.location, redirects + 1);
              return;
            }
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
              if (res.statusCode !== 200) reject(new Error(`latest.yml 다운로드 실패 (${res.statusCode})`));
              else resolve(data);
            });
          }
        ).on('error', reject);
      };
      fetchUrl(ymlDownloadUrl);
    });
    let yml = ymlAsset;
    yml = yml.replace(/^path: .+$/m, `path: ${setupExeName}`);
    yml = yml.replace(/^(\s+- url: ).+$/m, `$1${githubDownloadUrl}`);
    if (!/sha512:\s+\S+/.test(yml)) {
      throw new Error('GitHub latest.yml에 sha512이 없습니다 — 자동업데이트 무결성 검사용');
    }
    fs.writeFileSync(ymlPath, yml);
    log('✓ latest.yml (GitHub Release) → ez-hub.kr/downloads/', colors.green);
  } catch (err) {
    log(`* latest.yml GitHub 복사 실패: ${err.message}`, colors.yellow);
    // 로컬 electron-builder latest.yml(sha512 포함)을 쓰고 URL만 GitHub로 교체
    const localYmlPath = path.join(
      path.resolve(__dirname, '..'),
      process.env.ELECTRON_BUILD_OUTPUT || 'release',
      'latest.yml'
    );
    if (fs.existsSync(localYmlPath)) {
      let yml = fs.readFileSync(localYmlPath, 'utf-8');
      yml = yml.replace(/^path: .+$/m, `path: ${setupExeName}`);
      yml = yml.replace(/^(\s+- url: ).+$/m, `$1${githubDownloadUrl}`);
      if (!/sha512:\s+\S+/.test(yml)) {
        throw new Error('로컬 latest.yml에도 sha512이 없습니다. electron-builder 산출물을 확인하세요.');
      }
      fs.writeFileSync(ymlPath, yml);
      log('✓ latest.yml (로컬 builder 산출물, sha512 유지)', colors.green);
    } else {
      throw new Error(
        `latest.yml 동기화 실패 — sha512 없는 fallback은 쓰지 않습니다: ${err.message}`
      );
    }
  }
}

async function main() {
  const { resolveHomepageDir } = require('./resolve-homepage-dir');
  const { loadDeployEnv } = require('./load-deploy-env');
  const currentDir = path.resolve(__dirname, '..');
  loadDeployEnv(currentDir);
  const homepageDir = resolveHomepageDir();
  const targetDir = path.join(homepageDir, 'public', 'ezpw');
  const downloadsDir = path.join(homepageDir, 'public', 'downloads');
  const distDir = path.join(currentDir, 'dist');
  const releaseDir = path.join(currentDir, process.env.ELECTRON_BUILD_OUTPUT || 'release');
  const releaseDirName = path.basename(releaseDir);
  const deployExeDirect = process.env.DEPLOY_SETUP_ZIP !== '1';
  // PC 자동업데이트: GitHub Release + latest.yml(sha512) 동기화 필수 (DEPLOY_FAST=1 일 때만 생략)
  const fastDeploy = process.env.DEPLOY_FAST === '1';
  const waitForGithubReleaseEnabled = !fastDeploy && process.env.DEPLOY_WAIT_RELEASE !== '0';
  const enableHostingCleanup = process.env.DEPLOY_CLEANUP_HOSTING === '1';
  const MIN_SETUP_BYTES = 15 * 1024 * 1024;
  const appVersion = require(path.join(currentDir, 'package.json')).version;
  const GITHUB_EXE_URL = `https://github.com/molnanle-prog/EzPrintWork/releases/download/v${appVersion}/EzPrintWork-Setup.exe`;
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  log('===================================================', colors.bold + colors.green);
  log('   🚀 EzPrintWork 통합 배포 (웹 + 홈페이지 + 업데이트)', colors.bold + colors.green);
  log('===================================================', colors.bold + colors.green);
  log('   배포 범위: 웹앱 + 홈페이지 + GitHub Release + latest.yml(sha512)', colors.cyan);
  if (process.env.DEPLOY_SKIP_ELECTRON === '1') {
    log('   (DEPLOY_SKIP_ELECTRON=1 → PC exe 빌드 생략, GitHub Release 메타 사용)', colors.yellow);
  } else if (!ghToken) {
    log('   (GH_TOKEN 없음 → Actions Release 대기. 권장: scripts/setup-deploy-token.ps1)', colors.yellow);
  } else {
    log('   (GH_TOKEN → Release 업로드 + latest.yml GitHub 자산 동기화)', colors.green);
  }
  log(`* 홈페이지 경로: ${homepageDir}`, colors.cyan);
  log(
    `* Release대기=${waitForGithubReleaseEnabled ? 'ON' : 'OFF'} / Hosting정리=${enableHostingCleanup ? 'ON' : 'OFF'}${fastDeploy ? ' (DEPLOY_FAST=1)' : ''}`,
    colors.cyan
  );
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
      tryTriggerGithubActionsRelease(appVersion, currentDir);
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

    const setupExeName = 'EzPrintWork-Setup.exe';
    const githubDownloadUrl =
      `https://github.com/molnanle-prog/EzPrintWork/releases/download/v${appVersion}/${setupExeName}`;
    const githubVersionUrl =
      `https://github.com/molnanle-prog/EzPrintWork/releases/download/v${appVersion}/${setupExeName}`;

    if (setupFile) {
      const sourcePath = path.join(releaseDir, setupFile);
      const sourceStat = fs.statSync(sourcePath);

      log(`* 감지된 설치 파일: ${setupFile} (${formatBytes(sourceStat.size)})`, colors.cyan);

      if (sourceStat.size < MIN_SETUP_BYTES) {
        throw new Error(
          `설치 파일 용량이 비정상적으로 작습니다 (${formatBytes(sourceStat.size)}). electron-builder 빌드를 다시 확인해 주세요.`
        );
      }

      const {
        fetchGithubReleaseByTag,
        waitForGithubRelease,
        writeDownloadMetaFromRelease,
      } = await import('./github-download-meta.mjs');

      const releaseTag = `v${appVersion}`;
      let githubRelease = await fetchGithubReleaseByTag(releaseTag);

      if (!githubRelease && !ghToken && waitForGithubReleaseEnabled) {
        log(`* GitHub Actions Release 대기 중 (${releaseTag}, 최대 ~10분)...`, colors.cyan);
        githubRelease = await waitForGithubRelease(releaseTag, {
          onWait: (attempt, max) => {
            log(`  … Release 미완료 (${attempt}/${max})`, colors.cyan);
          },
        });
      } else if (!githubRelease && !ghToken && !waitForGithubReleaseEnabled) {
        log('* 빠른 배포 모드: GitHub Release 대기 생략', colors.yellow);
      }

      if (githubRelease) {
        await writeDownloadMetaFromRelease(githubRelease, downloadsDir);
        log(`✓ GitHub Release ${releaseTag} ↔ latest.yml(sha512) 동기화`, colors.green);
      } else {
        throw new Error(
          `GitHub Release ${releaseTag} 미완료 — sha512 불일치 방지를 위해 Hosting 배포를 중단합니다.\n` +
          `  → GH_TOKEN 설정 후: npm run release:all\n` +
          `  → 또는 Actions 완료 후: npm run sync:downloads && firebase deploy --only hosting`
        );
      }

      if (ghToken && githubRelease) {
        log('* GitHub Release 업로드·동기화 완료', colors.cyan);
      } else if (!ghToken) {
        log('* GitHub Release 수동 업로드: set GH_TOKEN=... && node scripts/publish-github-release.js', colors.yellow);
      }
    } else if (process.env.DEPLOY_SKIP_ELECTRON === '1') {
      log('* 로컬 exe 없음 — GitHub Release v' + appVersion + ' 메타데이터 사용', colors.yellow);
      await writeDownloadManifestFromGithub({
        appVersion,
        setupExeName,
        githubDownloadUrl,
        githubVersionUrl,
        downloadsDir,
        log,
        colors,
      });
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

  // 4.1 GitHub latest.yml(sha512) 재동기화 — exe보다 yml 자산이 늦게 올라오는 경우 dist 보정
  try {
    const { syncDownloadMeta } = await import('./github-download-meta.mjs');
    await syncDownloadMeta(`v${appVersion}`);
    const distDownloadsDir = path.join(homepageDir, 'dist', 'downloads');
    if (fs.existsSync(distDownloadsDir)) {
      for (const name of ['latest.yml', 'download-manifest.json']) {
        const src = path.join(downloadsDir, name);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(distDownloadsDir, name));
        }
      }
    }
    log('✓ latest.yml(sha512) GitHub 재동기화 → dist 반영', colors.green);
  } catch (err) {
    if (process.env.DEPLOY_SKIP_ELECTRON === '1') {
      log(`* latest.yml 재동기화 실패: ${err.message}`, colors.yellow);
    } else {
      log(`[에러] latest.yml 재동기화 실패: ${err.message}`, colors.red);
      process.exit(1);
    }
  }

  // 4.5. Hosting 저장 한도 방지
  if (enableHostingCleanup) {
    log('\n[4.5/5] Firebase Hosting 오래된 배포본 정리 중...', colors.yellow);
    try {
      execSync('node scripts/cleanup_hosting_releases.mjs gen-lang-client-0746903005 3', { stdio: 'inherit', cwd: currentDir });
    } catch (e) {
      log('* 경고: Hosting 릴리스 정리 실패 — 배포는 계속 시도합니다.', colors.yellow);
    }
  } else {
    log('\n[4.5/5] 빠른 배포 모드: Hosting 릴리스 정리 생략', colors.yellow);
  }

  // 5. 구글 파이어베이스 호스팅 업로드
  log('\n[5/5] 구글 파이어베이스 클라우드로 최종 업로드(배포) 중...', colors.yellow);
  runCommand('npx -y firebase-tools deploy --only hosting', homepageDir);

  log('\n===================================================', colors.bold + colors.green);
  log('   🎉 [성공] 통합 배포 완료', colors.bold + colors.green);
  log('   • 웹앱 /ezpw/ + version.json', colors.cyan);
  log('   • 홈페이지 (ez-hub.kr) Firebase Hosting', colors.cyan);
  log('   • /downloads/latest.yml + download-manifest.json', colors.cyan);
  log('   확인: https://ez-hub.kr/ezpw/  |  Ctrl+Shift+R', colors.cyan);
  log('===================================================', colors.bold + colors.green);
}

main();
