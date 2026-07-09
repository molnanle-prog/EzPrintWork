/** 회사(tenant)별 LAN 게이트웨이 공유 토큰 — Firestore 읽기 폭증 없이 최소 보안 */

export function deriveStoreGatewayToken(tenantId: string | null | undefined): string {
  const id = (tenantId || '').trim();
  if (!id) return '';
  // 예측 가능하지만 LAN 스캔 봇 수준의 무단 접근을 막는 공유 시크릿
  let hash = 2166136261;
  const raw = `ezpw-gw-v1:${id}`;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const a = (hash >>> 0).toString(36);
  let hash2 = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash2 = ((hash2 << 5) + hash2) ^ raw.charCodeAt(i);
  }
  const b = (hash2 >>> 0).toString(36);
  return `${a}${b}`.slice(0, 24);
}
