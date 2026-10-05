import { PLAN_TEAM_LIMITS } from '@/lib/plan-catalog';

/**
 * Canonical Stripe Price ID → Plan mapping.
 * Single source of truth used by webhook, sync, and update routes.
 * DO NOT duplicate this map in individual route files.
 *
 * Hardcoded IDs are the real production Stripe price IDs and serve as
 * guaranteed fallbacks so the server never maps the wrong plan even when
 * NEXT_PUBLIC_* env vars aren't present in the Vercel server runtime.
 */

// ── Pro Team ────────────────────────────────────────────────────────────────
const priceTeamMonthly  = process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY  || 'price_1UGfFuKBufuw6n64PyvRIpCN';
const priceTeamAnnual   = process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL   || 'price_1UGfGdKBufuw6n64uU4o6BvH';

// ── Elite Teams ──────────────────────────────────────────────────────────────
const priceEliteMonthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY || 'price_1UGfI9KBufuw6n64VVUH8sJz';
const priceEliteAnnual  = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL  || 'price_1UGfIMKBufuw6n64o7Zj0Ldy';

// ── Elite League ─────────────────────────────────────────────────────────────
const priceLeagueMonthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY
  || process.env.STRIPE_PRICE_ELITE_LEAGUE_MONTHLY
  || 'price_1UGfJdKBufuw6n649i1aozYQ';
const priceLeagueAnnual  = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL
  || process.env.STRIPE_PRICE_ELITE_LEAGUE_ANNUAL
  || 'price_1UGfOQKBufuw6n645TRvzBuJ';

// ── Schools Plan ─────────────────────────────────────────────────────────────
const priceSchoolMonthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY
  || process.env.STRIPE_PRICE_SCHOOLS_MONTHLY
  || 'price_1UGfKIKBufuw6n64riJUjIMm';
const priceSchoolAnnual  = process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL
  || process.env.STRIPE_PRICE_SCHOOLS_ANNUAL
  || 'price_1UGfKYKBufuw6n64tGfjDO0q';

export const PLAN_PRICE_MAP: Record<string, { id: string; teamLimit: number }> = {
  // Pro Team — Monthly & Annual
  [priceTeamMonthly]:   { id: 'team',   teamLimit: PLAN_TEAM_LIMITS.team },
  [priceTeamAnnual]:    { id: 'team',   teamLimit: PLAN_TEAM_LIMITS.team },
  // Elite Teams — Monthly & Annual
  [priceEliteMonthly]:  { id: 'elite',  teamLimit: PLAN_TEAM_LIMITS.elite },
  [priceEliteAnnual]:   { id: 'elite',  teamLimit: PLAN_TEAM_LIMITS.elite },
  // Elite League — Monthly & Annual
  [priceLeagueMonthly]: { id: 'league', teamLimit: PLAN_TEAM_LIMITS.league },
  [priceLeagueAnnual]:  { id: 'league', teamLimit: PLAN_TEAM_LIMITS.league },
  // Schools Plan — Monthly & Annual
  [priceSchoolMonthly]: { id: 'school', teamLimit: 15 },
  [priceSchoolAnnual]:  { id: 'school', teamLimit: 15 },
};

// Extra Team add-on price IDs
export const EXTRA_TEAM_PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_EXTRA_TEAM_MONTHLY || 'price_1UGfLHKBufuw6n64SDWcVF9T',
  annual:  process.env.STRIPE_PRICE_EXTRA_TEAM_ANNUAL  || 'price_1UGfLnKBufuw6n64DS2JS5D3',
};

// All known valid price IDs (used for input validation in API routes)
export const ALL_KNOWN_PRICE_IDS = new Set<string>([
  ...Object.keys(PLAN_PRICE_MAP),
  EXTRA_TEAM_PRICE_IDS.monthly,
  EXTRA_TEAM_PRICE_IDS.annual,
]);

