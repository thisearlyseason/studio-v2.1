import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {LOCAL_OPERATIONS_CASE_REQUIREMENTS} from '../scripts/qa/certification/local/batches/operations.mjs';
import {createMediaBrowserObserver,generatedMp4Body} from '../scripts/qa/certification/local/media-browser.mjs';
test('Media frozen cases are explicit and exact',()=>assert.deepEqual(Object.values(LOCAL_OPERATIONS_CASE_REQUIREMENTS['files-avatar-branding-player-media-paths']).flat().sort(),['media-user-avatar','media-player-self','media-parent','media-team-owner','media-branding','media-private-public','media-wrong-player','media-wrong-team','media-outsider','media-unverified','media-suspended','media-type','media-image-boundary','media-video-boundary','media-delete','media-responsive','media-console','media-network'].sort()));
test('Media observer retains actual initiating case and ignores foreign origins',()=>{
  const page=new EventEmitter(),observer=createMediaBrowserObserver(page,{baseUrl:'http://127.0.0.1:9001'});
  const request={url:()=> 'http://127.0.0.1:9001/api/media?path=secret',method:()=> 'POST'};
  observer.start(['media-user-avatar']);page.emit('request',request);observer.start(['media-responsive']);page.emit('response',{request:()=>request,status:()=>201});
  const foreign={...request,url:()=> 'http://foreign/api/media'};page.emit('request',foreign);page.emit('response',{request:()=>foreign,status:()=>201});
  const rows=observer.finish().observedResponses;assert.deepEqual(rows.map(row=>row.tag),['media-user-avatar','media-console','media-network']);assert.equal(rows[0].pathname,'/api/media');assert.equal(page.listenerCount('response'),0);
});
test('generated MP4 boundary uses a bounded free box and exact actual streamed byte count',async()=>{
  const prefix=Buffer.from('00000018667479706d703432000000006d70343269736f6d','hex');
  let count=0,max=0,first;for await(const chunk of generatedMp4Body(prefix,500*1024*1024+1)){count+=chunk.length;max=Math.max(max,chunk.length);first??=chunk;}
  assert.equal(count,500*1024*1024+1);assert.ok(max<=64*1024);assert.deepEqual(first,prefix);
  const chunks=[];for await(const chunk of generatedMp4Body(prefix,100))chunks.push(chunk);assert.equal(chunks[1].readUInt32BE(0),76);assert.equal(chunks[1].toString('ascii',4,8),'free');
});
test('affected Film records supported protected upload and gallery deletion uses managed cleanup',()=>{
  const audit=readFileSync(new URL('../scripts/qa/run-phase2-emulator-audit.mjs',import.meta.url),'utf8');
  const film=audit.slice(audit.indexOf('async function runPracticeFilmWorkflowAudit'),audit.indexOf('async function runLibraryWorkflowAudit'));
  assert.match(film,/captureOperationRequests\('film-photo'[\s\S]*?apiJsonResult\('\/api\/media\?path='/);
  const ui=readFileSync(new URL('../src/app/(dashboard)/coaches-corner/page.tsx',import.meta.url),'utf8');
  assert.match(ui,/e\.stopPropagation\(\);\s*void handleDeletePhoto\(photoUrl\)/);
});
