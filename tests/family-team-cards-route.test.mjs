import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build } from 'esbuild';

async function loadRoute() {
  const stubs = {
    'next/server': `
      export class NextResponse extends Response {
        static json(body, init={}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json' } }); }
      }
      export class NextRequest extends Request {}
    `,
    '@/lib/firebase-admin': `export const adminDb = globalThis.__TASK4_FAMILY_DB;`,
    '@/lib/api-auth': `export async function verifyFirebaseToken() { return globalThis.__TASK4_FAMILY_AUTH; }`,
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/app/api/family/teams/route.ts', import.meta.url))],
    bundle: true, format: 'esm', platform: 'node', target: 'node20', write: false, logLevel: 'silent',
    plugins: [{ name: 'stubs', setup(esbuild) {
      esbuild.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'stub' } : null);
      esbuild.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: stubs[args.path], loader: 'js' }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Date.now()}-${Math.random()}`);
}

function memoryDb(records) {
  const values = new Map(Object.entries(records));
  const snapshot = ref => ({ id: ref.id, exists: values.has(ref.path), data: () => structuredClone(values.get(ref.path)) });
  class DocRef {
    constructor(path) { this.path = path; this.id = path.split('/').at(-1); }
    async get() { return snapshot(this); }
  }
  class Query {
    constructor(path, filters = []) { this.path = path; this.filters = filters; }
    where(field, _operator, value) { return new Query(this.path, [...this.filters, [field, value]]); }
    async get() {
      const depth = this.path.split('/').length + 1;
      const docs = [...values.entries()]
        .filter(([path, value]) => path.startsWith(`${this.path}/`) && path.split('/').length === depth && this.filters.every(([field, expected]) => value[field] === expected))
        .map(([path]) => snapshot(new DocRef(path)));
      return { docs, empty: docs.length === 0 };
    }
  }
  class CollectionRef extends Query { doc(id) { return new DocRef(`${this.path}/${id}`); } }
  return {
    collection(path) { return new CollectionRef(path); },
    async getAll(...refs) { return refs.map(snapshot); },
  };
}

test('family team cards derive child squads from the verified guardian and expose safe metadata only', async () => {
  globalThis.__TASK4_FAMILY_AUTH = { uid: 'guardian-a', role: 'parent' };
  globalThis.__TASK4_FAMILY_DB = memoryDb({
    'users/guardian-a': { role: 'parent' },
    'players/child-a': { parentId: 'guardian-a', joinedTeamIds: ['team-a', 'team-c'] },
    'players/other-child': { parentId: 'guardian-b', joinedTeamIds: ['team-b'] },
    'teams/team-a': { name: 'Falcons', teamLogoUrl: 'https://example.test/a.png', ownerUserId: 'private-owner-a', contactEmail: 'private-a@example.test' },
    'teams/team-b': { name: 'Bluebirds', ownerUserId: 'private-owner-b' },
    'teams/team-c': { teamName: 'Goldens', heroImageUrl: 'https://example.test/c.png', ownerUserId: 'private-owner-c' },
  });
  const route = await loadRoute();
  const response = await route.GET(new Request('http://127.0.0.1/api/family/teams?guardianUid=guardian-b&childUid=other-child'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    teams: [
      { id: 'team-a', name: 'Falcons', teamLogoUrl: 'https://example.test/a.png' },
      { id: 'team-c', name: 'Goldens', heroImageUrl: 'https://example.test/c.png' },
    ],
  });
});

test('family team cards reject non-guardian roles without revealing squad existence', async () => {
  globalThis.__TASK4_FAMILY_AUTH = { uid: 'adult-a', role: 'adult_player' };
  globalThis.__TASK4_FAMILY_DB = memoryDb({
    'users/adult-a': { role: 'adult_player' },
    'players/child-a': { parentId: 'adult-a', joinedTeamIds: ['team-a'] },
    'teams/team-a': { name: 'Falcons' },
  });
  const route = await loadRoute();
  const response = await route.GET(new Request('http://127.0.0.1/api/family/teams'));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Family access required.' });
});

test('family cards merge server-derived child squads into every family consumer', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/family/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /fetch\('\/api\/family\/teams'/);
  assert.match(source, /const familyTeams = useMemo/);
  assert.match(source, /<ChildCard key=\{child\.id\} child=\{child\} teams=\{familyTeams\}/);
  assert.match(source, /fetch\('\/api\/family\/children'/);
  assert.match(source, /Unlink from/);
  assert.match(source, /Remove Athlete/);
});
