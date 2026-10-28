import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Render the real account-billing page. Only external account/network hooks
// are replaced; no Firebase, Stripe, account or entitlement writes occur.
await mkdir('scratch', { recursive: true });
const directory = await mkdtemp(process.cwd() + '/scratch/billing-extra-slots-unit-');
after(() => rm(directory, { recursive: true, force: true }));
const seams = {
  'fixture:state': `export let state; export function setState(value){state=value}`,
  '@/firebase': `export function useAuth(){return {currentUser:{isAnonymous:false}}}`,
  '@/components/providers/team-provider': `import {state} from 'fixture:state'; export function useTeam(){return state.account}`,
  '@/lib/use-subscription-capabilities': `import {state} from 'fixture:state'; export function useSubscriptionCapabilities(){return state.capabilities}`,
  '@/lib/use-billing-display-prices': `export function useBillingDisplayPrices(){return {quote:()=>({currency:'USD'}),label:()=> 'USD 15.99',refresh:()=>{}}}`,
  '@/lib/client-auth': `export function getAuthToken(){throw Error('No authentication in render test')} export function authHeader(){return {}}`,
  'next/navigation': `export function useRouter(){return {push:()=>{throw Error('No navigation in render test')}}}`,
  '@/components/SquadIdentity': `export function SquadIdentity(){return null}`,
  '@/hooks/use-toast': `export function toast(){throw Error('No actions in render test')}`,
};
await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import Page from './src/app/(dashboard)/dashboard/billing/page';
    import {setState} from 'fixture:state';
    export function render(fixture){setState(fixture);return renderToStaticMarkup(<Page/>)}
  ` },
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', packages: 'external',
  outfile: directory + '/page.mjs', logLevel: 'silent',
  plugins: [{ name: 'synthetic-account', setup(b) {
    b.onResolve({ filter: /.*/ }, a => Object.hasOwn(seams, a.path) ? { path: a.path, namespace: 'fixture' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: seams[a.path], resolveDir: process.cwd() }));
  } }],
});
const { render } = await import(pathToFileURL(directory + '/page.mjs'));
function fixture({ plan = 'team', selectedPro = false, store, capable = true, stripe = true } = {}) {
  const user = { id: 'synthetic-owner', plan_type: plan, team_limit: plan === 'free' ? 0 : 1,
    subscription_status: 'active', billing_cycle: 'monthly', extra_teams: 0,
    ...(stripe ? { stripe_subscription_id: 'sub_synthetic' } : {}), ...(store ? { billing_provider: store } : {}) };
  const teams = [true, false].map((isPro, i) => ({ id: String(i), ownerUserId: user.id, name: isPro ? 'Paid team' : 'Starter team', isPro, planId: isPro ? 'team' : 'free', type: 'adult' }));
  return { account: { user, isPro: selectedPro, activeTeam: teams[selectedPro ? 0 : 1], teams,
    proQuotaStatus: { remaining: 0, current: 1, limit: user.team_limit }, updateTeamPlan: () => { throw Error('No allocation in render test'); } },
    capabilities: { addonsAllowed: capable, planChangesAllowed: capable, portalAllowed: false } };
}

test('paid account can access extra slots while its Starter team is selected without granting that team Pro', () => {
  const html = render(fixture());
  assert.match(html, /Extra Squad Slots/);
  assert.match(html, /aria-label="Increase extra squad quantity"/);
  assert.match(html, /disabled=""[^>]*>Assign Pro Slot/);
  assert.match(html, /Slot Limit Reached/);
});
test('extra-slot controls remain available with the paid team selected and with a managed Pro grant', () => {
  for (const input of [{ selectedPro: true }, { stripe: false }]) assert.match(render(fixture(input)), /Extra Squad Slots/);
  assert.match(render(fixture({ stripe: false })), /Active - managed plan/);
});
test('initial web checkout keeps the intended-use choice with its dialog rather than a detached page form', () => {
  const html = render(fixture({ stripe: false }));
  assert.match(html, /Extra Squad Slots/);
  assert.doesNotMatch(html, /Choose intended use|How will this subscription be used\?/);
});
test('viewing a Pro demo team does not turn a free account into an extra-slot customer', () => {
  assert.doesNotMatch(render(fixture({ plan: 'free', selectedPro: true })), /Extra Squad Slots/);
});
test('provider capability restrictions still disable extra-slot controls', () => {
  const html = render(fixture({ capable: false }));
  assert.match(html, /aria-label="Increase extra squad quantity" disabled=""/);
  assert.match(html, /Extra squad slots are temporarily unavailable/);
});
test('Apple and Google subscribers retain their original store billing surface', () => {
  for (const store of ['app_store', 'play_store']) {
    const html = render(fixture({ store }));
    assert.doesNotMatch(html, /Extra Squad Slots/);
    assert.match(html, /Manage (Apple|Google Play).*subscription/);
  }
});
