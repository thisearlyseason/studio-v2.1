import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('root application registers The Squad service worker', async () => {
  const layout = await source('../src/app/layout.tsx');
  const registration = await source('../src/components/pwa/AppServiceWorkerRegistration.tsx');
  const registrationHelper = await source('../src/lib/service-worker-registration.ts');
  const manifest = JSON.parse(await source('../public/manifest.json'));
  assert.match(layout, /AppServiceWorkerRegistration/);
  assert.match(registration, /registerPrimaryServiceWorker/);
  assert.match(registrationHelper, /navigator\.serviceWorker\.register\(workerUrl, \{[\s\S]*scope: '\/'/);
  assert.equal(manifest.name, 'The Squad');
  assert.equal(manifest.start_url, '/dashboard');
  assert.equal(manifest.id, '/');
  assert.equal(manifest.scope, '/');
});

test('worker never caches authenticated dashboard HTML', async () => {
  const worker = await source('../public/sw.js');
  assert.match(worker, /'\/offline\.html'/);
  assert.match(worker, /event\.request\.mode === 'navigate'/);
  assert.doesNotMatch(worker, /cache\.addAll\(\[[^\]]*'\/dashboard'/);
  assert.match(worker, /payload\?\.webPush/);
  assert.match(worker, /messaging\.onBackgroundMessage/);
});
