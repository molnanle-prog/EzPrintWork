/**
 * Firebase Hosting 오래된 릴리스 삭제 (10GB 저장 한도 해제)
 * 사용법: node scripts/cleanup_hosting_releases.mjs [siteId] [keepCount]
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const SITE_ID = process.argv[2] || 'gen-lang-client-0746903005';
const KEEP = Math.max(1, parseInt(process.argv[3] || '2', 10));

function loadAccessToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config?.tokens?.access_token) throw new Error('firebase login 필요');
  return config.tokens.access_token;
}

async function listReleases(token) {
  const releases = [];
  let pageToken = '';
  do {
    const url = new URL(`https://firebasehosting.googleapis.com/v1beta1/sites/${SITE_ID}/releases`);
    url.searchParams.set('pageSize', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    releases.push(...(data.releases || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return releases;
}

async function deleteVersion(token, versionName) {
  const res = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${versionName}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`${versionName}: ${text.slice(0, 300)}`);
  }
}

async function run() {
  console.log(`=== Hosting 릴리스 정리 (${SITE_ID}) ===`);
  console.log(`유지: 최신 ${KEEP}개\n`);
  const token = loadAccessToken();
  const releases = await listReleases(token);
  console.log(`총 릴리스: ${releases.length}개`);

  const sorted = [...releases].sort((a, b) => {
    const ta = new Date(a.releaseTime || 0).getTime();
    const tb = new Date(b.releaseTime || 0).getTime();
    return tb - ta;
  });

  const toDelete = sorted.slice(KEEP);
  let deleted = 0;
  for (const rel of toDelete) {
    const versionName = rel.version?.name;
    if (!versionName) continue;
    try {
      await deleteVersion(token, versionName);
      deleted++;
      console.log(`  삭제: ${rel.releaseTime || '-'} | ${rel.message || versionName}`);
    } catch (e) {
      console.log(`  건너뜀: ${e.message}`);
    }
  }
  console.log(`\n완료: ${deleted}개 버전 삭제 예약 (백그라운드 반영까지 수 분 소요 가능)`);
}

run().catch((e) => {
  console.error('실패:', e.message);
  process.exit(1);
});
