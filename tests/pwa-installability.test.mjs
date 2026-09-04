import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import sharp from 'sharp';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('root application registers The Squad service worker', async () => {
  const layout = await source('../src/app/layout.tsx');
  const registration = await source('../src/components/pwa/AppServiceWorkerRegistration.tsx');
  const registrationHelper = await source('../src/lib/service-worker-registration.ts');
  const manifest = JSON.parse(await source('../public/manifest.json'));
  assert.match(layout, /AppServiceWorkerRegistration/);
  assert.match(registration, /registerPrimaryServiceWorker/);
  assert.match(registrationHelper, /navigator\.serviceWorker\.register\('\/sw\.js', \{[\s\S]*scope: '\/'/);
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
  assert.doesNotMatch(worker, /firebase-messaging/);
  assert.doesNotMatch(worker, /messaging\.onBackgroundMessage/);
});

test('manifest ships consistent full-frame regular and dedicated maskable artwork', async () => {
  const manifest = JSON.parse(await source('../public/manifest.json'));
  const regular192 = manifest.icons.find(icon => icon.sizes === '192x192' && icon.purpose === 'any');
  const regular512 = manifest.icons.find(icon => icon.sizes === '512x512' && icon.purpose === 'any');
  const maskable512 = manifest.icons.find(icon => icon.sizes === '512x512' && icon.purpose === 'maskable');

  assert.ok(regular192);
  assert.ok(regular512);
  assert.ok(maskable512);

  const root = new URL('../public/', import.meta.url);
  const [actual192, expected192, maskableMetadata] = await Promise.all([
    sharp(fileURLToPath(new URL(regular192.src.slice(1), root))).removeAlpha().raw().toBuffer(),
    sharp(fileURLToPath(new URL(regular512.src.slice(1), root))).resize(192, 192).removeAlpha().raw().toBuffer(),
    sharp(fileURLToPath(new URL(maskable512.src.slice(1), root))).metadata(),
  ]);
  const meanDifference = actual192.reduce(
    (sum, value, index) => sum + Math.abs(value - expected192[index]),
    0,
  ) / actual192.length;

  assert.ok(meanDifference < 2, `192px artwork differs from the full-frame source by ${meanDifference}`);
  assert.equal(maskableMetadata.width, 512);
  assert.equal(maskableMetadata.height, 512);
});

test('install artwork reaches every canvas corner without a baked-in white frame', async () => {
  const manifest = JSON.parse(await source('../public/manifest.json'));
  const root = new URL('../public/', import.meta.url);

  for (const icon of manifest.icons) {
    const { data, info } = await sharp(fileURLToPath(new URL(icon.src.slice(1), root)))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cornerOffsets = [
      0,
      (info.width - 1) * info.channels,
      (info.height - 1) * info.width * info.channels,
      ((info.height * info.width) - 1) * info.channels,
    ];

    for (const offset of cornerOffsets) {
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      assert.ok(
        red < 245 || green < 245 || blue < 245,
        `${icon.src} has a white canvas corner that Android will render as an inset square`
      );
    }
  }
});

test('all browser and operating-system icon discovery paths use full-frame artwork', async () => {
  const layout = await source('../src/app/layout.tsx');
  assert.doesNotMatch(layout, /favicon-192\.png|favicon-512\.png|favicon\.ico/);
  assert.match(layout, /app-icon-192-v4\.png/);
  assert.match(layout, /app-icon-512-v4\.png/);

  const root = new URL('../public/', import.meta.url);
  for (const path of ['favicon-192.png', '../src/app/icon.png', '../src/app/apple-icon.png']) {
    const sourcePath = fileURLToPath(new URL(path, root));
    const metadata = await sharp(sourcePath).metadata();
    const expected = await sharp(fileURLToPath(new URL('app-icon-512-v4.png', root)))
      .resize(metadata.width, metadata.height)
      .removeAlpha()
      .raw()
      .toBuffer();
    const actual = await sharp(sourcePath).removeAlpha().raw().toBuffer();
    const meanDifference = actual.reduce(
      (sum, value, index) => sum + Math.abs(value - expected[index]),
      0,
    ) / actual.length;
    assert.ok(meanDifference < 2, `${path} still advertises inset artwork`);
  }
});

test('notification click behavior is registered by the standards-only worker', async () => {
  const worker = await source('../public/sw.js');
  const order = [];
  const context = {
    URL,
    console,
    caches: {},
    clients: {},
    importScripts() {
      order.push('firebase-import');
    },
    self: {
      location: { href: 'https://example.test/sw.js', origin: 'https://example.test' },
      registration: {},
      addEventListener(type) {
        order.push(`listener:${type}`);
      },
      skipWaiting() {},
      clients: { claim() {} },
    },
  };

  vm.runInNewContext(worker, context);

  assert.ok(order.includes('listener:notificationclick'));
  assert.ok(!order.includes('firebase-import'));
});

test('web push displays a dedicated monochrome notification badge', async () => {
  const worker = await source('../public/sw.js');
  const listeners = new Map();
  let notification;
  const context = {
    URL,
    console,
    caches: {},
    clients: {},
    importScripts() {},
    self: {
      location: { href: 'https://example.test/sw.js', origin: 'https://example.test' },
      registration: {
        showNotification(title, options) {
          notification = { title, options };
          return Promise.resolve();
        },
      },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      skipWaiting() {},
      clients: { claim() {} },
    },
  };
  vm.runInNewContext(worker, context);
  let completion;
  listeners.get('push')({
    data: { json: () => ({ webPush: { title: 'New chat', body: 'Hello', url: '/chats/1' } }) },
    waitUntil(promise) { completion = promise; },
  });
  await completion;

  assert.equal(notification.options.badge, '/notification-badge.png');
  const { width, height, hasAlpha, channels } = await sharp(fileURLToPath(
    new URL('../public/notification-badge.png', import.meta.url),
  )).metadata();
  assert.equal(width, 96);
  assert.equal(height, 96);
  assert.equal(hasAlpha, true);
  assert.equal(channels, 4);
});
