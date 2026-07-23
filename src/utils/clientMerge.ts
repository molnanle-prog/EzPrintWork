import { Client, ClientContact, PrepaidLedgerEntry } from '../types';
import { db } from '../services/dataService';
import { getPreferredSmsNumber } from './clientSms';

export interface ClientMergePreview {
    primaryName: string;
    secondaryName: string;
    primaryJobs: number;
    secondaryJobs: number;
    primaryQuotes: number;
    secondaryQuotes: number;
    totalJobs: number;
    totalQuotes: number;
}

export interface ClientMergeResult extends ClientMergePreview {
    contactsMerged: number;
}

function normalizePhone(phone?: string): string {
    return (phone || '').replace(/\D/g, '');
}

function contactKey(contact: ClientContact): string {
    const phone = normalizePhone(contact.phone);
    if (phone) return `p:${phone}`;
    const name = (contact.name || '').trim().toLowerCase();
    if (name) return `n:${name}`;
    return `x:${contact.department || ''}-${contact.email || ''}`;
}

function getClientContacts(client: Client): ClientContact[] {
    if (client.contacts?.length) return client.contacts.map((c) => ({ ...c }));
    return [{
        name: client.contactPerson || '',
        phone: client.phone || '',
        email: client.email || '',
        department: '담당자',
    }];
}

function mergeNotes(primaryNote?: string, secondaryNote?: string, secondaryName?: string): string {
    const primary = primaryNote?.trim() || '';
    const secondary = secondaryNote?.trim() || '';
    if (!secondary || secondary === primary) return primary;
    if (!primary) return secondary;
    if (primary.includes(secondary)) return primary;
    return `${primary}\n[합침] ${secondaryName}: ${secondary}`;
}

function mergeContacts(primary: Client, secondary: Client): ClientContact[] {
    const merged: ClientContact[] = [];
    const seen = new Set<string>();

    const addContact = (contact: ClientContact) => {
        if (!contact.name?.trim() && !contact.phone?.trim() && !contact.email?.trim()) return;
        const key = contactKey(contact);
        if (seen.has(key)) return;
        seen.add(key);
        merged.push({ ...contact });
    };

    getClientContacts(primary).forEach(addContact);
    getClientContacts(secondary).forEach(addContact);

    return merged.length > 0 ? merged : [{ name: '', phone: '', department: '담당자' }];
}

/** 양쪽 선불 이력을 시간순으로 합치고 balanceAfter를 다시 계산 */
function mergePrepaidLedgers(primary: Client, secondary: Client): PrepaidLedgerEntry[] | undefined {
    const rows = [
        ...(primary.prepaidLedger || []).map((e) => ({ ...e })),
        ...(secondary.prepaidLedger || []).map((e) => ({ ...e })),
    ];
    if (rows.length === 0) return undefined;

    rows.sort((a, b) => {
        const ta = a.timestamp || '';
        const tb = b.timestamp || '';
        if (ta !== tb) return ta.localeCompare(tb);
        return (a.id || '').localeCompare(b.id || '');
    });

    let running = 0;
    return rows.map((entry) => {
        running += Number(entry.amount) || 0;
        return { ...entry, balanceAfter: running };
    });
}

function buildMergedClient(primary: Client, secondary: Client): Client {
    const contacts = mergeContacts(primary, secondary);
    const primaryContact = contacts[0] || { name: '', phone: '', department: '담당자' };
    const mergedNote = mergeNotes(primary.note, secondary.note, secondary.name);
    const mergeStamp = `[거래처 합침] ${new Date().toLocaleDateString('ko-KR')} '${secondary.name}' → '${primary.name}'`;
    const note = mergedNote ? `${mergedNote}\n${mergeStamp}` : mergeStamp;

    const prepaidLedger = mergePrepaidLedgers(primary, secondary);
    const prepaidSum =
        (primary.prepaidBalance || 0) + (secondary.prepaidBalance || 0);
    const prepaidFromLedger =
        prepaidLedger && prepaidLedger.length > 0
            ? prepaidLedger[prepaidLedger.length - 1].balanceAfter
            : undefined;
    const prepaidBalance =
        prepaidFromLedger !== undefined
            ? prepaidFromLedger
            : prepaidSum > 0
              ? prepaidSum
              : undefined;

    const merged: Client = {
        ...primary,
        businessRegistrationNumber: primary.businessRegistrationNumber?.trim() || secondary.businessRegistrationNumber || '',
        contactPerson: primary.contactPerson?.trim() || primaryContact.name || secondary.contactPerson || '',
        phone: primary.phone?.trim() || primaryContact.phone || secondary.phone || '',
        email: primary.email?.trim() || secondary.email || primaryContact.email || '',
        address: primary.address?.trim() || secondary.address || '',
        note,
        contacts,
        sendSmsOnComplete: primary.sendSmsOnComplete !== false || secondary.sendSmsOnComplete !== false,
        customSmsNumber: primary.customSmsNumber?.trim() || secondary.customSmsNumber?.trim() || '',
        prepaidBalance,
        prepaidLedger,
        order: primary.order ?? secondary.order,
    };

    if (!merged.customSmsNumber && merged.sendSmsOnComplete !== false) {
        merged.customSmsNumber = getPreferredSmsNumber(merged);
    }

    return merged;
}

export function getClientMergePreview(primary: Client, secondary: Client): ClientMergePreview {
    const primaryJobs = db.getJobsByClient(primary.name).length;
    const secondaryJobs = db.getJobsByClient(secondary.name).length;
    const quotes = db.getQuotes();
    const primaryQuotes = quotes.filter((q) => q.clientName === primary.name).length;
    const secondaryQuotes = quotes.filter((q) => q.clientName === secondary.name).length;

    return {
        primaryName: primary.name,
        secondaryName: secondary.name,
        primaryJobs,
        secondaryJobs,
        primaryQuotes,
        secondaryQuotes,
        totalJobs: primaryJobs + secondaryJobs,
        totalQuotes: primaryQuotes + secondaryQuotes,
    };
}

/** 두 거래처를 primary 기준으로 합치고, 작업·견적 거래처명도 함께 통합 */
export async function mergeClients(primaryId: string, secondaryId: string): Promise<ClientMergeResult> {
    if (primaryId === secondaryId) {
        throw new Error('같은 거래처는 합칠 수 없습니다.');
    }

    const clients = db.getClients();
    const primary = clients.find((c) => c.id === primaryId);
    const secondary = clients.find((c) => c.id === secondaryId);

    if (!primary || !secondary) {
        throw new Error('선택한 거래처를 찾을 수 없습니다.');
    }

    const preview = getClientMergePreview(primary, secondary);
    const mergedClient = buildMergedClient(primary, secondary);
    const contactsBefore = getClientContacts(primary).length;
    const contactsMerged = mergedClient.contacts.length - contactsBefore;

    await db.applyClientMerge({
        mergedClient,
        secondaryId,
        secondaryName: secondary.name,
        primaryName: primary.name,
    });

    return {
        ...preview,
        contactsMerged: Math.max(contactsMerged, 0),
    };
}
