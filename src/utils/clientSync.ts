import { Client, Job } from '../types';
import { db } from '../services/dataService';
import { getPreferredSmsNumber } from './clientSms';

export type ClientSyncResult = 'none' | 'created' | 'updated';

/** 작업 저장 시 거래처 자동 등록 또는 담당자/연락처 빈 칸 반영 */
export async function syncClientFromJob(job: Job, clientIdHint?: string | null): Promise<ClientSyncResult> {
    const name = job.clientName?.trim();
    const contactPerson = job.contactPerson?.trim() || '';
    const clientPhone = job.clientPhone?.trim() || '';

    if (!name) return 'none';

    const clients = db.getClients();
    const client =
        (clientIdHint ? clients.find((c) => c.id === clientIdHint) : undefined) ||
        clients.find((c) => c.name === name);

    if (!client) {
        const contacts = [{ name: contactPerson, phone: clientPhone, department: '담당자' }];
        const draft: Partial<Client> = {
            name,
            contactPerson,
            phone: clientPhone,
            contacts,
            sendSmsOnComplete: true,
            customSmsNumber: getPreferredSmsNumber({ contactPerson, phone: clientPhone, contacts }),
        };
        await db.addClient(draft as Client);
        return 'created';
    }

    if (!contactPerson && !clientPhone) return 'none';

    const contacts = client.contacts?.length
        ? client.contacts.map((c) => ({ ...c }))
        : [{ name: client.contactPerson || '', phone: client.phone || '', department: '담당자' }];

    const updated: Client = { ...client, contacts: [...contacts] };
    let changed = false;

    if (contactPerson && !updated.contactPerson?.trim()) {
        updated.contactPerson = contactPerson;
        changed = true;
    }
    if (clientPhone && !updated.phone?.trim()) {
        updated.phone = clientPhone;
        changed = true;
    }

    const primary = updated.contacts[0] || { name: '', phone: '', department: '담당자' };
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
    await db.updateClient(updated);
    return 'updated';
}
