/**
 * release-build/ (또는 release/) 산출물을 GitHub Releases에 업로드
 * 사용: set GH_TOKEN=ghp_xxx && node scripts/publish-github-release.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OWNER = 'molnanle-prog';
const REPO = 'EzPrintWork';

function request(method, apiPath, token, body, contentType) {
  return new Promise((resolve, reject) => {
    const payload = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'EzPrintWork-Release-Script',
          ...(payload
            ? {
                'Content-Type': contentType || 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch {
              resolve(data);
            }
          } else {
            reject(new Error(`GitHub API ${method} ${apiPath} → ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function uploadAsset(uploadUrlTemplate, token, filePath, label) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);
    const uploadUrl = new URL(
      uploadUrlTemplate.replace(/\{[^}]*\}/, `?name=${encodeURIComponent(label)}&label=${encodeURIComponent(label)}`)
    );
    const req = https.request(
      {
        hostname: uploadUrl.hostname,
        path: uploadUrl.pathname + uploadUrl.search,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
          'User-Agent': 'EzPrintWork-Release-Script',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✓ 업로드: ${label} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
            resolve();
          } else {
            reject(new Error(`Asset upload failed ${label}: ${res.statusCode} ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    stream.pipe(req);
  });
}

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('GH_TOKEN 또는 GITHUB_TOKEN 환경변수가 필요합니다.');
    process.exit(1);
  }

  const projectRoot = path.resolve(__dirname, '..');
  const version = require(path.join(projectRoot, 'package.json')).version;
  const tag = `v${version}`;
  const releaseDir = path.join(projectRoot, process.env.ELECTRON_BUILD_OUTPUT || 'release-build');

  if (!fs.existsSync(releaseDir)) {
    console.error(`빌드 폴더 없음: ${releaseDir} — 먼저 electron-builder를 실행하세요.`);
    process.exit(1);
  }

  const assets = [
    'EzPrintWork-Setup.exe',
    'latest.yml',
    'EzPrintWork-Setup.exe.blockmap',
  ]
    .map((name) => path.join(releaseDir, name))
    .filter((p) => fs.existsSync(p));

  const setupExe = assets.find((p) => p.endsWith('EzPrintWork-Setup.exe'));
  if (!setupExe) {
    console.error('EzPrintWork-Setup.exe를 찾을 수 없습니다. electron-builder 빌드를 먼저 실행하세요.');
    process.exit(1);
  }

  console.log(`GitHub Release ${tag} 게시 중…`);

  let release;
  try {
    release = await request('POST', `/repos/${OWNER}/${REPO}/releases`, token, {
      tag_name: tag,
      name: `EzPrintWork ${version}`,
      body: `## EzPrintWork v${version}\n\n- PC 설치 프로그램: EzPrintWork-Setup.exe\n- 앱 실행 시 GitHub에서 자동 업데이트 확인`,
      draft: false,
      prerelease: false,
    });
  } catch (err) {
    if (!String(err.message).includes('422')) throw err;
    console.log('* 기존 Release 감지 — 동일 태그 업데이트');
    const list = await request('GET', `/repos/${OWNER}/${REPO}/releases/tags/${tag}`, token);
    release = list;
  }

  for (const filePath of assets) {
    const name = path.basename(filePath);
    const existing = (release.assets || []).find((a) => a.name === name);
    if (existing?.id) {
      await request('DELETE', `/repos/${OWNER}/${REPO}/releases/assets/${existing.id}`, token);
      console.log(`* 기존 파일 교체: ${name}`);
    }
    await uploadAsset(release.upload_url, token, filePath, name);
  }

  console.log(`\n🎉 Release 완료: https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`);
  console.log(`   다운로드: https://github.com/${OWNER}/${REPO}/releases/latest/download/EzPrintWork-Setup.exe`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
