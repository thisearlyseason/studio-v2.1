import assert from 'node:assert/strict';
import test from 'node:test';
import {createTeamEventRequestRegistry,teamEventRequestFingerprint} from '../src/lib/team-event-request.ts';
test('interrupted submission retains its request identity until acknowledged',()=>{
  const registry=createTeamEventRequestRegistry();const event={teamId:'synthetic',uid:'coach',event:{title:'Practice',date:'2026-10-10'}};
  const pending=registry.acquire(event);
  assert.deepEqual(registry.acquire(structuredClone(event)),pending);
  registry.complete(pending);
  assert.notEqual(registry.acquire(event).requestId,pending.requestId);
});
test('canonical requests ignore object key order but preserve array order and account identity',()=>{
  assert.equal(teamEventRequestFingerprint({b:2,a:{d:4,c:3}}),teamEventRequestFingerprint({a:{c:3,d:4},b:2}));
  assert.notEqual(teamEventRequestFingerprint([1,2]),teamEventRequestFingerprint([2,1]));
  const registry=createTeamEventRequestRegistry();
  assert.notEqual(registry.acquire({teamId:'a',uid:'coach'}).requestId,registry.acquire({teamId:'a',uid:'other'}).requestId);
  assert.notEqual(registry.acquire({teamId:'a',uid:'coach'}).requestId,registry.acquire({teamId:'b',uid:'coach'}).requestId);
});
test('a late acknowledgement cannot clear a newer submission',()=>{
  const registry=createTeamEventRequestRegistry();const payload={title:'Practice'};
  const old=registry.acquire(payload);registry.complete(old);
  const next=registry.acquire(payload);registry.complete(old);
  assert.deepEqual(registry.acquire(payload),next);
});
