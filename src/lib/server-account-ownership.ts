import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { isAccountAccessBlocked } from './account-access-policy';

export class AccountOwnershipError extends Error {
  readonly status = 409;
}

/** Read before other transaction writes; owner and acting staff must both be live. */
export async function readOwnershipAccounts(db: Firestore, transaction: Transaction, ownerUid: string, actorUid: string) {
  const accounts = await Promise.all([...new Set([ownerUid, actorUid])]
    .map(uid => transaction.get(db.collection('users').doc(uid))));
  for (const account of accounts) {
    if (!account.exists) throw new AccountOwnershipError('Account profile is incomplete.');
    if (isAccountAccessBlocked(account.data())) throw new AccountOwnershipError('This account is unavailable or scheduled for deletion. Organization creation is not allowed.');
  }
  return {
    owner: accounts[0],
    // Share a written document with deletion, not only an empty ownership query.
    // A concurrent deletion retries and sees the new organization, or creation
    // retries and sees deletionStatus=pending. Call only after all reads.
    fence() {
      for (const account of accounts) transaction.update(account.ref, { ownershipRevision: FieldValue.increment(1) });
    },
  };
}
