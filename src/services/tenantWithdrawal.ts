import { doc, setDoc } from 'firebase/firestore';
import { db as firestore } from './firebase';

/** 회사 탈퇴 표시. 저장 폴더 파일과 구글 계정은 지우지 않는다. */
export async function markTenantWithdrawn(args: {
    tenantId: string;
    uid: string;
    email?: string | null;
}): Promise<void> {
    const tenantId = String(args.tenantId || '').trim();
    const uid = String(args.uid || '').trim();
    if (!tenantId || !uid) {
        throw new Error('회사 정보를 확인하지 못했습니다.');
    }
    await setDoc(
        doc(firestore, 'tenants', tenantId),
        {
            withdrawalStatus: 'withdrawn',
            withdrawnAt: new Date().toISOString(),
            withdrawnByUid: uid,
            withdrawnByEmail: String(args.email || '').trim(),
        },
        { merge: true }
    );
}

export function isWithdrawnTenantData(data: Record<string, unknown> | null | undefined): boolean {
    if (!data) return false;
    return data.withdrawalStatus === 'withdrawn' || !!String(data.withdrawnAt || '').trim();
}
