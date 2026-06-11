/**
 * ccpdata 폴더 → 앱 백업/복원용 단일 JSON 변환
 * 사용법: node scripts/ccpdata_to_backup.mjs "<ccpdata폴더>" [출력파일]
 */
import fs from 'fs';
import path from 'path';

const SOURCE_DIR = process.argv[2];
const OUT = process.argv[3] || path.join(SOURCE_DIR, 'ezpw_backup_merged.json');

const KEYS = ['jobs', 'clients', 'staff', 'quotes', 'instructions', 'messages', 'leaves', 'papers', 'settings'];

function read(dir, name) {
  const p = path.join(dir, `ezpw_${name}.json`);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8').trim();
  if (!raw) return [];
  const d = JSON.parse(raw);
  return Array.isArray(d) ? d : [d];
}

if (!SOURCE_DIR) {
  console.error('사용법: node scripts/ccpdata_to_backup.mjs "<ccpdata폴더>" [출력파일]');
  process.exit(1);
}

const backup = {};
for (const k of KEYS) backup[k] = read(SOURCE_DIR, k);

fs.writeFileSync(OUT, JSON.stringify(backup, null, 2), 'utf8');
console.log('저장:', OUT);
for (const k of KEYS) console.log(`  ${k}: ${backup[k].length}건`);
