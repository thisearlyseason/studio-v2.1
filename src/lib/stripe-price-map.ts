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
const priceTeamMonthly  = process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY  || 'price_1TL4qyGu1UxxOYbPen5QOIJv';
const priceTeamAnnual   = process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL   || 'price_1TL4qyGu1UxxOYbPxrnZKSd4';

// ── Elite Teams ──────────────────────────────────────────────────────────────
const priceEliteMonthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY || 'price_1TL4vCGu1UxxOYbPc9MX6y8L';
const priceEliteAnnual  = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL  || 'price_1TL4vCGu1UxxOYbPxiAlj9Jc';

// ── Elite League ─────────────────────────────────────────────────────────────
const priceLeagueMonthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY
  || process.env.STRIPE_PRICE_ELITE_LEAGUE_MONTHLY
  || 'price_1TL55yGu1UxxOYbPcQvc6AZV';
const priceLeagueAnnual  = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL
  || process.env.STRIPE_PRICE_ELITE_LEAGUE_ANNUAL
  || 'price_1TL55yGu1UxxOYbPV7zlMKCQ';

// ── Schools Plan ─────────────────────────────────────────────────────────────
const priceSchoolMonthly = process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY
  || process.env.STRIPE_PRICE_SCHOOLS_MONTHLY
  || 'price_1TL58qGu1UxxOYbPOUPCAqdz';
const priceSchoolAnnual  = process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL
  || process.env.STRIPE_PRICE_SCHOOLS_ANNUAL
  || 'price_1TL58qGu1UxxOYbPWXLqlsyB';

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
  [priceSchoolMonthly]: { id: 'school', teamLimit: PLAN_TEAM_LIMITS.school },
  [priceSchoolAnnual]:  { id: 'school', teamLimit: PLAN_TEAM_LIMITS.school },
};

// Extra Team add-on price IDs
export const EXTRA_TEAM_PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_EXTRA_TEAM_MONTHLY || 'price_1TL5HSGu1UxxOYbPiidFB9NB',
  annual:  process.env.STRIPE_PRICE_EXTRA_TEAM_ANNUAL  || 'price_1TL5HSGu1UxxOYbPl0Gqarxg',
};

// All known valid price IDs (used for input validation in API routes)
export const ALL_KNOWN_PRICE_IDS = new Set<string>([
  ...Object.keys(PLAN_PRICE_MAP),
  EXTRA_TEAM_PRICE_IDS.monthly,
  EXTRA_TEAM_PRICE_IDS.annual,
]);
