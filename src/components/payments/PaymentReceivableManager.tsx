import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db, formatJobNumber, getErrorMessage } from '../../services/dataService';
import { Client, Job, PaymentStatus, Staff } from '../../types';
import { resolveClientSmsNumber } from '../../utils/clientSms';
import {
  CreditCard,
  Search,
  AlertCircle,
  CheckCircle2,
  Wallet,
  Building2,
  Calendar,
  User,
  Phone,
  MessageCircle,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { JobDetailModal } from '../common/JobDetailModal';
import { PastJobSearchResults } from '../common/PastJobSearchResults';
import { ClientContactModal } from '../common/ClientContactModal';
import { toast } from 'sonner';
import { getJobOutstandingAmount, normalizePrepaidBalance } from '../../utils/prepaidBalance';

type PaymentFilter = 'all' | 'outstanding' | PaymentStatus | 'byClient' | 'prepaidClients';
type SortKey = 'title' | 'clientName' | 'contactPerson' | 'phone' | 'price' | 'paymentStatus' | 'dueDate';
type ColumnKey = SortKey | 'contact';
type SortDir = 'asc' | 'desc';
type ClientSortKey = 'clientName' | 'pendingCount' | 'partialCount' | 'totalOutstanding';

const PAYMENT_STATUSES: PaymentStatus[] = ['결제대기', '일부결제', '후불결제', '결제완료', '취소'];

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  title: 210,
  clientName: 150,
  contactPerson: 90,
  phone: 110,
  price: 168,
  paymentStatus: 100,
  dueDate: 96,
  contact: 72,
};

const COLUMN_WIDTHS_STORAGE_KEY = 'ezprint_payment_column_widths';
/** 체크박스 + 좌측 p-3 여백(다른 열과 동일) */
const SELECT_COLUMN_WIDTH = 30;

const JOB_COLUMNS: { key: ColumnKey; label: string; sortable: boolean; align?: 'center' }[] = [
  { key: 'title', label: '작업', sortable: true },
  { key: 'clientName', label: '고객사', sortable: true },
  { key: 'contactPerson', label: '담당자', sortable: true },
  { key: 'phone', label: '연락처', sortable: true },
  { key: 'price', label: '금액', sortable: true },
  { key: 'paymentStatus', label: '결제상태', sortable: true },
  { key: 'dueDate', label: '납기일', sortable: true },
  { key: 'contact', label: '연락', sortable: false, align: 'center' },
];

interface ClientSummaryRow {
  clientName: string;
  pendingCount: number;
  partialCount: number;
  totalOutstanding: number;
  jobs: Job[];
}

function paymentBadgeClass(status: PaymentStatus): string {
  switch (status) {
    case '결제완료':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case '일부결제':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case '후불결제':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case '취소':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    default:
      return 'bg-red-100 text-red-700 border-red-200';
  }
}

function isOutstanding(status?: PaymentStatus): boolean {
  return status === '결제대기' || status === '일부결제' || status === '후불결제';
}

function paymentStatusOrder(status?: PaymentStatus): number {
  switch (status) {
    case '결제대기':
      return 0;
    case '일부결제':
      return 1;
    case '후불결제':
      return 2;
    case '결제완료':
      return 3;
    case '취소':
      return 4;
    default:
      return 0;
  }
}

function getJobContactPhone(job: Job): string {
  const client = db.getClients().find((c) => c.name === job.clientName);
  return resolveClientSmsNumber(client || {}, job.clientPhone);
}

function getJobContactPerson(job: Job): string {
  if (job.contactPerson?.trim()) return job.contactPerson.trim();
  const client = db.getClients().find((c) => c.name === job.clientName);
  return client?.contactPerson?.trim() || '-';
}

function phoneDialHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `tel:${digits}` : '';
}

function loadColumnWidths(): Record<ColumnKey, number> {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLUMN_WIDTHS };
    const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, number>>;
    return { ...DEFAULT_COLUMN_WIDTHS, ...parsed };
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }
}

