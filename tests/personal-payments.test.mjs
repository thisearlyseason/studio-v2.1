import test from 'node:test';
import assert from 'node:assert/strict';
import { paidTeamPaymentTotals } from '../src/lib/personal-payments.ts';
test('personal history counts paid ledger cents by currency and excludes unsuccessful payments', () => {
 assert.deepEqual(paidTeamPaymentTotals([
  {status:'paid',currency:'usd',amount:12500}, {status:'paid',currency:'USD',amount:1500},
  {status:'paid',currency:'cad',amount:4000}, {status:'failed',currency:'usd',amount:99900},
  {status:'pending',currency:'usd',amount:3000}, {status:'paid',amount:-100},
  {status:'paid',amount:'broken'}, {status:'paid',amount:NaN}
 ]), [['CAD',4000],['USD',14000]]);
 assert.deepEqual(paidTeamPaymentTotals([]),[]);
});

test('partial and full refunds reduce personal totals without crossing currencies', () => {
 assert.deepEqual(paidTeamPaymentTotals([
  {status:'partially_refunded',currency:'usd',amount:10000,amount_refunded:2500},
  {status:'refunded',currency:'usd',amount:5000,amount_refunded:5000},
  {status:'paid',currency:'cad',amount:3000,amount_refunded:1000}
 ]), [['CAD',2000],['USD',7500]]);
});
