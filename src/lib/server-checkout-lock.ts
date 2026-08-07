import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';

type CheckoutLock = {
  key?: string;
  sessionId?: string | null;
  expiresAt?: number;
};

export type CheckoutLockClaim = {
  claimed: boolean;
  existingSessionId?: string;
  replacedSessionId?: string;
};

export async function claimCheckoutLock(
  userRef: FirebaseFirestore.DocumentReference,
  key: string
): Promise<CheckoutLockClaim> {
  const now = Date.now();
  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(userRef);
    const lock = (snapshot.data()?.pendingCheckout || {}) as CheckoutLock;
    const active = typeof lock.expiresAt === 'number' && lock.expiresAt > now;

    if (active && lock.key === key && lock.sessionId) {
      return { claimed: true, existingSessionId: lock.sessionId };
    }
    if (active && !lock.sessionId) {
      return { claimed: false };
    }

    transaction.update(userRef, {
      pendingCheckout: {
        key,
        sessionId: null,
        expiresAt: now + 2 * 60 * 1000,
        updatedAt: now,
      },
    });
    return {
      claimed: true,
      ...(active && lock.sessionId ? { replacedSessionId: lock.sessionId } : {}),
    };
  });
}

export async function finalizeCheckoutLock(
  userRef: FirebaseFirestore.DocumentReference,
  key: string,
  sessionId: string,
  expiresAt: number
): Promise<void> {
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(userRef);
    if (snapshot.data()?.pendingCheckout?.key !== key) return;
    transaction.update(userRef, {
      pendingCheckout: {
        key,
        sessionId,
        expiresAt,
        updatedAt: Date.now(),
      },
    });
  });
}

export async function releaseCheckoutLock(
  userRef: FirebaseFirestore.DocumentReference,
  key: string
): Promise<void> {
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(userRef);
    if (snapshot.data()?.pendingCheckout?.key !== key) return;
    transaction.update(userRef, {
      pendingCheckout: admin.firestore.FieldValue.delete(),
    });
  });
}
