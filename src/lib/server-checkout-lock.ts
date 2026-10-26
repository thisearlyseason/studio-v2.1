import { assertManagedPlatformRequest, assertManagedCheckoutReady } from './stripe-managed-checkout';
import { randomUUID } from 'node:crypto';
import { isStandardTaxCheckout, validStandardTaxRequest, sameStandardTaxPolicy, isTaxLocationFailure, isDefiniteTaxLocationRejection } from './standard-checkout-tax';
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

class TaxPolicyMismatch extends CheckoutLifecycleError {
  constructor(readonly lock: CheckoutLock) {
    super('The previous checkout uses a different or unverified tax policy. Let that checkout expire or contact support before continuing.');
  }
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

async function clearFreshRejectedCheckout(db: Firestore, userRef: DocumentReference, expected: CheckoutLock) {
  await db.runTransaction(async transaction => {
    const current = (await transaction.get(userRef)).data()?.pendingCheckout as CheckoutLock | undefined;
    if (!sameAttempt(current, expected) || current?.sessionId || current?.expiresAt !== expected.expiresAt) return;
    transaction.update(userRef, { pendingCheckout: FieldValue.delete() });
  });
}

function customerId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  return typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string' && value.id ? value.id : null;
}

function assertSessionOwner(session: Stripe.Checkout.Session, userRef: DocumentReference, customer: unknown) {
  const expected = customerId(customer);
  if (!expected || session.metadata?.firebase_uid !== userRef.id || customerId(session.customer) !== expected || session.mode !== 'subscription') {
    throw new CheckoutLifecycleError('The pending checkout could not be verified for this account. Contact support before continuing.');
  }
}

