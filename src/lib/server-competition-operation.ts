import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

export type CompetitionOperationIdentity = {
  requestId: string;
  payloadHash: string;
  operationId: string;
};

export type CompetitionRequestInput = {
  requestId: string;
  tenantId: string;
  kind: string;
  payload: unknown;
};

export type CompetitionOperationInput = {
  actorUid: string;
  identity: CompetitionOperationIdentity;
  db?: Firestore;
};

export type CompetitionExternalEffect = {
  effectId: string;
  kind: string;
  payload: unknown;
};

export type CompetitionTransactionContext = {
  transaction: Transaction;
  identity: CompetitionOperationIdentity;
  /** Persist an external-effect intent atomically; a separate worker performs the effect. */
  queueExternalEffect(effect: CompetitionExternalEffect): void;
};

/**
 * Firestore may invoke this callback more than once during transaction retries.
 * It MUST perform only Firestore transaction reads/writes. Never call a network,
 * email, push, payment, or other external provider here; use queueExternalEffect.
 */
export type CompetitionTransactionMutation<T> = (
  context: CompetitionTransactionContext,
) => Promise<T> | T;

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const TENANT_ID = /^[^/\s]{1,200}$/;
const MUTATION_KIND = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const EFFECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

function canonicalJson(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid competition payload.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('Invalid competition payload.');
    seen.add(value);
    const result = value.map(item => canonicalJson(item, seen));
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) throw new Error('Invalid competition payload.');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('Invalid competition payload.');
    seen.add(value as object);
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new Error('Invalid competition payload.');
      result[key] = canonicalJson(item, seen);
    }
    seen.delete(value as object);
    return result;
  }
  throw new Error('Invalid competition payload.');
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalCompetitionRequest(input: CompetitionRequestInput): CompetitionOperationIdentity {
  const requestId = String(input.requestId || '').trim();
  const tenantId = String(input.tenantId || '').trim();
  const kind = String(input.kind || '').trim();
  if (!REQUEST_ID.test(requestId)) throw new Error('Invalid competition requestId.');
  if (!TENANT_ID.test(tenantId)) throw new Error('Invalid competition tenantId.');
  if (!MUTATION_KIND.test(kind)) throw new Error('Invalid competition mutation kind.');
  const payloadHash = hash(JSON.stringify(canonicalJson(input.payload)));
  const operationId = `competition_${hash(JSON.stringify([tenantId, kind, requestId])).slice(0, 40)}`;
  return { requestId, payloadHash, operationId };
}

function validateIdentity(identity: CompetitionOperationIdentity): void {
  if (!REQUEST_ID.test(identity.requestId) || !/^[a-f0-9]{64}$/.test(identity.payloadHash) || !/^competition_[a-f0-9]{40}$/.test(identity.operationId)) {
    throw new Error('Invalid competition operation identity.');
  }
}

export async function runCompetitionOperation<T>(
  input: CompetitionOperationInput,
  mutateTransaction: CompetitionTransactionMutation<T>,
): Promise<T> {
  validateIdentity(input.identity);
  const actorUid = String(input.actorUid || '').trim();
  if (!actorUid) throw new Error('Forbidden competition mutation.');
  const db = input.db || adminDb;
  const operationRef = db.collection('competitionOperations').doc(input.identity.operationId);
  return db.runTransaction(async transaction => {
    const existing = await transaction.get(operationRef);
    if (existing.exists) {
      const receipt = existing.data() || {};
      if (receipt.payloadHash !== input.identity.payloadHash || receipt.actorUid !== actorUid || receipt.requestId !== input.identity.requestId) {
        throw new Error('Request collision.');
      }
      return receipt.result as T;
    }
    const queuedEffectIds = new Set<string>();
    const context: CompetitionTransactionContext = {
      transaction,
      identity: input.identity,
      queueExternalEffect(effect) {
        const effectId = String(effect.effectId || '').trim();
        const kind = String(effect.kind || '').trim();
        if (!EFFECT_ID.test(effectId) || !MUTATION_KIND.test(kind) || queuedEffectIds.has(effectId)) {
          throw new Error('Invalid competition external effect.');
        }
        const canonicalPayload = canonicalJson(effect.payload);
        const payloadText = JSON.stringify(canonicalPayload);
        const outboxId = `${input.identity.operationId}_${hash(effectId).slice(0, 32)}`;
        transaction.create(db.collection('competitionOperationOutbox').doc(outboxId), {
          operationId: input.identity.operationId,
          effectId,
          kind,
          payload: JSON.parse(payloadText),
          payloadHash: hash(payloadText),
          status: 'pending',
          attempts: 0,
          createdAt: new Date().toISOString(),
        });
        queuedEffectIds.add(effectId);
      },
    };
    const result = await mutateTransaction(context);
    if (result === undefined) throw new Error('Competition operation result is required.');
    transaction.create(operationRef, {
      requestId: input.identity.requestId,
      payloadHash: input.identity.payloadHash,
      actorUid,
      result,
      effectIds: [...queuedEffectIds],
      createdAt: new Date().toISOString(),
    });
    return result;
  });
}
