import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { observeCalendarResponse } from '../scripts/qa/certification/local/calendar-response-observation.mjs';

const source = readFileSync(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
const tree = ts.createSourceFile('audit.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

for (const name of ['browserOwnerEventCreate', 'browserMemberEventRsvp', 'browserOwnerEventEditDelete']) {
  test(`${name} serialized response listener survives its next navigation without CLI-unavailable globals`, async () => {
    const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    let script;
    const build = vm.runInNewContext(`(${declaration.getText(tree)})`, {
      BASE_URL: 'http://127.0.0.1:9001', observeCalendarResponse,
      cli: (_session, args) => { script = args[1]; return '{}'; },
    });
    build('owned-test-session', 'test-marker');
    const execute = vm.runInNewContext(`(${script})`);
    let onResponse;
    const navigationComplete = new Error('next navigation survived');
    const page = {
      on: (event, callback) => { if (event === 'response') onResponse = callback; },
      goto: async () => {
        onResponse({ url: () => 'http://127.0.0.1:9001/events', status: () => 200,
          request: () => ({ isNavigationRequest: () => true, method: () => 'GET' }) });
        throw navigationComplete;
      },
    };
    await assert.rejects(() => execute(page), error => error === navigationComplete);
  });
}

test('Event owner edit workflow captures a distinct reload response for the persistence case', () => {
  const source = readFileSync(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
  assert.match(source, /observationTag = 'evt-persistence'/);
  assert.match(source, /owner event edit second reload persistence/);
  assert.match(source, /captureBrowserOperationRequests\('evt-persistence', 'qa-coach-owner-a', eventWorkflow\.ownerResult\.observedResponses, 'evt-persistence'\)/);
});

test('Attendance named cases require independent observed request evidence', () => {
  const source = readFileSync(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
  for (const caseId of ['att-staff-record', 'att-duplicate', 'att-member-readonly', 'att-removed', 'att-removed-read', 'att-tenant-b', 'att-race', 'att-console', 'att-network', 'att-responsive']) {
    assert.match(source, new RegExp(`'${caseId}'[^\\n]+requests: operationRequestEvidence\\('${caseId}'\\)`));
  }
});

test('RSVP named cases require independent observed request evidence', () => {
  const source = readFileSync(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
  for (const caseId of ['rsvp-self', 'rsvp-parent-child', 'rsvp-parent-team-c', 'rsvp-staff', 'rsvp-cancelled', 'rsvp-replay', 'rsvp-forged-uid', 'rsvp-removed', 'rsvp-tenant-b', 'rsvp-race', 'rsvp-console', 'rsvp-network', 'rsvp-responsive']) {
    assert.match(source, new RegExp(`'${caseId}'[^\\n]+requests: operationRequestEvidence\\('${caseId}'\\)`));
  }
});

test('Calendar named cases require independent observed request evidence', () => {
  const source = readFileSync(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
  for (const caseId of ['cal-team-a-b', 'cal-family-a-c', 'cal-filters', 'cal-empty', 'cal-invalid', 'cal-outsider', 'cal-rapid-switch', 'cal-midnight', 'cal-dst-spring', 'cal-dst-fall', 'cal-console', 'cal-network', 'cal-responsive']) {
    assert.match(source, new RegExp(`'${caseId}'[^\\n]+requests: operationRequestEvidence\\('${caseId}'\\)`));
  }
});

test('Calendar workflow reconciles rendered fixtures after every required filter and bounds real overlays', () => {
  assert.match(source, /Calendar Parent A renders exactly the linked Team A and Team C fixtures and no Team B fixture/);
  assert.match(source, /Calendar day week month and type filters reconcile exact included and excluded fixtures/);
  assert.match(source, /Calendar team and child filters reconcile exact included and excluded fixtures/);
  assert.match(source, /Calendar filter panel and event detail dialog remain within desktop and mobile viewports/);
  assert.match(source, /assertCalendarFilterAndDetailBounds/);
  assert.match(source, /getByText\('Event Types', \{ exact: true \}\)\.locator\('\.\.'\)\.getByText\('practice', \{ exact: true \}\)/);
});

test('Calendar evidence rejects duplicate event markers across views, households, filters, and team switches', () => {
  const markerStart = source.indexOf('async function assertCalendarExactMarkerIsolation');
  const boundsStart = source.indexOf('async function assertCalendarFilterAndDetailBounds', markerStart);
  const markerHelper = source.slice(markerStart, boundsStart);
  assert.match(markerHelper, /result\.included === 1/);
  assert.doesNotMatch(markerHelper, /result\.included > 0/);

  const reconciliationStart = source.indexOf('async function assertCalendarRenderedFilterReconciliation');
  const workflowStart = source.indexOf('async function runCalendarViewsWorkflowAudit', reconciliationStart);
  const reconciliation = source.slice(reconciliationStart, workflowStart);
  assert.match(reconciliation, /ownerResult\.monthCount === 1 && ownerResult\.dayCount === 1 && ownerResult\.weekCount === 1 && ownerResult\.agendaCount === 1/);
  assert.match(reconciliation, /teamARows === 1 && parentResult\.householdProjection\.teamCRows === 1/);
  assert.match(reconciliation, /parentResult\.bothVisible\.active === 1 && parentResult\.bothVisible\.household === 1/);
  assert.match(reconciliation, /parentResult\.teamAOnly\.active === 1/);

  const workflowEnd = source.indexOf('async function runReminderSchedulerRuntimeAudit', workflowStart);
  const workflow = source.slice(workflowStart, workflowEnd);
  assert.match(workflow, /filterPopover\.locator\('\[data-calendar-team-id\]'\)\.evaluateAll/);
  assert.match(workflow, /JSON\.stringify\(result\.ownerTeamIds\), JSON\.stringify\(\[teamA\.id\]\)/);
  assert.match(workflow, /parentResult\.householdFilterCount, 2/);
  assert.match(workflow, /parentResult\.athleteCount, 2/);
  assert.match(workflow, /parentBResult\.teamB === 1/);
  assert.match(workflow, /multiTeamResult\.firstBView === 1 && multiTeamResult\.finalBView === 1/);
});

test('Calendar responsive evidence measures the real Radix popover shell and exact role surfaces', () => {
  const helperStart = source.indexOf('async function assertCalendarFilterAndDetailBounds');
  const helperEnd = source.indexOf('async function assertCalendarRenderedFilterReconciliation');
  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /\[data-radix-popper-content-wrapper\] > \[data-state="open"\]\[data-side\]\[data-align\]/);
  assert.doesNotMatch(helper, /getByText\('Squad Enrollment', \{ exact: true \}\)\.locator\('\.\.'\)/);
  assert.match(helper, /getByRole\('dialog', \{ name: 'Event Details: ' \+ eventTitle, exact: true \}\)/);
  assert.match(helper, /captureBrowserOperationRequests\('cal-responsive', actorAlias/);
  for (const actorAlias of ['qa-coach-owner-a', 'qa-parent-a', 'qa-parent-b', 'qa-multi-org']) {
    assert.match(source, new RegExp(`actorAlias: '${actorAlias}'`));
  }
  assert.match(source, /actor: 'qa-coach-owner-a\+qa-parent-a\+qa-parent-b\+qa-multi-org'/);
});

test('Calendar bounds helper opens the responsive Agenda surface before selecting the event detail', () => {
  const helperStart = source.indexOf('async function assertCalendarFilterAndDetailBounds');
  const helperEnd = source.indexOf('async function assertCalendarRenderedFilterReconciliation');
  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /getByRole\('button', \{ name: 'Agenda', exact: true \}\)\.click\(\)/);
  assert.match(helper, /const eventHeading = page\.getByRole\('heading', \{ name: eventTitle, exact: true \}\)\.first\(\)/);
  assert.match(helper, /await eventHeading\.click\(\)/);
});

test('Calendar bounds helper measures the event dialog only after its geometry settles', () => {
  const helperStart = source.indexOf('async function assertCalendarFilterAndDetailBounds');
  const helperEnd = source.indexOf('async function assertCalendarRenderedFilterReconciliation');
  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /await settleGeometry\(detailDialog, 'event detail dialog'\)/);
  assert.match(helper, /stableFrames >= 2/);
  assert.match(helper, /Math\.abs\(current\[index\] - previous\[index\]\) <= 0\.5/);
});

test('Calendar bounds helper permits only subpixel viewport rounding at the overlay edge', () => {
  const helperStart = source.indexOf('async function assertCalendarFilterAndDetailBounds');
  const helperEnd = source.indexOf('async function assertCalendarRenderedFilterReconciliation');
  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /const boundsTolerance = 0\.5/);
  assert.match(helper, /box\.x >= -boundsTolerance/);
  assert.match(helper, /box\.x \+ box\.width <= viewport\.width \+ boundsTolerance/);
});

test('serialized Playwright templates never reference the CLI-unavailable URL constructor', () => {
  const unsafe = [];
  function visit(node) {
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const literal = ts.isTemplateExpression(node)
        ? node.head.text + node.templateSpans.map(span => `null${span.literal.text}`).join('')
        : node.text;
      if (/\bpage\s*(?:\.|=>|\))/.test(literal) && /\bnew\s+URL\s*\(/.test(literal)) {
        unsafe.push(tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.deepEqual(unsafe, [], 'Use the VM-safe observer; host-side URL parsing remains supported.');
});
