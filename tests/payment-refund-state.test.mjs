import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentRefundState, paymentNetCents } from '../src/lib/payment-refund-state.ts';
test('full and partial refunds preserve cents and reduce revenue', () => {
 assert.deepEqual(paymentRefundState(505, 205), {amount_refunded:205,net_amount:300,status:'partially_refunded'});
 assert.deepEqual(paymentRefundState(500, 500), {amount_refunded:500,net_amount:0,status:'refunded'});
 assert.equal(paymentNetCents({amount:505,status:'paid'}),505);
 assert.equal(paymentNetCents({amount:505,status:'failed'}),0);
});
test('late success and older partial refunds cannot erase refunded money', () => {
 assert.equal(paymentRefundState(500,0,500).net_amount,0);
 assert.equal(paymentRefundState(500,100,300).amount_refunded,300);
 assert.equal(paymentRefundState(500,500,500).amount_refunded,500);
});
