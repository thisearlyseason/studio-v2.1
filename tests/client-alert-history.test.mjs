import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAlertHistory } from '../src/lib/client-alert-history.ts';
const base = { teamId: 'squad-1', getToken: async () => 'token' };
test('authorized history loads with no cache and authentication', async () => {
  const result = await fetchAlertHistory({ ...base, request: async (url, init) => {
    assert.equal(url, '/api/teams/alerts?teamId=squad-1');
    assert.equal(init.headers.Authorization, 'Bearer token');
    assert.equal(init.cache, 'no-store');
    return Response.json({ alerts: [{ id: 'a' }] });
  } });
  assert.deepEqual(result, { alerts: [{ id: 'a' }], error: null });
});
test('server failures, expired sessions and revoked access remain recoverable', async () => {
  for (const status of [401, 403, 500, 503]) {
    const result = await fetchAlertHistory({ ...base, request: async () => Response.json({ error: 'private server detail' }, { status }) });
    assert.deepEqual(result.alerts, []);
    assert.ok(result.error);
    assert.doesNotMatch(result.error, /private server detail/);
  }
});
test('network and token failures do not escape into the app', async () => {
  const network = await fetchAlertHistory({ ...base, request: async () => { throw Error('offline'); } });
  const auth = await fetchAlertHistory({ ...base, getToken: async () => { throw Error('expired'); } });
  assert.match(network.error, /connection/);
  assert.match(auth.error, /connection/);
});
test('cancelled requests cannot populate another squad and malformed responses are not empty successes', async () => {
  const controller = new AbortController();
  const result = await fetchAlertHistory({ ...base, signal: controller.signal, request: async () => {
    controller.abort(); return Response.json({ alerts: [{ id: 'old-squad' }] });
  } });
  assert.equal(result, null);
  const malformed = await fetchAlertHistory({ ...base, request: async () => Response.json({}) });
  assert.ok(malformed.error);
  const recovered = await fetchAlertHistory({ ...base, request: async () => Response.json({ alerts: [] }) });
  assert.deepEqual(recovered, { alerts: [], error: null });
});
