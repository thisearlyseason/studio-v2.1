import { NextResponse } from 'next/server';
import { PRICING_CONFIG, EXTRA_TEAM_CONFIG } from '@/lib/pricing';
import { getStripe } from '@/lib/stripe-client';
import { displayPriceFromStripe } from '@/lib/billing-display-price';
import { readSaasTaxCatalog, resolveSaasTaxEntry } from '@/lib/saas-tax-catalog';
import { verifiedSaasTaxPrice } from '@/lib/server-saas-tax-catalog';
export const dynamic = 'force-dynamic';
let cached: {prices: NonNullable<ReturnType<typeof displayPriceFromStripe>>[]; expires: number} | undefined;
let pending: Promise<NonNullable<ReturnType<typeof displayPriceFromStripe>>[]> | undefined;
export async function GET() {
  try {
    if(cached && cached.expires>Date.now()) return NextResponse.json({prices:cached.prices},{headers:{'Cache-Control':'no-store'}});
    const ids = [...new Set([...PRICING_CONFIG.flatMap(plan => [plan.monthlyPriceId, plan.annualPriceId]), EXTRA_TEAM_CONFIG.monthlyPriceId, EXTRA_TEAM_CONFIG.annualPriceId])];
    const taxCatalog = readSaasTaxCatalog();
    pending ||= Promise.all(ids.map(async id => {
      try {
        if (!taxCatalog.length) return displayPriceFromStripe(await getStripe().prices.retrieve(id,{expand:['currency_options']}),Date.now(),'usd');
        const plan = PRICING_CONFIG.find(plan => plan.monthlyPriceId === id || plan.annualPriceId === id);
        const offer = plan?.id || 'extra_team';
        const cycle = (plan?.annualPriceId || EXTRA_TEAM_CONFIG.annualPriceId) === id ? 'annual' : 'monthly';
        // Both declarations must lead to the displayed price. Keep the existing
        // selection alias in the response, never expose a selectable tax variant.
        const [personal] = await Promise.all(['personal', 'commercial'].map(use =>
          verifiedSaasTaxPrice(getStripe(), resolveSaasTaxEntry(offer, cycle, use as 'personal' | 'commercial'))));
        return displayPriceFromStripe({ ...personal, id }, Date.now(), 'usd');
      } catch { return null; }
    })).then(prices=>prices.filter((price): price is NonNullable<typeof price> => Boolean(price)));
    const prices=await pending;
    cached={prices,expires:Date.now()+60_000};
    return NextResponse.json({ prices: prices.filter(Boolean) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Current prices are unavailable. Try again before subscribing.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  } finally { pending=undefined; }
}
