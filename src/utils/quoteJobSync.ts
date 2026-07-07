import { Job, JobItem, JobSpecs, Quote, QuoteLine } from '../types';
import { VAT_RATE } from './quoteCalculator';
import { formatJobNumber } from './jobNumber';

export function deriveQuoteStatusFromJobStatus(jobStatus: string, existing?: Quote): Quote['status'] {
  if (jobStatus === 'CANCELED') return '거절';
  if (jobStatus === 'QUOTE') return '대기';
  if (existing?.status === '거절') return '거절';
  if (existing?.status === '승인') return '승인';
  return '승인';
}

/** dataService.isBookletProductType 와 동일 — 순환 import 방지 */
export function isBookletProductType(typeName: string): boolean {
  if (!typeName) return false;
  if (typeName.includes('책자')) return true;
  if (typeName.includes('카탈로그') || typeName.includes('카달로그')) return true;
  return false;
}

function joinParts(parts: (string | undefined | false)[]): string {
  return parts.filter(Boolean).join(' / ');
}

function formatPaperLine(paperType?: string, paperWeight?: string): string {
  const paper = [paperType, paperWeight].filter(Boolean).join(' ').trim();
  return paper;
}

function getInnerPageList(specs: JobSpecs) {
  if (specs.innerPages && specs.innerPages.length > 0) {
    return specs.innerPages;
  }
  if (specs.paperTypeInner || specs.paperWeightInner || specs.printColorInner) {
    return [{
      id: 'inner-legacy',
      paperType: specs.paperTypeInner || '',
      paperWeight: specs.paperWeightInner || '',
      printColor: specs.printColorInner || '',
      pagesCount: '',
    }];
  }
  return [];
}

/** 내지 인쇄·사양이 실제로 입력된 경우 (기본값만 있는 경우 제외) */
export function hasMeaningfulInnerSpecs(specs: JobSpecs): boolean {
  if ((specs.processingInner?.length ?? 0) > 0) return true;

  const pages = getInnerPageList(specs);
  if (pages.some((ip) => {
    if (ip.isDivider) {
      const qty = String(ip.dividerQuantity || '').trim();
      return qty !== '' && qty !== '0';
    }
    const pagesCount = String(ip.pagesCount || '').trim();
    return pagesCount !== '' && pagesCount !== '0';
  })) {
    return true;
  }

  return false;
}

function hasCoverSpecs(specs: JobSpecs): boolean {
  return Boolean(
    specs.paperType?.trim()
    || specs.paperWeight?.trim()
    || specs.printColor?.trim()
    || specs.hasCoverWing
    || (specs.processingCover?.length ?? 0) > 0
  );
}

function formatCoverSection(specs: JobSpecs): string | undefined {
  if (!hasCoverSpecs(specs)) return undefined;

  const parts = [
    formatPaperLine(specs.paperType, specs.paperWeight),
    specs.printColor?.trim(),
    specs.hasCoverWing ? '날개표지' : undefined,
    specs.processingCover?.length ? `후가공 ${specs.processingCover.join(', ')}` : undefined,
  ].filter(Boolean);

  if (parts.length === 0) return undefined;
  return `표지: ${parts.join(' / ')}`;
}

function formatInnerSection(specs: JobSpecs): string[] {
  const lines: string[] = [];
  let innerIdx = 0;
  let dividerIdx = 0;

  for (const ip of getInnerPageList(specs)) {
    if (ip.isDivider) {
      dividerIdx += 1;
      const qty = String(ip.dividerQuantity || '').trim();
      if (!qty || qty === '0') continue;
      lines.push(`간지 ${dividerIdx}: ${ip.dividerColor || '색상미지정'} / ${qty}장`);
      continue;
    }

    const pagesCount = String(ip.pagesCount || '').trim();
    const hasPaper = Boolean(ip.paperType?.trim() || ip.paperWeight?.trim());
    const hasPrint = Boolean(ip.printColor?.trim());
    if (!hasPaper && !hasPrint && (!pagesCount || pagesCount === '0')) continue;

    innerIdx += 1;
    const parts = [
      formatPaperLine(ip.paperType, ip.paperWeight),
      ip.printColor?.trim(),
      pagesCount && pagesCount !== '0' ? `${pagesCount}p` : undefined,
    ].filter(Boolean);

    if (parts.length === 0) continue;
    const label = innerIdx === 1 && lines.length === 0 ? '내지' : `내지 ${innerIdx}`;
    lines.push(`${label}: ${parts.join(' / ')}`);
  }

  if ((specs.processingInner?.length ?? 0) > 0) {
    lines.push(`내지 후가공: ${specs.processingInner!.join(', ')}`);
  }

  return lines;
}

