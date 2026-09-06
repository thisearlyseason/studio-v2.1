import assert from 'node:assert/strict';
import test from 'node:test';
import {
  registrationConfigHash,
  registrationPayloadHash,
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
