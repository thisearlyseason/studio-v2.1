import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { hasUnresolvedSubscription } from './checkout-policy';
import { CheckoutLifecycleError, resolveCheckoutForDeletion } from './server-checkout-lock';

export class AccountDeletionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function assertEligible(profile: Record<string, unknown> | undefined, ownsOrganization: boolean) {
  if (!profile) throw new AccountDeletionError('Account profile is incomplete.', 409);
  if (profile.isDemo === true) throw new AccountDeletionError('Demo accounts reset automatically and cannot be queued for live-account deletion.', 400);
  if (hasUnresolvedSubscription(profile)) throw new AccountDeletionError('Manage or resolve the active subscription with its original billing provider before scheduling account deletion.', 409);
  if (ownsOrganization) throw new AccountDeletionError('Transfer or delete every team and league you own before deleting this account. This prevents orphaned organization data.', 409);
}

/** Shared lifecycle: no provider-specific shortcuts around the existing guards. */
export function createAccountDeletionActions(db: Firestore, auth: Pick<Auth, 'revokeRefreshTokens' | 'updateUser'>, clock = Date.now) {
  return {
    async eligible(uid: string) {
      const [user, teams, leagues] = await Promise.all([
        db.collection('users').doc(uid).get(),
        db.collection('teams').where('ownerUserId', '==', uid).limit(1).get(),
        db.collection('leagues').where('creatorId', '==', uid).limit(1).get(),
      ]);
      assertEligible(user.data(), !teams.empty || !leagues.empty);
      if (user.data()?.pendingCheckout) {
        try { await resolveCheckoutForDeletion(db, db.collection('users').doc(uid)); }
        catch (error) { throw new AccountDeletionError(error instanceof CheckoutLifecycleError ? error.message : 'The pending checkout could not be confirmed. No deletion was started; please try again.', error instanceof CheckoutLifecycleError ? error.status : 503); }
      }
    },
    async schedule(uid: string) {
      const requestedAt = Timestamp.fromMillis(clock()), purgeAt = Timestamp.fromMillis(requestedAt.toMillis() + 7 * 24 * 60 * 60 * 1000);
      const requestRef = db.collection('accountDeletionRequests').doc(uid), userRef = db.collection('users').doc(uid);
      const effective = await db.runTransaction(async transaction => {
        const [request, user, teams, leagues] = await Promise.all([
          transaction.get(requestRef),
          transaction.get(userRef),
          transaction.get(db.collection('teams').where('ownerUserId', '==', uid).limit(1)),
          transaction.get(db.collection('leagues').where('creatorId', '==', uid).limit(1)),
        ]);
        // This check and the pending profile write serialize with ownership
        // creation, including requests that passed authentication earlier.
        assertEligible(user.data(), !teams.empty || !leagues.empty);
        if (user.data()?.pendingCheckout) throw new AccountDeletionError('Resolve the pending checkout before deleting this account.', 409);
        const existing = request.data();
        const pending = existing?.status === 'pending' && existing.purgeAt instanceof Timestamp;
        const deadline = pending ? existing.purgeAt as Timestamp : purgeAt;
        if (!pending) transaction.set(requestRef, { uid, requestedAt, purgeAt, status: 'pending' });
        transaction.set(userRef, { deletionRequestedAt: pending ? existing.requestedAt ?? requestedAt : requestedAt, deletionPurgeAt: deadline, deletionStatus: 'pending' }, { merge: true });
        return deadline;
      });
      await auth.revokeRefreshTokens(uid);
      await auth.updateUser(uid, { disabled: true });
      return effective.toDate().toISOString();
    },
  };
}
