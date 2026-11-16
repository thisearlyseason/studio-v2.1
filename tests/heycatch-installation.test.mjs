import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import nextConfig from '../next.config.ts';
const read = file => fs.readFileSync(file, 'utf8');
const key = 'hck_pk_APvOG4sebjLfK6k-1DXlNpFKJICaSF8m';

test('SDK initializes eagerly once with the real key and known Next/agent metadata', () => {
  const source = read('src/instrumentation-client.ts');
  const calls = [];
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { exports: {}, require: () => ({ analytics: { init: config => calls.push(config) } }) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].projectKey, key);
  assert.equal(calls[0].install.frameworkVersion, '15');
  assert.equal(calls[0].install.agent, 'codex');
  assert.equal(calls[0].site, undefined); // shared website/app project, per guide
  assert.equal(calls[0].apiHost, undefined);
  assert.doesNotMatch(source, /import\(|useEffect|typeof window/);
});
test('effective CSP allows both HeyCatch helper scripts and ingest, preserving restrictive defaults', async () => {
  for (const rule of await nextConfig.headers()) {
    const csp = rule.headers.find(header => header.key === 'Content-Security-Policy').value;
    for (const name of ['script-src', 'connect-src']) assert(csp.split(';').find(part => part.trim().startsWith(name + ' ')).includes('https://in.heycatch.ai'));
    assert(csp.includes("default-src 'self'"));
  }
});
test('reserved one-character short links preserve campaign attribution', async () => {
  const rule = (await nextConfig.redirects()).find(rule => rule.source === '/:l([a-z0-9])');
  assert.equal(rule.destination, '/?utm_source=heycatch&utm_campaign=:l');
  assert.equal(rule.permanent, false);
});
test('server subscription events await identity and ingest with the same internal UID', async () => {
  const calls = []; const exported = {};
  const source = ts.transpileModule(read('src/lib/server-heycatch.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports: exported, require: () => ({ analytics: { init: () => {}, setIdentity: async (...args) => calls.push(['identity', ...args]), trackEvent: async (...args) => calls.push(['event', ...args]) } }) });
  await exported.trackSubscriptionOutcome('subscription_started', { userId: 'internal-user', planType: 'team', status: 'trialing', billingCycle: 'monthly' }, 'evt_1');
  assert.equal(calls[0][0], 'identity'); assert.equal(calls[0][1], 'internal-user');
  assert.equal(calls[1][1], 'subscription_started'); assert.equal(calls[1][3].userId, 'internal-user');
  assert.equal(calls[1][2].plan, 'team'); assert.equal(calls[1][2].stripe_event_id, 'evt_1');
});
