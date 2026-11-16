// Editorial comparison, checked against the linked official sources 2026-11-16.
// Describe the paid/free tradeoff honestly; missing documentation is not absence.
export const COMPETITOR_COMPARISONS = {
  teamsnap: {
    name: 'TeamSnap',
    summary: 'TeamSnap Classic offers free team management with optional paid plans. TeamSnap ONE is a paid organization platform with a custom quote. The Squad offers a free Starter plan and published organization tiers.',
    free: 'Classic: free team management, with optional paid upgrades.',
    paid: 'ONE: request an organization quote; registration, payments and team management are included.',
    fit: 'Stay with Classic if your team only needs its free tools. If your club already relies on ONE, compare your quote and current workflows with the included teams and tools in The Squad before moving.',
    sources: [{ label: 'TeamSnap official pricing and free-plan FAQ', url: 'https://www.teamsnap.com/pricing' }],
  },
  teamlinkt: {
    name: 'TeamLinkt',
    summary: 'TeamLinkt Core has no subscription charge for the organization and charges for payment processing. The Squad also has a free Starter plan, with paid Pro tools and organization subscriptions. A paid subscription is useful only if its tools and total cost fit your club.',
    free: 'Core: no subscription charge; registration, schedules, rosters and communication. Payment processing is charged separately.',
    paid: 'Optional Operations and Revenue add-ons are each $425/year; Full Platform is $795/year. Ask TeamLinkt for your processing rate.',
    fit: 'Core may be enough if it covers your registration and season workflow. Compare optional operations tools and processing costs with the Pro teams included in The Squad. Do not compare a subscription price alone with the full cost of collecting dues.',
    sources: [{ label: 'TeamLinkt official pricing and included features', url: 'https://teamlinkt.com/pricing' }],
  },
  spond: {
    name: 'Spond',
    summary: 'Spond offers a free app and club management solution for sports and activities. The Squad has a free Starter plan and paid plans for Pro team and organization tools. Start with the jobs your coaches and families actually need.',
    free: 'Free app and club management: events, invitations, messaging and member management.',
    paid: 'Check Spond’s current payment terms for your country before collecting fees; free software does not mean every transaction is free.',
    fit: 'Keep Spond if its event, messaging and club tools already cover your needs. Try The Squad demo if you want to test practice plans, digital waivers, auto-brackets and team management together. Check each required workflow before paying.',
    sources: [{ label: 'Spond official US product overview', url: 'https://www.spond.com/en-us/' }, { label: 'Spond payment features and terms', url: 'https://www.spond.com/en-us/payments/' }],
  },
} as const;
export type ComparisonSlug = keyof typeof COMPETITOR_COMPARISONS;
export function isComparisonSlug(value: string): value is ComparisonSlug { return Object.hasOwn(COMPETITOR_COMPARISONS, value); }