async function assertCompletedSubscriptionEnded(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (session.status !== 'complete') return;
  const id = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  if (!id) throw busy();
  const subscription = await stripe.subscriptions.retrieve(id);
  const subscriptionCustomer = customerId(subscription.customer);
  if (!subscriptionCustomer || subscriptionCustomer !== customerId(session.customer) ||
      (subscription.metadata?.firebase_uid && subscription.metadata.firebase_uid !== session.metadata?.firebase_uid)) throw new CheckoutLifecycleError('The previous subscription ownership could not be verified.');
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
  if (!validStandardTaxRequest(request)) throw new CheckoutLifecycleError('Automatic tax checkout requires a USD subscription and buyer-provided billing address.');
  const db = userRef.firestore;
  for (let retry = 0; retry < 3; retry++) {
    let reservation: { lock: CheckoutLock; create: boolean; recover: boolean };
    try {
      reservation = await db.runTransaction(async transaction => {
        const profile = (await transaction.get(userRef)).data();
        assertAvailable(profile);
        const current = profile?.pendingCheckout as CheckoutLock | undefined;
        if (current && !sameStandardTaxPolicy(current.request, request)) throw new TaxPolicyMismatch(current);
        if (current?.sessionId) return { lock: current, create: false, recover: false };
        if (current) {
          // Legacy unknown outcomes cannot safely be discarded on a timer.
          if (!current.attemptId || !current.request) throw new CheckoutLifecycleError('A previous checkout has an unconfirmed outcome. Contact support to reconcile it before starting another checkout or deleting this account.');
          if (!Number.isFinite(current.expiresAt) || current.expiresAt! > Date.now()) throw busy();
          const lock = { ...current, expiresAt: Date.now() + 120_000 };
          transaction.update(userRef, { pendingCheckout: lock });
          return { lock, create: true, recover: true };
        }
        const attemptId = (request.managed_payments?.enabled === true ? 'checkout-attempt-managed-v4-' : isStandardTaxCheckout(request) ? 'checkout-attempt-standard-tax-v1-' : 'checkout-attempt-standard-v2-') + randomUUID();
        const lock: CheckoutLock = {
          key, attemptId, sessionId: null, expiresAt: Date.now() + 120_000,
          request: { ...request, expires_at: Math.floor(Date.now() / 1000) + 86400, metadata: { ...request.metadata, firebase_uid: userRef.id, checkout_attempt: attemptId } },
        };
        transaction.update(userRef, { pendingCheckout: lock });
        return { lock, create: true, recover: false };
      });
    } catch (error) {
      if (!(error instanceof TaxPolicyMismatch)) throw error;
      // Read-only terminal proof can release only this exact expired attempt.
      // Open/uncertain attempts stay fenced. Completed sessions also require
      // authoritative proof that their same-customer subscription has ended.
      const previous = error.lock;
      if (!previous.sessionId || !previous.request?.customer) throw error;
      const oldSession = await stripe.checkout.sessions.retrieve(previous.sessionId);
      assertSessionOwner(oldSession, userRef, previous.request.customer);
      if (oldSession.status === 'complete') await assertCompletedSubscriptionEnded(stripe, oldSession);
      else if (oldSession.status !== 'expired') throw error;
      await clearSettledCheckout(db, userRef, previous);
      continue;
    }
    const { lock, create, recover } = reservation;

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
      const olderOpenSessions: Stripe.Checkout.Session[] = [];
      do {
        const page = await stripe.checkout.sessions.list({ customer: String(lock.request!.customer), ...(!recover ? { status: 'open' as const } : {}), limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
        for (const old of page.data) {
          if (old.metadata?.checkout_attempt === lock.attemptId) recoveredSession = old;
          else if (old.status === 'open') {
            assertSessionOwner(old, userRef, lock.request!.customer);
            if (isStandardTaxCheckout(request) && (old.automatic_tax?.enabled !== true || old.managed_payments?.enabled === true || old.currency !== 'usd')) {
              throw new CheckoutLifecycleError('An older checkout has a different or unverified tax policy. Contact support to reconcile it before continuing.');
            }
            olderOpenSessions.push(old);
          }
        }
        cursor = page.has_more ? page.data.at(-1)?.id : undefined;
        if (page.has_more && !cursor) throw busy();
      } while (cursor);
      // Check every page before expiring any owned same-policy session. A legacy
      // tax-disabled session is held for explicit reconciliation, never replaced.
      if (recoveredSession) {
        assertSessionOwner(recoveredSession, userRef, lock.request!.customer);
        if (recoveredSession.status === 'expired' || recoveredSession.status === 'complete') {
          await assertCompletedSubscriptionEnded(stripe, recoveredSession);
          await clearSettledCheckout(db, userRef, lock);
          continue;
        }
        if (isStandardTaxCheckout(request) && (recoveredSession.automatic_tax?.enabled !== true || recoveredSession.managed_payments?.enabled === true || recoveredSession.currency !== 'usd')) {
          throw new CheckoutLifecycleError('The recovered checkout tax configuration could not be verified. Contact support before continuing.');
        }
      }
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
      if (recoveredSession) assertSessionOwner(recoveredSession, userRef, lock.request!.customer);
      for (const old of olderOpenSessions) await stripe.checkout.sessions.expire(old.id);
      try {
        session = recoveredSession ?? await stripe.checkout.sessions.create(lock.request!, { idempotencyKey: lock.attemptId! });
      } catch (error) {
        if (isStandardTaxCheckout(lock.request) && isTaxLocationFailure(error)) {
          // A definite first-create validation rejection cannot have created a
          // session. An uncertain recovery must retain its original attempt.
          if (!recover && isDefiniteTaxLocationRejection(error)) await clearFreshRejectedCheckout(db, userRef, lock);
          throw new CheckoutLifecycleError('Tax location could not be verified. Review your billing address before retrying.');
        }
        throw error;
      }
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
    // Tax/currency readiness is relevant only while a checkout can be used.
    // An owner-verified terminal session must not strand its exact old lock.
    if (session.status === 'expired' || session.status === 'complete') {
      await assertCompletedSubscriptionEnded(stripe, session);
      await clearSettledCheckout(db, userRef, lock);
      continue;
    }
    if (lock.request?.managed_payments?.enabled === true) {
      if (session.managed_payments?.enabled !== true) {
        if (session.status === 'open') await stripe.checkout.sessions.expire(session.id);
        throw new CheckoutLifecycleError('Managed checkout responsibility could not be verified.');
      }
      if (session.status === 'open') await assertManagedCheckoutReady(stripe, lock.request);
    }
    if (isStandardTaxCheckout(request)) {
      if (session.automatic_tax?.enabled !== true || session.managed_payments?.enabled === true || session.currency !== 'usd') {
        throw new CheckoutLifecycleError('The previous checkout tax configuration could not be verified. Contact support before continuing.');
      }
      if (session.automatic_tax.status === 'failed') throw new CheckoutLifecycleError('Tax calculation is unavailable. Please try again later.');
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
