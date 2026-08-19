import { Job, JobItem, JobSpecs, JobTypeDefinition, Priority } from '../types';

export type OrderParseFieldKey =
  | 'paperType'
  | 'paperWeight'
  | 'size'
  | 'printColor'
  | 'processing'
  | 'quantity'
  | 'lineQuote';

export type OrderParseJobFieldKey =
  | 'priority'
  | 'price'
  | 'dueDate'
  | 'contactPerson'
  | 'clientName'
  | 'clientPhone'
  | 'title';

export type OrderParseIntent = 'quote' | 'order';

export interface OrderParseField {
  key: OrderParseFieldKey;
  label: string;
  value: string | number | string[];
  evidence: string;
  included: boolean;
}

export interface OrderParseItem {
  type: string;
  evidence: string;
  fields: OrderParseField[];
}

export interface OrderParseJobField {
  key: OrderParseJobFieldKey;
  label: string;
  value: string | number;
  isoValue?: string;
  evidence: string;
  included: boolean;
}

export interface OrderParseSkipped {
  label: string;
  reason: string;
  evidence: string;
}

export interface OrderTextParseResult {
  items: OrderParseItem[];
  jobFields: OrderParseJobField[];
  skipped: OrderParseSkipped[];
  sourceText: string;
  intent: OrderParseIntent;
  intentEvidence: string;
}

const PRINT_COLOR_RULES: Array<{ re: RegExp; value: string }> = [
  { re: /양면\s*(흑백|1도|2도)/, value: '양면 2도(흑백)' },
  { re: /단면\s*(흑백|1도)/, value: '단면 1도(흑백)' },
  { re: /양면\s*(컬러|칼라|4도|8도)?/, value: '양면 8도(컬러)' },
  { re: /단면\s*(컬러|칼라|4도)?/, value: '단면 4도(컬러)' },
  { re: /별색/, value: '별색' },
];

const TYPOS: Array<[RegExp, string]> = [
  [/맷수/g, '매수'],
  [/멧수/g, '매수'],
  [/칼라/g, '컬러'],
  [/아뜨지/g, '아트지'],
  [/스노우우지/g, '스노우지'],
  [/무광\s*코팅/g, '무광코팅'],
  [/유광\s*코팅/g, '유광코팅'],
  [/한장/g, '한 장'],
];

const WEEKDAY_INDEX: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
};

export interface OrderParseCatalog {
  products: JobTypeDefinition[];
  processingOptions: string[];
  /** 등록된 거래처 상호 — 글 안에서 가장 긴 일치부터 사용 */
  clientNames?: string[];
  /** 우리 인쇄소 상호 — 고객사로 오인하지 않음 */
  ownCompanyName?: string;
}

function normalize(text: string): string {
  let t = text.replace(/\r\n/g, '\n');
  for (const [re, to] of TYPOS) t = t.replace(re, to);
  return t;
}

function isQuestion(sentence: string): boolean {
  return /얼마|몇\s*매|몇\s*장|인가요|할까요|가능\s*한가요|\?|？/.test(sentence);
}

function isPrintContentHint(text: string): boolean {
  return /넣어|넣어서|기재|인쇄해|명함에\s*넣|넣어\s*주/.test(text);
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?。다요])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 고객 메일/문자에서 자주 쓰는 품목 별칭 → 마스터 품목명 */
const PRODUCT_SYNONYMS: Record<string, string[]> = {
  실사: ['현수막', '배너', '현수막/배너', '실사출력'],
  '전단지/리플렛': ['전단지', '리플렛', '리플릿'],
  '서식지/NCR(양식지)': ['서식지', 'NCR', '양식지'],
  '쇼핑백/종이가방': ['쇼핑백', '종이가방'],
  카탈로그: ['카달로그', '브로셔', '브로슈어'],
  복사: ['컬러복사', '흑백복사', '복사본'],
};

function aliasesFor(name: string): string[] {
  const parts = name.split(/[\\/·,]/).map((s) => s.trim()).filter((s) => s.length >= 2);
  const stripped = parts.map((p) => p.replace(/\(.*?\)/g, '').trim()).filter((s) => s.length >= 2);
  return [...new Set([name, ...parts, ...stripped])].sort((a, b) => b.length - a.length);
}

