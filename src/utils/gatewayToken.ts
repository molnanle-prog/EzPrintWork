/** 회사(tenant)별 LAN 게이트웨이 인증 토큰 */

let cachedGatewaySecret = '';

/** 설정/매장 PC에서 로드한 무작위 시크릿을 런타임에 공유 */
export function setCachedGatewaySecret(secret: string | null | undefined): void {
  cachedGatewaySecret = String(secret || '').trim();
}

export function getCachedGatewaySecret(): string {
  return cachedGatewaySecret;
}

/** 매장 PC가 최초 1회 생성하는 게이트웨이 시크릿 (예측 불가) */
export function createStoreGatewaySecret(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

/**
 * @deprecated tenantId만으로 계산되는 레거시 토큰 — 신규 인증에 사용하지 말 것.
 * 시크릿이 아직 없는 구버전 매장과의 일시 호환용으로만 유지.
 */
export function deriveStoreGatewayToken(tenantId: string | null | undefined): string {
  const id = (tenantId || '').trim();
  if (!id) return '';
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

/**
 * 게이트웨이 API 인증 토큰.
 * 1순위: 설정에 저장된 무작위 시크릿
 * 2순위(일시): 레거시 derive — 시크릿 배포 전 구버전 호환
 */
export function getGatewayAuthToken(tenantId?: string | null): string {
  if (cachedGatewaySecret.length >= 16) return cachedGatewaySecret;
  return deriveStoreGatewayToken(tenantId);
}
