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
