import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import * as practice from '../scripts/qa/certification/local/practice-browser.mjs';

test('Practice browser receipts retain request-start case ownership, actual status, and no private body/query',()=>{
  const page=new EventEmitter();
  const observer=practice.createPracticeBrowserObserver(page,{baseUrl:'http://127.0.0.1:3100',prefix:'plan'});
  observer.start(['plan-create-edit']);
  const request={url:()=> 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Write/channel?SID=private',method:()=> 'POST',postData:()=> 'req0___data__='+encodeURIComponent(JSON.stringify({writes:[{update:{name:'private'}}]}))};
  page.emit('request',request);
  observer.start(['plan-assign']);
  page.emit('response',{request:()=>request,url:request.url,status:()=>200});
  const unrelated={url:()=> 'https://example.com/private',method:()=> 'GET'};
  page.emit('request',unrelated);page.emit('response',{request:()=>unrelated,url:unrelated.url,status:()=>200});
  const result=observer.finish();
  assert.deepEqual(result.observedResponses.map(r=>r.tag),['plan-create-edit','plan-console','plan-network']);
  assert.ok(result.observedResponses.every(r=>r.method==='POST'&&r.status===200&&r.pathname==='/google.firestore.v1.Firestore/Write/channel'));
  assert.ok(!JSON.stringify(result).includes('private'));
  assert.equal(page.listenerCount('response'),0);
});

test('Practice excludes Write-channel handshakes that contain no application writes',()=>{
  const page=new EventEmitter();const observer=practice.createPracticeBrowserObserver(page,{baseUrl:'http://127.0.0.1:3100',prefix:'plan'});observer.start(['plan-create-edit']);
  const request={url:()=> 'http://127.0.0.1:8080/google.firestore.v1.Firestore/Write/channel',method:()=> 'POST',postData:()=> 'req0___data__='+encodeURIComponent(JSON.stringify({database:'private'}))};
  page.emit('request',request);page.emit('response',{request:()=>request,url:request.url,status:()=>200});
  assert.deepEqual(observer.finish().observedResponses,[]);
});

test('Practice response evidence rejects missing actual mutation transport and absent case captures',()=>{
  const nav={tag:'plan-create-edit',method:'GET',pathname:'/practice',status:200};
  assert.throws(()=>practice.requirePracticeResponses([nav],'plan-create-edit',{mutation:true}),/mutation/);
  assert.throws(()=>practice.requirePracticeResponses([nav],'plan-assign'),/capture/);
  const write={...nav,method:'POST',pathname:'/google.firestore.v1.Firestore/Write/channel'};
  assert.equal(practice.requirePracticeResponses([nav,write],'plan-create-edit',{mutation:true}).length,2);
});

test('Practice layout rejects omitted desktop measurements and out-of-bounds relevant controls',()=>{
  const row=(width,height)=>({viewport:{width,height},pageWidth:width,boxes:{dialog:{x:0,y:0,width:width-1,height:height-1},control:{x:5,y:5,width:20,height:20}}});
  assert.throws(()=>practice.validatePracticeBounds([row(390,844)]),/both/);
  const rows=[row(1440,900),row(390,844)];assert.equal(practice.validatePracticeBounds(rows),true);
  rows[0].boxes.control.x=1440;assert.throws(()=>practice.validatePracticeBounds(rows),/bounds/);
});
