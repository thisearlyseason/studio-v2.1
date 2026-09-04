/**
 * Shared Stripe client factory.
 * Throws hard if STRIPE_SECRET_KEY is not set — prevents silent billing failures.
 */
import Stripe from 'stripe';
import { assertOutboundProviderAllowed } from '@/lib/server-outbound-provider-policy';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  assertOutboundProviderAllowed('stripe');
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === 'sk_test_dummy') {
    throw new Error(
      '[Stripe] STRIPE_SECRET_KEY is not configured. ' +
      'Set it in your Vercel environment variables.'
    );
  }

  // Do NOT hardcode apiVersion — let the installed stripe package use its own
  // supported default. Hardcoding an unsupported version causes 500 errors.
  _stripe = new Stripe(key);
  return _stripe;
}