function compareJobs(a: Job, b: Job, sortKey: SortKey, sortDir: SortDir): number {
  let cmp = 0;
  switch (sortKey) {
    case 'title':
      cmp = (a.title || '').localeCompare(b.title || '', 'ko');
      break;
    case 'clientName':
      cmp = (a.clientName || '').localeCompare(b.clientName || '', 'ko');
      break;
    case 'contactPerson':
      cmp = getJobContactPerson(a).localeCompare(getJobContactPerson(b), 'ko');
      break;
    case 'phone':
      cmp = getJobContactPhone(a).replace(/\D/g, '').localeCompare(getJobContactPhone(b).replace(/\D/g, ''));
      break;
    case 'price':
      cmp = (a.price || 0) - (b.price || 0);
      break;
    case 'paymentStatus':
      cmp = paymentStatusOrder(a.paymentStatus) - paymentStatusOrder(b.paymentStatus);
      break;
    case 'dueDate':
      cmp =
        new Date(a.dueDate || a.createdAt).getTime() - new Date(b.dueDate || b.createdAt).getTime();
      break;
  }
  return sortDir === 'asc' ? cmp : -cmp;
}

function compareClientRows(a: ClientSummaryRow, b: ClientSummaryRow, sortKey: ClientSortKey, sortDir: SortDir): number {
  let cmp = 0;
  switch (sortKey) {
    case 'clientName':
      cmp = a.clientName.localeCompare(b.clientName, 'ko');
      break;
    case 'pendingCount':
      cmp = a.pendingCount - b.pendingCount;
      break;
    case 'partialCount':
      cmp = a.partialCount - b.partialCount;
      break;
    case 'totalOutstanding':
      cmp = a.totalOutstanding - b.totalOutstanding;
      break;
  }
  return sortDir === 'asc' ? cmp : -cmp;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown size={11} className="opacity-40 shrink-0" />;
  return dir === 'asc' ? <ArrowUp size={11} className="shrink-0" /> : <ArrowDown size={11} className="shrink-0" />;
}

