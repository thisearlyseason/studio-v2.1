import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const origin = 'https://thesquadv2-native-store-qa-tylers-projects-5b59182e.vercel.app';
const config = JSON.stringify({ projectId: 'the-squad-audit-preview', apiKey: 'qa-public-key' });
const baseEnv = {
  NODE_ENV: 'production', VERCEL_ENV: 'preview', NEXT_PUBLIC_APP_DISTRIBUTION: 'store',
  QA_VERIFICATION_EMAIL_TRANSPORT: 'firebase', NEXT_PUBLIC_APP_URL: origin,
  GOOGLE_CLOUD_PROJECT: 'the-squad-audit-preview', GCLOUD_PROJECT: 'the-squad-audit-preview',
  FIREBASE_WEBAPP_CONFIG: config, NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: config, RESEND_API_KEY: '',
};

// Replace only external Auth/mail and database-backed guard boundaries.
async function fixture(t, changes = {}) {
  const key = 'qaVerification' + Math.random().toString(36).slice(2);
  const state = { env: { ...baseEnv, ...changes }, mail: [], requests: [], authStatus: 200, limitStatus: 200, verified: false };
  globalThis[key] = state;
  t.after(() => { delete globalThis[key]; });
  const shared = `const s = globalThis[${JSON.stringify(key)}];`;
  const stubs = {
    'next/server': 'export class NextResponse extends Response { static json(body, init) {return new NextResponse(JSON.stringify(body), init);} }',
    '@/lib/api-auth': `import {NextResponse} from 'next/server'; ${shared} export async function verifyFirebaseToken(){return s.authStatus !== 200 ? NextResponse.json({error:'denied'},{status:s.authStatus}) : {uid:'qa-user',email:'qa@example.test',signInProvider:'password'};} export function assertNonAnonymous(){return null;}`,
    '@/lib/firebase-admin': 'export function ensureAdminInit(){}',
    'firebase-admin': `${shared} export function auth(){return {getUser:async()=>({email:'qa@example.test',emailVerified:s.verified,displayName:'QA'}),generateEmailVerificationLink:async()=> 'https://example.test/verification'};}`,
    '@/lib/server-request-guards': `import {NextResponse} from 'next/server'; ${shared} export class RequestBodyError extends Error {} export async function readJsonBodyWithLimit(req){return req.json();} export async function enforceUserRateLimit(){return s.limitStatus===200 ? null : NextResponse.json({error:'limited'},{status:s.limitStatus});}`,
    'resend': `${shared} export class Resend { emails={send:async(message)=>{s.mail.push(message);return {data:{id:'qa-mail'}};}}; }`,
  };
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL('../src/app/api/email/verify-email/route.ts', import.meta.url))],
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
    define: { 'process.env': `globalThis.${key}.env` },
    plugins: [{ name: 'verification-boundaries', setup(b) {
      b.onResolve({ filter: /.*/ }, a => Object.hasOwn(stubs, a.path) ? { path: a.path, namespace: 'boundary' } : null);
      b.onLoad({ filter: /.*/, namespace: 'boundary' }, a => ({ contents: stubs[a.path], loader: 'js' }));
    } }],
  });
  const { POST } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    state.requests.push({ url, options });
    return state.response || Response.json({ email: 'qa@example.test' });
  });
  t.mock.method(console, 'error', () => {});
  return { state, post: (url = origin) => POST(new Request(url + '/api/email/verify-email', {
    method: 'POST', headers: { Authorization: 'Bearer fake-verified-id-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'QA', email: 'not-the-recipient@example.test' }),
  })) };
}

test('approved hosted QA sends verification for the authenticated token without Resend', async t => {
  const { state, post } = await fixture(t);
  const res = await post();
  assert.equal(res.status, 200);
  assert.equal(state.mail.length, 0);
  assert.equal(state.requests.length, 1);
  const { url, options } = state.requests[0];
  assert.equal(url, 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=qa-public-key');
  assert.deepEqual(JSON.parse(options.body), { requestType: 'VERIFY_EMAIL', idToken: 'fake-verified-id-token', continueUrl: origin + '/login?verified=1' });
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(await res.json(), { success: true, transport: 'firebase-qa' });
});

test('ordinary production delivery still uses branded Resend when QA transport is absent', async t => {
  const { state, post } = await fixture(t, { QA_VERIFICATION_EMAIL_TRANSPORT: undefined, VERCEL_ENV: 'production', NEXT_PUBLIC_APP_DISTRIBUTION: 'web', RESEND_API_KEY: 'test-key' });
  assert.equal((await post()).status, 200);
  assert.equal(state.requests.length, 0);
  assert.deepEqual(state.mail[0].to, ['qa@example.test']);
  assert.equal(state.mail[0].from, 'The Squad Pro <noreply@thesquad.pro>');
});

test('QA transport refuses production, foreign projects, malformed config and wrong origins', async t => {
  for (const change of [
    { VERCEL_ENV: 'production' }, { NEXT_PUBLIC_APP_DISTRIBUTION: 'web' },
    { GOOGLE_CLOUD_PROJECT: 'the-squad-v2' }, { GCLOUD_PROJECT: 'the-squad-v2' },
    { FIREBASE_WEBAPP_CONFIG: '{}' }, { FIREBASE_WEBAPP_CONFIG: 'invalid' },
    { NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: JSON.stringify({ projectId: 'the-squad-v2', apiKey: 'other' }) },
    { NEXT_PUBLIC_APP_URL: 'https://www.thesquad.pro' }, { QA_VERIFICATION_EMAIL_TRANSPORT: 'typo' },
    { AUDIT_OUTBOUND_PROVIDER_MODE: 'block' },
  ]) {
    const { state, post } = await fixture(t, change);
    assert.equal((await post()).status, 500, JSON.stringify(change));
    assert.equal(state.requests.length + state.mail.length, 0);
  }
  const { state, post } = await fixture(t);
  assert.equal((await post('https://foreign.example.test')).status, 500);
  assert.equal(state.requests.length, 0);
});

test('auth, rate limiting and already-verified checks precede QA delivery', async t => {
  const { state, post } = await fixture(t);
  state.authStatus = 401;
  assert.equal((await post()).status, 401);
  state.authStatus = 200; state.limitStatus = 429;
  assert.equal((await post()).status, 429);
  state.limitStatus = 200; state.verified = true;
  assert.deepEqual(await (await post()).json(), { success: true, alreadyVerified: true });
  assert.equal(state.requests.length + state.mail.length, 0);
});

test('Firebase rejection fails signup without leaking provider payload or falling back', async t => {
  const { state, post } = await fixture(t);
  state.response = Response.json({ error: { message: 'secret-provider-diagnostic' } }, { status: 400 });
  const res = await post();
  assert.equal(res.status, 500);
  assert.equal(state.requests.length, 1);
  assert.equal(state.mail.length, 0);
  assert.doesNotMatch(await res.text(), /secret-provider/);
});
