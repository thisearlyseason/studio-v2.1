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

test('SSRF guard checks private IPv4 addresses in every IPv6 mapped notation', () => {
  for (const address of [
    '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1',
    '::FFFF:A9FE:A9FE', '::ffff:a00:1', '::ffff:c0a8:101',
    '::ffff:ac10:1', '::ffff:6440:1',
  ]) {
    assert.equal(isPrivateIp(address), true, address);
  }
  for (const address of ['::ffff:8.8.8.8', '::ffff:808:808', '2001:4860:4860::8888']) {
    assert.equal(isPrivateIp(address), false, address);
  }
});

test('notification links stay on the app origin or use relative paths', () => {
  assert.equal(validNotificationUrl('/dashboard/team'), true);
  assert.equal(validNotificationUrl('https://www.thesquad.pro/admin'), true);
  assert.equal(validNotificationUrl('//evil.example/path'), false);
  assert.equal(validNotificationUrl('/\\evil.example/path'), false);
  assert.equal(validNotificationUrl('/\n/evil.example/path'), false);
  assert.equal(validNotificationUrl('https://www.thesquad.pro:4444/phish'), false);
  assert.equal(validNotificationUrl('https://evil.thesquad.pro/phish'), false);
  assert.equal(validNotificationUrl('javascript:alert(1)'), false);
});
