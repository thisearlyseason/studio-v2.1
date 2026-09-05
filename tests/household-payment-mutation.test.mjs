import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHouseholdPaymentProjection, assertHouseholdPaymentMutationScope } from '../src/lib/household-payment-mutation.ts';

test('household payment projection derives guardian child and team identity from server records', () => {
  const payment = buildHouseholdPaymentProjection({
    paymentId:'run-pay-1', teamId:'team-a', team:{name:'Falcons',isActive:true},
    childId:'child-a', child:{parentId:'parent-a',firstName:'Run',lastName:'Child',joinedTeamIds:['team-a']},
    input:{description:'Runtime dues',amount:23.45,status:'pending',date:'2026-09-07',dueDate:'2026-09-09',category:'Dues'}, actorUid:'owner-a', now:'2026-09-05T00:00:00.000Z',
  });
  assert.equal(payment.parentId,'parent-a'); assert.equal(payment.childName,'Run Child'); assert.equal(payment.teamName,'Falcons');
  assert.equal(payment.amount,23.45); assert.equal(payment.status,'pending');
  assert.equal(Object.hasOwn(payment,'guardianUid'),false);
});

test('household payment mutation fails closed for inactive, wrong-child, and wrong-team records', () => {
  const base={teamId:'team-a',team:{name:'Falcons',isActive:true},childId:'child-a',child:{parentId:'parent-a',joinedTeamIds:['team-a']}};
  assert.doesNotThrow(()=>assertHouseholdPaymentMutationScope(base));
  assert.throws(()=>assertHouseholdPaymentMutationScope({...base,team:{...base.team,isActive:false}}),error=>error.status===409);
  assert.throws(()=>assertHouseholdPaymentMutationScope({...base,child:{parentId:'',joinedTeamIds:['team-a']}}),error=>error.status===403);
  assert.throws(()=>assertHouseholdPaymentMutationScope({...base,child:{parentId:'parent-a',joinedTeamIds:['team-c']}}),error=>error.status===403);
});
