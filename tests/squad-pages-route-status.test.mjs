import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const bundle = await build({ stdin: { contents: `export * from './src/lib/squad-pages/route-status'; export * from './src/lib/squad-pages/store'; export * from './src/lib/squad-pages/fixtures'; export * from './src/lib/squad-pages/service';`, resolveDir: root }, bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent', alias: { '@': root + '/src' }, plugins: [{ name: 'isolated-route-test', setup(b) {
  b.onResolve({ filter: /^next\/server$/ }, () => ({ path: pathToFileURL(require.resolve('next/server')).href, external: true }));
  b.onResolve({ filter: /firebase-admin/ }, () => ({ path: 'sdk', namespace: 'blocked' }));
  b.onLoad({ filter: /.*/, namespace: 'blocked' }, () => ({ contents: 'export const adminDb = new Proxy({}, {get(){throw Error("Provider forbidden")}});', loader: 'js' }));
} }] });
const m = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const entity = { kind: 'team', id: 'demo-hawks' }, actor = { uid: 'demo-owner' };
async function published() {
  const store = m.memoryStore(m.previewRecords());
  let record = (await m.mutatePage(store, actor, { entity, action: 'save', expectedVersion: 0, content: m.fictionalContent() })).record;
  record = (await m.mutatePage(store, actor, { entity, action: 'publish', expectedVersion: record.version, revision: record.draft.revision })).record;
  return { store, record };
}
test('absent and malformed public routes resolve before rendering without provider calls', async () => {
  const store = m.memoryStore(m.previewRecords());
  for (const route of ['/p/absent-route-test', '/p', '/p/', '/p/a/b', '/p/%ZZ', '/p/%2F', '/p/BadSlug']) assert.equal(await m.squadPublicRouteExists(route, store), false, route);
});
test('current published record remains routable including trailing slash', async () => {
  const { store, record } = await published();
  assert.equal(await m.squadPublicRouteExists('/p/' + record.slug, store), true);
  assert.equal(await m.squadPublicRouteExists('/p/' + record.slug + '/', store), true);
});
test('unpublished record is a real missing route, never private draft delivery', async () => {
  const { store, record } = await published();
  await m.mutatePage(store, actor, { entity, action: 'unpublish', expectedVersion: record.version });
  assert.equal(await m.squadPublicRouteExists('/p/' + record.slug, store), false);
});
test('coverage-expired publication cannot pass the pre-stream route check', async () => {
  const { store, record } = await published();
  await store.run(async scope => { const team = await scope.get('teams/demo-hawks'); scope.set('teams/demo-hawks', { ...team, isPro: false, planId: 'free' }); const user = await scope.get('users/demo-owner'); scope.set('users/demo-owner', { ...user, plan_type: 'free', subscription_status: 'canceled' }); const page = await scope.get('squadPagesPrivate/' + record.key); scope.set('squadPagesPrivate/' + record.key, { ...page, coverageLostAt: '2000-01-01T00:00:00Z' }); });
  assert.equal(await m.squadPublicRouteExists('/p/' + record.slug, store), false);
});
test('backend failures propagate rather than masquerade as a missing page', async () => {
  await assert.rejects(m.squadPublicRouteExists('/p/valid-slug', { run: async () => { throw Error('synthetic backend failure'); } }), /synthetic backend failure/);
});
test('blocked route produces complete HTTP404 HTML with no-store and noindex', async () => {
  const response = m.squadPageNotFoundResponse();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(await response.text(), /<h1>404<\/h1>/);
});

test('repeated preflight preserves a covered published revision and private draft', async () => {
  const { store, record } = await published();
  const before = await store.run(scope => scope.get('squadPagesPrivate/' + record.key));
  for (let i = 0; i < 3; i++) assert.equal(await m.squadPublicRouteExists('/p/' + record.slug, store), true);
  const after = await store.run(scope => scope.get('squadPagesPrivate/' + record.key));
  assert.deepEqual(after, before);
});
test('first coverage-loss read retains the original grace start across repeated preflight', async () => {
  const { store, record } = await published();
  await store.run(async scope => { const team = await scope.get('teams/demo-hawks'); scope.set('teams/demo-hawks', { ...team, isPro: false, planId: 'free' }); const user = await scope.get('users/demo-owner'); scope.set('users/demo-owner', { ...user, plan_type: 'free', subscription_status: 'canceled' }); });
  assert.equal(await m.squadPublicRouteExists('/p/' + record.slug, store), true);
  const first = await store.run(scope => scope.get('squadPagesPrivate/' + record.key));
  assert.ok(first.coverageLostAt);
  assert.equal(await m.squadPublicRouteExists('/p/' + record.slug, store), true);
  const again = await store.run(scope => scope.get('squadPagesPrivate/' + record.key));
  assert.equal(again.coverageLostAt, first.coverageLostAt);
  assert.equal(again.version, first.version);
  assert.deepEqual(again.draft, first.draft);
});
test('revoked entity becomes unavailable through the existing service reconciliation', async () => {
  const { store, record } = await published();
  const revoked = { run: fn => store.run(scope => fn({ ...scope, get: async key => key === 'teams/demo-hawks' ? null : scope.get(key) })) };
  assert.equal(await m.squadPublicRouteExists('/p/' + record.slug, revoked), false);
  const after = await store.run(scope => scope.get('squadPagesPrivate/' + record.key));
  assert.equal(after.status, 'expired');
  assert.equal(after.publicationRevision, null);
  assert.deepEqual(after.draft, record.draft);
});
