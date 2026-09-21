import { Client, ClientContact } from '../types';

/** 휴대폰 번호(010/011/016/017/018/019) 여부 */
export function isMobilePhone(phone?: string): boolean {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, '');
    return /^01[016789]\d{7,8}$/.test(digits);
}

function pickMobileFromContacts(contacts: ClientContact[]): string {
    const byDept = contacts.find(
        (c) => c.phone?.trim() && (c.department?.includes('휴대') || c.department?.includes('모바일'))
    );
    if (byDept?.phone) return byDept.phone.trim();

    const byMobile = contacts.find((c) => isMobilePhone(c.phone));
    if (byMobile?.phone) return byMobile.phone.trim();

    return '';
}

/** 문자 발송용 — 휴대폰 번호를 우선 선택 */
export function getPreferredSmsNumber(client: Partial<Client>): string {
    const contacts = client.contacts || [];

    const fromContacts = pickMobileFromContacts(contacts);
    if (fromContacts) return fromContacts;

    if (isMobilePhone(client.phone)) return client.phone!.trim();

    const firstWithPhone = contacts.find((c) => c.phone?.trim());
    if (firstWithPhone?.phone) return firstWithPhone.phone.trim();

    return (client.phone || '').trim();
}

/** 거래처에 저장된 설정 + 휴대폰 우선 규칙으로 최종 수신 번호 */
export function resolveClientSmsNumber(client: Partial<Client>, fallbackPhone?: string): string {
    if (client.customSmsNumber?.trim()) return client.customSmsNumber.trim();
    const preferred = getPreferredSmsNumber(client);
    if (preferred) return preferred;
    return (fallbackPhone || '').trim();
}

export type GroupSmsRecipient = {
    id: string;
    clientId: string;
    clientName: string;
    contactName: string;
    phone: string;
    digits: string;
};

/** 선택한 거래처에서 휴대폰 번호가 있는 담당자만 */
export function collectMobileRecipients(clients: Client[]): GroupSmsRecipient[] {
    const out: GroupSmsRecipient[] = [];
    const seen = new Set<string>();

    const push = (client: Client, contactName: string, phone?: string) => {
        if (!isMobilePhone(phone)) return;
        const digits = phone!.replace(/\D/g, '');
        const key = `${client.id}:${digits}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
            id: key,
            clientId: client.id,
            clientName: client.name,
            contactName: (contactName || '').trim() || '담당자',
            phone: phone!.trim(),
            digits,
        });
    };

    for (const client of clients) {
        for (const contact of client.contacts || []) {
            push(client, contact.name || client.contactPerson, contact.phone);
        }
        push(client, client.contactPerson, client.phone);
        if (client.customSmsNumber && isMobilePhone(client.customSmsNumber)) {
            push(client, client.contactPerson || '문자 수신', client.customSmsNumber);
        }
    }
    return out;
}

export type SmsReceiveMode = 'mobile' | 'primary' | 'contact' | 'custom';

export function inferSmsReceiveMode(client: Partial<Client>, customSmsNumber?: string): SmsReceiveMode {
    const custom = (customSmsNumber || '').trim();
    if (!custom) return 'mobile';

    const preferred = getPreferredSmsNumber(client);
    if (custom === preferred) return 'mobile';

    const firstPhone = client.contacts?.[0]?.phone?.trim() || client.phone?.trim() || '';
    if (custom === firstPhone) return 'primary';

    if (client.contacts?.some((c) => c.phone?.trim() === custom)) return 'contact';

    return 'custom';
}

export function resolveSmsNumberForMode(client: Partial<Client>, mode: SmsReceiveMode): string {
    if (mode === 'mobile') return getPreferredSmsNumber(client);
    if (mode === 'primary') {
        return client.contacts?.[0]?.phone?.trim() || client.phone?.trim() || '';
    }
    if (mode === 'contact') {
        return getPreferredSmsNumber(client)
            || client.contacts?.find((c) => c.phone?.trim())?.phone?.trim()
            || '';
    }
    return (client.customSmsNumber || '').trim();
}
