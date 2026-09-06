import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from '../scripts/qa/certification/local/film-playback.mjs';

test('Film playback evidence rejects unready, paused, and non-advancing media', async()=>{
  assert.equal(typeof module.validateFilmPlayback,'function');
  const observed={duration:1.812,before:0,after:0.302,paused:false};
  assert.equal(module.validateFilmPlayback(observed),true);
  for(const invalid of [{...observed,duration:Infinity},{...observed,after:0},{...observed,paused:true},{...observed,after:3}]) assert.throws(()=>module.validateFilmPlayback(invalid));
});

test('Film alert dismissal closes only the exact visible alert and preserves unexpected failures',async()=>{
  assert.equal(typeof module.dismissFilmTeamAlert,'function');
  const actions=[];
  const page={getByRole(role,options){assert.equal(role,'dialog');assert.deepEqual(options,{name:'High Priority Team Alert',exact:true});return{
    async waitFor({state}){actions.push(state);},
    getByRole(role,options){assert.equal(role,'button');assert.deepEqual(options,{name:'Close',exact:true});return{async click(){actions.push('close');}};},
  };}};
  await module.dismissFilmTeamAlert(page);
  assert.deepEqual(actions,['visible','close','hidden']);
  const missing={getByRole(){return{async waitFor(){throw Object.assign(new Error('absent'),{name:'TimeoutError'});}};}};
  await module.dismissFilmTeamAlert(missing);
  const broken={getByRole(){return{async waitFor(){throw new Error('session closed');}};}};
  await assert.rejects(module.dismissFilmTeamAlert(broken),/session closed/);
});
