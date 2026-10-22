/** Team ledger amounts are integer minor units; never combine currencies. */
export function paidTeamPaymentTotals(payments: readonly { status?: string; currency?: string; amount?: unknown; amount_refunded?: unknown }[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const payment of payments) {
    const amount = Number(payment.amount);
    if (!['paid', 'partially_refunded'].includes(payment.status || '') || !Number.isSafeInteger(amount) || amount < 0) continue;
    const refunded = Number(payment.amount_refunded || 0);
    const net = amount - (Number.isSafeInteger(refunded) ? Math.min(amount, Math.max(0, refunded)) : 0);
    const currency = (payment.currency || 'usd').toUpperCase();
    totals.set(currency, (totals.get(currency) || 0) + net);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b));
}
