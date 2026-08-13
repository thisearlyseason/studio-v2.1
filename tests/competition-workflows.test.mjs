import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('division setting copies stay draft and refuse to overwrite deployed schedules', () => {
  const route = read('src/app/api/leagues/clone/route.ts');
  assert.match(route, /deploymentStatus === 'deployed'/);
  assert.match(route, /already has a deployed schedule/);
  assert.match(route, /is_active: false/);
  assert.doesNotMatch(route, /batch\.update\(target\.ref,[\s\S]{0,300}schedule: \[\]/);
});

test('tournament setup, bracket, schedule, and deployment use explicit persisted states', () => {
  const page = read('src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx');
  const deployment = read('src/lib/server-tournament-schedule-deployment.ts');
  assert.match(page, /setupStatus: 'complete'/);
  assert.match(page, /deploymentStatus: 'undeployed'/);
  assert.match(page, /deploymentStatus: 'failed'/);
  assert.match(deployment, /bracketStatus: 'ready'/);
  assert.match(deployment, /scheduleStatus: 'ready'/);
  assert.match(deployment, /deploymentStatus: 'deployed'/);
});

test('tournament waivers use Library documents and one agreement contract for every roster team', () => {
  const page = read('src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx');
  const action = read('src/app/api/public/portals/action/route.ts');
  assert.match(page, /waiverDocuments:/);
  assert.match(page, /agreement\?\.agreed === true \|\| agreement\?\.status === 'signed'/);
  assert.match(action, /new FieldPath\('teamAgreements', teamName\)/);
  assert.match(action, /collection\('archived_waivers'\)/);
});

test('event safety is staff-only and provides audit, division, and date controls', () => {
  const panel = read('src/components/safety/event-safety-panel.tsx');
  const provider = read('src/components/providers/team-provider.tsx');
  const rules = read('firestore.rules');
  assert.match(panel, /divisionFilter/);
  assert.match(panel, /dateFilter/);
  assert.match(panel, /supportingDocumentUrl/);
  assert.match(provider, /auditHistory: arrayUnion/);
  assert.match(rules, /match \/incidents\/\{incidentId\}[\s\S]{0,300}isTeamStaff\(teamId\)/);
});

test('shared modal scrolling exposes a disappearing more-settings affordance', () => {
  const scrollArea = read('src/components/ui/scroll-area.tsx');
  assert.match(scrollArea, /hasMoreBelow/);
  assert.match(scrollArea, /scrollHeight - viewport\.scrollTop - viewport\.clientHeight/);
  assert.match(scrollArea, /ChevronDown/);
  assert.match(scrollArea, /touch-pan-y/);
});
