import assert from 'node:assert/strict';
import test from 'node:test';
import {
  registrationConfigHash,
  registrationPayloadHash,
  effectiveLeagueRegistrationConfig,
  registrationArchiveMatches,
  isCalendarDateCurrent,
  isCalendarDate,
  nextRegistrationCount,
  validateRegistrationConfig,
  registrationPaymentSnapshot,
} from '../src/lib/registration-policy.ts';

const valid = {
  title: 'Team Registration', description: 'Register one squad', is_active: true, type: 'team',
  form_version: 2,
  form_schema: [
    {id:'team-name',label:'Team name',type:'short_text',required:true},
    {id:'division',label:'Division',type:'select',required:true,options:['U12','U14']},
  ],
};

test('registration config normalizes a closed schema and creates a stable version hash', () => {
  const first = validateRegistrationConfig(valid);
  const second = validateRegistrationConfig({...valid, form_schema:[...valid.form_schema].map(field=>({...field}))});
  assert.equal(first.form_version, 2);
  assert.equal(registrationConfigHash(first), registrationConfigHash(second));
  assert.match(first.config_hash, /^[a-f0-9]{64}$/);
});

test('legacy league payment fields become one hash-bound effective configuration', () => {
  const effective = effectiveLeagueRegistrationConfig(
    validateRegistrationConfig(valid),
    { registrationCost: '40', paymentInstructions: 'E-transfer before opening day' },
  );
  assert.equal(effective.registration_cost, '40');
  assert.equal(effective.offline_payment_instructions, 'E-transfer before opening day');
  assert.deepEqual(registrationPaymentSnapshot(effective), { amount: 40, currency: 'CAD', mode: 'offline', status: 'pending', instructions: 'E-transfer before opening day' });
  assert.notEqual(effective.config_hash, validateRegistrationConfig(valid).config_hash);
  assert.throws(() => effectiveLeagueRegistrationConfig(validateRegistrationConfig(valid), { registrationCost: '40' }), /instructions/i);
});

test('immutable registration archive matching compares the complete canonical receipt', () => {
  const receipt = { id: 'receipt', entryId: 'entry', answers: { email: 'a@example.test', name: 'A' }, signedAt: '2026-09-06T12:00:00.000Z', configHash: 'a'.repeat(64), payloadHash: 'b'.repeat(64), immutable: true };
  assert.equal(registrationArchiveMatches(receipt, { ...receipt, answers: { name: 'A', email: 'a@example.test' } }), true);
  assert.equal(registrationArchiveMatches(receipt, { ...receipt, signedAt: '2026-09-06T12:00:01.000Z' }), false);
  assert.equal(registrationArchiveMatches(receipt, { ...receipt, answers: { email: 'other@example.test', name: 'A' } }), false);
});

test('calendar dates and atomic registration counters fail closed', () => {
  assert.equal(isCalendarDateCurrent('2026-09-06', Date.parse('2026-09-06T00:00:00Z')), true);
  assert.equal(isCalendarDateCurrent('2026-02-30', Date.parse('2026-01-01T00:00:00Z')), false);
  assert.equal(isCalendarDate('2008-02-29'), true);
  assert.equal(isCalendarDate('2008-02-30'), false);
  assert.equal(isCalendarDateCurrent('', Date.now()), false);
  assert.deepEqual(nextRegistrationCount(0, 1), { accepted: true, count: 1 });
  assert.deepEqual(nextRegistrationCount(1, 1), { accepted: false, count: 1 });
  assert.throws(() => nextRegistrationCount(-1, 2), /counter/i);
});

test('registration replay hashes are stable across equivalent answer key ordering', () => {
  assert.equal(
    registrationPayloadHash({ answers: { email: 'coach@example.test', name: 'Coach' }, signature: 'Coach Name' }),
    registrationPayloadHash({ signature: 'Coach Name', answers: { name: 'Coach', email: 'coach@example.test' } }),
  );
});

test('registration config rejects duplicate ids unsupported types empty options and oversized schemas', () => {
  assert.throws(()=>validateRegistrationConfig({...valid,form_schema:[valid.form_schema[0],valid.form_schema[0]]}),/duplicate/i);
  assert.throws(()=>validateRegistrationConfig({...valid,form_schema:[{id:'x',label:'X',type:'script'}]}),/type/i);
  assert.throws(()=>validateRegistrationConfig({...valid,form_schema:[{id:'x',label:'X',type:'select',options:[]}]}),/option/i);
  assert.throws(()=>validateRegistrationConfig({...valid,form_schema:Array.from({length:51},(_,i)=>({id:`f${i}`,label:'X',type:'short_text'}))}),/50/);
});

test('registration payment snapshot is truthful for free and configured offline payment only', () => {
  assert.deepEqual(registrationPaymentSnapshot({registration_cost:'0'}),{amount:0,currency:'CAD',mode:'free',status:'not_required',instructions:null});
  assert.deepEqual(registrationPaymentSnapshot({registration_cost:'25.50',offline_payment_instructions:'Pay at check-in',currency:'cad'}),{amount:25.5,currency:'CAD',mode:'offline',status:'pending',instructions:'Pay at check-in'});
  assert.throws(()=>registrationPaymentSnapshot({registration_cost:'25.50'}),/instructions/i);
  assert.throws(()=>validateRegistrationConfig({...valid,registration_cost:'25.50'}),/instructions/i);
});