export const PaymentReceivableManager: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [contactingJob, setContactingJob] = useState<Job | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(loadColumnWidths);
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [clientSortKey, setClientSortKey] = useState<ClientSortKey>('totalOutstanding');
  const [clientSortDir, setClientSortDir] = useState<SortDir>('desc');
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkPaymentStatus, setBulkPaymentStatus] = useState<PaymentStatus>('결제완료');
  const resizingRef = useRef<{ col: ColumnKey; startX: number; startWidth: number } | null>(null);
  const columnWidthsRef = useRef(columnWidths);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  const reload = () => {
    setJobs(db.getAllJobs());
    setClients(db.getClients());
    setStaff(db.getStaff().filter((s) => !s.isDeleted && s.active !== false));
  };

  useEffect(() => {
    db.ensurePaymentJobsSync();
    reload();
    return db.subscribe(reload);
  }, []);

  const stats = useMemo(() => {
    const active = jobs.filter((j) => j.paymentStatus !== '취소');
    // 미수·미결제 = 완불 전 상태 (결제대기·일부결제·후불결제)
    const outstandingJobs = active.filter((j) => isOutstanding(j.paymentStatus));
    const settledJobs = active.filter((j) => j.paymentStatus === '결제완료');
    const totalPrepaid = db.getTotalPrepaidBalance();
    const outstandingAmount = outstandingJobs.reduce((s, j) => s + getJobOutstandingAmount(j), 0);
    const collectedAmount = settledJobs.reduce(
      (s, j) => s + (j.prepaidAppliedAmount || 0) + (j.paidAmount || 0),
      0
    );
    return {
      outstandingCount: outstandingJobs.length,
      outstandingAmount,
      partialCount: active.filter((j) => j.paymentStatus === '일부결제').length,
      paidCount: settledJobs.length,
      paidAmount: collectedAmount,
      totalPrepaid,
      // 거래처 간 상계가 아님 — 표시용 참고치
      netPosition: totalPrepaid - outstandingAmount,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs
      .filter((j) => {
        if (filter === 'byClient' || filter === 'prepaidClients') return false;
        if (filter === 'outstanding') return isOutstanding(j.paymentStatus);
        if (filter !== 'all') return j.paymentStatus === filter;
        return true;
      })
      .filter((j) => {
        if (!q) return true;
        return (
          j.clientName?.toLowerCase().includes(q) ||
          j.title?.toLowerCase().includes(q) ||
          j.contactPerson?.toLowerCase().includes(q) ||
          getJobContactPerson(j).toLowerCase().includes(q) ||
          getJobContactPhone(j).replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
          formatJobNumber(j).includes(q) ||
          j.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => compareJobs(a, b, sortKey, sortDir));
  }, [jobs, filter, search, sortKey, sortDir]);

  useEffect(() => {
    const visibleIds = new Set(filteredJobs.map((j) => j.id));
    setSelectedJobIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredJobs]);

  const clientSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, ClientSummaryRow>();

    jobs
      .filter((j) => isOutstanding(j.paymentStatus))
      .forEach((job) => {
        const name = job.clientName?.trim() || '(미지정)';
        const row = map.get(name) || {
          clientName: name,
          pendingCount: 0,
          partialCount: 0,
          totalOutstanding: 0,
          jobs: [],
        };
        if (job.paymentStatus === '결제대기') row.pendingCount += 1;
        if (job.paymentStatus === '일부결제') row.partialCount += 1;
        row.totalOutstanding += getJobOutstandingAmount(job);
        row.jobs.push(job);
        map.set(name, row);
      });

    return Array.from(map.values())
      .filter((row) => {
        if (!q) return true;
        if (row.clientName.toLowerCase().includes(q)) return true;
        return row.jobs.some(
          (j) =>
            j.title?.toLowerCase().includes(q) ||
            getJobContactPerson(j).toLowerCase().includes(q) ||
            formatJobNumber(j).includes(q)
        );
      })
      .map((row) => ({
        ...row,
        jobs: [...row.jobs].sort((a, b) => compareJobs(a, b, 'dueDate', 'desc')),
      }))
      .sort((a, b) => compareClientRows(a, b, clientSortKey, clientSortDir));
  }, [jobs, search, clientSortKey, clientSortDir]);

  const clientSummaryTotals = useMemo(
    () => ({
      clients: clientSummaries.length,
      pendingCount: clientSummaries.reduce((s, r) => s + r.pendingCount, 0),
      partialCount: clientSummaries.reduce((s, r) => s + r.partialCount, 0),
      totalOutstanding: clientSummaries.reduce((s, r) => s + r.totalOutstanding, 0),
    }),
    [clientSummaries]
  );

  const prepaidClientRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .map((client) => {
        const balance = normalizePrepaidBalance(client.prepaidBalance);
        if (balance <= 0) return null;
        const relatedJobs = jobs.filter((j) => j.clientName?.trim() === client.name.trim());
        const outstandingJobs = relatedJobs.filter((j) => isOutstanding(j.paymentStatus));
        const outstandingAmount = outstandingJobs.reduce((sum, j) => sum + getJobOutstandingAmount(j), 0);
        return {
          client,
          balance,
          outstandingJobs,
          outstandingAmount,
          recentJob: relatedJobs
            .slice()
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0],
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row)
      .filter((row) => {
        if (!q) return true;
        return (
          row.client.name.toLowerCase().includes(q) ||
          (row.client.contactPerson || '').toLowerCase().includes(q) ||
          (row.client.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
        );
      })
      .sort((a, b) => b.balance - a.balance);
  }, [clients, jobs, search]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'dueDate' || key === 'price' ? 'desc' : 'asc');
    }
  };

  const handleClientSort = (key: ClientSortKey) => {
    if (clientSortKey === key) {
      setClientSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setClientSortKey(key);
      setClientSortDir(key === 'clientName' ? 'asc' : 'desc');
    }
  };

  const startColumnResize = useCallback((col: ColumnKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      col,
      startX: e.clientX,
      startWidth: columnWidthsRef.current[col],
    };

    const onMove = (ev: MouseEvent) => {
      const state = resizingRef.current;
      if (!state) return;
      const next = Math.max(56, state.startWidth + (ev.clientX - state.startX));
      setColumnWidths((prev) => ({ ...prev, [state.col]: next }));
    };

    const onUp = () => {
      resizingRef.current = null;
      localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(columnWidthsRef.current));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const toggleClientExpand = (clientName: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientName)) next.delete(clientName);
      else next.add(clientName);
      return next;
    });
  };

  const openContactModal = (job: Job, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const phone = getJobContactPhone(job);
    if (!phone) {
      toast.error('연락처가 없습니다. 작업 또는 거래처에 전화번호를 등록해 주세요.');
      return;
    }
    setContactingJob({ ...job, clientPhone: phone });
  };

  const handleCall = (job: Job, e: React.MouseEvent) => {
    e.stopPropagation();
    const phone = getJobContactPhone(job);
    if (!phone) {
      toast.error('전화할 번호가 없습니다.');
      return;
    }
    window.location.href = phoneDialHref(phone);
  };

  const handlePaymentChange = async (job: Job, next: PaymentStatus) => {
    if (job.paymentStatus === next) return;
    try {
      await db.updateJob({ ...job, paymentStatus: next });
      toast.success(`[${job.clientName}] 결제 상태 → ${next}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredJobs.map((j) => j.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedJobIds.has(id));
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkPaymentChange = async () => {
    const targets = jobs.filter((j) => selectedJobIds.has(j.id));
    if (targets.length === 0) {
      toast.error('일괄 변경할 작업을 먼저 선택해 주세요.');
      return;
    }
    try {
      await Promise.all(
        targets.map((job) =>
          job.paymentStatus === bulkPaymentStatus
            ? Promise.resolve()
            : db.updateJob({ ...job, paymentStatus: bulkPaymentStatus })
        )
      );
      toast.success(`${targets.length}건 결제 상태를 "${bulkPaymentStatus}"(으)로 변경했습니다.`);
      setSelectedJobIds(new Set());
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const filterTabs: { id: PaymentFilter; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'outstanding', label: '미수·미결제' },
    { id: '일부결제', label: '일부결제' },
    { id: '후불결제', label: '후불결제' },
    { id: '결제완료', label: '결제완료' },
    { id: 'byClient', label: '고객사별 종합' },
    { id: 'prepaidClients', label: '선불고객' },
  ];

  const tableMinWidth = Object.values(columnWidths).reduce((s, w) => s + w, 0) + SELECT_COLUMN_WIDTH;
  const selectedCount = selectedJobIds.size;
  const visibleAllSelected =
    filteredJobs.length > 0 && filteredJobs.every((j) => selectedJobIds.has(j.id));
  const visibleSomeSelected = filteredJobs.some((j) => selectedJobIds.has(j.id));

  const renderJobRow = (job: Job, nested = false) => {
    const contactPhone = getJobContactPhone(job);
    const hasPhone = !!contactPhone.replace(/\D/g, '');
    return (
      <tr
        key={job.id}
        className={`hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors ${
          nested ? 'bg-slate-50/80 dark:bg-slate-900/30' : ''
        }`}
        onClick={() => setSelectedJob(job)}
      >
        <td className="pl-3 pr-0 py-1.5 text-center" style={{ width: SELECT_COLUMN_WIDTH }} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedJobIds.has(job.id)}
            onChange={() => toggleJobSelection(job.id)}
            className="w-4 h-4 accent-blue-600 cursor-pointer"
            aria-label={`${job.title} 선택`}
          />
        </td>
        <td className={`px-3 py-1.5 ${nested ? 'pl-8' : ''}`} style={{ width: columnWidths.title }}>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-1">{job.title}</p>
          <p className="text-[10px] text-slate-400 font-mono">{formatJobNumber(job)}</p>
        </td>
        <td className="px-3 py-1.5" style={{ width: columnWidths.clientName }}>
          <div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
            <Building2 size={14} className="text-slate-400 shrink-0" />
            <span className="line-clamp-1">{job.clientName}</span>
          </div>
        </td>
        <td className="px-3 py-1.5" style={{ width: columnWidths.contactPerson }}>
          <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
            <User size={13} className="text-slate-400 shrink-0" />
            <span className="line-clamp-2 font-medium">{getJobContactPerson(job)}</span>
          </div>
        </td>
        <td className="px-3 py-1.5" style={{ width: columnWidths.phone }}>
          {hasPhone ? (
            <a
              href={phoneDialHref(contactPhone)}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline"
            >
              {contactPhone}
            </a>
          ) : (
            <span className="text-[11px] text-slate-400">번호 없음</span>
          )}
        </td>
        <td className="px-3 py-1.5" style={{ width: columnWidths.price }}>
          <p className="text-sm font-black text-slate-800 dark:text-slate-100 tabular-nums whitespace-nowrap">
            {(job.price || 0).toLocaleString()}원
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              ({job.priceIncludesVat ? '부가세 포함' : '부가세 미포함'})
            </span>
          </p>
        </td>
        <td className="px-3 py-1.5" style={{ width: columnWidths.paymentStatus }} onClick={(e) => e.stopPropagation()}>
          <select
            value={job.paymentStatus || '결제대기'}
            onChange={(e) => handlePaymentChange(job, e.target.value as PaymentStatus)}
            className={`text-xs font-bold px-2 py-1 rounded-lg border outline-none cursor-pointer ${paymentBadgeClass(
              job.paymentStatus || '결제대기'
            )}`}
          >
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-1.5 text-xs text-slate-500" style={{ width: columnWidths.dueDate }}>
          <div className="flex items-center gap-1">
            <Calendar size={12} />
            {job.dueDate ? new Date(job.dueDate).toLocaleDateString() : '-'}
          </div>
        </td>
        <td className="px-3 py-1.5" style={{ width: columnWidths.contact }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={(e) => handleCall(job, e)}
              disabled={!hasPhone}
              className={`p-1.5 rounded-lg border transition-colors ${
                hasPhone
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
              }`}
              title={hasPhone ? '전화 걸기' : '연락처 없음'}
            >
              <Phone size={14} />
            </button>
            <button
              type="button"
              onClick={(e) => openContactModal(job, e)}
              disabled={!hasPhone}
              className={`p-1.5 rounded-lg border transition-colors ${
                hasPhone
                  ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                  : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
              }`}
              title={hasPhone ? '문자 보내기' : '연락처 없음'}
            >
              <MessageCircle size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const clientSortColumns: { key: ClientSortKey; label: string }[] = [
    { key: 'clientName', label: '고객사' },
    { key: 'pendingCount', label: '미수(결제대기)' },
    { key: 'partialCount', label: '일부결제' },
    { key: 'totalOutstanding', label: '합계 미수금' },
  ];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-full overflow-hidden">
      <div className="p-4 md:p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex-none">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <CreditCard size={22} className="text-blue-600" />
              결제 및 미수 관리
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {filter === 'byClient'
                ? '고객사별 미수·일부결제 현황을 종합합니다. 미수 건을 클릭하면 작업 상세를 확인할 수 있습니다.'
                : filter === 'prepaidClients'
                ? '선불 잔액이 있는 거래처만 모아 봅니다. 필요 시 연관 작업 상세로 바로 이동할 수 있습니다.'
                : '작업별 견적 금액·결제 상태를 한곳에서 확인하고 관리합니다. 헤더 클릭 정렬 · 우측 가장자리 드래그로 칸 너비 조절.'}
            </p>
          </div>
          <div className="relative w-full md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                filter === 'byClient'
                  ? '고객사·작업명 검색 (지난 작업 포함)'
                  : filter === 'prepaidClients'
                  ? '고객사·담당자·전화번호 검색'
                  : '거래처·작업명 검색 — 선택 시 상세 보기'
              }
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <PastJobSearchResults
          query={search}
          onSelectJob={(job) => setSelectedJob(job)}
          className="mt-3"
          paymentFilter={
            filter === 'outstanding' ||
            filter === '일부결제' ||
            filter === '후불결제' ||
            filter === '결제완료'
              ? filter
              : undefined
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 px-3 py-2">
            <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide flex items-center gap-1">
              <AlertCircle size={12} /> 미수·미결제
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-xl font-black text-red-700 dark:text-red-300 leading-none">{stats.outstandingCount}건</p>
              <p className="text-xl font-black text-red-600/80 tabular-nums leading-none">
                {stats.outstandingAmount.toLocaleString()}원
              </p>
            </div>
            <p className="text-[10px] text-red-500/70 mt-1">선불 차감분 제외</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40 px-3 py-2">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1">
              <Wallet size={12} /> 일부결제
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-xl font-black text-amber-800 dark:text-amber-200 leading-none">{stats.partialCount}건</p>
            </div>
          </div>
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-900/50 px-3 py-2">
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide flex items-center gap-1">
              <Wallet size={12} /> 선불 잔액 합계
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-xl font-black text-indigo-800 dark:text-indigo-200 leading-none tabular-nums">
                {stats.totalPrepaid.toLocaleString()}원
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900/50 px-3 py-2">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide flex items-center gap-1">
              <CheckCircle2 size={12} /> 결제완료 합계
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-xl font-black text-blue-800 dark:text-blue-200 leading-none">{stats.paidCount}건</p>
              <p className="text-xl font-black text-blue-600/80 tabular-nums leading-none">
                {stats.paidAmount.toLocaleString()}원
              </p>
            </div>
          </div>
        </div>

        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            참고(전체 선불 합 − 전체 미수 합, 거래처 간 상계 아님):{' '}
            <strong
              className={
                stats.netPosition >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }
            >
              {stats.netPosition >= 0 ? '+' : ''}
              {stats.netPosition.toLocaleString()}원
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-4">
          <div className="flex flex-wrap gap-2">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  filter === tab.id
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filter !== 'byClient' && filter !== 'prepaidClients' && (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                선택 {selectedCount}건
              </span>
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-blue-300 whitespace-nowrap"
              >
                {visibleAllSelected ? '현재 목록 전체 해제' : '현재 목록 전체 선택'}
              </button>
              <select
                value={bulkPaymentStatus}
                onChange={(e) => setBulkPaymentStatus(e.target.value as PaymentStatus)}
                className="text-xs font-bold px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBulkPaymentChange}
                disabled={selectedCount === 0}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white whitespace-nowrap"
              >
                선택 일괄 변경
              </button>
              {visibleSomeSelected && !visibleAllSelected && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  현재 검색/필터 목록 기준
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        {filter === 'byClient' ? (
          <div className="min-w-[720px]">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-red-50/60 dark:bg-red-950/20 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                미수 고객사 <span className="text-red-600">{clientSummaryTotals.clients}</span>곳
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                결제대기 <span className="font-black text-red-600">{clientSummaryTotals.pendingCount}</span>건
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                일부결제 <span className="font-black text-amber-600">{clientSummaryTotals.partialCount}</span>건
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                합계 미수금{' '}
                <span className="font-black text-red-700 tabular-nums">
                  {clientSummaryTotals.totalOutstanding.toLocaleString()}원
                </span>
              </span>
            </div>

            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-8" />
                  {clientSortColumns.map((col) => (
                    <th key={col.key} className="p-0">
                      <button
                        type="button"
                        onClick={() => handleClientSort(col.key)}
                        className="w-full flex items-center gap-1 px-3 py-3 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                      >
                        {col.label}
                        <SortIcon active={clientSortKey === col.key} dir={clientSortDir} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {clientSummaries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400 text-sm">
                      미수·일부결제 고객사가 없습니다.
                    </td>
                  </tr>
                )}
                {clientSummaries.map((row) => {
                  const expanded = expandedClients.has(row.clientName);
                  return (
                    <React.Fragment key={row.clientName}>
                      <tr
                        className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                        onClick={() => toggleClientExpand(row.clientName)}
                      >
                        <td className="p-3 text-slate-400">
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                            <Building2 size={14} className="text-slate-400 shrink-0" />
                            {row.clientName}
                          </div>
                        </td>
                        <td className="p-3 text-sm font-black text-red-600 tabular-nums">{row.pendingCount}건</td>
                        <td className="p-3 text-sm font-black text-amber-600 tabular-nums">{row.partialCount}건</td>
                        <td className="p-3 text-sm font-black text-red-700 dark:text-red-300 tabular-nums">
                          {row.totalOutstanding.toLocaleString()}원
                        </td>
                      </tr>
                      {expanded &&
                        row.jobs.map((job) => (
                          <tr
                            key={`${row.clientName}-${job.id}`}
                            className="bg-slate-50/90 dark:bg-slate-900/40 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer border-l-4 border-l-red-300 dark:border-l-red-800"
                            onClick={() => setSelectedJob(job)}
                          >
                            <td className="p-3" />
                            <td className="p-3 pl-6" colSpan={4}>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{job.title}</span>
                                <span className="text-[10px] font-mono text-slate-400">{formatJobNumber(job)}</span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${paymentBadgeClass(
                                    job.paymentStatus || '결제대기'
                                  )}`}
                                >
                                  {job.paymentStatus || '결제대기'}
                                </span>
                                <span className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums">
                                  {(job.price || 0).toLocaleString()}원
                                  <span className="text-[10px] font-bold text-slate-400 ml-0.5">
                                    ({job.priceIncludesVat ? '부가세 포함' : '부가세 미포함'})
                                  </span>
                                </span>
                                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                  <Calendar size={11} />
                                  {job.dueDate ? new Date(job.dueDate).toLocaleDateString() : '납기 미정'}
                                </span>
                                <span className="text-[11px] text-blue-600 font-bold">클릭 → 작업 상세</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : filter === 'prepaidClients' ? (
          <div className="min-w-[720px]">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-indigo-50/60 dark:bg-indigo-950/20 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                선불 고객사 <span className="text-indigo-600">{prepaidClientRows.length}</span>곳
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                선불 합계{' '}
                <span className="font-black text-indigo-700 tabular-nums">{stats.totalPrepaid.toLocaleString()}원</span>
              </span>
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-xs font-bold text-slate-500">고객사</th>
                  <th className="p-3 text-xs font-bold text-slate-500">담당자/연락처</th>
                  <th className="p-3 text-xs font-bold text-slate-500">선불 잔액</th>
                  <th className="p-3 text-xs font-bold text-slate-500">연관 미수</th>
                  <th className="p-3 text-xs font-bold text-slate-500 text-right">최근 작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {prepaidClientRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-slate-400 text-sm">
                      선불 잔액이 있는 고객사가 없습니다.
                    </td>
                  </tr>
                )}
                {prepaidClientRows.map((row) => (
                  <tr key={row.client.id} className="hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                        <Building2 size={14} className="text-slate-400 shrink-0" />
                        {row.client.name}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-slate-600 dark:text-slate-300">
                      <div>{row.client.contactPerson || '-'}</div>
                      <div className="font-mono text-[11px]">{row.client.phone || '-'}</div>
                    </td>
                    <td className="p-3 text-sm font-black text-indigo-700 dark:text-indigo-300 tabular-nums">
                      {row.balance.toLocaleString()}원
                    </td>
                    <td className="p-3 text-xs text-slate-600 dark:text-slate-300">
                      {row.outstandingJobs.length}건 / {row.outstandingAmount.toLocaleString()}원
                    </td>
                    <td className="p-3 text-right">
                      {row.recentJob ? (
                        <button
                          type="button"
                          onClick={() => setSelectedJob(row.recentJob || null)}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-300"
                        >
                          {row.recentJob.title}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">작업 없음</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <table
            className="w-full text-left border-collapse"
            style={{ minWidth: tableMinWidth, tableLayout: 'fixed' }}
          >
            <colgroup>
              <col style={{ width: SELECT_COLUMN_WIDTH }} />
              {JOB_COLUMNS.map((col) => (
                <col key={col.key} style={{ width: columnWidths[col.key] }} />
              ))}
            </colgroup>
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
              <tr>
                <th className="pl-3 pr-0 py-1.5 text-center" style={{ width: SELECT_COLUMN_WIDTH }}>
                  <input
                    type="checkbox"
                    checked={visibleAllSelected}
                    onChange={toggleSelectAllVisible}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                    aria-label="현재 목록 전체 선택"
                  />
                </th>
                {JOB_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`relative p-0 select-none ${col.align === 'center' ? 'text-center' : ''}`}
                    style={{ width: columnWidths[col.key] }}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key as SortKey)}
                        className={`w-full flex items-center gap-1 px-3 py-1.5 text-xs font-bold transition-colors ${
                          col.align === 'center' ? 'justify-center' : 'text-left'
                        } ${
                          sortKey === col.key
                            ? 'text-blue-600 bg-blue-50/80 dark:bg-blue-900/30'
                            : 'text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </button>
                    ) : (
                      <span className="block px-3 py-1.5 text-xs font-bold text-slate-500">{col.label}</span>
                    )}
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400/60 active:bg-blue-500 z-20"
                      onMouseDown={(e) => startColumnResize(col.key, e)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredJobs.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-slate-400 text-sm">
                    해당 조건의 작업이 없습니다.
                  </td>
                </tr>
              )}
              {filteredJobs.map((job) => renderJobRow(job))}
            </tbody>
          </table>
        )}
      </div>

      {contactingJob && (
        <ClientContactModal
          job={contactingJob}
          onClose={() => setContactingJob(null)}
          onUpdate={async (updated) => {
            try {
              await db.updateJob(updated);
              setContactingJob(null);
            } catch (e) {
              toast.error(getErrorMessage(e));
            }
          }}
        />
      )}

      {selectedJob && (
        <JobDetailModal
          key={selectedJob.id}
          job={selectedJob}
          staff={staff}
          initialViewMode="summary"
          onClose={() => setSelectedJob(null)}
          onUpdate={async (updated) => {
            try {
              await db.updateJob(updated);
              setSelectedJob(null);
            } catch (e) {
              toast.error(getErrorMessage(e));
            }
          }}
        />
      )}
    </div>
  );
};
