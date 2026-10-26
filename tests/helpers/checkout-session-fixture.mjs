/** Synthetic provider response only; no Stripe requests or subscriptions. */
export function checkoutSessionFixture(id, params) {
  return {
    id, object: 'checkout.session', mode: params.mode, status: 'open', payment_status: 'unpaid',
    customer: params.customer, subscription: null, metadata: params.metadata,
    currency: params.currency,
    automatic_tax: { enabled: params.automatic_tax?.enabled === true, status: null },
    managed_payments: { enabled: params.managed_payments?.enabled === true },
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    url: 'https://checkout.stripe.com/test/' + id,
  };
}
