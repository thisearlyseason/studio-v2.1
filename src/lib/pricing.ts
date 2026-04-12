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
    name: 'Individual Team',
    description: 'Perfect for single competitive squads.',
    teamLimit: 1,
    monthlyPrice: '$19.99',
    annualPrice: '$199',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY || 'price_1TL4qyGu1UxxOYbPen5QOIJv',
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL || 'price_1TL4qyGu1UxxOYbPxrnZKSd4',
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
    teamLimit: 8,
    monthlyPrice: '$119',
    annualPrice: '$1,119',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY || 'price_1TL4vCGu1UxxOYbPc9MX6y8L',
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL || 'price_1TL4vCGu1UxxOYbPxiAlj9Jc',
    features: [
      'Up to 8 Pro Team Hubs',
      'Master Club Management Dashboard',
      'League & Tournament Architect',
      'Staff Role Management',
      'Priority Infrastructure'
    ]
  },
  {
    id: 'league',
    name: 'Elite League',
    description: 'Institutional scale for series and leagues.',
    teamLimit: 18,
    monthlyPrice: '$279',
    annualPrice: '$2,790',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY || 'REQUIRED_CONFIG',
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL || 'REQUIRED_CONFIG',
    features: [
      'Up to 18 Pro Team Hubs',
      'League Series Architect',
      'Global Tournament Hosting',
      'Brand White-labeling',
      'Institutional Support'
    ]
  },
  {
    id: 'school',
    name: 'Schools Plan',
    description: 'K-12 Athletic Department command center.',
    teamLimit: 10,
    monthlyPrice: '$175',
    annualPrice: '$1,750',
    monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY || 'REQUIRED_CONFIG',
    annualPriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL || 'REQUIRED_CONFIG',
    features: [
      'Up to 10 Pro Team Hubs',
      'Athletic Director Dashboard',
      'Academic Eligibility Sync',
      'Multi-Squad Logistical Support',
      'Unlimited Programs'
    ]
  }
];

export const EXTRA_TEAM_CONFIG = {
  monthlyPriceId: process.env.STRIPE_PRICE_EXTRA_TEAM_MONTHLY || 'price_1TL5HSGu1UxxOYbPiidFB9NB',
  annualPriceId: process.env.STRIPE_PRICE_EXTRA_TEAM_ANNUAL || 'price_1TL5HSGu1UxxOYbPl0Gqarxg',
  monthlyPrice: '$15.99',
  annualPrice: '$159'
};
