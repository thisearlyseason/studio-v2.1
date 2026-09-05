import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

async function importRoute(relativePath) {
  const stubs = {
    'next/server': `export class NextResponse extends Response { static json(body, init={}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }); } } export class NextRequest extends Request { constructor(url, init) { super(url, init); this.nextUrl = new URL(url); } }`,
    '@/lib/firebase-admin': `export const adminDb = {}; export function ensureAdminInit() {}`,
    '@/lib/api-auth': `export async function verifyFirebaseToken() { return new Response('{}', { status: 401 }); }`,
    '@/lib/server-request-guards': `export class RequestBodyError extends Error {}; export async function enforcePublicRateLimit() { return null; } export async function enforceUserRateLimit() { return null; } export async function readJsonBodyWithLimit(req) { return req.json(); }`,
    'firebase-admin': `export default { firestore: { FieldValue: { delete() {} } }, auth() {} }; export const firestore = { FieldValue: { delete() {}, serverTimestamp() {} } };`,
    'firebase-admin/firestore': `export const FieldValue = { delete() {}, serverTimestamp() {} };`,
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL(relativePath, import.meta.url))], bundle: true,
    format: 'esm', platform: 'node', target: 'node20', write: false, logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(esbuild) {
      esbuild.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'stub' } : null);
      esbuild.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

test('the legacy youth invite endpoint delegates to the canonical Family invite contract', async () => {
  const [canonical, legacy] = await Promise.all([
    importRoute('../src/app/api/invites/youth/route.ts'),
    importRoute('../src/app/api/youth-invites/route.ts'),
  ]);
  for (const method of ['GET', 'POST', 'PUT']) assert.equal(typeof legacy[method], 'function', method);

  const request = pathname => ({ nextUrl: new URL(`http://127.0.0.1${pathname}?token=bad`), headers: new Headers() });
  const canonicalResponse = await canonical.GET(request('/api/invites/youth'));
  const legacyResponse = await legacy.GET(request('/api/youth-invites'));
  assert.equal(canonicalResponse.status, 404);
  assert.equal(legacyResponse.status, canonicalResponse.status);
  assert.deepEqual(await legacyResponse.json(), await canonicalResponse.json());
});
