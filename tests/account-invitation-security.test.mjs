import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { youthInviteRollbackPlan } from '../src/lib/youth-invite-rotation.ts';

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
  assert.match(route, /collection\('teams'\)\.doc\(binding\.teamId\)\.collection\('members'\)\.doc\(userRecord\.uid\)/);
  assert.match(route, /collection\('users'\)\.doc\(userRecord\.uid\)\.collection\('teamMemberships'\)\.doc\(binding\.teamId\)/);
  assert.match(route, /playerId: freshInvite\.childId/);
  assert.match(route, /collectionGroup\('members'\)/);
  assert.match(route, /authorizedMemberships/);
  assert.match(route, /data\.status === 'removed'/);
  assert.match(route, /data\.isDeleted === true/);
  assert.doesNotMatch(route, /cleanChildId\(playerData\.primaryTeamId\)/);
  assert.doesNotMatch(route, /playerData\.joinedTeamIds/);
});

test('concurrent youth redemption reports a consumed invitation instead of account authority conflict', async () => {
  const route = await readFile(new URL('../src/app/api/invites/youth/route.ts', import.meta.url), 'utf8');

  assert.match(route, /await invitationWasConsumed\(redeemInviteRef\)/);
  assert.match(route, /Invitation not found or expired\./);
});

test('youth invitation creation actually delivers the single-use activation link', async () => {
  const [route, templates] = await Promise.all([
    readFile(new URL('../src/app/api/invites/youth/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/email-templates.ts', import.meta.url), 'utf8'),
  ]);

  const createSection = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function PUT'));
  assert.match(createSection, /youthInvitationEmail/);
  assert.match(createSection, /getResend\(\)\.emails\.send/);
  assert.match(createSection, /signup\/youth\?token=/);
  assert.match(createSection, /rollbackYouthInviteDelivery/);
  assert.match(templates, /export function youthInvitationEmail/);
  assert.match(templates, /guardianName\?\.trim\(\)\.replace\(\/\[\\r\\n\]\+\/g, ' '\)/);
});

test('failed replacement delivery restores the prior valid youth invitation', () => {
  const previousInvite = { token: 'old', email: 'old@example.test', used: false };
  const previousPlayer = {
    pendingInviteEmail: 'old@example.test',
    inviteToken: 'old',
    inviteSentAt: 'before',
    inviteExpiresAt: 'later',
  };
  assert.deepEqual(youthInviteRollbackPlan({
    currentToken: 'new',
    replacementToken: 'new',
    previousInvite,
    previousPlayer,
  }), {
    deleteReplacement: true,
    restorePreviousInvite: previousInvite,
    restorePlayer: previousPlayer,
  });
  assert.equal(youthInviteRollbackPlan({
    currentToken: 'newer', replacementToken: 'new', previousInvite, previousPlayer,
  }), null, 'a later rotation must not be overwritten');
});
