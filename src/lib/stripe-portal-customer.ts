import type Stripe from 'stripe';

type StripePortalClient = Pick<Stripe, 'customers' | 'subscriptions'>;

export type PortalCustomerUser = {
  email?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

export function buildStripeCustomerIdempotencyKey(
  userId: string,
  previousCustomerId: string | null | undefined
): string {
  return previousCustomerId
    ? `customer-${userId}-replacing-${previousCustomerId}`
    : `customer-${userId}-initial`;
}

function isMissingStripeResource(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 'resource_missing';
}

async function retrieveActiveCustomer(
  stripe: StripePortalClient,
  customerId: string | null | undefined
): Promise<Stripe.Customer | null> {
  if (!customerId) return null;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer.deleted ? null : customer;
  } catch (error) {
    if (isMissingStripeResource(error)) return null;
    throw error;
  }
}

/**
 * Resolves the Stripe customer behind a user, including accounts created before
 * stripe_customer_id was persisted and accounts carrying an obsolete ID.
 */
export async function resolvePortalCustomerId(
  stripe: StripePortalClient,
  userId: string,
  user: PortalCustomerUser
): Promise<string | null> {
  const storedCustomer = await retrieveActiveCustomer(stripe, user.stripe_customer_id);
  if (storedCustomer) return storedCustomer.id;

  if (user.stripe_subscription_id) {
    try {
      const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
      const subscriptionCustomerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;
      const subscriptionCustomer = await retrieveActiveCustomer(stripe, subscriptionCustomerId);
      if (subscriptionCustomer) return subscriptionCustomer.id;
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
      // Continue to metadata/email recovery for environment-migrated accounts.
    }
  }

  if (user.email) {
    try {
      const customers = await stripe.customers.list({ email: user.email, limit: 100 });
      const matchingCustomer = customers.data.find(
        customer => !customer.deleted && customer.metadata?.firebase_uid === userId
      );
      if (matchingCustomer) return matchingCustomer.id;
    } catch (error) {
      if (!isMissingStripeResource(error)) throw error;
    }
  }

  return null;
}
