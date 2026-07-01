/**
 * GitHub Releases ↔ ez-hub downloads 메타 동기화
 * 사용: node scripts/github-download-meta.mjs [v1.3.4 | latest]
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { resolveHomepageDir } = require('./resolve-homepage-dir.js');

const OWNER = 'molnanle-prog';
const REPO = 'EzPrintWork';
const SETUP_EXE = 'EzPrintWork-Setup.exe';

function githubGet(apiPath) {
  return new Promise((resolve, reject) => {
    https.get(
      `https://api.github.com${apiPath}`,
      { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EzPrintWork-DownloadMeta' } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
          }
        });
      }
    ).on('error', reject);
  });
}

function fetchRaw(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'EzPrintWork-DownloadMeta' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        fetchRaw(res.headers.location, redirects + 1).then(resolve, reject);
        return;
      }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) reject(new Error(`Fetch ${url} → ${res.statusCode}`));
        else resolve(data);
      });
    }).on('error', reject);
  });
}

export async function fetchGithubReleaseByTag(tag) {
  try {
    return await githubGet(`/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
  } catch (err) {
    if (String(err.message).includes('404')) return null;
    throw err;
  }
}

export async function fetchGithubLatestRelease() {
  return githubGet(`/repos/${OWNER}/${REPO}/releases/latest`);
}

/** GitHub Actions Release 완료까지 대기 (로컬 exe ≠ CI exe 시 sha512 불일치 방지) */
export async function waitForGithubRelease(
  tag,
  { maxAttempts = 40, intervalMs = 15_000, onWait } = {}
) {
  const normalized = tag.startsWith('v') ? tag : `v${tag}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const release = await fetchGithubReleaseByTag(normalized);
    const exeAsset = release?.assets?.find((a) => a.name === SETUP_EXE);
    const ymlAsset = release?.assets?.find((a) => a.name === 'latest.yml');
    if (release && exeAsset && ymlAsset) {
      return release;
    }
    if (release && exeAsset && !ymlAsset && onWait) {
      onWait(attempt, maxAttempts, 'exe-only');
    } else if (onWait) {
      onWait(attempt, maxAttempts);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return null;
}

export async function writeDownloadMetaFromRelease(release, downloadsDir) {
  const tag = release.tag_name;
  const version = tag.replace(/^v/, '');
  const ymlAsset = (release.assets || []).find((a) => a.name === 'latest.yml');
  const exeAsset = (release.assets || []).find((a) => a.name === SETUP_EXE);
  if (!exeAsset) {
    throw new Error(`Release ${tag}에 ${SETUP_EXE} 없음`);
  }

  const githubLatestUrl =
    `https://github.com/${OWNER}/${REPO}/releases/latest/download/${SETUP_EXE}`;
  const githubVersionUrl =
    `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/${SETUP_EXE}`;

  fs.mkdirSync(downloadsDir, { recursive: true });

  let yml;
  if (ymlAsset) {
    yml = await fetchRaw(ymlAsset.browser_download_url);
    yml = yml.replace(/^path: .+$/m, `path: ${SETUP_EXE}`);
    yml = yml.replace(/^(\s+- url: ).+$/m, `$1${githubLatestUrl}`);
  } else {
    throw new Error(`Release ${tag}에 latest.yml 없음 — electron-builder Release 자산 확인 필요`);
  }
  fs.writeFileSync(path.join(downloadsDir, 'latest.yml'), yml);

  const manifest = {
    version,
    setupFile: SETUP_EXE,
    latestSetupFile: SETUP_EXE,
    setupExeName: SETUP_EXE,
    setupBytes: exeAsset.size,
    exeBytes: exeAsset.size,
    downloadUrl: githubLatestUrl,
    latestDownloadUrl: githubLatestUrl,
    githubReleaseUrl: `https://github.com/${OWNER}/${REPO}/releases/tag/${tag}`,
    githubReleaseLatest: `https://github.com/${OWNER}/${REPO}/releases/latest`,
    githubVersionDownloadUrl: githubVersionUrl,
    downloadType: 'exe',
    host: 'github-releases',
    updatedAt: new Date().toISOString(),
    installHint: '다운로드 후 EzPrintWork-Setup.exe 설치 프로그램을 실행하세요.',
  };
  fs.writeFileSync(path.join(downloadsDir, 'download-manifest.json'), JSON.stringify(manifest, null, 2));

  return { tag, version, exeBytes: exeAsset.size };
}

export async function syncDownloadMeta(tagArg = 'latest') {
  const downloadsDir = path.join(resolveHomepageDir(), 'public', 'downloads');
  let release;
  if (tagArg === 'latest') {
    release = await fetchGithubLatestRelease();
  } else {
    const tag = tagArg.startsWith('v') ? tagArg : `v${tagArg}`;
    release = await fetchGithubReleaseByTag(tag);
    if (!release) throw new Error(`GitHub Release ${tag} 없음`);
  }
  const result = await writeDownloadMetaFromRelease(release, downloadsDir);
  console.log(`✓ downloads 메타 동기화: ${result.tag} (${result.exeBytes} bytes)`);
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  syncDownloadMeta(process.argv[2] || 'latest').catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
