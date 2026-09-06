import { adminDb } from '@/lib/firebase-admin';

const SAFE_PART = /^[A-Za-z0-9_-]{1,120}$/;
const POLL_INTERVAL_MS = 15;
const MAX_WAIT_MS = 8_000;

export type CertificationBarrierHeaders = {
  barrierId: string;
  participant: string;
};

export function isLocalAuditBarrierEnabled(environment: Record<string, string | undefined> = process.env): boolean {
  return environment.NODE_ENV !== 'production' && environment.AUDIT_LOCAL_REQUEST_BARRIER === '1';
}

export function readCertificationBarrierHeaders(headers: Headers): CertificationBarrierHeaders | null {
  const barrierId = headers.get('x-certification-barrier') || '';
  const participant = headers.get('x-certification-barrier-participant') || '';
  return SAFE_PART.test(barrierId) && SAFE_PART.test(participant) ? { barrierId, participant } : null;
}

/**
 * Local certification only: each request records its arrival before the test
 * releases the shared gate. It is unreachable in production and cannot be
 * enabled by a client header alone.
 */
export async function awaitLocalCertificationRequestBarrier(headers: Headers): Promise<void> {
  if (!isLocalAuditBarrierEnabled()) return;
  const input = readCertificationBarrierHeaders(headers);
  if (!input) return;
  const reference = adminDb.collection('qaCertificationRequestBarriers').doc(input.barrierId);
  const now = new Date().toISOString();
  await adminDb.runTransaction(async transaction => {
    const current = await transaction.get(reference);
    if (!current.exists || current.data()?.state !== 'open') return;
    transaction.set(reference, {
      arrivals: { [input.participant]: now },
      updatedAt: now,
    }, { merge: true });
  });
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const current = await reference.get();
    const state = current.data()?.state;
    if (state === 'released') return;
    if (state === 'cancelled') throw new Error('Local certification request barrier was cancelled.');
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error('Local certification request barrier timed out before release.');
}
