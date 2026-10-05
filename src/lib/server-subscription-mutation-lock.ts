import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { isActiveSubscriptionMutationLock } from '@/lib/subscription-seat-policy';

const MUTATION_LOCK_MS = 2 * 60 * 1000;

type SubscriptionMutationLock = {
  key?: string;
  expiresAt?: number;
};

export class SubscriptionMutationInProgressError extends Error {
  constructor() {
    super('SUBSCRIPTION_MUTATION_IN_PROGRESS');
    this.name = 'SubscriptionMutationInProgressError';
  }
}

export async function claimSubscriptionMutation(
  userRef: FirebaseFirestore.DocumentReference,
  key: string
): Promise<void> {
  const now = Date.now();
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) throw new Error('ENTITLEMENT_USER_NOT_FOUND');
    const lock = (snapshot.data()?.subscriptionMutation || {}) as SubscriptionMutationLock;
    const active = isActiveSubscriptionMutationLock(lock, now);

    if (active) {
      throw new SubscriptionMutationInProgressError();
    }
    transaction.update(userRef, {
      subscriptionMutation: {
        key,
        expiresAt: now + MUTATION_LOCK_MS,
        startedAt: now,
      },
    });
  });
}

export async function releaseSubscriptionMutation(
  userRef: FirebaseFirestore.DocumentReference,
  key: string
): Promise<void> {
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(userRef);
    if (!snapshot.exists) return;
    if (snapshot.data()?.subscriptionMutation?.key !== key) return;
    transaction.update(userRef, {
      subscriptionMutation: admin.firestore.FieldValue.delete(),
    });
  });
}
