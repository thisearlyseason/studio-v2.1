import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('branding UI exposes an authoritative delete and visible no-logo fallback', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/team/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /handleLogoDelete/);
  assert.match(source, /Remove Identity Asset/);
  assert.match(source, /deleteField\(\)/);
  assert.match(source, /data-testid="team-logo-fallback"/);
});
