/** Refund totals are cumulative cents; replayed success events cannot erase them. */
export function paymentRefundState(amount: number, refunded: number, previousRefunded = 0) {
  const gross = Math.max(0, Math.round(amount));
  const refund = Math.min(gross, Math.max(0, Math.round(refunded || 0), Math.round(previousRefunded || 0)));
  return { amount_refunded: refund, net_amount: gross - refund,
    status: refund >= gross && refund > 0 ? 'refunded' : refund > 0 ? 'partially_refunded' : 'paid' };
}
export function paymentNetCents(payment: {amount?: number; amount_refunded?: number; status?: string}) {
  if (payment.status === 'failed' || payment.status === 'pending' || payment.status === 'refunded') return 0;
  return paymentRefundState(payment.amount || 0, payment.amount_refunded || 0).net_amount;
}
