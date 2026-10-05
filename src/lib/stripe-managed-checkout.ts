import type Stripe from 'stripe';
import { ACTIVE_PLAN_PRICE_IDS, EXTRA_TEAM_PRICE_IDS } from './stripe-price-map';
import { assertManagedProviderLocation } from './managed-tax-coverage';

// Server-only opt-in for the platform's own SaaS. Connect callers never import
// this module. Existing subscriptions retain their original payment mode.
export const MANAGED_SAAS_FLOW = 'platform_saas_managed_v1';
export class ManagedCheckoutUnavailable extends Error { readonly status = 409; }
export function managedSaasEnabled() {
  return process.env.SQUAD_STRIPE_MANAGED_PAYMENTS_ENABLED === 'true';
}
export function managedSubscriptionChangesEnabled() {
  return process.env.SQUAD_STRIPE_MANAGED_SUBSCRIPTION_CHANGES_ENABLED === 'true';
}
export function managedSaasMetadata(): Record<string, string> {
  return managedSaasEnabled() ? { squad_payment_flow: MANAGED_SAAS_FLOW } : {};
}
export function platformSaasCheckoutParameters(): Stripe.Checkout.SessionCreateParams {
  if (!managedSaasEnabled()) return { managed_payments: { enabled: false }, adaptive_pricing: { enabled: false } };
  if (process.env.SQUAD_STRIPE_AUTOMATIC_TAX_ENABLED === 'true') {
    throw new ManagedCheckoutUnavailable('Conflicting payment responsibility settings.');
  }
  return { managed_payments: { enabled: true } };
}
export function assertManagedPlatformRequest(request: Stripe.Checkout.SessionCreateParams) {
  if (request.managed_payments?.enabled !== true) return;
  if (!managedSubscriptionChangesEnabled() && request.line_items?.some(item =>
    Object.values(EXTRA_TEAM_PRICE_IDS).includes(String(item.price)))) {
    throw new ManagedCheckoutUnavailable('Managed extra squad slots are temporarily unavailable.');
  }
  const data = request.subscription_data;
  const prices = new Set([...ACTIVE_PLAN_PRICE_IDS, ...Object.values(EXTRA_TEAM_PRICE_IDS)]);
  if (request.mode !== 'subscription' || request.currency !== 'usd' ||
      request.metadata?.squad_payment_flow !== MANAGED_SAAS_FLOW ||
      data?.metadata?.squad_payment_flow !== MANAGED_SAAS_FLOW ||
      data?.transfer_data || data?.on_behalf_of || data?.application_fee_percent != null ||
      request.payment_intent_data || request.automatic_tax || request.adaptive_pricing || request.customer_update ||
      !request.line_items?.length || request.line_items.some(item => !item.price || !prices.has(item.price))) {
    throw new ManagedCheckoutUnavailable('Managed checkout is restricted to platform SaaS subscriptions.');
  }
}
export async function assertManagedCheckoutReady(stripe: Stripe, request: Stripe.Checkout.SessionCreateParams) {
  if (request.managed_payments?.enabled !== true) return;
  assertManagedPlatformRequest(request);
  if (!managedSaasEnabled()) throw new ManagedCheckoutUnavailable('Managed checkout rollout is paused.');
  await assertManagedProviderLocation(stripe, String(request.customer));
}
export function expectsManaged(subscription: Stripe.Subscription) {
  return subscription.managed_payments?.enabled === true || subscription.metadata?.squad_payment_flow === MANAGED_SAAS_FLOW;
}
export async function assertManagedSubscriptionChange(stripe: Stripe, subscription: Stripe.Subscription) {
  if (!expectsManaged(subscription)) return;
  if (!managedSaasEnabled()) throw new ManagedCheckoutUnavailable('Managed subscription changes are paused.');
  if (!managedSubscriptionChangesEnabled()) throw new ManagedCheckoutUnavailable('Managed plan changes and extra squad slots are temporarily unavailable.');
  await assertManagedReceipt(stripe, subscription);
}
export async function assertManagedReceipt(stripe: Stripe, subscription: Stripe.Subscription) {
  if (!expectsManaged(subscription)) return;
  if (subscription.managed_payments?.enabled !== true || subscription.on_behalf_of || subscription.transfer_data || subscription.application_fee_percent != null) {
    throw new ManagedCheckoutUnavailable('Managed subscription responsibility could not be verified.');
  }
  if (!subscription.automatic_tax?.enabled || !subscription.latest_invoice) {
    throw new ManagedCheckoutUnavailable('Managed invoice tax calculation is unavailable.');
  }
  const invoice = typeof subscription.latest_invoice === 'string'
    ? await stripe.invoices.retrieve(subscription.latest_invoice) : subscription.latest_invoice;
  const country = invoice.customer_address?.country;
  if (!invoice.automatic_tax?.enabled || invoice.automatic_tax.status !== 'complete' || !country) {
    throw new ManagedCheckoutUnavailable('Managed invoice tax calculation is incomplete.');
  }
  const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  await assertManagedProviderLocation(stripe, customer, country);
}

export { ManagedCoverageUnavailable } from './managed-tax-coverage';

// Read the existing default configuration only; never change provider settings.
export async function managedPortalAccess(stripe: Stripe, subscription: Stripe.Subscription) {
  if (!expectsManaged(subscription) || (managedSaasEnabled() && managedSubscriptionChangesEnabled())) {
    return { portalAllowed: true, paymentMethodUpdateAllowed: true, configuration: undefined as string | undefined };
  }
  const configurations = await stripe.billingPortal.configurations.list({ active: true, is_default: true, limit: 1 });
  const configuration = configurations.data[0];
  if (!configuration || !configuration.active || !configuration.is_default) {
    return { portalAllowed: false, paymentMethodUpdateAllowed: false, configuration: undefined as string | undefined };
  }
  return {
    portalAllowed: configuration.features.subscription_update.enabled === false,
    paymentMethodUpdateAllowed: configuration.features.payment_method_update.enabled === true,
    configuration: configuration.id,
  };
}
