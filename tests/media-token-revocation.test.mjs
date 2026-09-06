import test from 'node:test';
import assert from 'node:assert/strict';
import {revokeMediaFileTokens} from '../src/lib/media-token-revocation.ts';
const fixture=()=>{let tokens='old';return{name:'players/p/avatar/x',bucket:{name:'demo-probe.appspot.com'},async getMetadata(){return[{metadata:{firebaseStorageDownloadTokens:tokens}}];},async setMetadata(){tokens='';}};};
test('production clears metadata and requires each previously issued URL to fail',async()=>{
  const calls=[];await revokeMediaFileTokens(fixture(),{environment:{},fetcher:async(url,init)=>{calls.push({url:String(url),init});return new Response(null,{status:403});}});assert.equal(calls.length,1);assert.equal(calls[0].init.headers,undefined);assert.match(calls[0].url,/https:\/\/firebasestorage.googleapis.com/);
  await assert.rejects(()=>revokeMediaFileTokens(fixture(),{environment:{},fetcher:async()=>new Response('leaked',{status:200})}),/still readable/);
});
test('emulator compatibility refuses non-loopback or non-demo targets before fetch',async()=>{
  for(const environment of[{FIREBASE_STORAGE_EMULATOR_HOST:'remote:9199',GCLOUD_PROJECT:'demo-probe'},{FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',GCLOUD_PROJECT:'production'}])await assert.rejects(()=>revokeMediaFileTokens(fixture(),{environment,fetcher:async()=>{throw Error('must not fetch');}}),/Unsafe emulator/);
});
test('emulator deletes only captured old tokens and verifies their denial',async()=>{
  const file=fixture(),calls=[];file.setMetadata=async()=>{};
  let deleted=false;file.getMetadata=async()=>[{metadata:{firebaseStorageDownloadTokens:deleted?'new-unpublished':'old'}}];
  await revokeMediaFileTokens(file,{environment:{FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199',GCLOUD_PROJECT:'demo-probe'},fetcher:async(url,init)=>{calls.push({url:String(url),init});if(init.method==='POST'){deleted=true;return new Response('{}');}return new Response(null,{status:403});}});
  assert.equal(calls.length,2);assert.equal(calls[0].init.headers.Authorization,'Bearer owner');assert.equal(calls[1].init.headers,undefined);
});
