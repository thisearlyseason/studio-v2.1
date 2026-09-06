import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {mediaDb,loadMediaRoute} from './helpers/media-route-harness.mjs';
import {generatedMp4Body} from '../scripts/qa/certification/local/media-browser.mjs';
import {materializeFixtureMediaBytes} from '../scripts/qa/certification/fixture-catalog.mjs';

test('actual route and SDK stream 500MiB, promote by reference, and reconcile overflow/interruption sessions',{skip:process.env.MEDIA_RESUMABLE_EMULATOR_PROBE!=='1',timeout:180000},async()=>{
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,'127.0.0.1:9199');assert.equal(process.env.GCLOUD_PROJECT,'demo-the-squad-rules-test');
  const {mediaBucket}=createRequire(import.meta.url)('../src/lib/server-media-storage.ts');
  const bucket=mediaBucket(120000),player='resumable-'+randomUUID(),prefix=`players/${player}/`,sessions=[],requests=[];
  bucket.storage.interceptors.push({request:options=>{requests.push({method:options.method,uri:options.uri||options.url,bodyBytes:Buffer.isBuffer(options.body)?options.body.length:JSON.stringify(options.json||{}).length});return options;}});
  const base=bucket.file.bind(bucket);
  bucket.file=(name,...args)=>{const file=base(name,...args),create=file.createResumableUpload.bind(file),write=file.createWriteStream.bind(file);file.createResumableUpload=async(...options)=>{const result=await create(...options);sessions.push({name,uri:result[0]});return result;};file.createWriteStream=options=>{const stream=write(options);stream.on('error',error=>console.log('owned stream diagnostic',String(error.message).replace(/https?:\/\/\S+/g,'[session redacted]')));return stream;};for(const method of['copy','getMetadata','delete']){const original=file[method].bind(file);file[method]=async(...params)=>{try{return await original(...params);}catch(error){console.log('owned SDK diagnostic',method,String(error.message).replace(/https?:\/\/\S+/g,'[session redacted]'));throw error;}};}return file;};
  const {db}=mediaDb({[`players/${player}`]:{userId:'adult',primaryTeamId:'a',recruitingProfileEnabled:false},'teams/a':{ownerUserId:'owner'}});db.bucket=bucket;
  const owner=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'owner'}),mp4=materializeFixtureMediaBytes({payloadGenerator:'tiny-mp4-v1'}),limit=500*1024*1024;
  const request=(name,body,method='POST')=>new Request('http://127.0.0.1/api/media?path='+encodeURIComponent(name),{method,headers:{Authorization:'Bearer synthetic','Content-Type':'video/mp4',...(method==='GET'?{Range:'bytes=0-23'}:{})},...(body?{body:Readable.toWeb(Readable.from(body)),duplex:'half'}:{})});
  try{
    const final=prefix+'videos/boundary.mp4';let produced=0,maxChunk=0;
    async function* exact(){for await(const chunk of generatedMp4Body(mp4,limit)){produced+=chunk.length;maxChunk=Math.max(maxChunk,chunk.length);yield chunk;}}
    const upload=await owner.route.POST(request(final,exact()));console.log('owned boundary stage',JSON.stringify({status:upload.status,produced,sessions:sessions.length}));assert.equal(upload.status,201);assert.equal(produced,limit);assert.ok(maxChunk<=65536);
    const metadata=(await base(final).getMetadata())[0];assert.equal(Number(metadata.size),limit);assert.equal(Boolean(metadata.metadata?.firebaseStorageDownloadTokens),false);
    const read=await owner.route.GET(request(final,null,'GET'));assert.equal(read.status,206);assert.equal(read.headers.get('Content-Range'),`bytes 0-23/${limit}`);assert.deepEqual(Buffer.from(await read.arrayBuffer()),mp4.subarray(0,24));
    const copies=requests.filter(row=>String(row.uri).includes('/rewriteTo/')||String(row.uri).includes('/copyTo/'));assert.ok(copies.length>=1);assert.ok(copies.every(row=>row.bodyBytes<8192));
    await base(final).delete();
    assert.equal((await owner.route.POST(request(prefix+'videos/overflow.mp4',generatedMp4Body(mp4,limit+1)))).status,413);
    async function* interrupted(){yield mp4;yield Buffer.alloc(1024*1024);throw Error('owned simulated caller interruption');}
    assert.equal((await owner.route.POST(request(prefix+'videos/interrupted.mp4',interrupted()))).status,500);
    assert.equal((await bucket.getFiles({prefix}))[0].length,0);
    for(const session of sessions){const uri=new URL(session.uri),control=new URL(`http://127.0.0.1:9199/v0/b/${bucket.name}/o`);control.searchParams.set('name',session.name);control.searchParams.set('upload_id',uri.searchParams.get('upload_id'));control.searchParams.set('upload_protocol','resumable');const response=await fetch(control,{method:'POST',headers:{Authorization:'Bearer owner','X-Goog-Upload-Command':'query'},signal:AbortSignal.timeout(5000)});await response.body?.cancel();console.log('owned session state',JSON.stringify({status:response.status,state:response.headers.get('x-goog-upload-status')}));assert.ok(response.status===404||['final','cancelled'].includes(response.headers.get('x-goog-upload-status')));}
    assert.equal(sessions.length,3);
    console.log(JSON.stringify({bytes:produced,maxChunk,promotionRequests:copies.length,promotionBodyMax:Math.max(...copies.map(x=>x.bodyBytes)),sessions:sessions.length,residuals:0}));
  }finally{owner.dispose();for(const file of(await bucket.getFiles({prefix}))[0])await file.delete({ignoreNotFound:true});assert.equal((await bucket.getFiles({prefix}))[0].length,0);await new Promise(resolve=>setTimeout(resolve,100));const live=process.getActiveResourcesInfo().filter(type=>['TCPSocketWrap','Timeout'].includes(type));assert.deepEqual(live,[],'owned HTTP sockets and deadline timers must settle promptly');console.log('owned live network/deadline resources',live.length);}
});
