import assert from 'node:assert/strict';
import test from 'node:test';
import * as networkModule from '../src/lib/public-network-url.ts';

const { isObviouslyPrivateHostname, isPrivateIp } = networkModule;
const notificationModule = await import('../src/lib/notification-targets.ts');
const { validNotificationUrl } = notificationModule;

test('SSRF guard blocks private IPv4 ranges and metadata addresses', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.2.3', '192.168.1.1', '169.254.169.254', '100.64.0.1']) {
    assert.equal(isPrivateIp(address), true, address);
  }
  assert.equal(isPrivateIp('8.8.8.8'), false);
});

test('SSRF guard blocks loopback, local IPv6, and private host suffixes', () => {
  for (const address of ['::1', 'fc00::1', 'fd12::1', 'fe80::1']) {
    assert.equal(isPrivateIp(address), true, address);
  }
  for (const hostname of ['localhost', 'service.local', 'metadata.google.internal', 'router.lan']) {
    assert.equal(isObviouslyPrivateHostname(hostname), true, hostname);
  }
  assert.equal(isObviouslyPrivateHostname('www.espn.com'), false);
});

test('notification links stay on the app origin or use relative paths', () => {
  assert.equal(validNotificationUrl('/dashboard/team'), true);
  assert.equal(validNotificationUrl('https://www.thesquad.pro/admin'), true);
  assert.equal(validNotificationUrl('//evil.example/path'), false);
  assert.equal(validNotificationUrl('https://evil.thesquad.pro/phish'), false);
  assert.equal(validNotificationUrl('javascript:alert(1)'), false);
});
