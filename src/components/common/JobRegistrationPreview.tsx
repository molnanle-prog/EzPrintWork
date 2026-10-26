import React from 'react';
import { toast } from 'sonner';
import { Job, Priority, Staff } from '../../types';
import { JobDetailModal } from './JobDetailModal';

const specs = {
  paperType: '스노우지',
  paperWeight: '200g',
  size: 'A4',
  quantity: '500부',
  processing: [] as string[],
  printColor: '단면 4도(컬러)',
  memo: '',
};

function previewJob(): Job {
  const due = new Date();
  due.setDate(due.getDate() + 7);
  due.setHours(15, 0, 0, 0);
  return {
    id: 'preview-registration',
    title: '강원도보(5190~5203) 인쇄',
    clientName: '디자인패스티벌',
    description: '',
    specs,
    subJobs: [{ id: '1', type: '책자', specs, externalOrder: true }],
    status: 'RECEIVED',
    priority: Priority.NORMAL,
    paymentStatus: '결제대기',
    createdAt: new Date().toISOString(),
    dueDate: due.toISOString(),
    progress: 0,
    type: '책자',
    price: 0,
    order: 0,
    assignedStaffIds: [],
  };
}

const previewStaff: Staff[] = [
  { id: 's1', name: '김민수', role: '인쇄', phone: '', avatarUrl: '', active: true, email: '', joinDate: '2026-01-01' },
  { id: 's2', name: '박지연', role: '디자인', phone: '', avatarUrl: '', active: true, email: '', joinDate: '2026-01-01' },
  { id: 's3', name: '이준호', role: '접수', phone: '', avatarUrl: '', active: true, email: '', joinDate: '2026-01-01' },
];

/** 개발 미리보기. 저장하지 않고 신규 등록 창만 보여 준다. */
export const JobRegistrationPreview: React.FC = () => {
  return (
    <JobDetailModal
      job={previewJob()}
      staff={previewStaff}
      isNew
      initialViewMode="edit"
      onClose={() => toast.message('미리보기라 창만 닫히지 않습니다.')}
      onUpdate={() => {
        toast.success('미리보기입니다. 등록 내용은 저장하지 않습니다.');
      }}
    />
  );
};
