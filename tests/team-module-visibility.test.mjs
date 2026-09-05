import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TEAM_MODULE_DEFINITIONS,
  isTeamModuleRouteDisabled,
  teamModuleFeaturePatch,
} from '../src/lib/team-module-visibility.ts';

test('team module policy uses the eight frozen keys and guards every canonical route', () => {
  assert.deepEqual(TEAM_MODULE_DEFINITIONS.map(item => item.key), [
    'attendance', 'equipment', 'facilities', 'feed', 'files', 'fundraising', 'practice', 'volunteers',
  ]);
  for (const module of TEAM_MODULE_DEFINITIONS) {
    assert.equal(isTeamModuleRouteDisabled(module.route, { [module.key]: false }), true, module.key);
    assert.equal(isTeamModuleRouteDisabled(module.route, { [module.key]: true }), false, module.key);
    assert.equal(isTeamModuleRouteDisabled(module.route, undefined), false, module.key);
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
