/** 숫자와 숫자 사이 x / X / × 를 * 로 통일 (엑셀·일부 프로그램은 * 입력이 안 됨) */
export function normalizeSizeLabel(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/(\d+(?:\.\d+)?)\s*[xX×✕＊]\s*(\d+(?:\.\d+)?)/g, '$1*$2');
  return s;
}

export function sizeLabelKey(raw: string): string {
  return normalizeSizeLabel(raw).replace(/\s+/g, '').toLowerCase();
}

export function sizesMatch(a: string, b: string): boolean {
  const ka = sizeLabelKey(a);
  const kb = sizeLabelKey(b);
  return !!ka && ka === kb;
}

export function dedupeSizeLabels(list: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list || []) {
    const normalized = normalizeSizeLabel(String(raw || '').trim());
    if (!normalized) continue;
    const key = sizeLabelKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

/** 가로·세로 숫자로 규격 문자열 만들기 */
export function formatSizeFromWidthHeight(width: string, height: string): string {
  const w = width.trim();
  const h = height.trim();
  if (!w && !h) return '';
  if (w && !h) {
    if (/^\d+(?:\.\d+)?$/.test(w)) return `${w}mm`;
    return normalizeSizeLabel(w);
  }
  if (!w && h) {
    if (/^\d+(?:\.\d+)?$/.test(h)) return `${h}mm`;
    return normalizeSizeLabel(h);
  }
  if (/^\d+(?:\.\d+)?$/.test(w) && /^\d+(?:\.\d+)?$/.test(h)) {
    return `${w}*${h}mm`;
  }
  return normalizeSizeLabel(`${w}*${h}`);
}
