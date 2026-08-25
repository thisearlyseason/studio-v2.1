import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NextRequest } from 'next/server';

import {
  createLeagueAssignmentsGetHandler,
  createLeagueAssignmentsReader,
} from '../src/lib/server-league-assignments.ts';

test('league assignment lookup has one exact collection-group field override', async () => {
  const indexes = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  const matching = indexes.fieldOverrides.filter(item =>
    item.collectionGroup === 'registrationEntries' &&
    item.fieldPath === 'assigned_team_id'
  );

  assert.deepEqual(matching, [{
    collectionGroup: 'registrationEntries',
    fieldPath: 'assigned_team_id',
    indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' }],
  }]);
});

test('league assignment reader uses the bounded indexed query and maps assigned rows', async () => {
  const operations = [];
  const documents = [
    {
      id: 'entry-1',
      data: () => ({ status: 'assigned', assigned_team_id: 'team-a', league_id: 'league-explicit' }),
      ref: { parent: { parent: { id: 'league-parent' } } },
    },
    {
      id: 'entry-2',
      data: () => ({ status: 'assigned', assigned_team_id: 'team-a' }),
      ref: { parent: { parent: { id: 'league-parent' } } },
    },
    {
      id: 'entry-3',
      data: () => ({ status: 'pending', assigned_team_id: 'team-a' }),
      ref: { parent: { parent: { id: 'league-parent' } } },
    },
  ];
  const db = {
    collectionGroup(name) {
      operations.push(['collectionGroup', name]);
      return {
        where(field, operator, value) {
          operations.push(['where', field, operator, value]);
          return {
            limit(limit) {
              operations.push(['limit', limit]);
              return { get: async () => ({ docs: documents, empty: false, size: 3 }) };
            },
          };
        },
      };
    },
  };

  const readAssignments = createLeagueAssignmentsReader(db);
  assert.deepEqual(await readAssignments('team-a'), [
    {
      status: 'assigned',
      assigned_team_id: 'team-a',
      league_id: 'league-explicit',
      id: 'entry-1',
    },
    {
      status: 'assigned',
      assigned_team_id: 'team-a',
      id: 'entry-2',
      league_id: 'league-parent',
    },
  ]);
  assert.deepEqual(operations, [
    ['collectionGroup', 'registrationEntries'],
    ['where', 'assigned_team_id', '==', 'team-a'],
    ['limit', 200],
  ]);
});

function assignmentsRequest(teamId = 'team-a') {
  return new NextRequest(`https://staging.thesquad.pro/api/leagues/assignments?teamId=${teamId}`);
}

test('league assignment GET rejects cross-squad callers before running the query', async () => {
  const operations = [];
  const GET = createLeagueAssignmentsGetHandler({
    verifyFirebaseToken: async () => ({ uid: 'user-a', role: 'coach', emailVerified: true }),
    getTeamAuthority: async () => {
      operations.push('authority');
      return null;
    },
    readAssignments: async () => {
      operations.push('query');
      return [];
    },
  });

  const response = await GET(assignmentsRequest('team-b'));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'Only authorized squad staff can view assignments.',
  });
  assert.deepEqual(operations, ['authority']);
});

test('league assignment GET returns an empty array to authorized squad staff', async () => {
  const operations = [];
  const GET = createLeagueAssignmentsGetHandler({
    verifyFirebaseToken: async () => ({ uid: 'owner-a', role: 'admin', emailVerified: true }),
    getTeamAuthority: async () => {
      operations.push('authority');
      return { isStaff: true };
    },
    readAssignments: async teamId => {
      operations.push(`query:${teamId}`);
      return [];
    },
  });

  const response = await GET(assignmentsRequest());

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { assignments: [] });
  assert.deepEqual(operations, ['authority', 'query:team-a']);
});

test('league assignment GET sanitizes an indexed-query service failure', async () => {
  const GET = createLeagueAssignmentsGetHandler({
    verifyFirebaseToken: async () => ({ uid: 'owner-a', role: 'admin', emailVerified: true }),
    getTeamAuthority: async () => ({ isStaff: true }),
    readAssignments: async () => {
      throw Object.assign(new Error('provider URL and index details'), { code: 9 });
    },
    logUnavailable: () => {},
  });

  const response = await GET(assignmentsRequest());

  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.deepEqual(payload, {
    error: 'League assignments are temporarily unavailable.',
  });
  assert.doesNotMatch(JSON.stringify(payload), /provider|index/i);
});
