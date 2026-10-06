import { assertManagedPlatformRequest, assertManagedCheckoutReady } from './stripe-managed-checkout';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { FieldValue, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { isAccountAccessBlocked } from './account-access-policy';
import { hasUnresolvedSubscription } from './checkout-policy';
import { getStripe } from './stripe-client';

type CheckoutLock = {
  key: string;
  attemptId?: string;
  sessionId?: string | null;
  expiresAt?: number;
  request?: Stripe.Checkout.SessionCreateParams;
};

export class CheckoutLifecycleError extends Error {
  readonly status = 409;
}

const busy = () => new CheckoutLifecycleError('A previous checkout is still being resolved. Please wait two minutes and retry checkout before deleting your account.');

function assertAvailable(profile: FirebaseFirestore.DocumentData | undefined) {
  if (!profile || isAccountAccessBlocked(profile)) throw new CheckoutLifecycleError('This account is unavailable or scheduled for deletion. Checkout cannot be started.');
  if (hasUnresolvedSubscription(profile)) throw new CheckoutLifecycleError('An active subscription already exists. Manage it from billing settings.');
}

function sameAttempt(current: CheckoutLock | undefined, expected: CheckoutLock) {
  return current?.key === expected.key && current?.attemptId === expected.attemptId && current?.sessionId === expected.sessionId;
}

async function clearSettledCheckout(db: Firestore, userRef: DocumentReference, expected: CheckoutLock) {
  await db.runTransaction(async transaction => {
    const profile = (await transaction.get(userRef)).data();
    if (!sameAttempt(profile?.pendingCheckout, expected)) return;
    transaction.update(userRef, { pendingCheckout: FieldValue.delete() });
  });
}

function assertSessionOwner(session: Stripe.Checkout.Session, userRef: DocumentReference, customer: unknown) {
  if (session.metadata?.firebase_uid !== userRef.id || session.customer !== customer || session.mode !== 'subscription') {
    throw new CheckoutLifecycleError('The pending checkout could not be verified for this account. Contact support before continuing.');
  }
}

async function assertCompletedSubscriptionEnded(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (session.status !== 'complete') return;
  const id = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!id) throw busy();
  const subscription = await stripe.subscriptions.retrieve(id);
  // Complete Checkout is not proof that a delayed payment has settled.
  if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
    throw new CheckoutLifecycleError('Cancel or resolve the subscription in billing settings before continuing.');
  }
}

/** expiresAt is a retry lease, NEVER evidence that a payment cannot complete.
 * The exact provider request is retained so an uncertain response is recoverable.
 */
