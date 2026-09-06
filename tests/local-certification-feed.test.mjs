import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {LOCAL_OPERATIONS_CASE_REQUIREMENTS} from '../scripts/qa/certification/local/batches/operations.mjs';
import {createFeedBrowserObserver} from '../scripts/qa/certification/local/feed-browser.mjs';

test('Feed emits all frozen cases rather than generic dimension placeholders',()=>{
  const contract=LOCAL_OPERATIONS_CASE_REQUIREMENTS['feed-post-media-comment-moderation'];
  assert.deepEqual(Object.values(contract).flat().sort(),['feed-post-comment','feed-media','feed-media-invalid','feed-replay','feed-author-delete','feed-moderator-delete','feed-audience','feed-parent','feed-removed','feed-team-b','feed-module-off','feed-persistence','feed-console','feed-network','feed-responsive'].sort());
});

test('Feed observer owns request-start case and rejects foreign lookalike origins',()=>{
  const page=new EventEmitter();
  const observer=createFeedBrowserObserver(page,{baseUrl:'http://127.0.0.1:9001'});
  const request={url:()=> 'http://127.0.0.1:9001/api/teams/feed/action?teamId=private',method:()=> 'POST'};
  observer.start(['feed-media']);page.emit('request',request);observer.start(['feed-author-delete']);
  page.emit('response',{request:()=>request,status:()=>201});
  const foreign={url:()=> 'http://127.0.0.1:9001.evil.test/api/teams/feed/action',method:()=> 'POST'};
  page.emit('request',foreign);page.emit('response',{request:()=>foreign,status:()=>200});
  const output=observer.finish();
  assert.deepEqual(output.observedResponses.map(item=>item.tag),['feed-media','feed-console','feed-network']);
  assert.equal(output.observedResponses[0].pathname,'/api/teams/feed/action');
  assert.equal(output.observedResponses[0].status,201);
  assert.equal(page.listenerCount('request'),0);
});
