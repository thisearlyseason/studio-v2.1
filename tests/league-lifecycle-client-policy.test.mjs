import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildManualLeagueTeamUpdate,
  leagueLifecycleClientPolicy,
  stageManualLeagueTeam,
} from '../src/lib/league-lifecycle-client-policy.ts';

test('manual organizer staging uses the authenticated league lifecycle mutation', () => {
  assert.deepEqual(
    buildManualLeagueTeamUpdate({
      teamId: 'manual-team-a',
      teamName: 'Alpha FC',
      coachName: 'Alex Coach',
      coachEmail: 'ALPHA@EXAMPLE.TEST',
      inviteCode: 'invite1',
      createdAt: '2026-09-08T12:00:00.000Z',
    }),
    {
      teamUpdate: {
        teamId: 'manual-team-a',
        publicFields: {
          teamName: 'Alpha FC',
          wins: 0,
          losses: 0,
          ties: 0,
          points: 0,
          status: 'accepted',
          manual: true,
          createdAt: '2026-09-08T12:00:00.000Z',
        },
        privateFields: {
          coachName: 'Alex Coach',
          coachEmail: 'alpha@example.test',
          inviteCode: 'INVITE1',
        },
      },
    },
  );
});

test('anonymous demos expose edit but not create, clone, archive, or delete', () => {
  assert.deepEqual(leagueLifecycleClientPolicy({ isDemo: true, canManage: true }), {
    create: false,
    edit: true,
    clone: false,
    archive: false,
    delete: false,
  });
  assert.deepEqual(leagueLifecycleClientPolicy({ isDemo: false, canManage: true }), {
    create: true,
    edit: true,
    clone: true,
    archive: true,
    delete: true,
  });
  assert.deepEqual(leagueLifecycleClientPolicy({ isDemo: false, canManage: false }), {
    create: false,
    edit: false,
    clone: false,
    archive: false,
    delete: false,
  });
});

test('manual organizer staging commits through the authenticated league updater', async () => {
  const calls = [];
  await stageManualLeagueTeam({
    leagueId: 'league-a',
    teamId: 'manual-team-a',
    teamName: 'Alpha FC',
    coachName: 'Alex Coach',
    coachEmail: 'alpha@example.test',
    inviteCode: 'invite1',
    createdAt: '2026-09-08T12:00:00.000Z',
    updateLeague: async (leagueId, updates) => calls.push({ leagueId, updates }),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].leagueId, 'league-a');
  assert.equal(calls[0].updates.teamUpdate.publicFields.status, 'accepted');
  assert.equal(calls[0].updates.teamUpdate.privateFields.coachEmail, 'alpha@example.test');
});
