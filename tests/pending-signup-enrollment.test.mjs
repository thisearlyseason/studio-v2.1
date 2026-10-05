import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { completePendingSignupEnrollment } from '../src/lib/pending-signup-enrollment.ts';

test('verified signup asks the server to consume its pending adult-athlete team code', async () => {
  const calls = [];
  const result = await completePendingSignupEnrollment(
    { getIdToken: async () => 'verified-token' },
    async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true, pendingEnrollment: true, teamId: 'team-a' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );

  assert.deepEqual(result, { pendingEnrollment: true, teamId: 'team-a' });
  assert.equal(calls[0].url, '/api/teams/join');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer verified-token');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    usePendingSignupCode: true,
    enrollmentIntent: 'player',
  });
});

test('pending enrollment helper surfaces a safe server error', async () => {
  await assert.rejects(
    () => completePendingSignupEnrollment(
      { getIdToken: async () => 'verified-token' },
      async () => new Response(JSON.stringify({ error: 'Squad invitation not found.' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    ),
    /Squad invitation not found/,
  );
});

test('signup persists only adult-athlete codes and verification consumes the pending enrollment', async () => {
  const [signup, verification] = await Promise.all([
    readFile(new URL('../src/app/signup/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/verify-email/page.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(signup, /\.\.\.\(regTarget === 'self' && normalizedJoinCode \? \{ pendingTeamJoinCode: normalizedJoinCode \} : \{\}\)/);
  assert.match(verification, /completePendingSignupEnrollment/);
});
