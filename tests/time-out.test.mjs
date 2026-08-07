import assert from 'node:assert/strict'; import test from 'node:test';
import core from '../src/components/time-out/game-core.ts';
const { DIFFICULTY, STORAGE, firstToFive, volleyballPoint, baseballContact, storageGet, storageSet } = core;
test('Time Out difficulty gets progressively faster and less forgiving',()=>{assert.ok(DIFFICULTY.easy.speed<DIFFICULTY.hard.speed);assert.ok(DIFFICULTY.easy.timing>DIFFICULTY.hard.timing)});
test('first-to-five ends a match',()=>{assert.equal(firstToFive(5,4),true);assert.equal(firstToFive(4,4),false)});
test('volleyball floor outcome awards a point to the correct side',()=>{assert.equal(volleyballPoint(true,'ai'),'player');assert.equal(volleyballPoint(false,'player'),'ai')});
test('baseball timing rewards centre contact',()=>{assert.ok(baseballContact(0,'easy').distance>baseballContact(.2,'easy').distance);assert.equal(baseballContact(1,'hard').label,'MISS')});
test('Time Out storage helpers are namespaced and safely retain preferences',()=>{const values=new Map(); global.window={localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};storageSet(STORAGE.sound,'true');assert.equal(storageGet(STORAGE.sound,'false'),'true');assert.match(STORAGE.baseballBest,/^the-squad:/);delete global.window});
