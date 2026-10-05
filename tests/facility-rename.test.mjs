import assert from 'node:assert/strict';
import test from 'node:test';
import * as facilityRename from '../src/lib/facility-rename.ts';

const {
  buildEventRenameUpdates,
  buildLeagueRenameUpdates,
  getFacilityFieldName,
} = facilityRename;

test('facility rename updates linked event and embedded tournament game names', () => {
  const updates = buildEventRenameUpdates(
    {
      location: 'Home Training Center',
      selectedFields: ['facility-1:Main Arena'],
      tournamentGames: [{ id: 'g1', location: 'Home Training Center - Main Arena' }],
    },
    {
      facilityId: 'facility-1',
      oldFacilityName: 'Home Training Center',
      newFacilityName: 'North Training Centre',
    }
  );

  assert.equal(updates.location, 'North Training Centre');
  assert.equal(updates.tournamentGames[0].location, 'North Training Centre - Main Arena');
  assert.equal(updates.selectedFields, undefined);
});

test('field rename updates qualified tournament references and embedded games', () => {
  const updates = buildEventRenameUpdates(
    {
      location: 'Home Training Center',
      selectedFields: ['facility-1:Main Arena', 'facility-2:Court A'],
      tournamentGames: [{ id: 'g1', location: 'Home Training Center - Main Arena' }],
    },
    {
      facilityId: 'facility-1',
      oldFacilityName: 'Home Training Center',
      oldFieldName: 'Main Arena',
      newFieldName: 'Championship Court',
    }
  );

  assert.deepEqual(updates.selectedFields, [
    'facility-1:Championship Court',
    'facility-2:Court A',
  ]);
  assert.equal(
    updates.tournamentGames[0].location,
    'Home Training Center - Championship Court'
  );
  assert.equal(updates.location, undefined);
});

test('field rename updates qualified and legacy league settings and schedule games', () => {
  const updates = buildLeagueRenameUpdates(
    {
      schedulerConfig: {
        startDate: '2026-07-01',
        selectedFields: ['facility-1:Main Arena', 'Practice Field A'],
      },
      schedule: [{ id: 'g1', location: 'Main Arena' }],
    },
    {
      facilityId: 'facility-1',
      oldFacilityName: 'Home Training Center',
      oldFieldName: 'Main Arena',
      newFieldName: 'Championship Court',
    }
  );

  assert.deepEqual(updates.schedulerConfig.selectedFields, [
    'facility-1:Championship Court',
    'Practice Field A',
  ]);
  assert.equal(updates.schedule[0].location, 'Championship Court');
});

test('unrelated names are not changed', () => {
  const updates = buildEventRenameUpdates(
    {
      location: 'Memorial Field',
      selectedFields: ['facility-2:Main Arena'],
      tournamentGames: [{ id: 'g1', location: 'Memorial Field' }],
    },
    {
      facilityId: 'facility-1',
      oldFacilityName: 'Home Training Center',
      oldFieldName: 'Main Arena',
      newFieldName: 'Championship Court',
    }
  );

  assert.deepEqual(updates, {});
});

test('qualified field labels preserve colons inside the field name', () => {
  assert.equal(getFacilityFieldName('facility-1:Court 1: North'), 'Court 1: North');
  assert.equal(getFacilityFieldName('Legacy Field'), 'Legacy Field');
});

test('legacy schedule labels are renamed without a facility ID', () => {
  const updates = buildEventRenameUpdates(
    {
      location: 'Home Training Center - Main Arena',
      tournamentGames: [{ id: 'g1', location: 'Home Training Center' }],
    },
    {
      facilityId: 'facility-1',
      oldFacilityName: 'Home Training Center',
      newFacilityName: 'North Training Centre',
    }
  );

  assert.equal(updates.location, 'North Training Centre - Main Arena');
  assert.equal(updates.tournamentGames[0].location, 'North Training Centre');
});
