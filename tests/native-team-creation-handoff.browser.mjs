// Exercise the real form with fictional account/router boundaries. No provider calls.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import ts from 'typescript';
import postcss from 'postcss';

const engines = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE || 'chromium';
assert(['chromium', 'webkit'].includes(engine));
const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = process.env.AUDIT_OUTPUT;
assert(out, 'Use an ignored scratch directory');
await fs.mkdir(out, { recursive: true });
const stubs = {
  router: `export const useRouter=()=>({push:href=>window.events.push({kind:'navigate',href}),back:()=>{}});export const useSearchParams=()=>new URLSearchParams(location.search);`,
  team: `export const useTeam=()=>window.team;`,
  distribution: `export const isStoreDistribution=new URLSearchParams(location.search).get('store')!=='0';`,
  toast: `export const toast=value=>window.events.push({kind:'toast',title:value.title});`,
};
const aliases = { 'next/navigation': 'router', '@/components/providers/team-provider': 'team', '@/lib/app-distribution': 'distribution', '@/hooks/use-toast': 'toast' };
await build({ stdin: { contents: `import React from'react';import{createRoot}from'react-dom/client';import Form from'${root}/src/app/(dashboard)/teams/new/page';
const q=new URLSearchParams(location.search);window.events=[];window.squadNativeBilling={postMessage:()=>{window.events.push({kind:'unexpected-store-operation'});throw Error('STORE_OPERATION_NOT_ALLOWED')}};
window.team={proQuotaStatus:{remaining:Number(q.get('remaining')||0)},activeTeam:q.has('school')?{id:'school',type:'school'}:{id:'demo',isDemo:true},isSchoolAdmin:q.has('school'),
createNewTeam:async(...args)=>{window.events.push({kind:'create',plan:args[4],type:args[1]});if(q.has('failure'))throw Error('Fixture creation failure');return q.has('empty')?'':'owned-created-team'},
setActiveTeam:team=>{window.events.push({kind:'select-team',id:team.id});window.team.activeTeam={id:team.id,ownerUserId:'fixture-user',isDemo:false}}};
createRoot(document.getElementById('root')).render(<Form/>);`, resolveDir: root, loader: 'tsx' }, bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', outfile: path.join(out, 'bundle.js'), plugins: [{ name: 'fictional-boundaries', setup(b) {
    b.onResolve({ filter: /^(next\/|@\/)/ }, args => {
      if (aliases[args.path]) return { path: aliases[args.path], namespace: 'fixture' };
      if (!args.path.startsWith('@/')) return;
      const base = path.join(root, 'src', args.path.slice(2));
      const extension = ['', '.tsx', '.ts', '.js'].find(ext => ts.sys.fileExists(base + ext));
      assert.notEqual(extension, undefined, base); return { path: base + extension };
    });
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: root, loader: 'jsx', contents: stubs[args.path] }));
  } }], });
const config = (await import(path.join(root, 'postcss.config.mjs'))).default;
const name = Object.keys(config.plugins)[0], plugin = (await import(name)).default;
const css = await postcss([plugin(name === 'tailwindcss' ? { config: path.join(root, 'tailwind.config.ts') } : { base: root })]).process(await fs.readFile(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', req.url === '/bundle.js' ? 'application/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html');
  res.end(req.url === '/bundle.js' ? await fs.readFile(path.join(out, 'bundle.js')) : req.url === '/style.css' ? css.css : '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const scenarios = [
  { name: 'store Pro without slots', query: 'tier=pro', plan: 'team', destination: '/subscriptions' },
  { name: 'store Starter', query: 'tier=starter', plan: 'free', destination: '/feed' },
  { name: 'store Pro with included slot', query: 'tier=pro&remaining=1', plan: 'team', destination: '/feed' },
  { name: 'select Pro from Starter form', query: 'tier=starter', selectPro: true, plan: 'team', destination: '/subscriptions' },
  { name: 'empty creation result fails closed', query: 'tier=pro&empty=1', error: 'Unable to create the squad. Please try again.' },
  { name: 'creation error does not navigate', query: 'tier=pro&failure=1', error: 'Fixture creation failure' },
  { name: 'school Pro without slots', query: 'tier=starter&school=1', plan: 'team', destination: '/subscriptions' },
  { name: 'web retains Billing handoff', query: 'tier=pro&store=0', plan: 'team', destination: '/dashboard/billing' },
];
const result = { engine, scope: 'Actual native creation form; fictional creator/router; no real accounts, teams or store requests', cases: [], errors: [], externalRequests: [] };
let browser;
try {
  browser = await engines[engine].launch({ ...(engine === 'chromium' ? { channel: 'chrome' } : {}), headless: true });
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      result.externalRequests.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(5000);
    page.on('pageerror', error => result.errors.push(error.message));
    await page.goto(origin + '/?' + scenario.query);
    await page.getByText('Starter Squad', { exact: true }).waitFor();
    const store = !scenario.query.includes('store=0');
    if (store) {
      await page.getByText('Pro Team', { exact: true }).waitFor();
      assert.equal(await page.getByText('Stripe payment required to activate', { exact: true }).count(), 0);
      if (!scenario.query.includes('remaining=1')) await page.getByText('View store plans', { exact: true }).waitFor();
      if (scenario.selectPro) await page.getByText('Pro Team', { exact: true }).tap();
    }
    await page.getByPlaceholder('e.g. Metro Elite U14').fill('Fictional handoff check');
    if (scenario.destination === '/subscriptions') await page.getByRole('button', { name: 'Create Then Upgrade →', exact: true }).waitFor();
    if (scenario.name === 'store Pro without slots') {
      await page.getByRole('button', { name: 'Create Then Upgrade →', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, 'pro-creation-handoff.png') });
    }
    await page.getByRole('button', { name: /Create Then Upgrade|Deploy Squad Hub/ }).tap();
    if (scenario.error) {
      await page.getByRole('alert').getByText(scenario.error, { exact: true }).waitFor();
    } else await page.waitForFunction(() => window.events.some(event => event.kind === 'navigate'));
    const events = await page.evaluate(() => window.events);
    if (scenario.error) assert.equal(events.filter(e => e.kind === 'navigate' || e.kind === 'select-team').length, 0);
    else {
      assert.deepEqual(events.filter(e => ['create','select-team','navigate'].includes(e.kind)), [
        { kind: 'create', plan: scenario.plan, type: scenario.query.includes('school=1') ? 'school_squad' : 'adult' },
        { kind: 'select-team', id: 'owned-created-team' }, { kind: 'navigate', href: scenario.destination },
      ]);
    }
    assert.equal(events.filter(e => e.kind === 'unexpected-store-operation').length, 0);
    result.cases.push({ name: scenario.name, status: 'PASS', destination: scenario.destination || null, realTeamWrites: 0, storeOperations: 0 });
    await context.close();
  }
  assert.deepEqual(result.errors, []); assert.deepEqual(result.externalRequests, []); result.status = 'PASS';
} catch (error) { result.status = 'FAIL'; result.failure = error.stack; process.exitCode = 1; }
finally {
  if (browser) await browser.close(); await new Promise(resolve => server.close(resolve));
  await fs.rm(path.join(out, 'bundle.js'), { force: true }); result.ownedBrowserAndServerClosed = true;
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
}
