import assert from 'node:assert/strict';
import test from 'node:test';
import { checkNativeAuthConfiguration } from '../scripts/qa/native-auth-config-check.mjs';
const valid = {
  platform: 'android', environment: 'qa', releaseBuild: false, distribution: 'store',
  serverEnabled: true, browserEnabled: true, nativeEnabled: true,
  storeOrigin: 'https://store.example.test', approvedStoreOrigin: 'https://store.example.test',
  firebaseProjectId: 'the-squad-audit-preview', webFirebaseProjectId: 'the-squad-audit-preview', registeredFirebaseProjectId: 'the-squad-audit-preview',
  buildIdentifier: 'pro.thesquad.shell.dev', registeredIdentifier: 'pro.thesquad.shell.dev',
  serverClientId: '207413047870-web.apps.googleusercontent.com', registeredServerClientId: '207413047870-web.apps.googleusercontent.com',
  signingSha256: 'a'.repeat(64), registeredSigningSha256: 'a'.repeat(64),
};
test('matching public QA identities pass the local checker only', () => {
  assert.deepEqual(checkNativeAuthConfiguration(valid), { ok: true, failures: [] });
});
test('missing switches, registration, origin, or mismatched signer cannot activate native auth', () => {
  for (const [key, value] of Object.entries({ serverEnabled: false, browserEnabled: false, nativeEnabled: false, registeredIdentifier: 'other.app', webFirebaseProjectId: 'other-project', registeredFirebaseProjectId: 'other-project', registeredServerClientId: 'other-client', signingSha256: 'b'.repeat(64), storeOrigin: '', releaseBuild: true, distribution: 'web' })) {
    const result = checkNativeAuthConfiguration({ ...valid, [key]: value });
    assert.equal(result.ok, false, key);
    assert.ok(result.failures.length > 0);
    assert.equal(JSON.stringify(result).includes('other-project'), false);
  }
});
test('iOS checks both OAuth client registrations and callback scheme', () => {
  const ios = { ...valid, platform: 'ios', iosClientId: '207413047870-iphone.apps.googleusercontent.com', registeredIosClientId: '207413047870-iphone.apps.googleusercontent.com', reversedClientId: 'com.googleusercontent.apps.207413047870-iphone' };
  assert.equal(checkNativeAuthConfiguration(ios).ok, true);
  assert.equal(checkNativeAuthConfiguration({ ...ios, reversedClientId: 'wrong' }).ok, false);
  assert.equal(checkNativeAuthConfiguration({ ...ios, registeredIosClientId: '' }).ok, false);
});
