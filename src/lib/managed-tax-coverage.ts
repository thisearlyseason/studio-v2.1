import type Stripe from 'stripe';

// Snapshot of official cross-border coverage, 2026-10-02. This is NOT a
// statement that every transaction or every domestic seller is covered.
export const MANAGED_CROSS_BORDER_COUNTRIES = new Set(
  'CM EG GH KE NG UG ZA ZM ZW AM AU AZ BN GE HK ID IL IN JP KG KR KW KZ LA MO MY NP NZ PH QA SA SG TH TJ TR TW VN AL BY CH GB GI IS LI MD NO RS UA AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK BB BM KY MX VG CA US'.split(' ')
);
const SELLER_COUNTRIES = new Set('CA US AT BE BG CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IT LT LU LV MT NL NO PL PT RO SE SI SK AU HK JP SG'.split(' '));
export function managedTaxCountryCovered(seller: string | undefined, buyer: string | undefined, options: { businessBuyer?: boolean; registeredInSerbia?: boolean } = {}) {
  if (!seller || !buyer || !SELLER_COUNTRIES.has(seller)) return false;
  if (seller === buyer) {
    if (seller === 'JP') return false;
    if (seller === 'SG' && options.businessBuyer !== false) return false;
    return true;
  }
  if (buyer === 'RS' && options.registeredInSerbia !== false) return false;
  return MANAGED_CROSS_BORDER_COUNTRIES.has(buyer);
}
export class ManagedCoverageUnavailable extends Error {}
export async function assertManagedProviderLocation(stripe: Stripe, customerId: string, expectedCountry?: string) {
  const [seller, customer] = await Promise.all([stripe.accounts.retrieve(null), stripe.customers.retrieve(customerId)]);
  if (customer.deleted) throw new ManagedCoverageUnavailable('Billing customer unavailable.');
  const buyerCountry = customer.address?.country;
  // Canada/US is the initial market, not a universal foreign-buyer block.
  // Require provider-stored country declarations; actual Managed responsibility
  // and completed tax calculation are checked separately on provider receipts.
  if (!seller.country || !/^[A-Z]{2}$/.test(seller.country) ||
      !buyerCountry || !/^[A-Z]{2}$/.test(buyerCountry)) {
    throw new ManagedCoverageUnavailable('Declared seller and billing countries are required.');
  }
  if (expectedCountry && buyerCountry !== expectedCountry) {
    throw new ManagedCoverageUnavailable('The invoice billing country does not match the declared customer country.');
  }
  return buyerCountry;
}
