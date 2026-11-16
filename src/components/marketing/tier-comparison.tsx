'use client';
import { PRICING_CONFIG, EXTRA_TEAM_CONFIG } from '@/lib/pricing';
import { PLAN_TEAM_LIMITS } from '@/lib/plan-catalog';
import { useBillingDisplayPrices } from '@/lib/use-billing-display-prices';
import type { DisplayPrice } from '@/lib/billing-display-price';

function annualSaving(monthly?: DisplayPrice, annual?: DisplayPrice) {
  if (!monthly || !annual || monthly.currency !== annual.currency || monthly.interval !== 'month' || annual.interval !== 'year' || monthly.amount <= 0 || annual.amount >= monthly.amount * 12) return null;
  return Math.floor((1 - annual.amount / (monthly.amount * 12)) * 100);
}
export function AnnualSavings() {
  const prices = useBillingDisplayPrices();
  const plan = PRICING_CONFIG.find(p => p.id === 'team')!;
  const saving = annualSaving(prices.quote(plan.monthlyPriceId), prices.quote(plan.annualPriceId));
  return saving ? <span className="text-xs text-white/80 px-2">Save {saving}% on Squad Pro with annual billing</span> : null;
}
export function ClubValueAnchor() {
  const prices = useBillingDisplayPrices();
  const team = PRICING_CONFIG.find(p => p.id === 'team')!;
  const elite = PRICING_CONFIG.find(p => p.id === 'elite')!;
  const single = prices.quote(team.monthlyPriceId), club = prices.quote(elite.monthlyPriceId);
  if (!single || !club || single.interval !== 'month' || club.interval !== 'month' || single.currency !== club.currency || club.amount >= single.amount * elite.teamLimit) return null;
  const saving = new Intl.NumberFormat('en', { style: 'currency', currency: club.currency, currencyDisplay: 'code' }).format(single.amount * elite.teamLimit - club.amount);
  return <p className="text-sm text-white/80">For {elite.teamLimit} Pro teams, save {saving}/month versus {elite.teamLimit} separate Squad Pro subscriptions on monthly billing.</p>;
}
export function TierComparison({ cycle = 'monthly' }: { cycle?: 'monthly' | 'annual' }) {
  const prices = useBillingDisplayPrices();
  return <section className="max-w-7xl mx-auto px-6 py-10 text-white" aria-labelledby="tier-heading">
    <h2 id="tier-heading" className="text-2xl font-bold mb-3">Compare the plans</h2>
    <p className="mb-4 text-sm text-white/70">Scroll horizontally to compare all five plans. Prices are per subscription; the row below shows included teams.</p>
    <div role="region" aria-label="Plan comparison" tabIndex={0} className="overflow-x-auto rounded-xl border border-white/20">
      <table className="w-full min-w-[850px] text-sm text-left"><caption className="sr-only">The Squad plan features and current billing prices</caption><thead><tr>{['Plan', 'Starter', 'Squad Pro', 'Elite Teams', 'Elite League', 'School District'].map(name => <th key={name} scope="col" className="p-4 border-b border-white/20">{name}</th>)}</tr></thead><tbody>
        <tr><th scope="row" className="p-4">{cycle === 'annual' ? 'Annual total' : 'Monthly total'}</th><td className="p-4">$0</td>{PRICING_CONFIG.map(plan => <td key={plan.id} className="p-4">{prices.label(cycle === 'annual' ? plan.annualPriceId : plan.monthlyPriceId)}/{cycle === 'annual' ? 'yr' : 'mo'}</td>)}</tr>
        <tr><th scope="row" className="p-4">Annual savings vs 12 months</th><td className="p-4">—</td>{PRICING_CONFIG.map(plan => { const saving = annualSaving(prices.quote(plan.monthlyPriceId), prices.quote(plan.annualPriceId)); return <td key={plan.id} className="p-4">{saving === null ? 'See current prices' : `${saving}%`}</td>; })}</tr>
        <tr className="border-t border-white/10"><th scope="row" className="p-4">Additional team price</th><td className="p-4">Upgrade plan</td><td className="p-4">Upgrade plan</td>{['elite', 'league', 'school'].map(id => <td key={id} className="p-4">{prices.label(cycle === 'annual' ? EXTRA_TEAM_CONFIG.annualPriceId : EXTRA_TEAM_CONFIG.monthlyPriceId)}/{cycle === 'annual' ? 'yr' : 'mo'} per added team</td>)}</tr>
        {/* D4.3: Add a storage row only after per-plan caps are verified; the repo has no authoritative quota catalog. */}
        {[
          ['Included teams', String(PLAN_TEAM_LIMITS.free), String(PLAN_TEAM_LIMITS.team), String(PLAN_TEAM_LIMITS.elite), String(PLAN_TEAM_LIMITS.league), String(PLAN_TEAM_LIMITS.school)],
          ['Schedules, team chat, score tracking', 'Included', 'Included', 'Included', 'Included', 'Included'],
          ['Digital waivers, Stripe payments, auto-brackets', 'Upgrade to Pro', 'Included', 'Included', 'Included', 'Included'],
          ['Who manages the teams', 'Team staff', 'Team staff', 'Club hub and staff roles', 'League management and reporting', 'Athletic director dashboard'],
          ['Additional paid teams', 'Upgrade plan', 'Upgrade plan', 'Available', 'Available', 'Available'],
        ].map(([label, ...values]) => <tr key={label} className="border-t border-white/10"><th scope="row" className="p-4">{label}</th>{values.map((value, i) => <td key={i} className="p-4 text-white/80">{value}</td>)}</tr>)}
      </tbody></table>
    </div>
    <p className="mt-4 text-sm text-white/70">Annual prices are the full yearly charge. Stripe processing fees are separate. Review additional-team prices in Billing before adding teams; app-store prices and taxes may differ.</p>
  </section>;
}
