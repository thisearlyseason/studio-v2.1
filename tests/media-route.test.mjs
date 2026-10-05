import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {mediaDb,loadMediaRoute} from './helpers/media-route-harness.mjs';
import {materializeFixtureMediaBytes} from '../scripts/qa/certification/fixture-catalog.mjs';
const initial={'teams/a':{ownerUserId:'owner'},'players/p':{userId:'adult',parentId:'parent',primaryTeamId:'a',recruitingProfileEnabled:false},'users/owner':{role:'coach'}};
const request=(path,{method='GET',bytes,type='image/png',auth=true,range}={})=>new Request(`http://127.0.0.1/api/media?path=${encodeURIComponent(path)}`,{method,headers:{...(auth?{Authorization:'Bearer synthetic'}:{}),...(bytes?{'Content-Type':type}:{}),...(range?{Range:range}:{})},...(bytes?{body:bytes}:{})});
test('real decoded padded PNG at exactly 5MiB is accepted without relaxing signature validation',async()=>{
  const {db,objects}=mediaDb(initial),owner=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'owner'}),bytes=Buffer.alloc(5*1024*1024);
  materializeFixtureMediaBytes({payloadGenerator:'solid-png-v1'}).copy(bytes);
  try{assert.equal((await owner.route.POST(request('players/p/avatar/boundary.png',{method:'POST',bytes}))).status,201);assert.equal(objects.get('players/p/avatar/boundary.png').bytes.length,bytes.length);}finally{owner.dispose();}
});
test('authorized media upload creates tokenless image; anonymous private read fails; exact range and delete work',async()=>{
  const {db,objects}=mediaDb(initial),owner=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'owner'}),anonymous=await loadMediaRoute('../../src/app/api/media/route.ts',db,null);
  const bytes=await sharp({create:{width:2,height:2,channels:4,background:'#f00'}}).png().toBuffer(),path='players/p/avatar/owned.png';
  try{
    const upload=await owner.route.POST(request(path,{method:'POST',bytes}));assert.equal(upload.status,201);assert.deepEqual(await upload.json(),{path,url:'/api/media?path=players%2Fp%2Favatar%2Fowned.png'});
    assert.equal(Object.hasOwn(objects.get(path).metadata.metadata||{},'firebaseStorageDownloadTokens'),false);
    assert.equal((await anonymous.route.GET(request(path,{auth:false}))).status,403);
    const read=await owner.route.GET(request(path,{range:'bytes=2-5'}));assert.equal(read.status,206);assert.equal(read.headers.get('Content-Range'),`bytes 2-5/${bytes.length}`);assert.deepEqual(Buffer.from(await read.arrayBuffer()),bytes.subarray(2,6));
    assert.equal((await owner.route.DELETE(request(path,{method:'DELETE'}))).status,200);assert.equal(objects.size,0);
    assert.equal((await owner.route.GET(request(path))).status,404);
  }finally{owner.dispose();anonymous.dispose();}
});
test('media rejects forged bytes, oversized body, wrong scope and blocked actor without objects',async()=>{
  const {db,objects}=mediaDb(initial),owner=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'owner'}),blocked=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'adult',blocked:true});
  try{
    assert.equal((await owner.route.POST(request('players/p/avatar/x',{method:'POST',bytes:Buffer.from('text pretending PNG')}))).status,400);
    assert.equal((await owner.route.POST(request('players/p/avatar/x',{method:'POST',bytes:Buffer.alloc(5242881)}))).status,413);
    assert.equal((await owner.route.POST(request('users/adult/avatar.jpg',{method:'POST',bytes:Buffer.from('x')}))).status,403);
    assert.equal((await blocked.route.GET(request('players/p/avatar/x'))).status,403);
    assert.equal(objects.size,0);
  }finally{owner.dispose();blocked.dispose();}
});
test('recruiting opt-out clears legacy tokens for only the affected player and returns current private state',async()=>{
  const {db,records,objects}=mediaDb(initial);
  records.get('players/p').recruitingProfileEnabled=true;
  objects.set('players/p/avatar/old.png',{bytes:Buffer.from('legacy'),metadata:{metadata:{firebaseStorageDownloadTokens:'old-private-token'}}});
  objects.set('players/other/avatar/other.png',{bytes:Buffer.from('other'),metadata:{metadata:{firebaseStorageDownloadTokens:'untouched'}}});
  const owner=await loadMediaRoute('../../src/app/api/media/recruiting/route.ts',db,{uid:'owner'});
  try{
    const response=await owner.route.POST(new Request('http://127.0.0.1/api/media/recruiting',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({playerId:'p',enabled:false})}));
    assert.equal(response.status,200);assert.equal(records.get('players/p').recruitingProfileEnabled,false);
    assert.equal(objects.get('players/p/avatar/old.png').metadata.metadata.firebaseStorageDownloadTokens,undefined);
    assert.equal(objects.get('players/other/avatar/other.png').metadata.metadata.firebaseStorageDownloadTokens,'untouched');
  }finally{owner.dispose();}
});
test('a stale video existence check cannot let failed upload rollback delete another writer',async()=>{
  const {db,objects}=mediaDb(initial),path='players/p/videos/race.webm',existing=Buffer.from('other writer');
  objects.set(path,{bytes:existing,metadata:{contentType:'video/webm',size:existing.length}});
  const file=db.bucket.file.bind(db.bucket);db.bucket.file=name=>({...file(name),async exists(){return name===path?[false]:[objects.has(name)];}});
  const owner=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'owner'});
  try{
    const response=await owner.route.POST(request(path,{method:'POST',type:'video/webm',bytes:Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(16)])}));
    assert.equal(response.status>=400,true);assert.deepEqual(objects.get(path)?.bytes,existing);assert.equal(objects.size,1);
  }finally{owner.dispose();}
});
test('image and promoted video fail closed and roll back only their token-bearing generation',async()=>{
  for(const video of[false,true]){
    const {db,objects}=mediaDb(initial),path=`players/p/${video?'videos':'avatar'}/injected`,base=db.bucket.file.bind(db.bucket);
    db.bucket.file=(name,options)=>{const file=base(name,options);return{...file,async save(bytes,opts){await file.save(bytes,opts);objects.get(name).metadata.metadata={...objects.get(name).metadata.metadata,firebaseStorageDownloadTokens:'injected'};},async copy(destination,opts){await file.copy(destination,opts);objects.get(destination.name).metadata.metadata={...objects.get(destination.name).metadata.metadata,firebaseStorageDownloadTokens:'injected'};}};};
    const owner=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'owner'}),bytes=materializeFixtureMediaBytes({payloadGenerator:video?'tiny-mp4-v1':'solid-png-v1'});
    try{const response=await owner.route.POST(request(path,{method:'POST',bytes,type:video?'video/mp4':'image/png'}));assert.equal(response.status,503);assert.equal(objects.size,0);}finally{owner.dispose();}
  }
});
test('healthy promoted video has tokenless final metadata; verification cannot delete a replacement writer',async()=>{
  const {db,objects}=mediaDb(initial),path='players/p/videos/healthy.mp4',owner=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'owner'});
  try{assert.equal((await owner.route.POST(request(path,{method:'POST',bytes:materializeFixtureMediaBytes({payloadGenerator:'tiny-mp4-v1'}),type:'video/mp4'}))).status,201);assert.equal(Boolean(objects.get(path).metadata.metadata?.firebaseStorageDownloadTokens),false);}finally{owner.dispose();}
  const base=db.bucket.file.bind(db.bucket),image='players/p/avatar/replaced.png';
  db.bucket.file=(name,options)=>{const file=base(name,options);return{...file,async save(bytes,opts){await file.save(bytes,opts);objects.set(name,{bytes:Buffer.from('other writer'),metadata:{generation:'999',metadata:{squadMediaUploadId:'other',firebaseStorageDownloadTokens:'other-token'}}});}};};
  const replacement=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'owner'});
  try{assert.equal((await replacement.route.POST(request(image,{method:'POST',bytes:materializeFixtureMediaBytes({payloadGenerator:'solid-png-v1'})}))).status,503);assert.equal(objects.get(image).bytes.toString(),'other writer');}finally{replacement.dispose();}
});
test('video starts its new resumable session at zero with bounded production chunks',async()=>{
  const {db}=mediaDb(initial),base=db.bucket.file.bind(db.bucket),options=[];
  db.bucket.file=(name,...args)=>{const file=base(name,...args);return{...file,createWriteStream(value){options.push(value);return file.createWriteStream(value);}};};
  const owner=await loadMediaRoute('../../src/app/api/media/route.ts',db,{uid:'owner'});
  try{assert.equal((await owner.route.POST(request('players/p/videos/session.mp4',{method:'POST',type:'video/mp4',bytes:materializeFixtureMediaBytes({payloadGenerator:'tiny-mp4-v1'})}))).status,201);assert.equal(options.length,1);assert.equal(options[0].resumable,true);assert.equal(options[0].offset,0);assert.equal(options[0].chunkSize,8*1024*1024);assert.equal(options[0].preconditionOpts.ifGenerationMatch,0);}finally{owner.dispose();}
});
