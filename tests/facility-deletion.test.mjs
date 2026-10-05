import assert from 'node:assert/strict';
import test from 'node:test';
import * as facilityDeletion from '../src/lib/facility-deletion.ts';

const { getFacilityReferenceReasons } = facilityDeletion;

const facilityContext = {
  facilityId: 'facility-1',
  facilityName: 'Home Training Center',
  facilityFieldNames: ['Main Arena', 'Practice Field A'],
};

test('facility deletion detects direct and qualified event references', () => {
  const reasons = getFacilityReferenceReasons(
    {
      facilityId: 'facility-1',
      selectedFields: ['facility-1:Main Arena'],
      location: 'Home Training Center',
    },
    facilityContext
  );

  assert.deepEqual(reasons, ['facility', 'selected fields', 'location']);
});

test('facility deletion detects embedded tournament and league schedule locations', () => {
  const reasons = getFacilityReferenceReasons(
    {
      tournamentGames: [
        { id: 'game-1', location: 'Home Training Center - Main Arena' },
      ],
      schedule: [{ id: 'game-2', location: 'Practice Field A' }],
    },
    facilityContext
  );

  assert.deepEqual(reasons, ['tournament schedule', 'league schedule']);
});

test('field deletion detects only the requested field', () => {
  const targetReasons = getFacilityReferenceReasons(
    {
      selectedFields: ['facility-1:Main Arena'],
      tournamentGames: [
        { id: 'game-1', location: 'Home Training Center - Main Arena' },
      ],
    },
    {
      facilityId: 'facility-1',
      facilityName: 'Home Training Center',
      fieldName: 'Main Arena',
    }
  );
  const unrelatedReasons = getFacilityReferenceReasons(
    {
      selectedFields: ['facility-1:Practice Field A'],
      tournamentGames: [
        { id: 'game-1', location: 'Home Training Center - Practice Field A' },
      ],
    },
    {
      facilityId: 'facility-1',
      facilityName: 'Home Training Center',
      fieldName: 'Main Arena',
    }
  );

  assert.deepEqual(targetReasons, ['selected fields', 'tournament schedule']);
  assert.deepEqual(unrelatedReasons, []);
});

test('legacy scheduler field names are detected', () => {
  const reasons = getFacilityReferenceReasons(
    {
      schedulerConfig: {
        selectedFields: ['Main Arena'],
      },
    },
    {
      facilityId: 'facility-1',
      facilityName: 'Home Training Center',
      fieldName: 'Main Arena',
    }
  );

  assert.deepEqual(reasons, ['scheduler configuration']);
});

test('unrelated facilities and resources do not block deletion', () => {
  const reasons = getFacilityReferenceReasons(
    {
      facilityId: 'facility-2',
      selectedFields: ['facility-2:Main Arena'],
      location: 'Memorial Field',
      tournamentGames: [{ id: 'game-1', location: 'Memorial Field' }],
    },
    facilityContext
  );

  assert.deepEqual(reasons, []);
});
