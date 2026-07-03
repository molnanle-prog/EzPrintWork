/**
 * 아카이브 유틸 스모크 테스트 (Firebase 없이 로컬 로직만 검증)
 * 실행: npx -y tsx scripts/smoke_archive_flow.ts
 */
import { isNasOrNetworkPath } from '../src/utils/archiveStorage';

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(`FAIL: ${msg}`);
    console.log(`OK: ${msg}`);
}

assert(isNasOrNetworkPath('\\\\NAS\\share\\ezprint'), 'UNC NAS path');
assert(isNasOrNetworkPath('Z:\\EzPrintWork_Archive'), 'mapped drive Z:');
assert(!isNasOrNetworkPath('C:\\Users\\CEO\\Documents'), 'local C: drive');

const merge = (a: { id: string; title: string }[], b: { id: string; title: string }[]) => {
    const map = new Map<string, { id: string; title: string }>();
    for (const job of a) map.set(job.id, job);
    for (const job of b) map.set(job.id, job);
    return Array.from(map.values());
};

const hot = [{ id: '1', title: 'recent' }];
const cold = [{ id: '2', title: 'old' }, { id: '1', title: 'old-overwrite' }];
const merged = merge(hot, cold);
assert(merged.length === 2, 'merge keeps 2 unique ids');
assert(merged.find((j) => j.id === '1')?.title === 'old-overwrite', 'cold/local wins on same id');

console.log('\nAll archive smoke checks passed.');
