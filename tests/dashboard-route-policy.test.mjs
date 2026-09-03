import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as routePolicyModule from '../src/lib/dashboard-route-policy.ts';

const { authorizeDashboardRoute, isProtectedDashboardPath, isSensitiveDashboardPath } = routePolicyModule;

test('dashboard route detection does not capture public league and tournament portals', () => {
  assert.equal(isProtectedDashboardPath('/dashboard'), true);
  assert.equal(isProtectedDashboardPath('/dashboard/billing'), true);
  assert.equal(isProtectedDashboardPath('/leagues/registration/league-1'), true);
  assert.equal(isProtectedDashboardPath('/leagues/spectator/league-1'), false);
  assert.equal(isProtectedDashboardPath('/tournaments'), true);
  assert.equal(isProtectedDashboardPath('/tournaments/public/team/event'), false);
});

test('sensitive account routes require revocation-aware session verification', () => {
  assert.equal(isSensitiveDashboardPath('/dashboard'), false);
  assert.equal(isSensitiveDashboardPath('/dashboard/billing'), true);
  assert.equal(isSensitiveDashboardPath('/family/payments'), true);
  assert.equal(isSensitiveDashboardPath('/family'), false);
  assert.equal(isSensitiveDashboardPath('/admin/plans'), true);
});

test('only superadmins can access global administration', () => {
  assert.equal(authorizeDashboardRoute('/admin/plans', { role: 'admin' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/admin/plans', { role: 'superadmin' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/admin', { role: 'adult_player' }, 'superadmin').allowed, true);
  assert.equal(authorizeDashboardRoute('/admin', { role: 'superadmin' }, 'superadmin').allowed, true);
});

test('family finance is limited to guardians and superadmins', () => {
  assert.equal(authorizeDashboardRoute('/family/payments', { role: 'parent' }).allowed, true);
  assert.equal(authorizeDashboardRoute('/family/payments', { role: 'adult_player' }).allowed, false);
});

test('staff operations reject member-only personas', () => {
  assert.equal(authorizeDashboardRoute('/equipment', { role: 'coach' }).allowed, true);
  assert.equal(authorizeDashboardRoute('/fundraising', { role: 'parent' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/manage-tournaments', { role: 'adult_player' }).allowed, false);
});

test('institution and competition hubs require matching authority', () => {
  assert.equal(authorizeDashboardRoute('/club', { role: 'admin', plan_type: 'school' }).allowed, true);
  assert.equal(authorizeDashboardRoute('/club', { role: 'coach', plan_type: 'free' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/competition', { role: 'league_creator', plan_type: 'free' }).allowed, true);
  assert.equal(authorizeDashboardRoute('/competition', { role: 'coach', plan_type: 'team' }).allowed, false);
});

test('shared navigation hides routes rejected by the dashboard policy', () => {
  const shell = fs.readFileSync(new URL('../src/components/layout/Shell.tsx', import.meta.url), 'utf8');

  assert.match(shell, /authorizeDashboardRoute\(tab\.href,[\s\S]+isSuperAdmin \? 'superadmin' : undefined/);
});

test('a forged profile role cannot inherit management or institution authority', () => {
  assert.equal(authorizeDashboardRoute('/admin', { role: 'superadmin' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/equipment', { role: 'superadmin' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/club', { role: 'superadmin', plan_type: 'school' }).allowed, false);
});

test('ordinary authenticated routes remain available during profile setup', () => {
  assert.equal(authorizeDashboardRoute('/dashboard', null).allowed, true);
  assert.equal(authorizeDashboardRoute('/teams/join', { role: 'adult_player' }).allowed, true);
});
