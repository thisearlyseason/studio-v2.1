import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {LOCAL_OPERATIONS_CASE_REQUIREMENTS} from '../scripts/qa/certification/local/batches/operations.mjs';
import {createPollBrowserObserver,findPollCard} from '../scripts/qa/certification/local/poll-browser.mjs';

test('Poll registry includes every frozen named case and observation envelope',()=>{
  assert.deepEqual(Object.values(LOCAL_OPERATIONS_CASE_REQUIREMENTS['polls-create-vote-change-tally']).flat().sort(),['poll-create','poll-invalid','poll-vote','poll-change','poll-replay','poll-race','poll-invalid-option','poll-ineligible','poll-removed','poll-team-b','poll-module-off','poll-responsive','poll-console','poll-network'].sort());
});
test('Poll browser observer binds exact owned channel navigation and mutations at request start',()=>{
  const page=new EventEmitter();
  const observer=createPollBrowserObserver(page,{baseUrl:'http://127.0.0.1:9001',chatId:'owned'});
  observer.start(['poll-vote']);
  const request={url:()=> 'http://127.0.0.1:9001/api/teams/chat/vote',method:()=> 'POST'};
  page.emit('request',request);observer.start(['poll-change']);page.emit('response',{request:()=>request,status:()=>200});
  for(const url of ['http://127.0.0.1:9001.evil/chats/owned','http://127.0.0.1:9001/chats/foreign','http://127.0.0.1:9001/api/teams/feed/action']) {
    const other={url:()=>url,method:()=> 'GET'};page.emit('request',other);page.emit('response',{request:()=>other,status:()=>200});
  }
  const result=observer.finish();
  assert.deepEqual(result.observedResponses.map(row=>row.tag),['poll-vote','poll-console','poll-network']);
  assert.equal(result.observedResponses[0].status,200);assert.equal(page.listenerCount('request'),0);
});
test('Poll card lookup excludes a channel heading with the identical marker',()=>{
  const page={getByRole(role,options){assert.equal(role,'heading');assert.deepEqual(options,{name:'same marker',level:4,exact:true});return{locator:path=>path};}};
  assert.equal(findPollCard(page,'same marker'),'xpath=../../..');
});
