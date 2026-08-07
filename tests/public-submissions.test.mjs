import assert from 'node:assert/strict';
import test from 'node:test';
import submissionModule from '../src/lib/public-submissions.ts';

const { parsePublicSubmission } = submissionModule;

test('public submission parser normalizes newsletter and contact values', () => {
  assert.deepEqual(parsePublicSubmission({
    type: 'newsletter', email: '  PERSON@Example.COM ', name: '  Pat  ',
  }), {
    type: 'newsletter', values: { email: 'person@example.com', name: 'Pat' },
  });
  assert.equal(parsePublicSubmission({
    type: 'contact', email: 'person@example.com', name: 'Pat', inquiry: 'Need help',
  }).values.inquiry, 'Need help');
});

test('public submission parser rejects malformed or oversized input', () => {
  assert.throws(() => parsePublicSubmission(null), /JSON object/);
  assert.throws(() => parsePublicSubmission({ type: 'newsletter', email: 'bad' }), /Invalid email/);
  assert.throws(() => parsePublicSubmission({ type: 'contact', email: 'a@b.com', name: 'A', inquiry: '' }), /Missing required/);
  assert.throws(() => parsePublicSubmission({
    type: 'newsletter', email: 'a@b.com', name: 'x'.repeat(121),
  }), /too long/);
});

test('beta submissions require the screened fields and bound selections', () => {
  const valid = {
    type: 'beta', email: 'tester@example.com', fullName: 'Tester', organization: 'Org', role: 'coach',
    sports: 'Soccer', scale: '1 team', currentTools: 'Sheets', frustrations: 'None', mustHave: 'Reports',
    whyBeta: 'Testing', tested_before: 'yes', frequency: 'weekly', address_street: '1 Main',
    address_city: 'Edmonton', address_state: 'AB', address_zip: 'T5A 1A1', devices: ['Desktop'], features: ['Stats'],
  };
  const parsed = parsePublicSubmission(valid);
  assert.equal(parsed.type, 'beta');
  assert.deepEqual(parsed.values.devices, ['Desktop']);
  assert.throws(() => parsePublicSubmission({ ...valid, tested_before: 'maybe' }), /Invalid beta/);
  assert.throws(() => parsePublicSubmission({ ...valid, devices: Array.from({ length: 9 }, () => 'x') }), /Too many/);
});
