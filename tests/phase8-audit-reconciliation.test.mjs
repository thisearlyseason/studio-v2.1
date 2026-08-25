import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const auditRoot = new URL('../docs/qa/production-audit/', import.meta.url);

async function auditFile(path) {
  return readFile(new URL(path, auditRoot), 'utf8');
}

function defectSection(ledger, id) {
  const start = ledger.indexOf(`## ${id} `);
  assert.notEqual(start, -1, `${id} must exist in the defect ledger`);
  const end = ledger.indexOf('\n## BUG-', start + 1);
  return ledger.slice(start, end === -1 ? ledger.length : end);
}

test('Phase 8 closes only the three repaired defects with canonical staging evidence', async () => {
  const ledger = await auditFile('07-defect-ledger.md');
  for (const id of ['BUG-006', 'BUG-007', 'BUG-010']) {
    const section = defectSection(ledger, id);
    assert.match(section, /\| Status \| FIXED AND VERIFIED \|/);
    assert.match(section, /2026-08-24-phase8-confirmed-defects/);
    assert.doesNotMatch(section, /CONFIRMED UNRESOLVED/);
  }
});

test('Phase 8 retained evidence links the exact deployment and every closure-critical browser invariant', async () => {
  const [deployment, browser, cleanup] = await Promise.all([
    auditFile('runs/2026-08-24-phase8-confirmed-defects/02-staging-deployment.md'),
    auditFile('runs/2026-08-24-phase8-confirmed-defects/03-browser-ledger.md'),
    auditFile('runs/2026-08-24-phase8-confirmed-defects/04-cleanup.md'),
  ]);

  assert.match(deployment, /https:\/\/github\.com\/thisearlyseason\/studio-v2\.1\/actions\/runs\/32806782497/);
  assert.match(deployment, /b495b4eafe5fd9caf6e04c4cf5500a2b6d0baf97/);

  for (const heading of [
    'Alias', 'Starting state', 'Route/action', 'Expected result', 'Visible state',
    'Page/app errors', 'Request failures', 'Overflow', 'Result',
  ]) {
    assert.match(browser, new RegExp(`\\|[^\\n]*${heading}[^\\n]*\\|`));
  }
  assert.equal((browser.match(/\| `p8-closure-/g) || []).length, 8);
  assert.match(browser, /generic unavailable message visibly observed on `\/login`/i);
  assert.match(browser, /protected requests `0`; protected Firestore listeners `0`/);
  assert.match(browser, /former-team listeners `0`; Team A GET `403`/);
  assert.equal((browser.match(/Own `200`, `assignments` array; changed API `403`;/g) || []).length, 4);
  assert.equal((browser.match(/GET\/PATCH `403\/403`/g) || []).length, 4);
  assert.match(browser, /every context recorded `0` unexpected request failures/);
  assert.match(browser, /prior non-waiting samples were discarded rather than inferred/i);

  assert.match(cleanup, /9\/40 → 9\/39 → 0\/0/);
  assert.match(cleanup, /retained and failure counts zero/);
  assert.match(cleanup, /private workspace absent/);
});

test('Phase 8 matrix has no failed row and retains all incomplete contracts as blocked', async () => {
  const matrix = await auditFile('05-coverage-matrix.md');
  const rows = matrix.split('\n')
    .filter(line => line.startsWith('| '))
    .map(line => line.split('|').slice(1, -1).map(value => value.trim()))
    .filter(columns => columns.length === 13 && ['PASS', 'FAIL', 'BLOCKED', 'NOT RUN', 'NOT APPLICABLE'].includes(columns[10]));
  assert.equal(rows.length, 88);
  const counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'NOT RUN', 'NOT APPLICABLE'].map(status => [status, rows.filter(row => row[10] === status).length]));
  assert.deepEqual(counts, { PASS: 2, FAIL: 0, BLOCKED: 86, 'NOT RUN': 0, 'NOT APPLICABLE': 0 });

  for (const [feature, subFeature] of [
    ['Authentication', 'Email/password login'],
    ['Dashboard/shell', 'Role landing and route policy'],
    ['Leagues', 'Registration/assignment'],
  ]) {
    const row = rows.find(item => item[0] === feature && item[1] === subFeature);
    assert.equal(row?.[10], 'BLOCKED');
    assert.equal(row?.[11], '—');
    assert.match(row?.[12] || '', /Phase 8/);
    assert.match(row?.[12] || '', /2026-08-24-phase8-confirmed-defects/);
  }
});

test('Phase 8 summary preserves NOT READY posture and exact cleanup evidence', async () => {
  const summary = await auditFile('13-phase8-confirmed-defect-repair.md');
  assert.match(summary, /NOT READY/);
  assert.match(summary, /83 contracts remain outside Phase 8/);
  assert.match(summary, /12\/12/);
  assert.match(summary, /authPresent.?=.?0/i);
  assert.match(summary, /firestorePresent.?=.?0/i);
  assert.match(summary, /b495b4eafe5fd9caf6e04c4cf5500a2b6d0baf97/);
  assert.match(summary, /32806782497/);
});
