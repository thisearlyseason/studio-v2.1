import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('store registration checkout denies before body, database, rate-limit or Stripe access', async () => {
  const key = 'nativeCheckoutBoundary_' + crypto.randomUUID();
  globalThis[key] = [];
  const fail = `(...args)=>{globalThis[${JSON.stringify(key)}].push(args);throw Error('Forbidden boundary access');}`;
  const stubs = {
    '@/lib/app-distribution': 'export const isStoreDistribution=true;',
    '@/lib/firebase-admin': `export const adminDb=new Proxy({}, {get:${fail}});`,
    '@/lib/stripe-client': `export const getStripe=${fail};`,
    '@/lib/server-stripe-connect': `export const resolveTeamConnectAccount=${fail};`,
    '@/lib/server-request-guards': `export const readJsonBodyWithLimit=${fail};export const enforceUserRateLimit=${fail};`,
    'next/server': 'export class NextResponse extends Response{static json(body,init){return new NextResponse(JSON.stringify(body),init)}}',
  };
  const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/app/api/tournaments/registration-checkout/route.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'forbidden-network-and-data', setup(b) { b.onResolve({filter:/.*/}, args => Object.hasOwn(stubs,args.path) ? {path:args.path,namespace:'boundary'} : null);b.onLoad({filter:/.*/,namespace:'boundary'},args=>({contents:stubs[args.path],loader:'js'})); } }] });
  try {
    const route = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
    const result = await route.POST(new Request('https://local.invalid/api/tournaments/registration-checkout', { method: 'POST', body: '{}' }));
    assert.equal(result.status, 403);
    assert.deepEqual(globalThis[key], []);
  } finally { delete globalThis[key]; }
});
