import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest } from 'next/server.js';
import * as prices from '../src/lib/stripe-price-map.ts';

// Execute the release's real route handlers and price/policy helpers. Only
// external Auth/Firestore/Stripe and mutation side effects are controlled.
// This is simulated-provider evidence, not an actual Stripe transaction.
const boundary = '__squadUsdRouteRegression';
let directory, routes, state;
const require = createRequire(import.meta.url);
const uid = 'local-usd-regression-owner';
const monthly = [...prices.ACTIVE_PLAN_PRICE_IDS].find(p => prices.PLAN_PRICE_MAP[p].id === 'team' && prices.PRICE_BILLING_CYCLE[p] === 'monthly');
const annual = [...prices.ACTIVE_PLAN_PRICE_IDS].find(p => prices.PLAN_PRICE_MAP[p].id === 'elite' && prices.PRICE_BILLING_CYCLE[p] === 'annual');
const legacy = 'price_1TkoThKBufuw6n64Sog2etTW';

before(async () => {
  await mkdir('output', { recursive: true });
  directory = await mkdtemp(join(process.cwd(), 'output/squad-usd-route-'));
  const injected = {
    'firebase-admin': `export function auth(){return {getUser:async()=>({metadata:{creationTime:new Date().toISOString()}})}}`,
    '@/lib/firebase-admin': `export const adminDb={collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>globalThis.${boundary}.user}),update:async()=>{}})})};`,
    '@/lib/stripe-client': `export function getStripe(){globalThis.${boundary}.providerAccesses++;return globalThis.${boundary}.stripe}`,
    '@/lib/api-auth': `import {NextResponse} from 'next/server'; export async function verifyFirebaseToken(){return {uid:${JSON.stringify(uid)}}} export function assertNonAnonymous(){return null} export function assertOwner(auth,id){return auth.uid===id?null:NextResponse.json({error:'Forbidden'},{status:403})}`,
    '@/lib/server-request-guards': `export class RequestBodyError extends Error{}; export async function readJsonBodyWithLimit(req){return req.json()} export async function enforceUserRateLimit(){return null}`,
    '@/lib/server-subscription-mutation-lock': `export class SubscriptionMutationInProgressError extends Error{}; export async function claimSubscriptionMutation(){globalThis.${boundary}.claims++} export async function releaseSubscriptionMutation(){globalThis.${boundary}.releases++}`,
    '@/lib/server-subscription-seats': `export async function reconcilePaidTeamSeats(value){globalThis.${boundary}.reconciliations.push(value);return {selectedTeamAllocated:true}}`,
    '@/lib/server-checkout-lock': `export class CheckoutLifecycleError extends Error{}; export async function createCheckoutSessionWithLock(ref,key,params){globalThis.${boundary}.checkouts.push({key,params});return {url:'https://checkout.example.test/local'}}`,
    '@/lib/store-request-guard': `export function storePurchaseResponse(){return null}`,
  };
  await build({entryPoints:{checkout:'src/app/api/stripe/create-checkout/route.ts',upgrade:'src/app/api/subscription/update/route.ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outdir:directory,outExtension:{'.js':'.cjs'},logLevel:'silent',plugins:[{name:'controlled-external-boundaries',setup(b){b.onResolve({filter:/.*/},args=>Object.hasOwn(injected,args.path)?{path:args.path,namespace:'local-fixture'}:args.namespace==='local-fixture'?{path:args.path,external:true}:undefined);b.onLoad({filter:/.*/,namespace:'local-fixture'},args=>({contents:injected[args.path]}));}}]});
  routes = {checkout:require(join(directory,'checkout.cjs')).POST,upgrade:require(join(directory,'upgrade.cjs')).POST};
});
after(async () => {delete globalThis[boundary];await rm(directory,{recursive:true,force:true});});

function reset(overrides={}) {
  const subscription={id:'sub_local',customer:'cus_local',currency:'usd',status:'active',cancel_at_period_end:false,items:{data:[{id:'si_base',price:{id:monthly},quantity:1}]},...overrides};
  state={user:{email:'fixture@example.test',stripe_customer_id:'cus_local',stripe_subscription_id:'sub_local'},subscription,updates:[],reconciliations:[],checkouts:[],claims:0,releases:0,providerAccesses:0};
  state.stripe={customers:{retrieve:async()=>({id:'cus_local',metadata:{firebase_uid:uid}})},subscriptions:{retrieve:async()=>subscription,list:async()=>({data:[]}),update:async(id,params,options)=>{state.updates.push({id,params,options});return state.updated??{...subscription,items:{data:params.items.map(i=>({id:i.id,price:{id:i.price},quantity:i.quantity??1}))}};}}};
  globalThis[boundary]=state;
}
const request = body => new NextRequest('https://local.example.test/api/billing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const upgrade = (price=annual,userId=uid) => routes.upgrade(request({userId,newPriceId:price,operationId:'local_operation_123456'}));

test('USD upgrade rejects a recognized legacy CAD price before provider mutation',async()=>{reset();assert.equal((await upgrade(legacy)).status,400);assert.equal(state.updates.length,0);assert.equal(state.claims,0);});
test('USD upgrade blocks CAD subscriptions and releases the acquired mutation lock',async()=>{reset({currency:'cad'});assert.equal((await upgrade()).status,409);assert.equal(state.updates.length,0);assert.equal(state.reconciliations.length,0);assert.equal(state.claims,1);assert.equal(state.releases,1);});
test('USD upgrade denies a different account before provider or entitlement access',async()=>{reset();assert.equal((await upgrade(annual,'other-user')).status,403);assert.equal(state.updates.length,0);assert.equal(state.claims,0);});
test('existing pending payment blocks another upgrade without granting capacity',async()=>{reset({pending_update:{expires_at:9999999999}});assert.equal((await upgrade()).status,409);assert.equal(state.updates.length,0);assert.equal(state.reconciliations.length,0);assert.equal(state.releases,1);});
test('new pending payment returns202 and leaves existing entitlements unchanged',async()=>{reset();state.updated={...state.subscription,pending_update:{expires_at:9999999999}};assert.equal((await upgrade()).status,202);assert.equal(state.reconciliations.length,0);assert.equal(state.releases,1);assert.equal(state.updates[0].params.payment_behavior,'pending_if_incomplete');});
test('annual USD upgrade recognizes historical addon and replaces its interval',async()=>{reset();state.subscription.items.data.push({id:'si_extra',price:{id:'price_1TkoTgKBufuw6n64twN6yAq3'},quantity:2});assert.equal((await upgrade()).status,200);assert.deepEqual(state.updates[0].params.items[1],{id:'si_extra',price:prices.EXTRA_TEAM_PRICE_IDS.annual,quantity:2});assert.equal(state.reconciliations[0].capacity,prices.PLAN_PRICE_MAP[annual].teamLimit+2);assert.equal(state.reconciliations[0].userUpdates.billing_cycle,'annual');assert.equal(state.releases,1);});
test('provider non-entitled update never grants paid capacity',async()=>{reset();state.updated={...state.subscription,status:'past_due'};assert.equal((await upgrade()).status,200);assert.equal(state.reconciliations[0].capacity,0);assert.equal(state.reconciliations[0].userUpdates.plan_type,'free');});
test('repeated upgrade operation keeps its provider idempotency scope stable',async()=>{reset();await upgrade();await upgrade();assert.equal(state.updates.length,2);assert.equal(state.updates[0].options.idempotencyKey,state.updates[1].options.idempotencyKey);assert.equal(state.claims,state.releases);});

for (const priceId of prices.ACTIVE_PLAN_PRICE_IDS) {
  test(`checkout ${prices.PLAN_PRICE_MAP[priceId].id}/${prices.PRICE_BILLING_CYCLE[priceId]} uses USD and matching addon`,async()=>{reset();delete state.user.stripe_subscription_id;const cycle=prices.PRICE_BILLING_CYCLE[priceId];const response=await routes.checkout(request({userId:uid,priceId,billingCycle:cycle,extraTeamQty:2,...(prices.PLAN_PRICE_MAP[priceId].id === 'school' ? {organizationDeclaration:'school'} : {})}));assert.equal(response.status,200);const params=state.checkouts[0].params;assert.equal(params.currency,'usd');assert.equal(params.adaptive_pricing.enabled,false);assert.deepEqual(params.line_items,[{price:priceId,quantity:1},{price:prices.EXTRA_TEAM_PRICE_IDS[cycle],quantity:2}]);assert.equal(params.metadata.firebase_uid,uid);assert.equal(params.subscription_data.trial_period_days,5);});
}
test('checkout rejects recognized CAD price and mismatched interval before session creation',async()=>{for(const input of [{priceId:legacy,billingCycle:'monthly'},{priceId:monthly,billingCycle:'annual'}]){reset();const r=await routes.checkout(request({userId:uid,...input}));assert.equal(r.status,400);assert.equal(state.checkouts.length,0);}});

test('new canonical checkout explicitly opts out of Managed Payments',async()=>{reset();state.user.stripe_subscription_id=null;const response=await routes.checkout(request({userId:uid,priceId:monthly}));assert.equal(response.status,200);assert.deepEqual(state.checkouts[0].params.managed_payments,{enabled:false});});

// School eligibility is evaluated by the real route/helper before provider access.
for (const priceId of prices.ACTIVE_PLAN_PRICE_IDS) {
  if (prices.PLAN_PRICE_MAP[priceId].id !== 'school') continue;
  test(`undeclared school/${prices.PRICE_BILLING_CYCLE[priceId]} checkout is denied before provider access`, async () => {
    reset();
    delete state.user.stripe_subscription_id;
    const response = await routes.checkout(request({userId:uid,priceId,billingCycle:prices.PRICE_BILLING_CYCLE[priceId],extraTeamQty:2}));
    assert.equal(response.status,403);
    assert.match((await response.json()).error,/Schools plan is for schools and nonprofits/);
    assert.equal(state.providerAccesses,0);
    assert.equal(state.checkouts.length,0);
    assert.equal(state.reconciliations.length,0);
    assert.equal(state.claims,0);
  });
}
