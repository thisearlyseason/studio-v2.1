import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixtureMutations } from '../scripts/qa/certification/local/fixture-mutations.mjs';
import { withAttendanceMemberships, selectScheduleTeam } from '../scripts/qa/certification/local/schedule-isolation.mjs';

for (const fails of [false, true]) {
  test(`attendance restores member documents and projections before the next scenario (${fails ? 'failure' : 'success'})`, async () => {
    const data = new Map([
      ['users/member/teamMemberships/team-a', { teamId: 'team-a' }],
      ['teams/pro/members/assistant', { role: 'Viewer', nested: { retained: true } }],
    ]);
    const baseline = structuredClone(data);
    const mutations = createFixtureMutations({ projectId: 'demo-schedule', runId: 'final-cert-schedule-test', firestore: {
      read: async path => structuredClone(data.get(path) ?? null),
      write: async (path, value) => { data.set(path, structuredClone(value)); },
      remove: async path => { data.delete(path); },
      hasDescendants: async () => false,
    } });
    const execute = () => withAttendanceMemberships(mutations, 'pro', ['member', 'assistant'], async () => {
      for (const uid of ['member', 'assistant']) {
        data.set(`teams/pro/members/${uid}`, { role: 'Coach' });
        data.set(`users/${uid}/teamMemberships/pro`, { teamId: 'pro' });
      }
      if (fails) throw new Error('selected attendance row failed');
      return 'observed';
    });
    if (fails) await assert.rejects(execute, /selected attendance row failed/);
    else assert.equal(await execute(), 'observed');
    assert.deepEqual(data, baseline, 'a fresh Event login must see the exact original membership set');
    await execute().catch(() => {});
    assert.deepEqual(data, baseline, 'the later RSVP invocation is equally isolated');
    assert.equal((await mutations.cleanup()).state, 'OBSERVED');
  });
}

test('schedule navigation selects the intended team before mounting the events page', async () => {
  const calls = [];
  const page = {
    evaluate: async (fn, teamId) => {
      globalThis.localStorage = { setItem: (...args) => calls.push(['storage', ...args]) };
      try { fn(teamId); } finally { delete globalThis.localStorage; }
    },
    goto: async url => { calls.push(['navigate', url]); },
  };
  await selectScheduleTeam(page, { teamId: 'team-a', url: 'http://127.0.0.1:9001/events' });
  assert.deepEqual(calls, [['storage', 'sf_session_team_id', 'team-a'], ['navigate', 'http://127.0.0.1:9001/events']]);
});
