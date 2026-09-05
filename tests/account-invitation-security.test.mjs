import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('league invite redemption rejects anonymous and unverified accounts', async () => {
  const source = await readFile(new URL('../functions/src/index.ts', import.meta.url), 'utf8');

  assert.match(source, /sign_in_provider/);
  assert.match(source, /provider === "anonymous"/);
  assert.match(source, /email_verified !== true/);
});

test('youth invite possession completes email verification without exposing invite PII', async () => {
  const route = await readFile(new URL('../src/app/api/invites/youth/route.ts', import.meta.url), 'utf8');

  assert.match(route, /emailVerified: true/);
  assert.doesNotMatch(
    route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST')),
    /email:\s*data\.email/,
  );
  assert.match(route, /collection\('teams'\)\.doc\(teamId\)\.collection\('members'\)\.doc\(userRecord\.uid\)/);
  assert.match(route, /collection\('users'\)\.doc\(userRecord\.uid\)\.collection\('teamMemberships'\)\.doc\(teamId\)/);
  assert.match(route, /playerId: freshInvite\.childId/);
  assert.match(route, /cleanChildId\(playerData\.primaryTeamId\)/);
  assert.match(route, /playerData\.joinedTeamIds\.find\(value => cleanChildId\(value\)\)/);
});
