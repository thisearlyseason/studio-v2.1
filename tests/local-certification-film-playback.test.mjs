import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from '../scripts/qa/certification/local/film-playback.mjs';

test('Film fails closed within five seconds when real playback never resolves finite duration',async()=>{
  const previous=globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame=callback=>setTimeout(callback,5);
  let seeks=0;let plays=0;
  const media={duration:Infinity,paused:true,muted:false,
    get currentTime(){return 0;},set currentTime(value){seeks++;if(!Number.isFinite(value))throw new TypeError('non-finite seek');},
    async play(){plays++;this.paused=false;},pause(){this.paused=true;},
  };
  const started=performance.now();
  try {
    await assert.rejects(module.observeFilmPlayback(media,0.76),/within 5s/);
    assert.ok(performance.now()-started>=4900 && performance.now()-started<6000);
    assert.equal(seeks,0);assert.equal(plays,1);assert.equal(media.paused,true);
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(seeks,0);assert.equal(plays,1);assert.equal(media.paused,true);
  }finally{globalThis.requestAnimationFrame=previous;}
});

test('Film playback evidence rejects unready, paused, and non-advancing media', async()=>{
  assert.equal(typeof module.validateFilmPlayback,'function');
  const observed={duration:1.812,before:0,after:0.302,paused:false};
  assert.equal(module.validateFilmPlayback(observed),true);
  for(const invalid of [{...observed,duration:Infinity},{...observed,after:0},{...observed,paused:true},{...observed,after:3}]) assert.throws(()=>module.validateFilmPlayback(invalid));
});

test('Film drains sequential Everyone and Coach alerts rather than exposing the next overlay',async()=>{
  let closed=0;
  const page={waitForEvent:async()=>({}),getByRole(){return{
    async innerText(){return 'synthetic alert';},async waitFor({state}){if(state==='visible'&&closed===2)throw Object.assign(new Error('no next alert'),{name:'TimeoutError'});},
    getByRole(){return{async click(){closed++;}};},
  };}};
  await module.dismissFilmTeamAlert(page);
  assert.equal(closed,2);
});

test('Film alert dismissal closes only the exact visible alert and preserves unexpected failures',async()=>{
  assert.equal(typeof module.dismissFilmTeamAlert,'function');
  const actions=[];
  const page={waitForEvent:async()=>({}),getByRole(role,options){assert.equal(role,'dialog');assert.deepEqual(options,{name:'High Priority Team Alert',exact:true});return{
    async innerText(){return 'synthetic alert';},async waitFor({state}){if(state==='visible'&&actions.includes('close'))throw Object.assign(new Error('absent'),{name:'TimeoutError'});actions.push(state);},
    getByRole(role,options){assert.equal(role,'button');assert.deepEqual(options,{name:'Got It',exact:true});return{async click(){actions.push('close');}};},
  };}};
  await module.dismissFilmTeamAlert(page);
  assert.deepEqual(actions,['visible','close','hidden']);
  const missing={getByRole(){return{async innerText(){return 'synthetic alert';},async waitFor(){throw Object.assign(new Error('absent'),{name:'TimeoutError'});}};}};
  await module.dismissFilmTeamAlert(missing);
  const broken={getByRole(){return{async innerText(){return 'synthetic alert';},async waitFor(){throw new Error('session closed');}};}};
  await assert.rejects(module.dismissFilmTeamAlert(broken),/session closed/);
  let closed=0;
  const overflowing={waitForEvent:async()=>({}),getByRole(){return{async innerText(){return 'synthetic alert';},async waitFor(){},getByRole(){return{async click(){closed++;}};}};}};
  await assert.rejects(module.dismissFilmTeamAlert(overflowing),/four-alert fixture bound/);
  assert.equal(closed,4);
});

test('Film deletion evidence waits for exact metadata and object 404s and reports bounded samples', async () => {
  assert.equal(typeof module.observeFilmDeletionReconciliation, 'function');
  let objectReads = 0;
  const observed = await module.observeFilmDeletionReconciliation({
    readMetadataStatus: async () => 404,
    readObjectStatus: async () => (++objectReads === 1 ? 200 : 404),
    timeoutMs: 50,
    intervalMs: 0,
  });
  assert.equal(observed.metadataStatus, 404);
  assert.equal(observed.objectStatus, 404);
  assert.deepEqual(observed.samples.map(sample => [sample.metadataStatus, sample.objectStatus]), [[404, 200], [404, 404]]);

  await assert.rejects(() => module.observeFilmDeletionReconciliation({
    readMetadataStatus: async () => 404,
    readObjectStatus: async () => 200,
    timeoutMs: 5,
    intervalMs: 0,
  }), /metadata=404 object=200/);
});


test('priority acknowledgment waits for committed state before navigation can resume', async()=>{
 let commit;const committed=new Promise(resolve=>{commit=resolve;});const actions=[];let visible=true;
 const page={waitForEvent(event,options){assert.equal(event,'console');assert.equal(options.predicate({text:()=> 'DEBUG: markAlertAsSeen Firestore write successful for ID: synthetic-alert'}),true);return committed;},getByRole(){return{async innerText(){return 'synthetic alert';},async waitFor({state}){if(state==='visible'&&!visible)throw Object.assign(new Error('absent'),{name:'TimeoutError'});actions.push(state);},getByRole(_role,options){assert.equal(options.name,'Got It');return{async click(){actions.push('acknowledge');visible=false;}};}};}};
 const work=module.dismissFilmTeamAlert(page);await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(actions,['visible','acknowledge']);commit({});await work;assert.deepEqual(actions,['visible','acknowledge','hidden']);
});

test('an immediately visible next alert does not block queue acknowledgement',async()=>{let current=0;const alert={async innerText(){return 'alert '+current;},async waitFor({state}){if(state==='visible'&&current===2)throw Object.assign(Error('done'),{name:'TimeoutError'});if(state==='hidden'&&current<2)throw Object.assign(Error('next visible'),{name:'TimeoutError'});},getByRole(){return{async click(){current++;}};}};await module.dismissFilmTeamAlert({getByRole(){return alert;},waitForEvent:async()=>({})});assert.equal(current,2);});
