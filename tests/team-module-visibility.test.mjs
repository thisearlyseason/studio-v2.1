import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TEAM_MODULE_DEFINITIONS,
  isTeamModuleRouteDisabled,
  visibleTeamModules,
  teamModuleFeaturePatch,
} from '../src/lib/team-module-visibility.ts';

test('team module policy includes configurable team tools and guards every canonical route', () => {
  assert.deepEqual(TEAM_MODULE_DEFINITIONS.map(item => item.key), [
    'attendance', 'competition', 'leagues', 'tournaments', 'scorekeeping', 'coachTools', 'equipment', 'facilities', 'feed', 'files', 'fundraising', 'practice', 'volunteers',
  ]);
  for (const teamModule of TEAM_MODULE_DEFINITIONS) {
    assert.equal(isTeamModuleRouteDisabled(teamModule.route, { [teamModule.key]: false }), true, teamModule.key);
    assert.equal(isTeamModuleRouteDisabled(teamModule.route, { [teamModule.key]: true }), false, teamModule.key);
    assert.equal(isTeamModuleRouteDisabled(teamModule.route, undefined), false, teamModule.key);
  }
});

test('module policy matches nested routes but never disables an unrelated route', () => {
  assert.equal(isTeamModuleRouteDisabled('/equipment/item-1', { equipment: false }), true);
  assert.equal(isTeamModuleRouteDisabled('/roster', { equipment: false, attendance: false }), false);
});

test('legacy disabled module flags remain enforced for persisted team settings', () => {
  for (const [route, key] of [
    ['/roster', 'roster'], ['/drills', 'playbook'], ['/chats', 'tacticalChat'],
    ['/volunteers', 'volunteer'], ['/files', 'library'],
  ]) {
    assert.equal(isTeamModuleRouteDisabled(route, { [key]: false }), true, `${key} must remain disabled`);
  }
});

test('canonical alias value takes precedence when both legacy and canonical flags exist', () => {
  assert.equal(isTeamModuleRouteDisabled('/files', { files: true, library: false }), false);
  assert.equal(isTeamModuleRouteDisabled('/files', { files: false, library: true }), true);
  assert.equal(isTeamModuleRouteDisabled('/volunteers', { volunteers: true, volunteer: false }), false);
  assert.equal(isTeamModuleRouteDisabled('/volunteers', { volunteers: false, volunteer: true }), true);
});

test('canonical settings writes migrate overlapping legacy aliases atomically', () => {
  const files = TEAM_MODULE_DEFINITIONS.find(item => item.key === 'files');
  const volunteers = TEAM_MODULE_DEFINITIONS.find(item => item.key === 'volunteers');
  assert.deepEqual(teamModuleFeaturePatch(files, false), { files: false, library: false });
  assert.deepEqual(teamModuleFeaturePatch(volunteers, true), { volunteers: true, volunteer: true });
});

test('audience overrides are team-specific and staff retain their authorized tools', () => {
  const team = { roster: false, byRole: { player: { roster: true }, parent: { files: false } } };
  const player = visibleTeamModules(team, false, false);
  const parent = visibleTeamModules(team, false, true);
  const coach = visibleTeamModules(team, true, true);
  assert.equal(isTeamModuleRouteDisabled('/roster', player), false);
  assert.equal(isTeamModuleRouteDisabled('/roster', parent), true);
  assert.equal(isTeamModuleRouteDisabled('/files', parent), true);
  assert.equal(isTeamModuleRouteDisabled('/files', player), false);
  assert.equal(isTeamModuleRouteDisabled('/roster', coach), false);
  assert.equal(isTeamModuleRouteDisabled('/files', visibleTeamModules({}, false, true)), false);
});
