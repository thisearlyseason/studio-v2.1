import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {createLibraryBrowserObserver,validateLibraryDownload,completeLibraryUpload} from '../scripts/qa/certification/local/library-browser.mjs';
import {LOCAL_OPERATIONS_CASE_REQUIREMENTS} from '../scripts/qa/certification/local/batches/operations.mjs';
test('Library frozen cases are explicit and exact',()=>assert.deepEqual(Object.values(LOCAL_OPERATIONS_CASE_REQUIREMENTS['files-library-crud-download']).flat().sort(),['lib-upload','lib-download','lib-member-read','lib-mime-spoof','lib-oversize','lib-wrong-path','lib-private-public','lib-delete','lib-stale','lib-team-b','lib-responsive','lib-console','lib-network'].sort()));
test('Library download cannot pass on name or length alone',()=>{
  const want={name:'Squad.pdf',length:32,hash:'independent-hash'},actual={filename:'Squad.pdf',byteCount:32,sha256:'independent-hash'};
  assert.equal(validateLibraryDownload(actual,want),true);
  for(const wrong of [{filename:'../Squad.pdf'},{byteCount:33},{sha256:'changed'}])assert.throws(()=>validateLibraryDownload({...actual,...wrong},want));
});
test('Library observer associates completed request with original case and exact origin',()=>{
  const page=new EventEmitter(),observer=createLibraryBrowserObserver(page,{baseUrl:'http://127.0.0.1:9001'});
  const request={url:()=> 'http://127.0.0.1:9001/api/teams/library?fileId=owned',method:()=> 'GET'};
  observer.start(['lib-download']);page.emit('request',request);observer.start(['lib-delete']);page.emit('response',{request:()=>request,status:()=>200});
  assert.deepEqual(observer.finish().observedResponses.map(row=>row.tag),['lib-download','lib-console','lib-network']);assert.equal(page.listenerCount('response'),0);
});
const uploaded={fileId:'owned-id',name:'Run owned.pdf',storagePath:'teams/team-a/library/owned-id/content'};
test('Library resolves its exact postcondition without reading the browser response body',async()=>{
  const response={status:201,json(){throw Error('Browser response body is unavailable');}};
  assert.deepEqual(await completeLibraryUpload(response,async()=>[uploaded],{teamId:'team-a',name:'Run owned.pdf'}),uploaded);
});
test('Library postcondition rejects failed upload, absence, duplicates and mismatched ownership',async()=>{
  for(const [status,rows]of[[500,[uploaded]],[201,[]],[201,[uploaded,uploaded]],[201,[{...uploaded,name:'Other'}]],[201,[{...uploaded,storagePath:'teams/team-b/library/owned-id/content'}]],[201,[{...uploaded,fileId:'../escape'}]]]){
    await assert.rejects(()=>completeLibraryUpload({status},async()=>rows,{teamId:'team-a',name:'Run owned.pdf'}),/Library/);
  }
});
test('Library postcondition propagates the bounded authenticated query failure',async()=>{
  await assert.rejects(()=>completeLibraryUpload({status:201},async()=>{throw Error('Query deadline exceeded');},{teamId:'team-a',name:'Run owned.pdf'}),/Query deadline/);
});
