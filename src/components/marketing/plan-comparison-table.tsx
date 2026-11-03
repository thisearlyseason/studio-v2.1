'use client';

import { PRICING_CONFIG } from '@/lib/pricing';
import { useBillingDisplayPrices } from '@/lib/use-billing-display-prices';

export function PlanComparisonTable() {
  // Share the homepage's live catalog, freshness limits and failure behavior.
  const prices = useBillingDisplayPrices();
  return <div className="overflow-x-auto rounded-2xl border"><table className="w-full text-left text-sm">
    <caption className="p-4 text-left text-muted-foreground">Current web subscription prices, with currency shown. Annual prices are billed annually, not monthly.</caption>
    <thead className="bg-muted"><tr>{['Plan', 'Monthly', 'Annual', 'Included team hubs'].map(label => <th key={label} scope="col" className="p-4">{label}</th>)}</tr></thead>
    <tbody>{PRICING_CONFIG.map(plan => <tr key={plan.id} className="border-t">
      <th scope="row" className="p-4">{plan.name}</th>
      <td className="p-4">{prices.label(plan.monthlyPriceId)}</td>
      <td className="p-4">{prices.label(plan.annualPriceId)}</td>
      <td className="p-4">{plan.teamLimit}</td>
    </tr>)}</tbody>
  </table></div>;
}
