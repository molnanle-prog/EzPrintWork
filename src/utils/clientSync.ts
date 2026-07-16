import { Client, ClientContact, Job } from '../types';
import { db } from '../services/dataService';
import { getPreferredSmsNumber } from './clientSms';

export type ClientSyncResult = 'none' | 'created' | 'updated';

/** 상호명 비교용 정규화 (앞뒤 공백·연속 공백 제거) */
export function normalizeClientName(name?: string | null): string {
    return (name || '').trim().replace(/\s+/g, ' ');
}

/** 담당자명 비교용 정규화 */
export function normalizeContactName(name?: string | null): string {
    return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
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

/** 거래처 contacts 배열 정규화 (레거시 contactPerson/phone 보정) */
export function getClientContacts(client: Client): ClientContact[] {
    if (client.contacts?.length) {
        return client.contacts.map((c) => ({ ...c }));
    }
    if (client.contactPerson?.trim() || client.phone?.trim()) {
        return [{
            name: client.contactPerson || '',
            phone: client.phone || '',
            department: '담당자',
        }];
    }
    return [];
}

function buildContactsFromJob(contactPerson: string, clientPhone: string) {
    return [{ name: contactPerson, phone: clientPhone, department: '담당자' }];
}

function contactNameEquals(a?: string | null, b?: string | null): boolean {
    const na = normalizeContactName(a);
    const nb = normalizeContactName(b);
    return !!na && !!nb && na === nb;
}

/**
 * 작업 저장 시 거래처 자동 등록 / 담당자 동기화.
 * - 상호명이 목록에 없으면 신규 생성
 * - 담당자가 비어 있으면 작업 입력값으로 채움
 * - 이미 담당자가 있는데 다른 이름을 입력하면 contacts에 새 담당자로 추가
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

    if (!contactPerson && !clientPhone) return 'none';

    const contacts = getClientContacts(client);
    if (contacts.length === 0) {
        contacts.push({ name: '', phone: '', department: '담당자' });
    }

    const updated: Client = {
        ...client,
        name: normalizeClientName(client.name) || name,
        contacts: [...contacts],
    };
    let changed = false;

    const matchedIdx = contactPerson
        ? updated.contacts.findIndex((c) => contactNameEquals(c.name, contactPerson))
        : -1;

    if (contactPerson && matchedIdx < 0) {
        const hasAnyNamedContact = updated.contacts.some((c) => c.name?.trim());
        if (!hasAnyNamedContact) {
            // 담당자 없음 → 첫 슬롯(대표)에 채움
            const primary = { ...updated.contacts[0] };
            primary.name = contactPerson;
            if (clientPhone) primary.phone = clientPhone;
            updated.contacts[0] = primary;
            changed = true;
        } else {
            // 다른 담당자명 → 새 담당자로 추가 (대표 순서는 유지)
            updated.contacts.push({
                name: contactPerson,
                phone: clientPhone,
                department: '담당자',
            });
            changed = true;
        }
    } else if (matchedIdx >= 0 && clientPhone) {
        const existing = updated.contacts[matchedIdx];
        if (!existing.phone?.trim()) {
            updated.contacts[matchedIdx] = { ...existing, phone: clientPhone };
            changed = true;
        }
    } else if (!contactPerson && clientPhone) {
        // 이름 없이 연락처만 — 대표 연락처가 비어 있을 때만 보강
        const primary = updated.contacts[0];
        if (primary && !primary.phone?.trim()) {
            updated.contacts[0] = { ...primary, phone: clientPhone };
            changed = true;
        }
        if (!updated.phone?.trim()) {
            updated.phone = clientPhone;
            changed = true;
        }
    }

    // 레거시 대표 필드 — 비어 있을 때만 contacts[0] 기준으로 채움
    const primary = updated.contacts[0];
    if (primary) {
        if (!updated.contactPerson?.trim() && primary.name?.trim()) {
            updated.contactPerson = primary.name;
            changed = true;
        }
        if (!updated.phone?.trim() && primary.phone?.trim()) {
            updated.phone = primary.phone;
            changed = true;
        }
    }

    if (!changed) return 'none';

    if (!updated.customSmsNumber?.trim()) {
        updated.customSmsNumber = getPreferredSmsNumber(updated);
    }

    await db.updateClient(updated);
    return 'updated';
}
