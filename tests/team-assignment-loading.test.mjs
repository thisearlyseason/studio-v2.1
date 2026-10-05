import assert from 'node:assert/strict';
import test from 'node:test';
import { teamAssignmentPage } from './helpers/team-assignment-page-harness.mjs';

const applicant = {
  id: 'entry-a', league_id: 'league-a', protocol_id: 'player_config', status: 'assigned',
  assigned_team_id: 'squad', answers: { fullName: 'First Applicant' },
  lifecycleVersion: 3, assignmentVersion: 1,
};

for (const [name, overrides] of [
  ['demo-marked squad even for staff with every feature', { activeTeam: { id: 'TEAM_1', isDemo: true } }],
  ['anonymous account', { authUser: { uid: 'demo-user', isAnonymous: true } }],
  ['unresolved or signed-out account', { authUser: null }],
  ['non-staff account', { isStaff: false }],
  ['squad without the registration feature', { hasFeature: () => false }],
]) test(`assignment loading does not request protected data for ${name}`, async () => {
  const requests = [];
  const page = await teamAssignmentPage({ ...overrides, fetch: async url => {
    requests.push(url);
    return Response.json({ assignments: [applicant] });
  } });
  try {
    page.render();
    const view = await page.settle();
    assert.deepEqual(requests, [], 'unsupported contexts must not send assignment requests');
    assert.deepEqual(view.assignments, []);
    assert.equal(view.error, null);
  } finally { page.dispose(); }
});

for (const status of [403, 503]) test(`real staff receive a retryable assignment error after HTTP ${status}`, async () => {
  let fail = true;
  const page = await teamAssignmentPage({ fetch: async () => fail
    ? Response.json({ error: status === 403 ? 'Only current authorized staff can manage this assignment.' : 'Service unavailable.' }, { status })
    : Response.json({ assignments: [applicant] }) });
  try {
    page.render();
    const failed = await page.settle();
    assert.ok(failed.error, 'a server failure must not look like an empty successful list');
    assert.deepEqual(failed.assignments, []);
    fail = false;
    await failed.retry();
    const recovered = page.render();
    assert.equal(recovered.error, null);
    assert.deepEqual(recovered.assignments, [applicant]);
  } finally { page.dispose(); }
});

for (const [name, overrides] of [
  ['missing session token', { getAuthToken: async () => null }],
  ['invalid success payload', { fetch: async () => Response.json({}) }],
  ['network failure', { fetch: async () => { throw new Error('Connection lost'); } }],
]) test(`assignment loading exposes ${name} as a failure`, async () => {
  const page = await teamAssignmentPage(overrides);
  try {
    page.render();
    const view = await page.settle();
    assert.ok(view.error);
    assert.deepEqual(view.assignments, []);
  } finally { page.dispose(); }
});

test('successful empty assignment response has no error', async () => {
  const page = await teamAssignmentPage();
  try {
    page.render();
    const view = await page.settle();
    assert.deepEqual(view.assignments, []);
    assert.equal(view.error, null);
  } finally { page.dispose(); }
});

for (const [name, updates] of [
  ['team', { activeTeam: { id: 'other', isDemo: false, planId: 'elite_league' } }],
  ['account', { authUser: { uid: 'other-staff', isAnonymous: false } }],
]) test(`switching ${name} immediately hides prior assignments while the new request is pending`, async () => {
  let resolveNext;
  let count = 0;
  const page = await teamAssignmentPage({ fetch: async () => ++count === 1
    ? Response.json({ assignments: [applicant] })
    : new Promise(resolve => { resolveNext = resolve; }) });
  try {
    page.render();
    assert.deepEqual((await page.settle()).assignments, [applicant]);
    const switched = page.render(updates);
    assert.deepEqual(switched.assignments, [], 'previous assignments must disappear on the first render');
    const pending = await page.settle();
    assert.equal(pending.loading, true);
    resolveNext(Response.json({ assignments: [] }));
    const loaded = await page.settle();
    assert.deepEqual(loaded.assignments, []);
    assert.equal(loaded.loading, false);
  } finally { page.dispose(); }
});

test('late assignment response cannot repopulate a newly selected demo squad', async () => {
  let resolveRequest;
  const page = await teamAssignmentPage({ fetch: () => new Promise(resolve => { resolveRequest = resolve; }) });
  try {
    page.render();
    await page.settle();
    page.render({ activeTeam: { id: 'TEAM_1', isDemo: true } });
    resolveRequest(Response.json({ assignments: [applicant] }));
    const view = await page.settle();
    assert.deepEqual(view.assignments, []);
    assert.equal(view.error, null);
  } finally { page.dispose(); }
});
