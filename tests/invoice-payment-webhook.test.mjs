import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest } from 'next/server.js';
import Stripe from 'stripe';
import { ACTIVE_PLAN_PRICE_IDS, PLAN_PRICE_MAP, PRICE_BILLING_CYCLE } from '../src/lib/stripe-price-map.ts';

// Real release handler and official Stripe signature verification. Provider
// retrieval and Firestore are offline controlled fixtures, not store acceptance.
const boundary = '__squadInvoiceWebhookFixture';
const fixtureSecret = 'whsec_local_invoice_regression_not_a_credential';
const stripeSdk = new Stripe('sk_test_local_offline_not_a_credential');
const uid = 'local-webhook-owner';
const priceId = [...ACTIVE_PLAN_PRICE_IDS].find(p => PLAN_PRICE_MAP[p].id === 'team' && PRICE_BILLING_CYCLE[p] === 'monthly');
const require = createRequire(import.meta.url);
let directory, handler, state;
const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
const previousFetch = globalThis.fetch;

function document(path) {
  return {path,get:async()=>({exists:state.records.has(path),data:()=>state.records.get(path)}),set:async(value,options)=>state.records.set(path,options?.merge?{...state.records.get(path),...value}:value),update:async(value)=>state.records.set(path,{...state.records.get(path),...value})};
}
before(async()=>{
  process.env.STRIPE_WEBHOOK_SECRET=fixtureSecret;
  globalThis.fetch=async()=>{throw new Error('No network allowed in invoice regression')};
  await mkdir('output',{recursive:true});directory=await mkdtemp(join(process.cwd(),'output/invoice-webhook-'));
  const seams={
    '@/lib/firebase-admin':`export const adminDb={collection:name=>({doc:id=>globalThis.${boundary}.doc(name+'/'+id)}),runTransaction:async fn=>fn({get:ref=>ref.get(),set:(ref,value)=>ref.set(value),update:(ref,value)=>ref.update(value)})};`,
    '@/lib/stripe-client':`export function getStripe(){return globalThis.${boundary}.stripe}`,
    '@/lib/server-subscription-seats':`export async function reconcilePaidTeamSeats(value){globalThis.${boundary}.reconciliations.push(value);return {selectedTeamAllocated:true}}`,
    '@/lib/server-signup-notification':`export async function notifySignup(...args){globalThis.${boundary}.signupNotifications.push(args)}`,
  };
  await build({entryPoints:['src/app/api/webhook/route.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:join(directory,'webhook.cjs'),logLevel:'silent',plugins:[{name:'offline-boundaries',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(seams,a.path)?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:seams[a.path]}));}}]});
  handler=require(join(directory,'webhook.cjs')).POST;
});
after(async()=>{
  globalThis.fetch=previousFetch;
  if (previousSecret===undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET=previousSecret;
  delete globalThis[boundary];
  await rm(directory,{recursive:true,force:true});
});
function reset(status='active') {
  const sub={id:'sub_local',object:'subscription',customer:'cus_local',currency:'usd',status,created:1700000000,cancel_at_period_end:false,metadata:{firebase_uid:uid},items:{data:[{id:'si_local',price:{id:priceId},quantity:1,current_period_end:1893456000}]}};
  state={records:new Map(),reconciliations:[],signupNotifications:[],subscriptions:[sub],sub,doc:document};
  state.stripe={webhooks:stripeSdk.webhooks,subscriptions:{retrieve:async id=>{if(state.failProvider)throw Error('Injected provider outage');return state.subscriptions.find(s=>s.id===id)},list:async()=>({data:state.subscriptions})},customers:{retrieve:async()=>({id:'cus_local',email:'fixture@example.test'})}};
  globalThis[boundary]=state;
}
function event(type='invoice.payment_succeeded',modern=true,id='evt_local') {
  return {id,object:'event',api_version:'2025-03-31.basil',created:Math.floor(Date.now()/1000),livemode:false,pending_webhooks:1,type,data:{object:{id:'in_local',object:'invoice',status:'paid',paid:true,amount_paid:1999,amount_due:1999,currency:'usd',customer:'cus_local',billing_reason:'subscription_cycle',...(modern?{parent:{type:'subscription_details',subscription_details:{subscription:'sub_local'}}}:{subscription:'sub_local'})}}};
}
function request(value,secret=fixtureSecret) {
  const body=JSON.stringify(value);const signature=stripeSdk.webhooks.generateTestHeaderString({payload:body,secret});
  return new NextRequest('https://webhook.example.test/api/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body});
}
for(const type of ['invoice.payment_succeeded','invoice.paid']) for(const modern of [true,false]) {
  test(`${type} reconciles ${modern?'Basil parent':'legacy subscription'} invoice from provider status`,async()=>{reset();assert.equal((await handler(request(event(type,modern)))).status,200);assert.equal(state.reconciliations.length,1);assert.equal(state.reconciliations[0].userId,uid);assert.equal(state.reconciliations[0].capacity,PLAN_PRICE_MAP[priceId].teamLimit);assert.equal(state.records.get('stripeWebhookEvents/evt_local').status,'completed');assert.equal(state.signupNotifications.length,1);});
}
test('payment-succeeded replay performs no second reconciliation or signup notification',async()=>{reset();const e=event();await handler(request(e));const r=await handler(request(e));assert.equal(r.status,200);assert.equal((await r.json()).duplicate,true);assert.equal(state.reconciliations.length,1);assert.equal(state.signupNotifications.length,1);});
test('paid invoice cannot grant seats while latest provider subscription remains past due',async()=>{reset('past_due');await handler(request(event()));assert.equal(state.reconciliations[0].entitled,false);assert.equal(state.reconciliations[0].capacity,0);assert.equal(state.reconciliations[0].userUpdates.plan_type,'free');});
test('wrong signature fails before ledger or entitlement effects',async()=>{reset();assert.equal((await handler(request(event(),'whsec_wrong_local_fixture'))).status,400);assert.equal(state.records.size,0);assert.equal(state.reconciliations.length,0);});
test('active processing lease returns retryable409 without reconciliation',async()=>{reset();state.records.set('stripeWebhookEvents/evt_local',{status:'processing',processingStartedAt:new Date().toISOString()});assert.equal((await handler(request(event()))).status,409);assert.equal(state.reconciliations.length,0);});
test('provider outage leaves failed ledger and subsequent delivery recovers once',async()=>{reset();state.failProvider=true;assert.equal((await handler(request(event()))).status,500);assert.equal(state.reconciliations.length,0);assert.equal(state.records.get('stripeWebhookEvents/evt_local').status,'failed');state.failProvider=false;assert.equal((await handler(request(event()))).status,200);assert.equal(state.reconciliations.length,1);assert.equal(state.records.get('stripeWebhookEvents/evt_local').attempt,2);});
test('delayed invoice resolves newer active subscription without notifying old signup',async()=>{reset('canceled');state.subscriptions.push({...state.sub,id:'sub_new',status:'active',created:1800000000});await handler(request(event()));assert.equal(state.reconciliations[0].userUpdates.stripe_subscription_id,'sub_new');assert.equal(state.reconciliations[0].entitled,true);assert.equal(state.signupNotifications.length,0);});
