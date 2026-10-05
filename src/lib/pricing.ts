import { PLAN_TEAM_LIMITS } from '@/lib/plan-catalog';

export type BillingCycle = 'monthly' | 'annual';

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  teamLimit: number;
  monthlyPrice: string;
  annualPrice: string;
  monthlyPriceId: string;
  annualPriceId: string;
  highlight?: boolean;
  features: string[];
}

export const PRICING_CONFIG: Plan[] = [
  {
    id: 'team',
    name: 'Pro Team',
    description: 'Perfect for single competitive squads.',
    teamLimit: PLAN_TEAM_LIMITS.team,
    monthlyPrice: '$19.99',
    annualPrice: '$199',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY || 'price_1UGfFuKBufuw6n64PyvRIpCN',
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL || 'price_1UGfGdKBufuw6n64uU4o6BvH',
    features: [
      '1 Pro Team Hub',
      'Unlimited Athlete Profiles',
      'Advanced Tournament Management',
      'Payments & Document Signing',
      'Analytics & Stats'
    ],
    highlight: true
  },
  {
    id: 'elite',
    name: 'Elite Teams',
    description: 'For growing clubs with multiple squads.',
    teamLimit: PLAN_TEAM_LIMITS.elite,
    monthlyPrice: '$119',
    annualPrice: '$1,119',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY || 'price_1UGfI9KBufuw6n64VVUH8sJz',
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL || 'price_1UGfIMKBufuw6n64o7Zj0Ldy',
    features: [
      'Up to 8 Pro Team Hubs',
      'Master Club Management Dashboard',
      'League & Tournament Architect',
      'Staff Role Management',
      'Priority Infrastructure',
      'Add additional teams at a discounted rate'
    ]
  },
  {
    id: 'league',
    name: 'Elite League',
    description: 'Institutional scale for series and leagues.',
    teamLimit: PLAN_TEAM_LIMITS.league,
    monthlyPrice: '$279',
    annualPrice: '$2,790',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY || process.env.STRIPE_PRICE_ELITE_LEAGUE_MONTHLY || 'price_1UGfJdKBufuw6n649i1aozYQ',
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL || process.env.STRIPE_PRICE_ELITE_LEAGUE_ANNUAL || 'price_1UGfOQKBufuw6n645TRvzBuJ',
    features: [
      'Up to 18 Pro Team Hubs',
      'League Series Architect',
      'Global Tournament Hosting',
      'Advanced League Standings & Reporting',
      'Institutional Support',
      'Add additional teams at a discounted rate'
    ]
  },
  {
    id: 'school',
    name: 'Schools Plan',
    description: 'For schools and nonprofit sports programs.',
    teamLimit: PLAN_TEAM_LIMITS.school,
    monthlyPrice: '$175',
    annualPrice: '$1,750',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY || process.env.STRIPE_PRICE_SCHOOLS_MONTHLY || 'price_1UGfKIKBufuw6n64riJUjIMm',
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL || process.env.STRIPE_PRICE_SCHOOLS_ANNUAL || 'price_1UGfKYKBufuw6n64tGfjDO0q',
    features: [
      '15 Pro Squad Hubs Included',
      'Athletic Director Dashboard',
      'Academic Eligibility Sync',
      'Multi-Squad Logistical Support',
      'Need more? Add extra squads at the lowest per-squad rate on the platform'
    ]
  }
];

export const EXTRA_TEAM_CONFIG = {
  monthlyPriceId: process.env.STRIPE_PRICE_EXTRA_TEAM_MONTHLY || 'price_1UGfLHKBufuw6n64SDWcVF9T',
  annualPriceId: process.env.STRIPE_PRICE_EXTRA_TEAM_ANNUAL || 'price_1UGfLnKBufuw6n64DS2JS5D3',
  monthlyPrice: '$15.99',
  annualPrice: '$159'
};
