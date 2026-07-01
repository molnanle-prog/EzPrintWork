import { Job, JobSpecs, Quote, QuoteLine } from '../types';
import { calcQuoteTotals } from './quoteCalculator';
import { formatJobNumber } from './jobNumber';

export function deriveQuoteStatusFromJobStatus(jobStatus: string, existing?: Quote): Quote['status'] {
  if (jobStatus === 'CANCELED') return '거절';
  if (jobStatus === 'QUOTE') return '대기';
  if (existing?.status === '거절') return '거절';
  if (existing?.status === '승인') return '승인';
  return '승인';
}

function formatSpecsDescription(specs: JobSpecs): string {
  const parts = [
    specs.paperType && specs.paperWeight ? `${specs.paperType} ${specs.paperWeight}` : specs.paperType,
    specs.size,
    specs.printColor,
    specs.processing?.length ? specs.processing.join(', ') : undefined,
    specs.memo,
  ].filter(Boolean);
  return parts.join(' / ') || '사양 미입력';
}

export function buildQuoteLinesFromJob(job: Job): QuoteLine[] {
  const subJobs = job.subJobs || [];
  if (subJobs.length > 0) {
    return subJobs.map((sj) => ({
      id: sj.id,
      subJobId: sj.id,
      productType: sj.type || job.type,
      description: formatSpecsDescription(sj.specs),
      quantity: sj.specs.quantity || '1',
      unitPrice: sj.lineQuote ?? 0,
      amount: sj.lineQuote ?? 0,
    }));
  }

  return [
    {
      id: `${job.id}-main`,
      productType: job.type || job.title,
      description: formatSpecsDescription(job.specs),
      quantity: job.specs.quantity || '1',
      unitPrice: job.price ?? 0,
      amount: job.price ?? 0,
    },
  ];
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
  const supplySum = lines.reduce((sum, line) => sum + (line.amount || 0), 0);
  const fallbackSupply = job.price ?? 0;
  const supplyBase = supplySum > 0 ? supplySum : fallbackSupply;
  const vatIncluded = job.priceIncludesVat ?? false;
  const totals = calcQuoteTotals(supplyBase, vatIncluded);

  if (vatIncluded && job.price > 0 && Math.abs(totals.totalAmount - job.price) <= 1) {
    return {
      supplyAmount: totals.supplyAmount,
      vatAmount: totals.vatAmount,
      totalAmount: job.price,
      vatIncluded,
    };
  }

  if (!vatIncluded && job.price > 0) {
    return {
      supplyAmount: job.price,
      vatAmount: 0,
      totalAmount: job.price,
      vatIncluded,
    };
  }

  return {
    supplyAmount: totals.supplyAmount,
    vatAmount: totals.vatAmount,
    totalAmount: totals.totalAmount,
    vatIncluded,
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