function formatStandardSpecsDescription(specs: JobSpecs): string {
  const parts = [
    formatPaperLine(specs.paperType, specs.paperWeight),
    specs.size?.trim(),
    specs.printColor?.trim(),
    specs.processing?.length ? specs.processing.join(', ') : undefined,
    specs.memo?.trim(),
  ].filter(Boolean);
  return parts.join(' / ') || '사양 미입력';
}

/** 견적서·명세 품목 사양 — 책자/카탈로그는 표지·내지 구분 */
export function formatQuoteLineDescription(productType: string, specs: JobSpecs): string {
  if (!isBookletProductType(productType)) {
    return formatStandardSpecsDescription(specs);
  }

  const sections: string[] = [];
  const cover = formatCoverSection(specs);
  if (cover) sections.push(cover);

  const innerLines = formatInnerSection(specs);
  const showInner = hasMeaningfulInnerSpecs(specs);
  if (showInner) {
    sections.push(...innerLines);
  }

  if (specs.processing?.length) {
    sections.push(`제본·공통: ${specs.processing.join(', ')}`);
  }

  if (specs.size?.trim()) {
    sections.push(`규격: ${specs.size.trim()}`);
  }

  if (specs.memo?.trim()) {
    sections.push(specs.memo.trim());
  }

  return sections.join(' / ') || '사양 미입력';
}

/** 품목별 lineQuote(계산기) 입력 여부 — 없으면 job.price(총액)만 입력한 경우 */
export function hasExplicitLineQuotes(job: Job): boolean {
  const subJobs = job.subJobs || [];
  if (subJobs.length > 0) {
    return subJobs.some((sj) => (sj.lineQuote ?? 0) > 0);
  }
  return false;
}

/** job.price(총액) → 공급가액. 부가세 포함이면 합계에서 역산 */
export function jobPriceToLineSupply(job: Job): number {
  const price = job.price ?? 0;
  if (price <= 0) return 0;
  if (job.priceIncludesVat) {
    return Math.round(price / (1 + VAT_RATE));
  }
  return price;
}

/** job.price → 견적 합계·공급가·부가세 (단일 소스) */
export function splitJobPriceToQuoteTotals(job: Job): {
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
  vatIncluded: boolean;
} {
  const vatIncluded = job.priceIncludesVat ?? false;
  const price = job.price ?? 0;
  if (price <= 0) {
    return { supplyAmount: 0, vatAmount: 0, totalAmount: 0, vatIncluded };
  }
  if (vatIncluded) {
    const totalAmount = price;
    const supplyAmount = Math.round(totalAmount / (1 + VAT_RATE));
    const vatAmount = totalAmount - supplyAmount;
    return { supplyAmount, vatAmount, totalAmount, vatIncluded: true };
  }
  return { supplyAmount: price, vatAmount: 0, totalAmount: price, vatIncluded: false };
}

function fillEmptyLineAmounts(job: Job, lines: QuoteLine[]): QuoteLine[] {
  if (!(job.price > 0)) return lines;
  // 품목별 금액이 있으면 lineQuote(공급가) 그대로 사용
  if (hasExplicitLineQuotes(job)) return lines;

  const supply = jobPriceToLineSupply(job);
  if (lines.length === 1) {
    return [{ ...lines[0], unitPrice: supply, amount: supply }];
  }

  return lines.map((line, idx) =>
    idx === 0 ? { ...line, unitPrice: supply, amount: supply } : line
  );
}

export function buildQuoteLinesFromJob(job: Job): QuoteLine[] {
  const subJobs = job.subJobs || [];
  let lines: QuoteLine[];

  if (subJobs.length > 0) {
    lines = subJobs.map((sj) => ({
      id: sj.id,
      subJobId: sj.id,
      productType: sj.type || job.type,
      description: formatQuoteLineDescription(sj.type || job.type, sj.specs),
      quantity: sj.specs.quantity || '1',
      unitPrice: sj.lineQuote ?? 0,
      amount: sj.lineQuote ?? 0,
    }));
  } else {
    lines = [
      {
        id: `${job.id}-main`,
        productType: job.type || job.title,
        description: formatQuoteLineDescription(job.type || job.title, job.specs),
        quantity: job.specs.quantity || '1',
        unitPrice: 0,
        amount: 0,
      },
    ];
  }

  return fillEmptyLineAmounts(job, lines);
}

