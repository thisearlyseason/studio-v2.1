import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM_MODULE_DEFINITIONS, isTeamModuleRouteDisabled } from '../src/lib/team-module-visibility.ts';

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
