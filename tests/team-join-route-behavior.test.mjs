import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

async function loadRoute() {
  const stubs = {
    'next/server': `
      export class NextResponse extends Response {
        static json(body, init={}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }); }
      }
      export class NextRequest extends Request { constructor(url, init) { super(url, init); this.nextUrl = new URL(url); } }
    `,
    '@/lib/firebase-admin': `export const adminDb = globalThis.__TASK4_JOIN_DB;`,
    '@/lib/api-auth': `
      export async function verifyFirebaseToken() { return globalThis.__TASK4_JOIN_AUTH; }
      export function assertNonAnonymous() { return null; }
    `,
    '@/lib/account-membership-policy': `export function safeJoinPosition({ joiningLinkedChild }) { return joiningLinkedChild ? 'Player' : 'Member'; }`,
    '@/lib/server-request-guards': `
      export class RequestBodyError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
      export async function enforceUserRateLimit() { return null; }
      export async function readJsonBodyWithLimit(request) { return request.json(); }
    `,
    '@/lib/staff-position': `export function hasStaffRole(data) { return ['Admin','Coach','Head Coach'].includes(data?.position); }`,
    '@/lib/server-team-access': `export async function findActiveTeamMember() { return null; }`,
    '@/lib/public-portal-data': `export function permitsLegacyOrPaidPortals() { return true; }`,
    'firebase-admin/firestore': `
      export const FieldValue = { arrayUnion: (...values) => ({ __arrayUnion: values }), serverTimestamp: () => 'server-time' };
      export const Timestamp = { fromMillis: value => ({ toMillis: () => value, toDate: () => new Date(value) }) };
    `,
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/app/api/teams/join/route.ts', import.meta.url))],
    bundle: true, format: 'esm', platform: 'node', target: 'node20', write: false, logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(esbuild) {
      esbuild.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'stub' } : null);
      esbuild.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Date.now()}-${Math.random()}`);
}

function memoryDb(initial) {
  const records = new Map(Object.entries(initial).map(([path, value]) => [path, structuredClone(value)]));
  const snapshot = ref => ({
    id: ref.id, ref, exists: records.has(ref.path),
    data: () => structuredClone(records.get(ref.path)),
  });
  const applyMerge = (prior, value) => Object.fromEntries(Object.entries({ ...(prior || {}), ...value }).map(([key, item]) => [
    key,
    item?.__arrayUnion ? [...new Set([...(prior?.[key] || []), ...item.__arrayUnion])] : item,
  ]));
  class DocRef {
    constructor(path) { this.path = path; this.id = path.split('/').at(-1); }
    collection(name) { return new CollectionRef(`${this.path}/${name}`); }
    async get() { return snapshot(this); }
    async set(value, options) { records.set(this.path, options?.merge ? applyMerge(records.get(this.path), value) : structuredClone(value)); }
  }
  class Query {
    constructor(path, filters=[]) { this.path=path; this.filters=filters; }
    where(field, _operator, value) { return new Query(this.path, [...this.filters, [field, value]]); }
    limit() { return this; }
    async get() {
      const depth = this.path.split('/').length + 1;
      const docs = [...records.entries()].filter(([path, value]) => path.startsWith(`${this.path}/`) && path.split('/').length === depth && this.filters.every(([field, expected]) => value[field] === expected)).map(([path]) => snapshot(new DocRef(path)));
      return { docs, empty: docs.length === 0, size: docs.length };
    }
  }
  class CollectionRef extends Query { doc(id='generated') { return new DocRef(`${this.path}/${id}`); } }
  const db = {
    collection(name) { return new CollectionRef(name); },
    async runTransaction(work) {
      const writes = [];
      const transaction = {
        get(ref) { return ref.get(); },
        create(ref, value) { if (records.has(ref.path)) throw new Error('ALREADY_EXISTS'); writes.push(['set', ref, value, false]); },
        set(ref, value, options) { writes.push(['set', ref, value, options?.merge]); },
        delete(ref) { writes.push(['delete', ref]); },
      };
      const result = await work(transaction);
      for (const [kind, ref, value, merge] of writes) {
        if (kind === 'delete') records.delete(ref.path);
        else records.set(ref.path, merge ? applyMerge(records.get(ref.path), value) : structuredClone(value));
      }
      return result;
    },
  };
  return { db, records };
}

function request(path, body) {
  return new Request(`http://127.0.0.1${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
}