export function buildItemsSummary(lines: QuoteLine[]): string {
  if (lines.length === 0) return '품목 없음';
  return lines
    .map((line) => {
      const qty = line.quantity ? ` ${line.quantity}` : '';
      return `${line.productType}${qty}`;
    })
    .join(', ');
}

export function computeQuoteAmounts(job: Job, lines: QuoteLine[]) {
  const vatIncluded = job.priceIncludesVat ?? false;
  const lineSupplySum = lines.reduce((sum, line) => sum + (line.amount || 0), 0);

  // 총액(job.price)만 입력 — lineQuote 없음
  if (!hasExplicitLineQuotes(job) && (job.price ?? 0) > 0) {
    return splitJobPriceToQuoteTotals(job);
  }

  // 품목별 lineQuote 합계(공급가) 기준
  const supplyAmount = lineSupplySum;
  if (vatIncluded) {
    const vatAmount = Math.round(supplyAmount * VAT_RATE);
    let totalAmount = supplyAmount + vatAmount;
    if (job.price > 0 && Math.abs(totalAmount - job.price) <= 1) {
      totalAmount = job.price;
    }
    return {
      supplyAmount,
      vatAmount: totalAmount - supplyAmount,
      totalAmount,
      vatIncluded: true,
    };
  }

  return {
    supplyAmount,
    vatAmount: 0,
    totalAmount: supplyAmount,
    vatIncluded: false,
  };
}

/** Firestore 재저장 방지 — 동기화 결과가 기존과 같으면 true */
export function isSameQuotePayload(a: Quote, b: Quote): boolean {
  const scalarKeys: (keyof Quote)[] = [
    'jobId', 'title', 'clientName', 'contactPerson', 'clientPhone', 'items',
    'totalAmount', 'supplyAmount', 'vatAmount', 'vatIncluded', 'status',
  ];
  for (const key of scalarKeys) {
    if (a[key] !== b[key]) return false;
  }
  return JSON.stringify(a.lines ?? []) === JSON.stringify(b.lines ?? []);
}

export function buildQuoteFromJob(job: Job, existing?: Quote): Quote {
  const lines = buildQuoteLinesFromJob(job);
  const amounts = computeQuoteAmounts(job, lines);

  return {
    id: existing?.id || job.linkedQuoteId || `quote-${job.id}`,
    jobId: job.id,
    title: job.title,
    clientName: (job.clientName ?? '').trim() || '미등록',
    contactPerson: job.contactPerson,
    clientPhone: job.clientPhone,
    items: buildItemsSummary(lines),
    lines,
    totalAmount: amounts.totalAmount,
    supplyAmount: amounts.supplyAmount,
    vatAmount: amounts.vatAmount,
    vatIncluded: amounts.vatIncluded,
    date: existing?.date || new Date().toISOString(),
    status: deriveQuoteStatusFromJobStatus(job.status, existing),
  };
}

export function findQuoteForJob(quotes: Quote[], job: Job): Quote | undefined {
  return quotes.find(
    (q) =>
      q.jobId === job.id ||
      q.id === job.linkedQuoteId ||
      q.id === `quote-${job.id}` ||
      job.linkedQuoteId === q.id
  );
}

/** 견적 품목 ↔ 작업 subJob 매칭 */
export function resolveLineJobItem(line: QuoteLine, job: Job | undefined): JobItem | undefined {
  if (!job) return undefined;
  const subJobs = job.subJobs || [];
  if (subJobs.length === 0) return undefined;
  return subJobs.find((sj) => sj.id === line.subJobId || sj.id === line.id);
}

/** 미리보기·출력 시 최신 작업 사양 반영 (금액은 resolveQuoteLinesForDisplay에서 일괄 처리) */
export function resolveQuoteLineForDisplay(
  line: QuoteLine,
  quote: Quote,
  job: Job | undefined
): QuoteLine {
  if (!job) return line;

  const subJobs = job.subJobs || [];
  let productType = line.productType;
  let specs: JobSpecs | undefined;

  if (subJobs.length > 0) {
    const sj = resolveLineJobItem(line, job);
    if (sj) {
      productType = sj.type || productType;
      specs = sj.specs;
    }
  } else if (line.id === `${job.id}-main` || !line.subJobId) {
    productType = job.type || productType;
    specs = job.specs;
  }

  const description = specs
    ? formatQuoteLineDescription(productType, specs)
    : line.description;

  return { ...line, productType, description };
}

