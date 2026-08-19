import assert from 'node:assert/strict';
import test from 'node:test';

import { canManageActiveTeamModules } from '../src/lib/team-settings-authority.ts';

test('account-level coach role does not grant module control for the active team', () => {
  assert.equal(canManageActiveTeamModules({
    accountRole: 'coach',
    hasActiveTeam: true,
    isTeamStaff: false,
  }), false);
});

test('active-team staff can manage module visibility', () => {
  assert.equal(canManageActiveTeamModules({
    accountRole: 'player',
    hasActiveTeam: true,
    isTeamStaff: true,
  }), true);
});

test('team-module controls require an active team', () => {
  assert.equal(canManageActiveTeamModules({
    accountRole: 'coach',
    hasActiveTeam: false,
    isTeamStaff: true,
  }), false);
});
