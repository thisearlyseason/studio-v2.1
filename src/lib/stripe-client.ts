/**
 * Shared Stripe client factory.
 * Throws hard if STRIPE_SECRET_KEY is not set — prevents silent billing failures.
 */
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === 'sk_test_dummy') {
    throw new Error(
      '[Stripe] STRIPE_SECRET_KEY is not configured. ' +
      'Set it in your environment variables before processing payments.'
    );
  }

  _stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' });
  return _stripe;
}
