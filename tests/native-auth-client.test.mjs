import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeAuthClient } from '../src/lib/native-auth/client.ts';
const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const id = '354db8df-388a-4a87-a239-1fa8ce4d8023';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup() {
  const native = deferred(), calls = [], states = [];
  const deps = {
    transport: { begin: async message => { calls.push(['begin', message]); return native.promise; }, cancel: requestId => calls.push(['cancel', requestId]) },
    random: { secret: () => secret, requestId: () => id, hash: async () => secret },
    fetcher: async (_url, options) => { calls.push(['redeem', JSON.parse(options.body)]); return Response.json({ uid: 'qa-coach', customToken: 'test-custom', returnPath: null }); },
    auth: { signIn: async token => { calls.push(['signIn', token]); return { uid: 'qa-coach' }; }, signOut: async () => { calls.push(['signOut']); } },
    session: { establish: async () => { calls.push(['session']); }, readUid: async () => 'qa-coach', clear: async () => { calls.push(['clear']); } },
    onState: state => states.push(state),
  };
  const client = createNativeAuthClient(deps);
  const ready = onboarding => native.resolve({ version: 1, type: 'ready', requestId: id, handle: secret, needsOnboarding: onboarding });
  return { deps, client, calls, states, ready, native };
}

test('successful handoff verifies both identities before releasing navigation', async () => {
  const f = setup(), pending = f.client.begin('google.com');
  f.ready(false); await pending;
  assert.deepEqual(f.calls.map(c => c[0]), ['begin', 'redeem', 'signIn', 'session']);
  assert.equal(f.states.at(-1).phase, 'verified');
  f.client.dispose();
});

test('cancelled native callback cannot redeem or sign in', async () => {
  const f = setup(), pending = f.client.begin('google.com');
  await f.client.cancel(); f.ready(false); await pending;
  assert.equal(f.calls.some(c => c[0] === 'redeem' || c[0] === 'signIn'), false);
  assert.equal(f.states.at(-1).phase, 'idle');
  f.client.dispose();
});

test('duplicate requests do not launch two providers', async () => {
  const f = setup(), pending = f.client.begin('google.com');
  await assert.rejects(f.client.begin('apple.com'), /in progress/);
  f.ready(false); await pending;
  assert.equal(f.calls.filter(c => c[0] === 'begin').length, 1);
  f.client.dispose();
});

test('new users submit explicit onboarding before receiving a credential', async () => {
  const f = setup(), pending = f.client.begin('google.com'); f.ready(true); await pending;
  assert.equal(f.states.at(-1).phase, 'onboarding');
  assert.equal(f.calls.some(c => c[0] === 'redeem'), false);
  await f.client.submitOnboarding({ fullName: 'QA Coach', role: 'coach', adultConfirmed: true, termsAccepted: true, joinCode: '' });
  assert.equal(f.calls.find(c => c[0] === 'redeem')[1].onboarding.adultConfirmed, true);
  assert.equal(f.states.at(-1).phase, 'verified');
  f.client.dispose();
});

test('a replaced callback cannot grant a session', async () => {
  const f = setup(), pending = f.client.begin('google.com');
  f.native.resolve({ version: 1, type: 'ready', requestId: 'ed055c0d-e051-4c78-8650-dfa1c2ac4d6f', handle: secret, needsOnboarding: false });
  await pending;
  assert.equal(f.calls.some(c => c[0] === 'signIn'), false);
  assert.equal(f.states.at(-1).phase, 'failed');
  f.client.dispose();
});

test('cancellation during unabortable Firebase sign-in cleans up before accepting another login', async () => {
  const f = setup(), firebase = deferred(), started = deferred();
  f.deps.auth.signIn = async () => { started.resolve(); return firebase.promise; };
  const pending = f.client.begin('google.com'); f.ready(false); await started.promise;
  const cancel = f.client.cancel();
  await assert.rejects(f.client.begin('google.com'), /in progress/);
  firebase.resolve({ uid: 'qa-coach' }); await pending; await cancel;
  assert.equal(f.calls.some(c => c[0] === 'session'), false);
  assert.equal(f.calls.some(c => c[0] === 'signOut'), true);
  assert.equal(f.calls.some(c => c[0] === 'clear'), true);
  assert.equal(f.states.at(-1).phase, 'idle');
  f.client.dispose();
});

test('UID mismatch in either Firebase or the server rolls back without navigation', async () => {
  for (const which of ['firebase', 'server']) {
    const f = setup();
    if (which === 'firebase') f.deps.auth.signIn = async () => ({ uid: 'different' });
    else f.deps.session.readUid = async () => 'different';
    const pending = f.client.begin('google.com'); f.ready(false); await pending;
    assert.equal(f.states.at(-1).phase, 'failed');
    assert.equal(f.calls.some(c => c[0] === 'signOut'), true);
    f.client.dispose();
  }
});

test('failed exchange keeps native credentials out of browser state and logs', async () => {
  const f = setup(); f.deps.fetcher = async () => Response.json({ error: 'sensitive server detail' }, { status: 503 });
  const pending = f.client.begin('google.com'); f.ready(false); await pending;
  assert.equal(f.states.at(-1).phase, 'failed');
  assert.equal(JSON.stringify(f.states).includes('sensitive'), false);
  assert.equal(f.calls.some(c => c[0] === 'signIn'), false);
  f.client.dispose();
});

test('failed cleanup keeps navigation and further login locked', async () => {
  const f = setup();
  f.deps.session.readUid = async () => 'wrong';
  f.deps.auth.signOut = async () => { throw new Error('cleanup failed'); };
  const pending = f.client.begin('google.com'); f.ready(false); await pending;
  assert.equal(f.states.at(-1).locked, true);
  assert.equal(f.calls.some(c => c[0] === 'clear'), true, 'cookie cleanup still runs when Firebase sign-out fails');
  await assert.rejects(f.client.begin('google.com'), /in progress/);
  f.client.dispose();
});

test('web identity becomes persistent only after both UID checks', async () => {
  const f = setup();
  f.deps.auth.persist = async () => { f.calls.push(['persist']); };
  const pending = f.client.begin('google.com'); f.ready(false); await pending;
  assert.deepEqual(f.calls.map(c => c[0]), ['begin', 'redeem', 'signIn', 'session', 'persist']);
  f.client.dispose();
});

test('cancel during persistence still rolls back instead of navigating', async () => {
  const f = setup(), persistence = deferred(), started = deferred();
  f.deps.auth.persist = async () => { started.resolve(); await persistence.promise; };
  const pending = f.client.begin('google.com'); f.ready(false);
  await Promise.race([started.promise, pending]);
  assert.equal(f.states.some(state => state.phase === 'verified'), false);
  const cancel = f.client.cancel(); persistence.resolve(); await pending; await cancel;
  assert.equal(f.calls.some(c => c[0] === 'signOut'), true);
  assert.equal(f.states.at(-1).phase, 'idle');
  f.client.dispose();
});
