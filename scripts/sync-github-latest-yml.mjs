import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { resolveHomepageDir } = require('./resolve-homepage-dir.js');
const downloadsDir = path.join(resolveHomepageDir(), 'public', 'downloads');

function githubGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'EzPrintWork-Sync' } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
      });
    }).on('error', reject);
  });
}

function fetchRaw(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'EzPrintWork-Sync' } }, (res) => {
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

const version = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')).version;
const tag = `v${version}`;
const ghUrl = 'https://github.com/molnanle-prog/EzPrintWork/releases/latest/download/EzPrintWork-Setup.exe';

const release = await githubGet(`https://api.github.com/repos/molnanle-prog/EzPrintWork/releases/tags/${tag}`);
const ymlAsset = release.assets.find((a) => a.name === 'latest.yml');
const exeAsset = release.assets.find((a) => a.name === 'EzPrintWork-Setup.exe');
if (!ymlAsset || !exeAsset) throw new Error(`Release ${tag} assets missing`);

let yml = await fetchRaw(ymlAsset.browser_download_url);
yml = yml.replace(/^path: .+$/m, 'path: EzPrintWork-Setup.exe');
yml = yml.replace(/^(\s+- url: ).+$/m, `$1${ghUrl}`);

fs.mkdirSync(downloadsDir, { recursive: true });
fs.writeFileSync(path.join(downloadsDir, 'latest.yml'), yml);

const manifestPath = path.join(downloadsDir, 'download-manifest.json');
const setupExeName = 'EzPrintWork-Setup.exe';
const versionDownloadUrl =
  `https://github.com/molnanle-prog/EzPrintWork/releases/download/${tag}/${setupExeName}`;
const manifest = {
  version,
  setupFile: setupExeName,
  latestSetupFile: setupExeName,
  setupExeName,
  setupBytes: exeAsset.size,
  exeBytes: exeAsset.size,
  downloadUrl: ghUrl,
  latestDownloadUrl: ghUrl,
  githubReleaseUrl: `https://github.com/molnanle-prog/EzPrintWork/releases/tag/${tag}`,
  githubReleaseLatest: 'https://github.com/molnanle-prog/EzPrintWork/releases/latest',
  githubVersionDownloadUrl: versionDownloadUrl,
  downloadType: 'exe',
  host: 'github-releases',
  updatedAt: new Date().toISOString(),
  installHint: '다운로드 후 EzPrintWork-Setup.exe 설치 프로그램을 실행하세요.',
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`✓ synced ${tag} latest.yml (exe ${exeAsset.size} bytes)`);
console.log(`  sha512: ${yml.match(/sha512: (.+)/)[1].slice(0, 32)}...`);