export const PRICE_BILLING_CYCLE: Record<string, 'monthly' | 'annual'> = {
  [priceTeamMonthly]: 'monthly',
  [priceTeamAnnual]: 'annual',
  [priceEliteMonthly]: 'monthly',
  [priceEliteAnnual]: 'annual',
  [priceLeagueMonthly]: 'monthly',
  [priceLeagueAnnual]: 'annual',
  [priceSchoolMonthly]: 'monthly',
  [priceSchoolAnnual]: 'annual',
  [EXTRA_TEAM_PRICE_IDS.monthly]: 'monthly',
  [EXTRA_TEAM_PRICE_IDS.annual]: 'annual',
};

export function priceMatchesBillingCycle(
  priceId: string,
  billingCycle: 'monthly' | 'annual'
): boolean {
  return PRICE_BILLING_CYCLE[priceId] === billingCycle;
}


// New purchases use only the current catalog. Legacy IDs remain readable for
// webhook retries and subscription reconciliation after the USD migration.
export const ACTIVE_PLAN_PRICE_IDS = new Set(Object.keys(PLAN_PRICE_MAP));

const LEGACY_PLAN_PRICES = [
  ['team', 'price_1TkoThKBufuw6n64Sog2etTW', 'price_1TkoThKBufuw6n64mYRDuvZW'],
  ['elite', 'price_1TkoTkKBufuw6n64mvg7vMYn', 'price_1TkoTkKBufuw6n643n99DamX'],
  ['league', 'price_1TkoThKBufuw6n64L4x3xEVi', 'price_1TkoThKBufuw6n642AnfApmr'],
  ['school', 'price_1TkoTgKBufuw6n64GqNmtP8b', 'price_1TkoThKBufuw6n64o6AokUc1'],
  ['team', 'price_1TL4qyGu1UxxOYbPen5QOIJv', 'price_1TL4qyGu1UxxOYbPxrnZKSd4'],
  ['elite', 'price_1TL4vCGu1UxxOYbPc9MX6y8L', 'price_1TL4vCGu1UxxOYbPxiAlj9Jc'],
  ['league', 'price_1TL55yGu1UxxOYbPcQvc6AZV', 'price_1TL55yGu1UxxOYbPV7zlMKCQ'],
  ['school', 'price_1TL58qGu1UxxOYbPOUPCAqdz', 'price_1TL58qGu1UxxOYbPWXLqlsyB'],
] as const;

for (const [plan, monthly, annual] of LEGACY_PLAN_PRICES) {
  PLAN_PRICE_MAP[monthly] = { id: plan, teamLimit: PLAN_TEAM_LIMITS[plan] };
  PLAN_PRICE_MAP[annual] = { id: plan, teamLimit: PLAN_TEAM_LIMITS[plan] };
  PRICE_BILLING_CYCLE[monthly] = 'monthly';
  PRICE_BILLING_CYCLE[annual] = 'annual';
  ALL_KNOWN_PRICE_IDS.add(monthly);
  ALL_KNOWN_PRICE_IDS.add(annual);
}

const LEGACY_EXTRA_TEAM_PRICES = [
  ['price_1TkoTgKBufuw6n64twN6yAq3', 'price_1TkoThKBufuw6n648enquQ8a'],
  ['price_1TL5HSGu1UxxOYbPiidFB9NB', 'price_1TL5HSGu1UxxOYbPl0Gqarxg'],
] as const;

const extraTeamPriceIds = new Set(Object.values(EXTRA_TEAM_PRICE_IDS));
for (const [monthly, annual] of LEGACY_EXTRA_TEAM_PRICES) {
  extraTeamPriceIds.add(monthly);
  extraTeamPriceIds.add(annual);
  PRICE_BILLING_CYCLE[monthly] = 'monthly';
  PRICE_BILLING_CYCLE[annual] = 'annual';
  ALL_KNOWN_PRICE_IDS.add(monthly);
  ALL_KNOWN_PRICE_IDS.add(annual);
}

export function isExtraTeamPriceId(priceId: string): boolean {
  return extraTeamPriceIds.has(priceId);
}
