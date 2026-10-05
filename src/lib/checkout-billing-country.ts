import type Stripe from 'stripe';

export const BILLING_COUNTRY_CODES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');
const countryCodes = new Set(BILLING_COUNTRY_CODES);

export class BillingCountryDeclarationError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) { super(message); }
}

function declaredCountry(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !countryCodes.has(value)) {
    throw new BillingCountryDeclarationError('Choose a valid billing country.', 'BILLING_COUNTRY_INVALID');
  }
  return value;
}
function requireCountry(country: string | undefined): string {
  if (!country) throw new BillingCountryDeclarationError(
    'Choose your billing country, then select your plan again. Use the same country in Checkout.',
    'BILLING_COUNTRY_REQUIRED'
  );
  return country;
}

// Standard checkout ignores this declaration. Managed checkout uses only an
// explicit buyer declaration or an existing provider-stored billing country.
// This records country; it does not infer an address or tax eligibility.
export async function prepareCheckoutBillingCountry({ enabled, stripe, customerId, userId, billingCountry }: {
  enabled: boolean;
  stripe: Pick<Stripe, 'customers'>;
  customerId: string | null;
  userId: string;
  billingCountry: unknown;
}): Promise<{ newAddress?: Stripe.CustomerCreateParams['address']; existingAddress?: Stripe.CustomerUpdateParams['address'] }> {
  if (!enabled) return {};
  const declaration = declaredCountry(billingCountry);
  if (!customerId) return { newAddress: { country: requireCountry(declaration) } };
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) throw new BillingCountryDeclarationError('Billing customer unavailable.', 'BILLING_CUSTOMER_UNAVAILABLE', 409);
  const storedCountry = customer.address?.country;
  if (storedCountry && countryCodes.has(storedCountry)) {
    if (declaration && declaration !== storedCountry) throw new BillingCountryDeclarationError(
      'Your declaration differs from your saved billing country. Update your billing details before checkout.',
      'BILLING_COUNTRY_CONFLICT', 409
    );
    return {};
  }
  const country = requireCountry(declaration);
  if (customer.metadata.firebase_uid !== userId) throw new BillingCountryDeclarationError(
    'Billing customer ownership could not be verified.', 'BILLING_CUSTOMER_UNVERIFIED', 403
  );
  const address = Object.fromEntries(Object.entries(customer.address || {}).filter(([, value]) => typeof value === 'string'));
  return { existingAddress: { ...address, country } };
}