function aliasesForProduct(product: JobTypeDefinition): string[] {
  const extras = [...(PRODUCT_SYNONYMS[product.name] || [])];
  if ((product.paperTypes || []).some((p) => /현수막/.test(p))) {
    extras.push('현수막', '배너');
  }
  return [...new Set([...aliasesFor(product.name), ...extras])].sort((a, b) => b.length - a.length);
}

function findLongest(haystack: string, candidates: string[]): Array<{ value: string; matched: string; len: number }> {
  const hits: Array<{ value: string; matched: string; len: number; index: number }> = [];
  for (const raw of candidates) {
    if (!raw) continue;
    const core = raw.replace(/\(.*?\)/g, '').trim();
    for (const v of [raw, core]) {
      if (!v || v.length < 2) continue;
      const idx = haystack.indexOf(v);
      if (idx >= 0) hits.push({ value: raw, matched: v, len: v.length, index: idx });
    }
  }
  hits.sort((a, b) => b.len - a.len || a.index - b.index);
  const seen = new Set<string>();
  const uniq: Array<{ value: string; matched: string; len: number }> = [];
  for (const h of hits) {
    if (seen.has(h.value)) continue;
    seen.add(h.value);
    uniq.push({ value: h.value, matched: h.matched, len: h.len });
  }
  return uniq;
}

function productsInSentence(sentence: string, products: JobTypeDefinition[]): JobTypeDefinition[] {
  const hits: Array<{ product: JobTypeDefinition; alias: string; index: number }> = [];
  const seen = new Set<string>();
  for (const p of products) {
    for (const alias of aliasesForProduct(p)) {
      const index = sentence.indexOf(alias);
      if (index >= 0 && !seen.has(p.name)) {
        seen.add(p.name);
        hits.push({ product: p, alias, index });
        break;
      }
    }
  }
  hits.sort((a, b) => b.alias.length - a.alias.length || a.index - b.index);
  if (hits.length <= 1) return hits.map((h) => h.product);
  const best = hits[0].alias.length;
  const top = hits.filter((h) => h.alias.length === best);
  if (top.length === 1) return [top[0].product];
  top.sort((a, b) => a.index - b.index);
  return top.map((h) => h.product);
}

function extractCustomSize(text: string): { value: string; evidence: string } | null {
  const m = text.match(/(\d{2,5})\s*(?:mm)?\s*[xX*×]\s*(\d{2,5})\s*(?:\(\s*)?(mm|cm)?(?:\s*\))?/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 10 || h < 10) return null;
  const unit = (m[3] || 'mm').toLowerCase();
  const ww = unit === 'cm' ? w * 10 : w;
  const hh = unit === 'cm' ? h * 10 : h;
  return { value: `${ww}*${hh}mm`, evidence: m[0].trim() };
}

function normalizeQtyUnit(unit?: string): string {
  if (!unit || unit === '장' || unit === '개') return '매';
  return unit;
}

function extractQuantity(sentence: string): { value: string; evidence: string } | null {
  if (isQuestion(sentence)) return null;
  const labeled = sentence.match(/(?:수량|매수|부수)\s*[:：]?\s*(\d{1,6})\s*(매|장|부|권|통|개)?/);
  if (labeled) {
    return { value: `${labeled[1]}${normalizeQtyUnit(labeled[2])}`, evidence: labeled[0].trim() };
  }
  const m = sentence.match(/(\d{1,6})\s*(매|장|부|권|통)/);
  if (!m) return null;
  return { value: `${m[1]}${normalizeQtyUnit(m[2])}`, evidence: m[0] };
}

function extractPrice(sentence: string): { value: number; evidence: string; isTotal: boolean } | { skip: true; evidence: string } | null {
  if (isQuestion(sentence)) {
    if (/원/.test(sentence) || /얼마/.test(sentence)) {
      return { skip: true, evidence: sentence.slice(0, 48) };
    }
    return null;
  }
  const m = sentence.match(/(\d{1,3}(?:,\d{3})+|\d{4,8})\s*원/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 1000) return null;
  return { value: n, evidence: m[0], isTotal: /합치|합계|총\s*액|전부/.test(sentence) };
}

function atSameTime(from: Date, plusDays: number): Date {
  const d = new Date(from);
  d.setDate(from.getDate() + plusDays);
  d.setHours(from.getHours(), from.getMinutes(), 0, 0);
  return d;
}

