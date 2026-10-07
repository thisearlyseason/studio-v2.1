import { NextResponse } from 'next/server';
import { PRICING_CONFIG, EXTRA_TEAM_CONFIG } from '@/lib/pricing';
import { getStripe } from '@/lib/stripe-client';
import { displayPriceFromStripe } from '@/lib/billing-display-price';
export const dynamic = 'force-dynamic';
let cached: {prices: NonNullable<ReturnType<typeof displayPriceFromStripe>>[]; expires: number} | undefined;
let pending: Promise<NonNullable<ReturnType<typeof displayPriceFromStripe>>[]> | undefined;
export async function GET() {
  try {
    if(cached && cached.expires>Date.now()) return NextResponse.json({prices:cached.prices},{headers:{'Cache-Control':'no-store'}});
    const ids = [...new Set([...PRICING_CONFIG.flatMap(plan => [plan.monthlyPriceId, plan.annualPriceId]), EXTRA_TEAM_CONFIG.monthlyPriceId, EXTRA_TEAM_CONFIG.annualPriceId])];
    pending ||= Promise.all(ids.map(async id => {
      try { return displayPriceFromStripe(await getStripe().prices.retrieve(id,{expand:['currency_options']}),Date.now(),'usd'); } catch { return null; }
    })).then(prices=>prices.filter((price): price is NonNullable<typeof price> => Boolean(price)));
    const prices=await pending;
    cached={prices,expires:Date.now()+60_000};
    return NextResponse.json({ prices: prices.filter(Boolean) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Current prices are unavailable. Try again before subscribing.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  } finally { pending=undefined; }
}