test('inactive code-only preview and consumption both fail closed without membership writes', async () => {
  const { db, records } = memoryDb({
    'teams/inactive-team': { id: 'inactive-team', name: 'Inactive', code: 'INACTIVE1', isActive: false },
    'users/adult-1': { id: 'adult-1', role: 'adult_player', fullName: 'Adult One' },
  });
  globalThis.__TASK4_JOIN_DB = db;
  globalThis.__TASK4_JOIN_AUTH = { uid: 'adult-1', email: 'adult@example.test', role: 'adult_player' };
  const route = await loadRoute();
  const preview = await route.GET({ nextUrl: new URL('http://127.0.0.1/api/teams/join?code=INACTIVE1'), headers: new Headers() });
  const consume = await route.POST(request('/api/teams/join', { code: 'INACTIVE1' }));
  assert.equal(preview.status, 404);
  assert.equal(consume.status, 409);
  assert.equal([...records.keys()].some(path => path.includes('/members/') || path.includes('/teamMemberships/')), false);
});

test('guardian child enrollment preserves the accountless child identity', async () => {
  const { db, records } = memoryDb({
    'teams/team-a': { id: 'team-a', name: 'Team A', code: 'TEAMCODE1', isActive: true },
    'users/parent-1': { id: 'parent-1', role: 'parent', fullName: 'Parent One' },
    'players/p_child': { id: 'p_child', firstName: 'Child', lastName: 'One', parentId: 'parent-1', userId: null, hasLogin: false, joinedTeamIds: [] },
  });
  globalThis.__TASK4_JOIN_DB = db;
  globalThis.__TASK4_JOIN_AUTH = { uid: 'parent-1', email: 'parent@example.test', role: 'parent' };
  const route = await loadRoute();
  const response = await route.POST(request('/api/teams/join', { code: 'TEAMCODE1', playerId: 'p_child', enrollmentIntent: 'player' }));
  assert.equal(response.status, 200);
  assert.equal(records.get('players/p_child').userId, null);
  assert.equal(records.get('players/p_child').hasLogin, false);
  assert.equal(records.get('teams/team-a/members/p_child').userId, null);
  assert.equal(records.get('teams/team-a/members/p_child').parentId, 'parent-1');
  assert.equal(records.get('users/parent-1/teamMemberships/team-a').teamId, 'team-a');
});

test('adult self enrollment resolves the persisted player identity from the authenticated account', async () => {
  const { db, records } = memoryDb({
    'teams/team-a': { id: 'team-a', name: 'Team A', code: 'TEAMCODE1', isActive: true },
    'users/adult-1': { id: 'adult-1', role: 'adult_player', fullName: 'Adult One' },
    'players/p_existing-adult': {
      id: 'p_existing-adult', firstName: 'Adult', lastName: 'One', userId: 'adult-1',
      parentId: null, hasLogin: true, joinedTeamIds: ['team-old'],
    },
  });
  globalThis.__TASK4_JOIN_DB = db;
  globalThis.__TASK4_JOIN_AUTH = { uid: 'adult-1', email: 'adult@example.test', role: 'adult_player' };
  const route = await loadRoute();
  const response = await route.POST(request('/api/teams/join', { code: 'TEAMCODE1', enrollmentIntent: 'player' }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.playerId, 'p_existing-adult');
  assert.deepEqual(records.get('players/p_existing-adult').joinedTeamIds, ['team-old', 'team-a']);
  assert.equal(records.has('players/p_adult-1'), false);
  assert.equal(records.get('teams/team-a/members/adult-1').playerId, 'p_existing-adult');
});
