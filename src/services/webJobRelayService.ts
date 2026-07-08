import { Job } from '../types';
import { doc, runTransaction } from 'firebase/firestore';
import { db as firestore, auth } from './firebase';

export interface WebJobRelayBatch {
    id: string;
    jobs: Job[];
    createdAt: string;
    uid?: string;
}

const QUEUE_DOC_ID = 'webJobQueue';

function getQueueRef(tenantId: string) {
    return doc(firestore, 'tenants', tenantId, 'sync', QUEUE_DOC_ID);
}

/** HTTPS 웹(ez-hub.kr) → HTTP LAN 게이트웨이는 브라우저가 차단(Mixed Content) */
export function isLikelyMixedContentBlocked(gatewayUrl: string | null | undefined): boolean {
    if (typeof window === 'undefined' || !gatewayUrl?.trim()) return false;
    if (window.location.protocol !== 'https:') return false;
    try {
        const u = new URL(gatewayUrl.trim());
        if (u.protocol !== 'http:') return false;
        const host = u.hostname.toLowerCase();
        return host !== 'localhost' && host !== '127.0.0.1';
    } catch {
        return false;
    }
}

function sanitizeJobs(jobs: Job[]): Job[] {
    return JSON.parse(JSON.stringify(jobs)) as Job[];
}

export async function enqueueWebJobRelayBatches(tenantId: string, jobs: Job[]): Promise<boolean> {
    if (!tenantId || jobs.length === 0) return false;
    const batch: WebJobRelayBatch = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        jobs: sanitizeJobs(jobs),
        createdAt: new Date().toISOString(),
        uid: auth.currentUser?.uid,
    };
    try {
        await runTransaction(firestore, async (tx) => {
            const ref = getQueueRef(tenantId);
            const snap = await tx.get(ref);
            const existing = (snap.data()?.batches as WebJobRelayBatch[] | undefined) || [];
            const next = [...existing, batch].slice(-30);
            tx.set(
                ref,
                { batches: next, updatedAt: new Date().toISOString() },
                { merge: true }
            );
        });
        return true;
    } catch (error) {
        console.warn('[WebJobRelay] enqueue failed:', error);
        return false;
    }
}

/** Electron 매장 PC — 큐 배치를 원자적으로 가져와 비움 */
export async function claimWebJobRelayBatches(tenantId: string): Promise<WebJobRelayBatch[]> {
    try {
        return await runTransaction(firestore, async (tx) => {
            const ref = getQueueRef(tenantId);
            const snap = await tx.get(ref);
            const batches = (snap.data()?.batches as WebJobRelayBatch[] | undefined) || [];
            if (batches.length === 0) return [];
            tx.set(ref, { batches: [], updatedAt: new Date().toISOString() }, { merge: true });
            return batches;
        });
    } catch (error) {
        console.warn('[WebJobRelay] claim failed:', error);
        return [];
    }
}

export function getWebJobQueueRef(tenantId: string) {
    return getQueueRef(tenantId);
}
