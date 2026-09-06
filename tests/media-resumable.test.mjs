import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaResumableOptions,cancelMediaUpload,mediaUploadAbortAdapter} from '../src/lib/media-resumable.ts';
const bucket='demo-the-squad-rules-test.appspot.com',name='players/p/pending/owned';
const environment={FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',GCLOUD_PROJECT:'demo-the-squad-rules-test'};
const uri=`http://127.0.0.1:9199/upload/storage/v1/b/${bucket}/o?name=${encodeURIComponent(name)}&upload_id=owned&uploadType=resumable`;
test('production uses bounded resumable chunks; raw streaming exception is exact demo loopback only',()=>{
  assert.deepEqual(mediaResumableOptions(bucket,{}),{resumable:true,chunkSize:8*1024*1024,highWaterMark:64*1024});
  assert.deepEqual(mediaResumableOptions(bucket,environment),{resumable:true,highWaterMark:64*1024});
  for(const env of[{...environment,FIREBASE_STORAGE_EMULATOR_HOST:'localhost:9199'},{...environment,FIREBASE_STORAGE_EMULATOR_HOST:'remote:9199'},{...environment,GCLOUD_PROJECT:'production'},{...environment,GCLOUD_PROJECT:'demo-other'}])assert.throws(()=>mediaResumableOptions(bucket,env),/Unsafe/);
  assert.throws(()=>mediaResumableOptions('other.appspot.com',environment),/Unsafe/);
});
test('owned emulator session cancellation is queried and verified without exposing a session URL',async()=>{
  const commands=[];await cancelMediaUpload({bucket,name,uri},{environment,fetcher:async(url,init)=>{assert.equal(new URL(url).origin,'http://127.0.0.1:9199');commands.push(init.headers['X-Goog-Upload-Command']);return new Response(null,{status:200,headers:{'X-Goog-Upload-Status':commands.length===1?'active':'cancelled'}});}});
  assert.deepEqual(commands,['query','cancel','query']);
  await assert.rejects(()=>cancelMediaUpload({bucket,name,uri},{environment,fetcher:async()=>new Response(null,{status:200,headers:{'X-Goog-Upload-Status':'active'}})}),/did not settle/);
  for(const bad of[uri.replace('127.0.0.1','example.com'),uri.replace(encodeURIComponent(name),'other')]){
    await assert.rejects(()=>cancelMediaUpload({bucket,name,uri:bad},{environment,fetcher:async()=>{throw Error('must not fetch');}}),/Unsafe/);
  }
});
test('production cancellation requires terminal query, no retries or emulator admin header',async()=>{
  const calls=[];await cancelMediaUpload({bucket:'real-bucket',name,uri:'https://storage.googleapis.com/upload/storage/v1/b/real-bucket/o?upload_id=owned&name='+encodeURIComponent(name)},{environment:{},fetcher:async(url,init)=>{calls.push(init);return new Response(null,{status:init.method==='DELETE'?499:404});}});
  assert.deepEqual(calls.map(x=>x.method),['DELETE','PUT']);assert.equal(calls[0].headers,undefined);
});
test('completed emulator protocol state is final, not the internal enum label',async()=>{
  let calls=0;await cancelMediaUpload({bucket,name,uri},{environment,fetcher:async()=>{calls++;return new Response(null,{status:200,headers:{'X-Goog-Upload-Status':'final'}});}});assert.equal(calls,1);
});
test('owned abort reaches SDK HTTP adapter even when duplexify drops the destroy error',async()=>{
  const owned=new AbortController(),sdk=new AbortController(),adapter=mediaUploadAbortAdapter(owned.signal);let started;
  const ready=new Promise(resolve=>{started=resolve;});
  const result=adapter({signal:sdk.signal},async options=>{started();await new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('request settled by abort')),{once:true}));});
  await ready;owned.abort();await assert.rejects(result,/settled by abort/);assert.equal(sdk.signal.aborted,false);
});
