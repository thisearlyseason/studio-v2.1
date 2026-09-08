import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const workerSource = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

function workerHarness({ cacheNames = [], fetchImpl = async () => ({ ok: true, clone() { return this; } }) } = {}) {
  const listeners = new Map();
  const deletedCaches = [];
  const cacheWrites = [];
  const cacheEntries = new Map();
  const names = new Set(cacheNames);
  const normalize = request => {
    if (typeof request === 'string') return request;
    const url = new URL(request.url);
    return url.origin === 'https://example.test' ? url.pathname : url.href;
  };
  const cache = {
    async addAll(urls) {
      for (const url of urls) cacheEntries.set(url, { source: `precache:${url}` });
    },
    async match(request) { return cacheEntries.get(normalize(request)); },
    async put(request, response) {
      const key = normalize(request);
      cacheWrites.push(key);
      cacheEntries.set(key, response);
    },
  };
  const caches = {
    async open(name) { names.add(name); return cache; },
    async keys() { return [...names]; },
    async delete(name) { deletedCaches.push(name); names.delete(name); return true; },
    async match(request) { return cacheEntries.get(normalize(request)); },
  };
  const state = { claimed: 0, skipped: 0 };
  const context = {
    URL,
    console,
    caches,
    fetch: fetchImpl,
    clients: {},
    self: {
      location: { href: 'https://example.test/sw.js', origin: 'https://example.test' },
      registration: { showNotification: async () => {} },
      addEventListener(type, listener) { listeners.set(type, listener); },
      skipWaiting() { state.skipped += 1; },
      clients: { claim() { state.claimed += 1; } },
    },
  };
  vm.runInNewContext(workerSource, context);
  return { cache, cacheEntries, cacheWrites, caches, deletedCaches, listeners, state };
}

async function dispatchLifecycle(listeners, type) {
  let completion;
  listeners.get(type)({ waitUntil(promise) { completion = promise; } });
  await completion;
}

async function dispatchFetch(listeners, path, fetchOptions = {}) {
  let responsePromise;
  listeners.get('fetch')({
    request: {
      method: fetchOptions.method || 'GET',
      mode: fetchOptions.mode || 'navigate',
      url: `https://example.test${path}`,
    },
    respondWith(promise) { responsePromise = promise; },
  });
  return responsePromise ? responsePromise : undefined;
}

test('service-worker activation removes every stale cache before claiming clients', async () => {
  const harness = workerHarness({ cacheNames: ['the-squad-shell-v10', 'the-squad-shell-v9', 'corrupt-partial-cache'] });

  await dispatchLifecycle(harness.listeners, 'activate');

  assert.deepEqual(new Set(harness.deletedCaches), new Set(['the-squad-shell-v9', 'corrupt-partial-cache']));
  assert.equal(harness.state.claimed, 1);
  assert.deepEqual(await harness.caches.keys(), ['the-squad-shell-v10']);
});

test('service-worker activation does not claim pages until stale-cache cleanup finishes', async () => {
  const harness = workerHarness({ cacheNames: ['the-squad-shell-v10', 'corrupt-partial-cache'] });
  let finishDeletion;
  harness.caches.delete = async name => {
    harness.deletedCaches.push(name);
    await new Promise(resolve => { finishDeletion = resolve; });
    return true;
  };
  let completion;
  harness.listeners.get('activate')({ waitUntil(promise) { completion = promise; } });
  await Promise.resolve();

  assert.equal(harness.state.claimed, 0);
  finishDeletion();
  await completion;
  assert.equal(harness.state.claimed, 1);
});

test('a failed precache rejects installation instead of activating a partial update', async () => {
  const harness = workerHarness();
  harness.cache.addAll = async () => { throw new Error('corrupt cache write'); };
  let completion;
  harness.listeners.get('install')({ waitUntil(promise) { completion = promise; } });

  await assert.rejects(completion, /corrupt cache write/);
  assert.equal(harness.state.skipped, 1);
  assert.equal(harness.state.claimed, 0);
});

test('authenticated navigation is never cached and falls back only to the public offline page', async () => {
  let online = true;
  const onlineDashboard = { ok: true, kind: 'private-dashboard', clone() { return this; } };
  const harness = workerHarness({
    fetchImpl: async request => {
      if (!online) throw new Error('offline');
      assert.equal(new URL(request.url).pathname, '/dashboard');
      return onlineDashboard;
    },
  });
  harness.cacheEntries.set('/offline.html', { kind: 'public-offline' });

  assert.equal(await dispatchFetch(harness.listeners, '/dashboard'), onlineDashboard);
  assert.deepEqual(harness.cacheWrites, []);

  online = false;
  assert.deepEqual(await dispatchFetch(harness.listeners, '/dashboard'), { kind: 'public-offline' });
  assert.equal(harness.cacheEntries.has('/dashboard'), false);
});

test('post-logout offline navigation cannot reveal a prior authenticated response', async () => {
  const stalePrivateResponse = { kind: 'prior-user-private-data' };
  const harness = workerHarness({ fetchImpl: async () => { throw new Error('offline'); } });
  harness.cacheEntries.set('/dashboard', stalePrivateResponse);
  harness.cacheEntries.set('/offline.html', { kind: 'public-offline' });

  const response = await dispatchFetch(harness.listeners, '/dashboard');

  assert.notEqual(response, stalePrivateResponse);
  assert.deepEqual(response, { kind: 'public-offline' });
});
