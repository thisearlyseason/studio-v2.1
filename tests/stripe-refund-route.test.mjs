import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import Stripe from 'stripe';
import {communicationDb} from './helpers/communication-route-harness.mjs';

test('signed refund and checkout replay reconcile one record with real ownership checks', async () => {
 const secret='whsec_unit_test'; process.env.STRIPE_CONNECT_WEBHOOK_SECRET=secret;
 const {db,records}=communicationDb({'teams/team-a':{stripeConnectAccountId:'acct_a'},'teams/team-a/fundraising/campaign-a':{currentAmount:0}});
 let refunded=200;
 const session={id:'cs_a',payment_intent:'pi_a',payment_status:'paid',amount_total:500,currency:'usd',metadata:{firebase_team_id:'team-a',firebase_campaign_id:'campaign-a'},customer_details:{email:'qa@example.test',name:'QA'}};
 const sdk=new Stripe('sk_test_not_used');
 const stripe={webhooks:sdk.webhooks,checkout:{sessions:{list:async()=>({data:[session]})}},paymentIntents:{retrieve:async()=>({metadata:{},latest_charge:{amount_refunded:refunded,receipt_url:'https://example.test/receipt'}})}};
 const key='refundRouteTest';globalThis[key]={db,stripe};
 const stubs={
  '@/lib/firebase-admin':`export const adminDb=globalThis.${key}.db;`,
  '@/lib/stripe-client':`export const getStripe=()=>globalThis.${key}.stripe;`,
  '@/lib/server-tournament-registration-payment':'export const fulfillTournamentRegistration=async()=>false;',
  'next/server':'export class NextResponse extends Response {static json(body,init={}){return new NextResponse(JSON.stringify(body),init)}}',
  'firebase-admin/firestore':'export const FieldValue={increment:value=>({__increment:value})};',
 };
 const built=await build({entryPoints:['src/app/api/stripe/connect/webhook/route.ts'],bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'test-boundaries',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
 const route=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 async function send(id,type,object,account='acct_a') {
  const body=JSON.stringify({id,type,account,created:100,data:{object}});
  const signature=sdk.webhooks.generateTestHeaderString({payload:body,secret});
  return route.POST(new Request('https://example.test/api/stripe/connect/webhook',{method:'POST',headers:{'stripe-signature':signature},body}));
 }
 try {
  assert.equal((await send('evt_partial','charge.refunded',{id:'ch_a',payment_intent:'pi_a'})).status,200);
  assert.equal(records.get('teams/team-a/payments/pi_a').status,'partially_refunded');
  assert.equal(records.get('teams/team-a/fundraising/campaign-a').currentAmount,3);
  refunded=500;
  assert.equal((await send('evt_full','charge.refunded',{id:'ch_a',payment_intent:'pi_a'})).status,200);
  assert.equal((await send('evt_checkout','checkout.session.completed',session)).status,200);
  assert.equal((await send('evt_full','charge.refunded',{id:'ch_a',payment_intent:'pi_a'})).status,200);
  assert.equal(records.get('teams/team-a/fundraising/campaign-a').currentAmount,0);
  assert.equal(records.get('teams/team-a/payments/pi_a').net_amount,0);
  assert.equal(records.get('teams/team-a/payments/pi_a').status,'refunded');
  assert.equal([...records.keys()].filter(k=>k.includes('/payments/')).length,1);
  assert.equal((await send('evt_wrong','charge.refunded',{id:'ch_a',payment_intent:'pi_a'},'acct_wrong')).status,500);
  const unpaid={...session,id:'cs_unpaid',payment_status:'unpaid',payment_intent:'pi_unpaid'};
  assert.equal((await send('evt_unpaid','checkout.session.completed',unpaid)).status,200);
  assert.equal(records.has('teams/team-a/payments/pi_unpaid'),false);
 } finally {delete globalThis[key];}
});