export async function createCheckoutSessionWithLock(userRef: DocumentReference, key: string, request: Stripe.Checkout.SessionCreateParams, stripe: Stripe) {
  assertManagedPlatformRequest(request);
  const db = userRef.firestore;
  for (let retry = 0; retry < 3; retry++) {
    const { lock, create, recover } = await db.runTransaction(async transaction => {
      const profile = (await transaction.get(userRef)).data();
      assertAvailable(profile);
      const current = profile?.pendingCheckout as CheckoutLock | undefined;
      if (current?.sessionId) return { lock: current, create: false, recover: false };
      if (current) {
        // Legacy unknown outcomes cannot safely be discarded on a timer.
        if (!current.attemptId || !current.request) throw new CheckoutLifecycleError('A previous checkout has an unconfirmed outcome. Contact support to reconcile it before starting another checkout or deleting this account.');
        if (!Number.isFinite(current.expiresAt) || current.expiresAt! > Date.now()) throw busy();
        const lock = { ...current, expiresAt: Date.now() + 120_000 };
        transaction.update(userRef, { pendingCheckout: lock });
        return { lock, create: true, recover: true };
      }
      const attemptId = (request.managed_payments?.enabled === true ? 'checkout-attempt-managed-v4-' : 'checkout-attempt-standard-v2-') + randomUUID();
      const lock: CheckoutLock = {
        key, attemptId, sessionId: null, expiresAt: Date.now() + 120_000,
        request: { ...request, expires_at: Math.floor(Date.now() / 1000) + 86400, metadata: { ...request.metadata, firebase_uid: userRef.id, checkout_attempt: attemptId } },
      };
      transaction.update(userRef, { pendingCheckout: lock });
      return { lock, create: true, recover: false };
    });

    let session: Stripe.Checkout.Session;
    if (create) {
      if (!lock.request || lock.request.customer !== request.customer || lock.request.metadata?.firebase_uid !== userRef.id) {
        throw new CheckoutLifecycleError('The saved checkout does not belong to this account. Contact support before continuing.');
      }
      // Validate Managed readiness before touching any older payable sessions.
      // A fresh reservation has not reached Stripe yet, so a known validation
      // failure can safely release only this exact attempt. Recovery stays fenced.
      try {
        await assertManagedCheckoutReady(stripe, lock.request);
      } catch (error) {
        if (!recover) await clearSettledCheckout(db, userRef, lock);
        throw error;
      }
      // Recovering this same attempt must not expire its already-created session.
      // Paginate so older open checkouts cannot remain payable but untracked.
      let cursor: string | undefined;
      let recoveredSession: Stripe.Checkout.Session | undefined;
      do {
        const page = await stripe.checkout.sessions.list({ customer: String(lock.request!.customer), ...(!recover ? { status: 'open' as const } : {}), limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
        for (const old of page.data) {
          if (old.metadata?.checkout_attempt === lock.attemptId) recoveredSession = old;
          else if (old.status === 'open') {
            assertSessionOwner(old, userRef, lock.request!.customer);
            await stripe.checkout.sessions.expire(old.id);
          }
        }
        cursor = page.has_more ? page.data.at(-1)?.id : undefined;
        if (page.has_more && !cursor) throw busy();
      } while (cursor);
      // No catch-time release: a timeout can happen AFTER Stripe creates it.
      if (!recoveredSession && Number(lock.request!.expires_at) <= Date.now() / 1000) throw new CheckoutLifecycleError('The previous checkout needs support reconciliation before it can be retried or the account deleted.');
      if (!recoveredSession) {
        // Existing documents predate the tightened create rules. Never turn a
        // client-forged request into privileged provider parameters. Only the
        // current route's validated parameters may create/replay a session.
        const saved = { ...lock.request!, metadata: { ...lock.request!.metadata } };
        delete saved.expires_at;
        delete saved.metadata.checkout_attempt;
        const expected = { ...request, metadata: { ...request.metadata, firebase_uid: userRef.id } };
        delete expected.expires_at;
        // Pre-migration reservations retain their exact omitted mode and old
        // provider key. Permit only this known schema addition; all other saved
        // parameters still require equality with the validated route request.
        if (!Object.hasOwn(saved, 'managed_payments') && expected.managed_payments?.enabled === false) {
          delete expected.managed_payments;
        }
        // An unresolved standard attempt keeps its exact original request/key.
        if (request.managed_payments?.enabled === true && saved.managed_payments?.enabled !== true && !lock.attemptId?.startsWith('checkout-attempt-managed-v4-')) {
          if (Object.hasOwn(saved, 'managed_payments')) expected.managed_payments = { enabled: false };
          else delete expected.managed_payments;
          expected.adaptive_pricing = { enabled: false };
          delete (expected.metadata as Stripe.MetadataParam).squad_payment_flow;
          expected.subscription_data = { ...expected.subscription_data, metadata: { ...expected.subscription_data?.metadata } };
          delete expected.subscription_data.metadata!.squad_payment_flow;
        }
        if (!isDeepStrictEqual(saved, expected)) throw new CheckoutLifecycleError('Retry the previous checkout selections to resolve that attempt, or contact support before deleting your account.');
      }
      session = recoveredSession ?? await stripe.checkout.sessions.create(lock.request!, { idempotencyKey: lock.attemptId! });
      await db.runTransaction(async transaction => {
        const profile = (await transaction.get(userRef)).data();
        if (!profile || isAccountAccessBlocked(profile) || profile.pendingCheckout?.attemptId !== lock.attemptId) throw busy();
        transaction.update(userRef, { pendingCheckout: { ...lock, sessionId: session.id, expiresAt: session.expires_at * 1000 } });
      });
      lock.sessionId = session.id;
    } else {
      session = await stripe.checkout.sessions.retrieve(lock.sessionId!);
    }
    assertSessionOwner(session, userRef, lock.request?.customer ?? request.customer);
    if (lock.request?.managed_payments?.enabled === true) {
      if (session.managed_payments?.enabled !== true) {
        if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
        throw new CheckoutLifecycleError('Managed checkout responsibility could not be verified.');
      }
      if (session.status === 'open') await assertManagedCheckoutReady(stripe, lock.request);
    }
    if (session.status === 'open' && lock.key === key && session.url) return session;
    if (session.status === 'open') session = await stripe.checkout.sessions.expire(session.id);
    await assertCompletedSubscriptionEnded(stripe, session);
    if (session.status !== 'expired' && session.status !== 'complete') throw busy();
    await clearSettledCheckout(db, userRef, lock);
  }
  throw busy();
}

/** User-authorized deletion may expire unpaid Checkout, never cancel/refund a
 * paid subscription. Provider failure leaves the account enabled and fenced.
 */
export async function resolveCheckoutForDeletion(db: Firestore, userRef: DocumentReference) {
  const profile = (await userRef.get()).data();
  const lock = profile?.pendingCheckout as CheckoutLock | undefined;
  if (!lock) return;
  if (!lock.sessionId) throw busy();
  const stripe = getStripe();
  let session = await stripe.checkout.sessions.retrieve(lock.sessionId);
  assertSessionOwner(session, userRef, profile?.stripe_customer_id);
  if (session.status === 'open') session = await stripe.checkout.sessions.expire(session.id);
  await assertCompletedSubscriptionEnded(stripe, session);
  if (session.status !== 'expired' && session.status !== 'complete') throw busy();
  await clearSettledCheckout(db, userRef, lock);
}