function resolveDueDate(text: string, from = new Date()): { value: string; isoValue: string; evidence: string } | null {
  const labeled = text.match(/(?:납기|납기일|마감|언제까지)\s*[:：]?\s*([^\n]+)/);
  const dueScope = labeled ? labeled[1] : text;
  const abs = dueScope.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/) || text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (abs) {
    const month = Number(abs[1]);
    const day = Number(abs[2]);
    const year = from.getFullYear();
    const d = new Date(year, month - 1, day, from.getHours(), from.getMinutes(), 0, 0);
    if (d.getTime() < from.getTime() - 86400000) d.setFullYear(year + 1);
    return { value: `${month}월 ${day}일`, isoValue: d.toISOString(), evidence: abs[0] };
  }
  if (/오늘\s*(까지|중|안|납기)/.test(dueScope) || /오늘\s*(까지|중|안)/.test(text)) {
    const d = atSameTime(from, 0);
    return { value: '오늘', isoValue: d.toISOString(), evidence: '오늘' };
  }
  if (/내일/.test(dueScope) || /내일/.test(text)) {
    const d = atSameTime(from, 1);
    return { value: '내일', isoValue: d.toISOString(), evidence: '내일' };
  }
  if (/모레/.test(dueScope) || /모레/.test(text)) {
    const d = atSameTime(from, 2);
    return { value: '모레', isoValue: d.toISOString(), evidence: '모레' };
  }
  const nDays = (dueScope.match(/(\d{1,2})\s*일\s*(뒤|후|이내|안)/) || text.match(/(\d{1,2})\s*일\s*(뒤|후|이내|안)/));
  if (nDays) {
    const d = atSameTime(from, Number(nDays[1]));
    return { value: `${nDays[1]}일 ${nDays[2]}`, isoValue: d.toISOString(), evidence: nDays[0] };
  }
  const rel = text.match(/(이번\s*주|다음\s*주)?\s*(월|화|수|목|금|토|일)요일/);
  if (!rel) return null;
  const prefix = rel[1] || '';
  const target = WEEKDAY_INDEX[rel[2]];
  const current = from.getDay();
  let delta = (target - current + 7) % 7;
  if (prefix.includes('다음')) {
    if (delta === 0) delta = 7;
    else if (target > current) delta += 7;
  }
  const d = new Date(from);
  d.setDate(from.getDate() + delta);
  d.setHours(from.getHours(), from.getMinutes(), 0, 0);
  return { value: rel[0].replace(/\s+/g, ''), isoValue: d.toISOString(), evidence: rel[0] };
}

function extractPriority(text: string): { value: Priority; evidence: string } | null {
  if (/매우\s*긴급|제일\s*급|오늘\s*중/.test(text)) {
    return { value: Priority.VERY_URGENT, evidence: '매우긴급/오늘중' };
  }
  if (/긴급|급하|급하게|빨리/.test(text)) {
    return { value: Priority.URGENT, evidence: '급하/긴급' };
  }
  return null;
}

function extractPerson(text: string): { value: string; evidence: string } | null {
  const m = text.match(/담당은\s*([가-힣]{2,4})(과장|대리|팀장|실장|주임|님)?/);
  if (m) {
    const value = m[1] + (m[2] || '');
    return { value, evidence: `담당은 ${value}` };
  }
  const titled = text.match(/([가-힣]{2,4})\s*(과장|대리|팀장|실장|주임|부장)입니다/);
  if (titled) return { value: titled[1], evidence: titled[0] };
  return null;
}

const NOT_COMPANY = /^(안녕|감사|문의|전달|제작|파일|유선|현수막|배너|실사|명함|스티커|전단지|리플렛|카탈로그|책자|복사|봉투|쇼핑백|안녕하세요|감사합니다)$/;