/** 사양 갱신 + 총액-only 금액 일괄 반영 + 합계 계산 */
export function resolveQuoteLinesForDisplay(
  rawLines: QuoteLine[],
  quote: Quote,
  job: Job | undefined
): { lines: QuoteLine[]; amounts: ReturnType<typeof computeQuoteAmounts> } {
  let lines = rawLines.map((line) => resolveQuoteLineForDisplay(line, quote, job));
  if (job) {
    lines = fillEmptyLineAmounts(job, lines);
  }

  const vatIncluded = job?.priceIncludesVat ?? quote.vatIncluded ?? false;
  const amounts = job
    ? computeQuoteAmounts(job, lines)
    : (() => {
        const supplySum = lines.reduce((s, l) => s + (l.amount || 0), 0);
        if (vatIncluded && quote.totalAmount > 0) {
          const totalAmount = quote.totalAmount;
          const supplyAmount = Math.round(totalAmount / (1 + VAT_RATE));
          return {
            supplyAmount,
            vatAmount: totalAmount - supplyAmount,
            totalAmount,
            vatIncluded: true,
          };
        }
        const total = quote.totalAmount || supplySum;
        return {
          supplyAmount: total,
          vatAmount: 0,
          totalAmount: total,
          vatIncluded: false,
        };
      })();

  return { lines, amounts };
}

/** 견적에 연결된 작업 ID 조회 */
export function resolveQuoteJobId(quote: Quote, jobs: Job[] = []): string | null {
  if (quote.jobId) return quote.jobId;

  if (quote.id.startsWith('quote-')) {
    const extracted = quote.id.slice('quote-'.length);
    if (extracted) return extracted;
  }

  const byLinkedQuote = jobs.find((j) => j.linkedQuoteId === quote.id);
  if (byLinkedQuote) return byLinkedQuote.id;

  const byQuotePrefix = jobs.find((j) => quote.id === `quote-${j.id}`);
  if (byQuotePrefix) return byQuotePrefix.id;

  return null;
}

/** 견적 목록·출력에 표시할 작업번호 (작업 상세와 동일 형식) */
export function getQuoteJobNumber(quote: Quote, jobs: Job[] = []): string {
  const jobId = resolveQuoteJobId(quote, jobs);
  if (!jobId) return '미연결';
  const job = jobs.find((j) => j.id === jobId);
  return job ? formatJobNumber(job) : '미연결';
}

export function resolveQuoteJob(quote: Quote, jobs: Job[] = []): Job | undefined {
  const jobId = resolveQuoteJobId(quote, jobs);
  if (!jobId) return undefined;
  return jobs.find((j) => j.id === jobId);
}

export function getQuoteTitle(quote: Quote, jobs: Job[] = []): string {
  if (quote.title?.trim()) return quote.title.trim();
  return resolveQuoteJob(quote, jobs)?.title?.trim() || '—';
}

/** 견적서 관리 목록용 간단 요약 */
export function getQuoteBriefContent(quote: Quote): string {
  const lines = quote.lines?.filter((l) => l.productType || l.amount) ?? [];
  if (lines.length === 0) {
    if (quote.items && quote.items !== '품목 없음') return quote.items;
    return '견적 내용 없음';
  }
  return lines
    .map((line) => {
      const qty = line.quantity ? ` ${line.quantity}` : '';
      const amt = line.amount > 0 ? ` ${line.amount.toLocaleString()}원` : '';
      return `${line.productType}${qty}${amt}`.trim();
    })
    .join(' · ');
}

/** 견적서·목록용 업체명(담당자) 표기 */
export function formatQuoteClientLabel(quote: Quote, jobs: Job[] = []): string {
  const job = resolveQuoteJob(quote, jobs);
  const clientName = (quote.clientName || job?.clientName || '').trim() || '—';
  const contact = (quote.contactPerson || job?.contactPerson || '').trim();
  return contact ? `${clientName}(${contact})` : clientName;
}

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

/** 견적서 PDF 저장 파일명 — 작업번호_거래처명.pdf */
export function getQuotePdfFileName(
  quote: Quote,
  jobs: Job[] = [],
  documentType: 'quote' | 'statement' = 'quote'
): string {
  const jobNo = sanitizeFileNamePart(getQuoteJobNumber(quote, jobs)) || '미연결';
  const job = resolveQuoteJob(quote, jobs);
  const clientName = sanitizeFileNamePart(quote.clientName || job?.clientName || '') || '거래처없음';
  const docSuffix = documentType === 'statement' ? '_거래명세서' : '';
  return `${jobNo}_${clientName}${docSuffix}.pdf`;
}
