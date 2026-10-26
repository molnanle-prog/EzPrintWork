import React, { useState } from 'react';
import { GitMerge } from 'lucide-react';
import { Job, JobStatusDefinition, Priority, Staff } from '../../types';
import { JobCardMergeModal } from './JobCardMergeModal';

const specs = {
  paperType: '스노우지',
  paperWeight: '200g',
  size: 'A4',
  quantity: '500',
  processing: [] as string[],
  printColor: '단면 4도(컬러)',
  memo: '',
};

const due = '2026-10-10T15:00:00.000Z';

const previewStaff: Staff[] = [
  { id: 's1', name: '김민수', role: '인쇄', phone: '', avatarUrl: '', active: true, email: '', joinDate: '2026-01-01' },
  { id: 's2', name: '박지연', role: '디자인', phone: '', avatarUrl: '', active: true, email: '', joinDate: '2026-01-01' },
];

const statuses: JobStatusDefinition[] = [
  { key: 'RECEIVED', label: '접수' },
  { key: 'DESIGN', label: '디자인' },
  { key: 'PRINT', label: '인쇄' },
];

function card(partial: Partial<Job> & Pick<Job, 'id' | 'title' | 'clientName' | 'type' | 'status'>): Job {
  return {
    description: '',
    specs,
    priority: Priority.NORMAL,
    paymentStatus: '결제대기',
    createdAt: '2026-10-07T01:00:00.000Z',
    dueDate: due,
    progress: 0,
    price: 0,
    order: 0,
    ...partial,
  };
}

const previewJobs: Job[] = [
  card({
    id: 'preview-1',
    title: '행사 명함',
    clientName: '디자인패스티벌',
    type: '명함',
    status: 'RECEIVED',
    contactPerson: '김서연',
    clientPhone: '010-2345-6789',
    assignedStaffIds: ['s1'],
    subJobs: [{ id: 'i1', type: '명함', specs }],
    price: 80000,
    createdAt: '2026-10-07T01:00:00.000Z',
  }),
  card({
    id: 'preview-2',
    title: '행사 현수막',
    clientName: '디자인패스티벌',
    type: '현수막',
    status: 'DESIGN',
    contactPerson: '박민재',
    clientPhone: '010-1111-2222',
    assignedStaffIds: ['s2'],
    subJobs: [{ id: 'i2', type: '현수막', specs: { ...specs, size: '5000x900' } }],
    price: 150000,
    createdAt: '2026-10-08T01:00:00.000Z',
  }),
  card({
    id: 'preview-3',
    title: '행사 리플렛',
    clientName: '디자인패스티벌',
    type: '리플렛',
    status: 'RECEIVED',
    contactPerson: '김서연',
    clientPhone: '010-2345-6789',
    assignedStaffIds: ['s1', 's2'],
    subJobs: [{ id: 'i3', type: '리플렛', specs }],
    price: 120000,
    createdAt: '2026-10-09T01:00:00.000Z',
  }),
  card({
    id: 'preview-4',
    title: '창간호 포스터',
    clientName: '강원도민일보',
    type: '포스터',
    status: 'PRINT',
    contactPerson: '이하늘',
    clientPhone: '033-123-4567',
    assignedStaffIds: ['s1'],
    subJobs: [{ id: 'i4', type: '포스터', specs }],
    price: 90000,
  }),
];

/** 개발 미리보기. 카드 합치기 선택만 보여주고 저장하지 않는다. */
export const KanbanMergePreview: React.FC = () => {
  const [open, setOpen] = useState(true);
  return (
    <div className="h-screen w-screen bg-slate-100 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-700"
        >
          <GitMerge size={13} />
          카드 합치기
        </button>
        <span className="text-xs text-slate-500">미리보기입니다. 체크한 카드는 저장되지 않습니다.</span>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-3 p-4 min-h-0">
        {statuses.map((status) => (
          <div key={status.key} className="bg-white rounded-xl border border-slate-200 p-3 overflow-auto">
            <p className="text-sm font-bold text-slate-700 mb-2">{status.label}</p>
            <div className="space-y-2">
              {previewJobs.filter((job) => job.status === status.key).map((job) => (
                <div key={job.id} className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-sm font-bold text-slate-800">{job.title}</p>
                  <p className="text-xs text-slate-500">{job.clientName} · {(job.subJobs || []).map((item) => item.type).join(', ')}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {open && (
        <JobCardMergeModal
          jobs={previewJobs}
          staff={previewStaff}
          statuses={statuses}
          previewMode
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};