function isOwnCompany(name: string, own?: string): boolean {
  const a = (own || '').trim().replace(/\s+/g, '');
  const b = name.trim().replace(/\s+/g, '');
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

function extractClientName(
  text: string,
  catalog: OrderParseCatalog,
  products: JobTypeDefinition[]
): { value: string; evidence: string } | null {
  const own = catalog.ownCompanyName;
  const registered = [...new Set((catalog.clientNames || []).map((n) => n.trim()).filter((n) => n.length >= 2))]
    .sort((a, b) => b.length - a.length);
  for (const name of registered) {
    if (isOwnCompany(name, own)) continue;
    if (text.includes(name)) return { value: name, evidence: name };
  }

  const corp = text.match(/(?:주식회사|\(주\)|㈜)\s*([가-힣A-Za-z0-9&.]{2,24})/);
  if (corp && !NOT_COMPANY.test(corp[1]) && !isOwnCompany(corp[1], own)) {
    return { value: corp[1], evidence: corp[0].trim() };
  }

  const sig = text.match(
    /([가-힣A-Za-z0-9&.]{2,24})\s+[가-힣]{2,4}\s*(과장|대리|팀장|실장|주임|부장|사원|매니저|대표)입니다/
  );
  if (sig && !NOT_COMPANY.test(sig[1]) && !isOwnCompany(sig[1], own)) {
    const looksLikeProduct = products.some((p) => aliasesForProduct(p).includes(sig[1]));
    if (!looksLikeProduct) return { value: sig[1], evidence: sig[0] };
  }

  return null;
}

function detectIntent(text: string): { intent: OrderParseIntent; evidence: string } {
  const quoteHit = text.match(/견적서|견적\s*(의뢰|요청|부탁|문의|좀|주세요)?|비용\s*(문의|안내)|단가\s*(문의|알려)/);
  const orderHit = text.match(/발주|주문\s*(합니다|드립니다|할게요)|제작\s*(부탁|의뢰|진행)|파일\s*전달|인쇄\s*(부탁|진행)|만들어\s*주|진행\s*(부탁|해주세요)/);
  if (quoteHit && orderHit) {
    if (/파일\s*전달|발주|주문\s*합니다/.test(text)) {
      return { intent: 'order', evidence: orderHit[0].replace(/\s+/g, ' ').trim() };
    }
    return { intent: 'quote', evidence: quoteHit[0].replace(/\s+/g, ' ').trim() };
  }
  if (quoteHit) return { intent: 'quote', evidence: quoteHit[0].replace(/\s+/g, ' ').trim() };
  if (orderHit) return { intent: 'order', evidence: orderHit[0].replace(/\s+/g, ' ').trim() };
  if (/얼마|가능한가요|될까요/.test(text) && !/파일\s*전달/.test(text)) {
    return { intent: 'quote', evidence: '가격 문의' };
  }
  return { intent: 'order', evidence: '작업 내용' };
}

function formatParsedPhone(raw: string): string {
  const clean = raw.replace(/\D/g, '');
  if (clean.startsWith('02')) {
    if (clean.length === 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
    if (clean.length >= 10) return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6, 10)}`;
  }
  if (clean.length === 11) return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  return raw;
}

function extractPhone(text: string): { value: string; evidence: string; printContent: boolean } | null {
  const labeled = text.match(/(?:연락처|전화|휴대폰|핸드폰|HP|Tel|H\.?P)\s*[:：]?\s*(0\d{1,2}-?\d{3,4}-?\d{4})/i);
  if (labeled) {
    return { value: formatParsedPhone(labeled[1]), evidence: labeled[0].trim(), printContent: false };
  }
  const phone = text.match(/0\d{1,2}-?\d{3,4}-?\d{4}/);
  if (!phone) return null;
  const idx = text.indexOf(phone[0]);
  const around = text.slice(Math.max(0, idx - 24), idx + phone[0].length + 16);
  const printContent = isPrintContentHint(around) || /명함에/.test(around);
  return { value: formatParsedPhone(phone[0]), evidence: phone[0], printContent };
}

function parseProductWindow(product: JobTypeDefinition, windowText: string, processingOptions: string[]): {
  fields: OrderParseField[];
  skipped: OrderParseSkipped[];
} {
  const fields: OrderParseField[] = [];
  const skipped: OrderParseSkipped[] = [];

  const papers = findLongest(windowText, product.paperTypes || []);
  if (papers[0]) {
    fields.push({ key: 'paperType', label: '용지', value: papers[0].value, evidence: papers[0].matched, included: true });
  } else if (/현수막/.test(windowText)) {
    const bannerPaper = (product.paperTypes || []).find((p) => /현수막/.test(p));
    if (bannerPaper) {
      fields.push({ key: 'paperType', label: '용지', value: bannerPaper, evidence: '현수막', included: true });
    }
  }

  const weightHits = [...windowText.matchAll(/(\d{2,3})\s*g/gi)].map((m) => m[0].replace(/\s+/g, '').toLowerCase());
  const weightHit = (product.paperWeights || []).find((w) => weightHits.includes(w.toLowerCase()));
  if (weightHit) {
    fields.push({ key: 'paperWeight', label: '평량', value: weightHit, evidence: weightHit, included: true });
  }

  const sizeCandidates = [...(product.sizes || []), 'A4', 'A3', 'A5', 'B5', 'B4', '90x50', '90*50'];
  const sizes = findLongest(windowText, sizeCandidates);
  if (sizes[0]) {
    let value = sizes[0].value;
    if (value === '90x50' || value === '90*50') {
      value = (product.sizes || []).find((s) => s.includes('90x50')) || '90x50mm(기본)';
    } else if (/^[AB]\d$/.test(value)) {
      value = (product.sizes || []).find((s) => s.startsWith(value)) || value;
    }
    fields.push({ key: 'size', label: '규격', value, evidence: sizes[0].matched, included: true });
  } else {
    const labeledSize = windowText.match(/(?:사이즈|규격|크기)\s*[:：]\s*([^\n]+)/);
    const customSize = extractCustomSize(labeledSize ? labeledSize[1] : windowText);
    if (customSize) {
      fields.push({ key: 'size', label: '규격', value: customSize.value, evidence: customSize.evidence, included: true });
    }
  }

  const procCandidates = [...new Set([...(product.processings || []), ...processingOptions])];
  const procs = findLongest(windowText, procCandidates);
  if (procs.length) {
    const values = [...new Set(procs.map((p) => p.value))];
    fields.push({
      key: 'processing',
      label: '후가공',
      value: values,
      evidence: procs.map((p) => p.matched).join(', '),
      included: true,
    });
  }

  for (const rule of PRINT_COLOR_RULES) {
    const m = windowText.match(rule.re);
    if (m) {
      fields.push({ key: 'printColor', label: '인쇄도수', value: rule.value, evidence: m[0].trim(), included: true });
      break;
    }
  }

  const sentences = splitSentences(windowText);
  let qty: { value: string; evidence: string } | null = null;
  let price: { value: number; evidence: string } | null = null;
  for (const s of sentences) {
    const q = extractQuantity(s);
    if (q && !qty) qty = q;
    const p = extractPrice(s);
    if (p && 'skip' in p) {
      skipped.push({ label: '금액', reason: '질문 속 금액은 넣지 않음', evidence: p.evidence });
    } else if (p && !p.isTotal && !price) {
      price = { value: p.value, evidence: p.evidence };
    }
  }
  if (qty) fields.push({ key: 'quantity', label: '수량', value: qty.value, evidence: qty.evidence, included: true });
  if (price) {
    fields.push({
      key: 'lineQuote',
      label: '품목금액',
      value: price.value,
      evidence: price.evidence,
      included: true,
    });
  }

  return { fields, skipped };
}

export function parseOrderText(raw: string, catalog: OrderParseCatalog): OrderTextParseResult {
  const sourceText = raw.trim();
  const text = normalize(sourceText);
  const items: OrderParseItem[] = [];
  const jobFields: OrderParseJobField[] = [];
  const skipped: OrderParseSkipped[] = [];
  const products = catalog.products || [];
  const sentences = splitSentences(text);
  const detected = detectIntent(text);

  const buckets = new Map<string, { product: JobTypeDefinition; sentences: string[] }>();
  let currentName: string | null = null;
  for (const s of sentences) {
    if (/합치|합계|총\s*액/.test(s) && productsInSentence(s, products).length > 0) continue;
    if (/^(안녕하세요|감사합니다|수고하세요)[.!]*$/.test(s)) continue;
    if (/드림-?\s*$/.test(s) && s.length < 20) continue;
    const hits = productsInSentence(s, products);
    if (hits.length > 1) {
      for (const hit of hits) {
        if (!buckets.has(hit.name)) buckets.set(hit.name, { product: hit, sentences: [] });
      }
      currentName = null;
      continue;
    }
    if (hits.length === 1) currentName = hits[0].name;
    if (!currentName) continue;
    if (!buckets.has(currentName)) {
      buckets.set(currentName, {
        product: hits[0] || products.find((p) => p.name === currentName)!,
        sentences: [],
      });
    }
    buckets.get(currentName)!.sentences.push(s);
  }

  for (const [name, bucket] of buckets) {
    if (!bucket.product || bucket.sentences.length === 0) continue;
    const parsed = parseProductWindow(bucket.product, bucket.sentences.join(' '), catalog.processingOptions || []);
    if (detected.intent === 'quote') {
      for (const f of parsed.fields) {
        if (f.key === 'lineQuote') f.included = false;
      }
    }
    items.push({
      type: name,
      evidence: aliasesFor(bucket.product.name)[0] || name,
      fields: parsed.fields,
    });
    skipped.push(...parsed.skipped);
  }

  const pri = extractPriority(text);
  if (pri) {
    jobFields.push({
      key: 'priority',
      label: '우선순위',
      value: pri.value,
      evidence: pri.evidence,
      included: true,
    });
  }

  const due = resolveDueDate(text);
  if (due) {
    jobFields.push({
      key: 'dueDate',
      label: '납기',
      value: due.value,
      isoValue: due.isoValue,
      evidence: due.evidence,
      included: true,
    });
  }

  const person = extractPerson(text);
  if (person) {
    jobFields.push({
      key: 'contactPerson',
      label: '담당자',
      value: person.value,
      evidence: person.evidence,
      included: true,
    });
  }

  const client = extractClientName(text, catalog, products);
  if (client) {
    jobFields.push({
      key: 'clientName',
      label: '거래처',
      value: client.value,
      evidence: client.evidence,
      included: true,
    });
  }

  const phone = extractPhone(text);
  if (phone?.printContent) {
    skipped.push({
      label: '고객전화',
      reason: '명함/인쇄에 넣을 번호로 보여 연락처에는 넣지 않음',
      evidence: phone.evidence,
    });
  } else if (phone) {
    jobFields.push({
      key: 'clientPhone',
      label: '연락처',
      value: phone.value,
      evidence: phone.evidence,
      included: true,
    });
  }

  for (const s of splitSentences(text)) {
    const p = extractPrice(s);
    if (p && !('skip' in p) && p.isTotal) {
      jobFields.push({
        key: 'price',
        label: '총액',
        value: p.value,
        evidence: p.evidence,
        included: detected.intent !== 'quote',
      });
    }
  }

  if (items.length > 0) {
    const types = items.map((i) => i.type).join(' + ');
    const title = detected.intent === 'quote' ? `견적 · ${types}` : types;
    jobFields.push({
      key: 'title',
      label: '제목',
      value: title,
      evidence: detected.intent === 'quote' ? '견적의뢰' : '품목명',
      included: true,
    });
  }

  const addr = text.match(/배송은\s*([^.\n]+)/) || text.match(/(?:배송|주소)\s*[:：]\s*([^\n]+)/);
  if (addr) {
    skipped.push({
      label: '배송주소',
      reason: '접수 칸에 주소 필드가 없어 메모에만 남김',
      evidence: addr[1].trim(),
    });
  }

  const fieldOrder: OrderParseJobFieldKey[] = [
    'clientName',
    'contactPerson',
    'clientPhone',
    'title',
    'dueDate',
    'priority',
    'price',
  ];
  jobFields.sort((a, b) => fieldOrder.indexOf(a.key) - fieldOrder.indexOf(b.key));

  return { items, jobFields, skipped, sourceText, intent: detected.intent, intentEvidence: detected.evidence };
}

function isBookletName(typeName: string): boolean {
  return /책자|카탈로그|카달로그|복사/.test(typeName || '');
}

function emptySpecs(def: JobTypeDefinition | undefined, typeName: string): JobSpecs {
  const booklet = isBookletName(typeName);
  return {
    paperType: def?.paperTypes?.[0] || '',
    paperWeight: def?.paperWeights?.[0] || '',
    size: def?.sizes?.[0] || '',
    quantity: '',
    processing: [],
    printColor: '단면 4도(컬러)',
    memo: '',
    paperTypeInner: booklet ? (def?.paperTypes?.[0] || '') : undefined,
    paperWeightInner: booklet ? (def?.paperWeights?.[0] || '') : undefined,
    printColorInner: booklet ? '단면 1도(흑백)' : undefined,
  };
}

function formatFieldDisplay(field: OrderParseField): string {
  if (Array.isArray(field.value)) return field.value.join(', ');
  if (typeof field.value === 'number') return `${field.value.toLocaleString()}원`;
  return String(field.value);
}

export function formatParseFieldValue(field: OrderParseField): string {
  return formatFieldDisplay(field);
}

export function applyOrderTextParse(
  job: Job,
  result: OrderTextParseResult,
  productDefs: JobTypeDefinition[]
): Job {
  const sourceItems = result.items
    .map((item) => ({ ...item, fields: item.fields.filter((f) => f.included) }))
    .filter((item) => item.fields.length > 0);
  const nextSubJobs: JobItem[] = sourceItems.map((item, idx) => {
    const def = productDefs.find((d) => d.name === item.type);
    const specs = emptySpecs(def, item.type);
    let lineQuote: number | undefined;
    for (const field of item.fields) {
      if (!field.included) continue;
      if (field.key === 'paperType') specs.paperType = String(field.value);
      if (field.key === 'paperWeight') specs.paperWeight = String(field.value);
      if (field.key === 'size') specs.size = String(field.value);
      if (field.key === 'printColor') specs.printColor = String(field.value);
      if (field.key === 'quantity') specs.quantity = String(field.value);
      if (field.key === 'processing' && Array.isArray(field.value)) specs.processing = field.value.map(String);
      if (field.key === 'lineQuote' && typeof field.value === 'number') lineQuote = field.value;
    }
    if (idx === 0 && result.sourceText) {
      specs.memo = result.intent === 'quote' ? `[견적의뢰] ${result.intentEvidence}\n${result.sourceText}` : result.sourceText;
    }
    const existing = job.subJobs?.[idx];
    return {
      id: existing?.id || `${Date.now()}-${idx}`,
      type: item.type,
      specs,
      lineQuote,
    };
  });

  if (nextSubJobs.length === 0) {
    const first = job.subJobs?.[0];
    if (first && result.sourceText) {
      nextSubJobs.push({
        ...first,
        specs: {
          ...first.specs,
          memo: result.intent === 'quote' ? `[견적의뢰] ${result.intentEvidence}\n${result.sourceText}` : result.sourceText,
        },
      });
    }
  }

  const patch: Job = {
    ...job,
    subJobs: nextSubJobs.length > 0 ? nextSubJobs : job.subJobs,
    type: nextSubJobs[0]?.type || job.type,
    specs: nextSubJobs[0]?.specs || job.specs,
  };

  const titleField = result.jobFields.find((f) => f.key === 'title' && f.included);
  if (!String(job.title || '').trim()) {
    if (titleField) patch.title = String(titleField.value);
    else if (nextSubJobs.length > 0) {
      const types = nextSubJobs.map((s) => s.type).join(' + ');
      patch.title = result.intent === 'quote' ? `견적 · ${types}` : types;
    }
  }

  for (const field of result.jobFields) {
    if (!field.included) continue;
    if (field.key === 'priority') patch.priority = field.value as Priority;
    if (field.key === 'contactPerson' && !String(job.contactPerson || '').trim()) {
      patch.contactPerson = String(field.value);
    }
    if (field.key === 'clientName' && !String(job.clientName || '').trim()) {
      patch.clientName = String(field.value);
    }
    if (field.key === 'clientPhone' && !String(job.clientPhone || '').trim()) {
      patch.clientPhone = String(field.value);
    }
    if (field.key === 'dueDate' && field.isoValue) {
      const parsed = new Date(field.isoValue);
      const current = new Date(job.dueDate);
      if (!Number.isNaN(current.getTime())) {
        parsed.setHours(current.getHours(), current.getMinutes(), 0, 0);
      }
      patch.dueDate = parsed.toISOString();
    }
    if (field.key === 'price' && typeof field.value === 'number') {
      patch.price = field.value;
    }
  }

  if (patch.price == null || patch.price === 0) {
    const sum = nextSubJobs.reduce((acc, sj) => acc + (Number(sj.lineQuote) || 0), 0);
    if (sum > 0) patch.price = sum;
  }

  return patch;
}
