'use client';
import Link from 'next/link';
import { Check, Minus, ChevronDown, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
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
const COMPARISON_PLANS = [
  { id: 'free', name: 'Starter', audience: 'Get your team together', teams: PLAN_TEAM_LIMITS.free, management: 'Team staff', label: 'Start free' },
  { id: 'team', name: 'Squad Pro', audience: 'Everything for one team', teams: PLAN_TEAM_LIMITS.team, management: 'Team staff', label: 'Start Pro' },
  { id: 'elite', name: 'Elite Teams', audience: 'One home for your club', teams: PLAN_TEAM_LIMITS.elite, management: 'Club hub + staff roles', label: 'Start your club' },
  { id: 'league', name: 'Elite League', audience: 'Run the whole competition', teams: PLAN_TEAM_LIMITS.league, management: 'League tools + reporting', label: 'Start your league' },
  { id: 'school', name: 'School District', audience: 'Connect your school teams', teams: PLAN_TEAM_LIMITS.school, management: 'Athletic director hub', label: 'Start your school' },
];

function Included({ value }: { value: boolean }) {
  return value
    ? <Check className="mx-auto h-5 w-5 text-white/90" aria-label="Included" />
    : <Minus className="mx-auto h-4 w-4 text-white/25" aria-label="Not included" />;
}

export function TierComparison({ cycle = 'monthly' }: { cycle?: 'monthly' | 'annual' }) {
  const prices = useBillingDisplayPrices();
  const interval = cycle === 'annual' ? 'yr' : 'mo';
  const priceFor = (id: string) => {
    if (id === 'free') return '$0';
    const plan = PRICING_CONFIG.find(plan => plan.id === id)!;
    return prices.label(cycle === 'annual' ? plan.annualPriceId : plan.monthlyPriceId);
  };
  const savingsFor = (id: string) => {
    const plan = PRICING_CONFIG.find(plan => plan.id === id);
    return plan ? annualSaving(prices.quote(plan.monthlyPriceId), prices.quote(plan.annualPriceId)) : null;
  };
  const extraPrice = prices.label(cycle === 'annual' ? EXTRA_TEAM_CONFIG.annualPriceId : EXTRA_TEAM_CONFIG.monthlyPriceId);
  const columnClass = (id: string) => id === 'team' ? 'bg-primary/[0.09] border-x border-primary/25' : '';
  const rows = [
    { label: 'Teams included', note: 'Each team has its own workspace', values: COMPARISON_PLANS.map(plan => <span key={plan.id} className="text-xl font-black text-white">{plan.teams}<span className="ml-1.5 text-xs font-medium text-white/45">{plan.id === 'free' ? 'team' : plan.teams === 1 ? 'Pro team' : 'Pro teams'}</span></span>) },
    { label: 'Schedules, RSVPs & team chat', values: COMPARISON_PLANS.map(plan => <Included key={plan.id} value />) },
    { label: 'Score tracking', values: COMPARISON_PLANS.map(plan => <Included key={plan.id} value />) },
    { label: 'Digital waivers & signatures', values: COMPARISON_PLANS.map(plan => <Included key={plan.id} value={plan.id !== 'free'} />) },
    { label: 'Dues through Stripe Connect', values: COMPARISON_PLANS.map(plan => <Included key={plan.id} value={plan.id !== 'free'} />) },
    { label: 'Auto-brackets', values: COMPARISON_PLANS.map(plan => <Included key={plan.id} value={plan.id !== 'free'} />) },
    { label: 'Management workspace', values: COMPARISON_PLANS.map(plan => <span key={plan.id} className="text-xs font-medium leading-relaxed text-white/65">{plan.management}</span>) },
    { label: 'Add another Pro team', note: 'Beyond your included teams', values: COMPARISON_PLANS.map(plan => ['free', 'team'].includes(plan.id) ? <span key={plan.id} className="text-xs font-medium text-white/35">Choose an organization plan</span> : <span key={plan.id} className="text-xs font-semibold text-white/75">{extraPrice}<span className="block pt-1 font-normal text-white/40">/{interval} per extra team</span></span>) },
  ];

  return (
    <section className="relative z-10 mx-auto max-w-7xl px-5 pt-20 md:px-6" aria-labelledby="tier-heading">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.25em] text-red-400">The details, side by side</p>
          <h2 id="tier-heading" className="scroll-mt-28 text-3xl font-black tracking-tight text-white md:text-5xl">Compare the plans<span className="text-primary">.</span></h2>
        </div>
        <p className="max-w-sm text-sm font-normal leading-relaxed text-white/50">Start with what you need today.<br className="hidden md:block" /> There’s room for your next team, too.</p>
      </div>

      <div className="hidden overflow-hidden rounded-[28px] border border-white/10 bg-[#101010] shadow-2xl md:block">
        <div role="region" aria-label="Plan comparison" tabIndex={0} className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400">
          <table className="w-full min-w-[1020px] table-fixed border-collapse text-center">
            <caption className="sr-only">Compare The Squad plans, current {cycle} prices, included teams and features</caption>
            <colgroup><col className="w-[220px]" />{COMPARISON_PLANS.map(plan => <col key={plan.id} />)}</colgroup>
            <thead>
              <tr>
                <th scope="col" className="p-6 text-left align-bottom"><span className="text-[10px] font-bold uppercase tracking-widest text-white/35">{cycle === 'annual' ? 'Billed annually' : 'Billed monthly'}</span></th>
                {COMPARISON_PLANS.map(plan => (
                  <th key={plan.id} scope="col" className={cn('relative px-4 pb-7 pt-10 align-top', columnClass(plan.id))}>
                    {plan.id === 'team' && <span className="absolute inset-x-0 top-0 bg-primary px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-white">Best value for one team</span>}
                    <div className="text-sm font-black tracking-tight text-white">{plan.name}</div>
                    <div className="mt-2 min-h-9 text-[11px] font-normal leading-relaxed text-white/45">{plan.audience}</div>
                    <div className="mt-5 text-xl font-black tracking-tight text-white">{priceFor(plan.id)}</div>
                    <div className="mt-1 text-[10px] font-medium text-white/40">{plan.id === 'free' ? 'Free plan' : `per ${cycle === 'annual' ? 'year' : 'month'}`}</div>
                    <div className="mt-3 min-h-5 text-[10px] font-semibold text-red-400">{savingsFor(plan.id) ? `Save ${savingsFor(plan.id)}% annually` : ''}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.label} className="border-t border-white/[0.06] transition-colors hover:bg-white/[0.025]">
                  <th scope="row" className="px-6 py-5 text-left text-xs font-semibold leading-relaxed text-white/80">{row.label}{row.note && <span className="mt-1 block text-[10px] font-normal text-white/35">{row.note}</span>}</th>
                  {row.values.map((value, index) => <td key={COMPARISON_PLANS[index].id} className={cn('px-4 py-5', columnClass(COMPARISON_PLANS[index].id))}>{value}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-white/10"><th scope="row" className="px-6 py-6 text-left text-[10px] font-normal text-white/35">Your next season starts here.</th>{COMPARISON_PLANS.map(plan => <td key={plan.id} className={cn('px-3 py-6', columnClass(plan.id))}><Link href="/signup" className={cn('inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-[10px] font-bold transition-colors', plan.id === 'team' ? 'bg-primary text-white hover:bg-primary/85' : 'border border-white/15 text-white/80 hover:bg-white/10')}>{plan.label}<ArrowUpRight className="h-3.5 w-3.5 shrink-0" /></Link></td>)}</tr></tfoot>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {COMPARISON_PLANS.map(plan => (
          <details key={plan.id} open={plan.id === 'team'} className={cn('group overflow-hidden rounded-2xl border bg-[#101010]', plan.id === 'team' ? 'border-primary/60' : 'border-white/10')}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 [&::-webkit-details-marker]:hidden">
              <span>{plan.id === 'team' && <span className="mb-1.5 block text-[8px] font-black uppercase tracking-wider text-red-400">Best value for one team</span>}<span className="block text-base font-black text-white">{plan.name}</span><span className="mt-1 block text-[11px] font-normal text-white/45">{plan.audience}</span></span>
              <span className="flex shrink-0 items-center gap-3"><span className="text-right text-sm font-bold text-white">{priceFor(plan.id)}<span className="block text-[10px] font-normal text-white/40">{plan.id === 'free' ? 'Free' : `/${interval}`}</span></span><ChevronDown className="h-4 w-4 text-white/40 transition-transform group-open:rotate-180" /></span>
            </summary>
            <div className="border-t border-white/10 px-5 pb-5">
              <dl className="divide-y divide-white/[0.06]">{rows.map(row => <div key={row.label} className="flex items-center justify-between gap-6 py-3.5"><dt className="max-w-[55%] text-xs font-normal leading-relaxed text-white/55">{row.label}</dt><dd className="text-right">{row.values[COMPARISON_PLANS.indexOf(plan)]}</dd></div>)}</dl>
              {savingsFor(plan.id) !== null && <p className="mb-4 text-xs font-semibold text-red-400">Save {savingsFor(plan.id)}% with annual billing</p>}
              <Link href="/signup" className={cn('flex items-center justify-center gap-2 rounded-xl py-3.5 text-xs font-bold', plan.id === 'team' ? 'bg-primary text-white' : 'bg-white/10 text-white')}>{plan.label}<ArrowUpRight className="h-4 w-4" /></Link>
            </div>
          </details>
        ))}
      </div>
      {/* Storage caps remain pending an authoritative per-plan quota catalog. */}
      <p className="mx-auto mt-6 max-w-3xl text-center text-[11px] font-normal leading-relaxed text-white/35">Prices are per subscription. Annual prices are the full yearly charge. Stripe processing fees are separate; app-store prices and taxes may differ. Review additional-team prices in Billing before adding teams.</p>
    </section>
  );
}
