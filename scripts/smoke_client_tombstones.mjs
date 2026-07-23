/**
 * 거래처·aux tombstone / LWW 핵심 규칙 스모크
 */
import assert from 'assert';

function isClientTombstoned(id, tombs, updatedMs) {
  const deletedMs = tombs.get(id);
  if (!deletedMs) return false;
  if (!updatedMs || !Number.isFinite(updatedMs)) return true;
  return updatedMs <= deletedMs;
}

function isIncomingNewer(incoming, prev) {
  const ri = typeof incoming.rev === 'number' ? incoming.rev : -1;
  const rp = typeof prev.rev === 'number' ? prev.rev : -1;
  if (ri >= 0 || rp >= 0) {
    if (ri !== rp) return ri > rp;
  }
  const ti = Date.parse(incoming.updatedAt || '') || 0;
  const tp = Date.parse(prev.updatedAt || '') || 0;
  return ti >= tp;
}

function mergeClients(current, incoming, tombs) {
  const map = new Map();
  const put = (c) => {
    if (!c?.id) return;
    const ms = Date.parse(c.updatedAt || '') || 0;
    if (isClientTombstoned(c.id, tombs, ms)) return;
    const prev = map.get(c.id);
    if (!prev) {
      map.set(c.id, c);
      return;
    }
    map.set(c.id, isIncomingNewer(c, prev) ? { ...prev, ...c } : prev);
  };
  for (const c of current) put(c);
  for (const c of incoming) put(c);
  return [...map.values()];
}

const tombs = new Map([['sec', Date.parse('2026-07-23T05:00:00.000Z')]]);
const local = [
  { id: 'pri', name: 'A', rev: 2, updatedAt: '2026-07-23T05:01:00.000Z' },
];
const staleNas = [
  { id: 'pri', name: 'A', rev: 1, updatedAt: '2026-07-23T04:00:00.000Z' },
  { id: 'sec', name: 'B', rev: 1, updatedAt: '2026-07-23T04:00:00.000Z' },
];

const merged = mergeClients(local, staleNas, tombs);
assert.strictEqual(merged.length, 1, 'tombstoned secondary must not revive');
assert.strictEqual(merged[0].id, 'pri');
assert.strictEqual(merged[0].rev, 2, 'higher rev must win');

const auxTombs = new Map([['q1', Date.now()]]);
const auxItems = [
  { id: 'q1', updatedAt: '2020-01-01T00:00:00.000Z' },
  { id: 'q2', updatedAt: '2026-01-01T00:00:00.000Z' },
];
const auxKept = auxItems.filter((row) => {
  const del = auxTombs.get(row.id);
  if (!del) return true;
  return Date.parse(row.updatedAt) > del;
});
assert.strictEqual(auxKept.length, 1);
assert.strictEqual(auxKept[0].id, 'q2');

console.log('✓ smoke_client_tombstones: tombstone + LWW OK');
