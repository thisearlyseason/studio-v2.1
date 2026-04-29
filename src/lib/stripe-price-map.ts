/**
 * Canonical Stripe Price ID → Plan mapping.
 * Single source of truth used by webhook, sync, and update routes.
 * DO NOT duplicate this map in individual route files.
 */
export const PLAN_PRICE_MAP: Record<string, { id: string; teamLimit: number }> = {
  // Pro Team — Monthly & Annual
  'price_1TL4qyGu1UxxOYbPen5QOIJv': { id: 'team', teamLimit: 1 },
  'price_1TL4qyGu1UxxOYbPxrnZKSd4': { id: 'team', teamLimit: 1 },
  // Elite Teams — Monthly & Annual
  'price_1TL4vCGu1UxxOYbPc9MX6y8L': { id: 'elite', teamLimit: 8 },
  'price_1TL4vCGu1UxxOYbPxiAlj9Jc': { id: 'elite', teamLimit: 8 },
  // Elite League — Monthly & Annual
  'price_1TL55yGu1UxxOYbPcQvc6AZV': { id: 'league', teamLimit: 18 },
  'price_1TL55yGu1UxxOYbPV7zlMKCQ': { id: 'league', teamLimit: 18 },
  // Schools Plan — Monthly & Annual
  'price_1TL58qGu1UxxOYbPOUPCAqdz': { id: 'school', teamLimit: 10 },
  'price_1TL58qGu1UxxOYbPWXLqlsyB': { id: 'school', teamLimit: 10 },
};

// Extra Team add-on price IDs
export const EXTRA_TEAM_PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_EXTRA_TEAM_MONTHLY || 'price_1TL5HSGu1UxxOYbPiidFB9NB',
  annual:  process.env.STRIPE_PRICE_EXTRA_TEAM_ANNUAL  || 'price_1TL5HSGu1UxxOYbPl0Gqarxg',
};

// All known valid price IDs (used for input validation)
export const ALL_KNOWN_PRICE_IDS = new Set<string>([
  ...Object.keys(PLAN_PRICE_MAP),
  EXTRA_TEAM_PRICE_IDS.monthly,
  EXTRA_TEAM_PRICE_IDS.annual,
]);
