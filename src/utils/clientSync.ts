import { Client, Job } from '../types';
import { db } from '../services/dataService';
import { getPreferredSmsNumber } from './clientSms';

export type ClientSyncResult = 'none' | 'created' | 'updated';

/** 상호명 비교용 정규화 (앞뒤 공백·연속 공백 제거) */
export function normalizeClientName(name?: string | null): string {
    return (name || '').trim().replace(/\s+/g, ' ');
}

/** 동일 상호명 거래처 찾기 (정규화 후 비교) */
export function findClientByNormalizedName(
    clients: Client[],
    name?: string | null
): Client | undefined {
    const key = normalizeClientName(name);
    if (!key) return undefined;
    return clients.find((c) => normalizeClientName(c.name) === key);
}

function buildContactsFromJob(contactPerson: string, clientPhone: string) {
    return [{ name: contactPerson, phone: clientPhone, department: '담당자' }];
}

/**
 * 작업 저장 시 거래처 자동 등록 / 담당자·연락처 빈 칸 반영.
 * - 상호명이 목록에 없으면 신규 생성
 * - 있으면 있으면 담당자·연락처가 비어 있으면 작업 입력값으로 채움
 * - linkedClientId 힌트가 있어도 상호명이 바뀌었으면 무시하고 이름 기준으로 재매칭
 */
export async function syncClientFromJob(
    job: Job,
    clientIdHint?: string | null
): Promise<ClientSyncResult> {
    const name = normalizeClientName(job.clientName);
    const contactPerson = job.contactPerson?.trim() || '';
    const clientPhone = job.clientPhone?.trim() || '';

    if (!name) return 'none';

    const clients = db.getClients();

    let client: Client | undefined;
    if (clientIdHint) {
        const hinted = clients.find((c) => c.id === clientIdHint);
        // 힌트 id가 가리키는 상호와 현재 입력 상호가 같아야만 사용
        if (hinted && normalizeClientName(hinted.name) === name) {
            client = hinted;
        }
    }
    if (!client) {
        client = findClientByNormalizedName(clients, name);
    }

    if (!client) {
        const contacts = buildContactsFromJob(contactPerson, clientPhone);
        const draft: Client = {
            id: '',
            name,
            contactPerson,
            phone: clientPhone,
            contacts,
            sendSmsOnComplete: true,
            customSmsNumber: getPreferredSmsNumber({
                contactPerson,
                phone: clientPhone,
                contacts,
            }),
            prepaidBalance: 0,
        };

        await db.addClient(draft);

        const created = findClientByNormalizedName(db.getClients(), name);
        if (!created) {
            throw new Error(
                '거래처 자동 등록이 저장되지 않았습니다. 네트워크·권한을 확인한 뒤 다시 저장해 주세요.'
            );
        }
        return 'created';
    }

    // 기존 거래처 — 빈 필드만 작업 입력값으로 보강
    if (!contactPerson && !clientPhone) return 'none';

    const contacts = client.contacts?.length
        ? client.contacts.map((c) => ({ ...c }))
        : buildContactsFromJob(client.contactPerson || '', client.phone || '');

    const updated: Client = {
        ...client,
        name: normalizeClientName(client.name) || name,
        contacts: [...contacts],
    };
    let changed = false;

    if (contactPerson && !updated.contactPerson?.trim()) {
        updated.contactPerson = contactPerson;
        changed = true;
    }
    if (clientPhone && !updated.phone?.trim()) {
        updated.phone = clientPhone;
        changed = true;
    }

    const primary = updated.contacts[0] || {
        name: '',
        phone: '',
        department: '담당자',
    };
    const nextPrimary = { ...primary };

    if (contactPerson && !primary.name?.trim()) {
        nextPrimary.name = contactPerson;
        changed = true;
    }
    if (clientPhone && !primary.phone?.trim()) {
        nextPrimary.phone = clientPhone;
        changed = true;
    }

    if (!changed) return 'none';

    updated.contacts = [nextPrimary, ...updated.contacts.slice(1)];
    if (!updated.customSmsNumber?.trim()) {
        updated.customSmsNumber = getPreferredSmsNumber(updated);
    }

    await db.updateClient(updated);
    return 'updated';
}
