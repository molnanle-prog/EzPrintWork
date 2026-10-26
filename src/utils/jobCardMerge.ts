import { Job, JobItem, PaymentStatus, Priority } from '../types';
import { isSettledPaymentStatus } from './prepaidBalance';

export function jobClientKey(name?: string): string {
  return (name || '').trim().replace(/\s+/g, ' ');
}

export function sameJobClient(a?: string, b?: string): boolean {
  const left = jobClientKey(a);
  const right = jobClientKey(b);
  return !!left && left === right;
}

function cloneItem(job: Job, item: JobItem, index: number): JobItem {
  const id = item.id || `${job.id}-${index + 1}`;
  return {
    ...item,
    id,
    specs: {
      ...item.specs,
      processing: [...(item.specs?.processing || [])],
    },
  };
}

/** 카드에 품목이 없으면 카드 자체를 품목 하나로 본다. */
export function jobItemsForMerge(job: Job): JobItem[] {
  if (job.subJobs && job.subJobs.length > 0) {
    return job.subJobs.map((item, index) => cloneItem(job, item, index));
  }
  return [
    {
      id: `${job.id}-main`,
      type: job.type || '기타',
      specs: {
        ...job.specs,
        processing: [...(job.specs?.processing || [])],
      },
      completed: job.status === 'COMPLETED',
    },
  ];
}

function uniqueItems(groups: JobItem[][]): JobItem[] {
  const seen = new Set<string>();
  const items: JobItem[] = [];
  for (const group of groups) {
    for (const item of group) {
      let id = item.id;
      let n = 2;
      while (seen.has(id)) {
        id = `${item.id}-${n}`;
        n += 1;
      }
      seen.add(id);
      items.push({ ...item, id });
    }
  }
  return items;
}

function contactLine(job: Job): string {
  return [job.contactPerson, job.clientPhone].map((part) => (part || '').trim()).filter(Boolean).join(' ');
}

function priorityRank(priority: Priority): number {
  if (priority === Priority.VERY_URGENT) return 2;
  if (priority === Priority.URGENT) return 1;
  return 0;
}

function highestPriority(jobs: Job[]): Priority {
  return jobs.reduce((best, job) => (priorityRank(job.priority) > priorityRank(best) ? job.priority : best), jobs[0].priority);
}

export function mergedPaymentStatus(jobs: Job[]): PaymentStatus {
  const statuses = jobs.map((job) => job.paymentStatus || '결제대기');
  if (statuses.every((status) => status === '취소')) return '취소';
  const active = statuses.filter((status) => status !== '취소');
  if (active.length > 0 && active.every((status) => isSettledPaymentStatus(status))) {
    return active.every((status) => status === '카드결제') ? '카드결제' : '결제완료';
  }
  const received = jobs.some((job) => (job.prepaidAppliedAmount || 0) > 0 || (job.paidAmount || 0) > 0 || isSettledPaymentStatus(job.paymentStatus) || job.paymentStatus === '일부결제');
  if (received) return '일부결제';
  if (active.length > 0 && active.every((status) => status === '후불결제')) return '후불결제';
  return '결제대기';
}

function uniqueStaffIds(jobs: Job[]): string[] {
  const ids: string[] = [];
  for (const job of jobs) {
    const list = job.assignedStaffIds?.length
      ? job.assignedStaffIds
      : job.assignedStaffId
        ? [job.assignedStaffId]
        : [];
    for (const id of list) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/** 남기는 카드에 다른 카드의 품목·금액·담당을 붙인다. 납품일·단계·제목은 남기는 카드를 유지한다. */
export function buildMergedJobCard(primary: Job, others: Job[], now = new Date()): Job {
  const jobs = [primary, ...others];
  if (jobs.some((job) => !sameJobClient(job.clientName, primary.clientName))) {
    throw new Error('같은 업체 카드만 합칠 수 있습니다.');
  }
  const items = uniqueItems(jobs.map((job) => jobItemsForMerge(job)));
  const staffIds = uniqueStaffIds(jobs);
  const extraContacts = others
    .map(contactLine)
    .filter((line) => line && line !== contactLine(primary));
  const uniqueExtra = [...new Set(extraContacts)];
  const descriptions = jobs
    .map((job) => (job.description || '').trim())
    .filter((text, index, list) => text && list.indexOf(text) === index);
  const description = [
    ...descriptions,
    uniqueExtra.length ? `추가 연락처: ${uniqueExtra.join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const contactPerson = (primary.contactPerson || '').trim()
    || jobs.map((job) => (job.contactPerson || '').trim()).find(Boolean)
    || '';
  const clientPhone = (primary.clientPhone || '').trim()
    || jobs.map((job) => (job.clientPhone || '').trim()).find(Boolean)
    || '';
  const price = jobs.reduce((sum, job) => sum + (Number(job.price) || 0), 0);
  const prepaidAppliedAmount = jobs.reduce((sum, job) => sum + (Number(job.prepaidAppliedAmount) || 0), 0);
  const paidAmount = jobs.reduce((sum, job) => sum + (Number(job.paidAmount) || 0), 0);
  const at = now.toISOString();
  const history = [
    ...jobs.flatMap((job) => job.history || []),
    {
      timestamp: at,
      staffId: 'system',
      action: '카드 합치기',
      details: others.map((job) => job.title || job.type || '작업').join(', ') + ' 품목을 이 카드로 합침',
    },
  ];
  const filePath = (primary.filePath || '').trim() || others.map((job) => (job.filePath || '').trim()).find(Boolean) || primary.filePath;

  return {
    ...primary,
    clientName: jobClientKey(primary.clientName),
    contactPerson: contactPerson || primary.contactPerson,
    clientPhone: clientPhone || primary.clientPhone,
    description,
    subJobs: items,
    type: items[0]?.type || primary.type,
    specs: items[0]?.specs || primary.specs,
    assignedStaffIds: staffIds,
    assignedStaffId: staffIds.length === 1 ? staffIds[0] : staffIds.includes(primary.assignedStaffId || '') ? primary.assignedStaffId : undefined,
    priority: highestPriority(jobs),
    paymentStatus: mergedPaymentStatus(jobs),
    price,
    prepaidAppliedAmount,
    paidAmount,
    filePath,
    linkedQuoteId: primary.linkedQuoteId || others.map((job) => job.linkedQuoteId).find(Boolean),
    history,
    updatedAt: at,
  };
}
