import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const names = ['WEB_PUSH_VAPID_SUBJECT', 'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY'];
const binding = key => ({ key, secret: key, version: '1', projectId: 'example-project' });
const run = metadata => spawnSync(process.execPath, ['scripts/check-reminder-runtime-config.mjs'], {
  encoding: 'utf8', input: JSON.stringify(metadata),
});
test('deployment gate accepts an active Function with all three explicit secret bindings', () => {
  const result = run({ state: 'ACTIVE', serviceConfig: { secretEnvironmentVariables: names.map(binding) } });
  assert.equal(result.status, 0, result.stderr);
});
test('deployment gate rejects the production failure shape with no secret bindings', () => {
  const result = run({ state: 'ACTIVE', serviceConfig: { environmentVariables: { FIREBASE_CONFIG: '{}' } } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WEB_PUSH_VAPID_PRIVATE_KEY/);
});
test('deployment gate rejects an inactive Function or incomplete binding without printing values', () => {
  for (const metadata of [
    { state: 'FAILED', serviceConfig: { secretEnvironmentVariables: names.map(binding) } },
    { state: 'ACTIVE', serviceConfig: { secretEnvironmentVariables: names.slice(1).map(binding), environmentVariables: { secret: 'DO-NOT-PRINT' } } },
  ]) {
    const result = run(metadata);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr + result.stdout, /DO-NOT-PRINT/);
  }
});
