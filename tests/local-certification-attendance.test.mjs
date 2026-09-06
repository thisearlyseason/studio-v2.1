import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAttendanceLedger, validateAttendanceBounds } from '../scripts/qa/certification/local/attendance-observation.mjs';

const options = { eventId: 'event-a', memberName: 'qa team member', status: 'declined', teamMarker: 'FALCON-A', forbiddenMarkers: ['BLUEBIRD-B', 'private-note'], maxRows: 30, expectedRows:['qa team member,declined','Alex FALCON-A,no_response'] };
const download = { filename: 'attendance_event-a.csv', content: 'Name,Status\nqa team member,declined\nAlex FALCON-A,no_response', byteLength: 73 };
test('Attendance ledger reconciles real filename, exact member status, Team A marker and bounded rows', () => {
  assert.equal(validateAttendanceLedger(download, options).rows, 2);
  for (const content of [download.content.replace('declined','going'), `${download.content}\nBLUEBIRD-B,going`, `${download.content}\nprivate-note,going`, 'Name,Status\nqa team member,declined', `${download.content}\nqa team member,declined`]) {
    assert.throws(() => validateAttendanceLedger({ ...download, content }, options));
  }
  assert.throws(() => validateAttendanceLedger({ ...download, filename: 'audit.csv' }, options));
  assert.throws(() => validateAttendanceLedger({ ...download, byteLength: 65537 }, options));
  assert.throws(() => validateAttendanceLedger(download, { ...options, maxRows: 1 }));
});
test('Attendance CSV reconciles exact roster multiplicity rather than rejecting legitimate duplicate names', () => {
  const rows=[...options.expectedRows,'Jordan Falcon,no_response','Jordan Falcon,no_response'];
  const duplicateNames={...download,content:['Name,Status',...rows].join('\n')};
  assert.equal(validateAttendanceLedger(duplicateNames,{...options,expectedRows:rows}).rows,4);
  assert.throws(()=>validateAttendanceLedger(duplicateNames,options));
});
test('Attendance bounds require two exact viewports and positive in-viewport dialog, matrix, tab, close and export controls', () => {
  const measurements = [ { width:1440,height:900 }, { width:390,height:844 } ].map(viewport => ({ viewport, controls:Object.fromEntries(['dialog','matrix','tab','close','export'].map(name => [name,{x:5,y:5,width:100,height:30}])) }));
  assert.equal(validateAttendanceBounds(measurements), true);
  assert.throws(() => validateAttendanceBounds(measurements.slice(1)));
  measurements[1].controls.export.x=380;
  assert.throws(() => validateAttendanceBounds(measurements));
});
test('Event Intelligence scrollable tab strip keeps the leading Attendance tab reachable on mobile', () => {
  const source=readFileSync(new URL('../src/app/(dashboard)/events/EventDetailDialog.tsx',import.meta.url),'utf8');
  assert.match(source,/<TabsList className="[^"]*justify-start[^"]*overflow-x-auto/);
});
test('Attendance dispatch uses a dedicated Team A workflow without Pro membership overlays', () => {
  const source=readFileSync(new URL('../scripts/qa/run-phase2-emulator-audit.mjs',import.meta.url),'utf8');
  assert.match(source,/scenarioId === 'attendance-practice-event-member-attendance'\s*\? await runTeamAAttendanceWorkflowAudit\(\)/);
  const workflow=source.slice(source.indexOf('async function runTeamAAttendanceWorkflowAudit'),source.indexOf('async function runIsolatedRsvpAndAttendanceWorkflowAudit'));
  assert.match(workflow,/qa-team-a/);
  assert.match(workflow,/qa-coach-owner-a/);
  assert.doesNotMatch(workflow,/qa-pro|addAttendanceFixtureMembership|withAttendanceMemberships|coaches-corner/);
  assert.match(workflow,/withFirestoreOverlay\(\[memberPath\]/);
  assert.match(workflow,/\.update\(\{name:memberName\}\)/);
  assert.match(source,/member\.locator\('\.\.\/\.\.\/\.\.'\)\.getByText\('DECLINED'/);
  const browser=source.slice(source.indexOf('function browserTeamAAttendanceMatrix'),source.indexOf('async function runTeamAAttendanceWorkflowAudit'));
  assert.match(browser,/name:'High Priority Team Alert'/);
  assert.match(browser,/await alert\.getByRole\('button',\{name:'Close',exact:true\}\)\.click\(\)/);
  assert.doesNotMatch(browser,/name:'Got It'|force:true/);
  assert.match(browser,/\['Going','Maybe','Decline'\]/);
  assert.match(source,/captureBrowserOperationRequests\('att-responsive', 'qa-team-member'/);
});
