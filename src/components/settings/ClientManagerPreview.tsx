import React from 'react';
import { Client } from '../../types';
import { ClientManager } from './ClientManager';

const previewClients: Client[] = [
  {
    id: 'preview-delivery-1',
    name: '디자인패스티벌',
    clientKind: 'delivery',
    contactPerson: '김서연',
    phone: '010-2345-6789',
    contacts: [{ name: '김서연', phone: '010-2345-6789', department: '담당' }],
    businessRegistrationNumber: '221-81-12345',
    prepaidBalance: 200000,
    sendSmsOnComplete: true,
  },
  {
    id: 'preview-delivery-2',
    name: '강원도민일보',
    clientKind: 'delivery',
    contactPerson: '박민재',
    phone: '033-123-4567',
    contacts: [{ name: '박민재', phone: '033-123-4567', department: '편집' }],
    sendSmsOnComplete: true,
  },
  {
    id: 'preview-delivery-3',
    name: '춘천시청',
    clientKind: 'delivery',
    contactPerson: '이하늘',
    phone: '033-250-3000',
    contacts: [{ name: '이하늘', phone: '033-250-3000', department: '홍보' }],
    sendSmsOnComplete: false,
  },
  {
    id: 'preview-order-1',
    name: '한솔페이퍼',
    clientKind: 'order',
    contactPerson: '정우성',
    phone: '032-450-1100',
    contacts: [{ name: '정우성', phone: '032-450-1100', department: '영업' }],
    sendSmsOnComplete: false,
  },
  {
    id: 'preview-order-2',
    name: '대한출력',
    clientKind: 'order',
    contactPerson: '최민아',
    phone: '02-555-0199',
    contacts: [{ name: '최민아', phone: '02-555-0199', department: '주문' }],
    sendSmsOnComplete: false,
  },
  {
    id: 'preview-order-3',
    name: '북바인더',
    clientKind: 'order',
    contactPerson: '한지훈',
    phone: '031-777-2200',
    contacts: [{ name: '한지훈', phone: '031-777-2200', department: '제본' }],
    sendSmsOnComplete: true,
  },
];

const previewStats = {
  jobs: {
    디자인패스티벌: 12,
    강원도민일보: 4,
    춘천시청: 8,
    한솔페이퍼: 2,
    대한출력: 1,
  },
  receivable: {
    강원도민일보: 350000,
  },
};

/** 개발 미리보기. 샘플 카드만 보여주고 저장하지 않는다. */
export const ClientManagerPreview: React.FC = () => {
  return (
    <div className="h-screen w-screen bg-slate-100 dark:bg-slate-900 p-4">
      <ClientManager previewMode previewClients={previewClients} previewStats={previewStats} />
    </div>
  );
};
