import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationDb,loadCommunicationRoute} from './helpers/communication-route-harness.mjs';
const base={'teams/a':{ownerUserId:'owner',isPro:true},'teams/a/members/member':{userId:'member',position:'Player',status:'active'}};
const bytes=Buffer.from('%PDF-1.4\nSynthetic Library\n%%EOF\n');
const request=(query='',body=bytes)=>new Request('http://127.0.0.1/api/teams/library?teamId=a&name=Squad.pdf'+query,{method:'POST',headers:{'Content-Type':'application/pdf'},body});
test('Library upload creates exactly one private object and metadata; member downloads exact bytes; delete revokes',async()=>{
  const {db,records,objects}=communicationDb(base);
  const owner=await loadCommunicationRoute('../../src/app/api/teams/library/route.ts',db,{uid:'owner'});
  const member=await loadCommunicationRoute('../../src/app/api/teams/library/route.ts',db,{uid:'member'});
  try{
    const created=await owner.route.POST(request());assert.equal(created.status,201);
    const {fileId}=await created.json();const record=records.get(`teams/a/files/${fileId}`);
    assert.equal(record.storagePath,`teams/a/library/${fileId}/content`);assert.equal(record.url,'');assert.equal(objects.size,1);
    const url=`http://127.0.0.1/api/teams/library?teamId=a&fileId=${fileId}`;
    const download=await member.route.GET(new Request(url));assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
    assert.equal(download.headers.get('Cache-Control'),'private, no-store');assert.equal(download.headers.get('Content-Disposition'),'attachment; filename="Squad.pdf"');
    assert.equal((await member.route.POST(request())).status,403);
    assert.equal((await member.route.DELETE(new Request(url,{method:'DELETE'}))).status,403);
    assert.equal((await owner.route.DELETE(new Request(url,{method:'DELETE'}))).status,200);assert.equal(objects.size,0);assert.equal(records.has(`teams/a/files/${fileId}`),false);
    assert.equal((await member.route.GET(new Request(url))).status,404);
  }finally{owner.dispose();member.dispose();}
});
test('Library rejects spoof, wrong path, oversized body, foreign actor, without orphan objects',async()=>{
  const {db,records,objects}=communicationDb({...base,'teams/a/files/prior':{sizeBytes:500*1024*1024-1}});
  const owner=await loadCommunicationRoute('../../src/app/api/teams/library/route.ts',db,{uid:'owner'});
  const foreign=await loadCommunicationRoute('../../src/app/api/teams/library/route.ts',db,{uid:'foreign'});
  try{
    assert.equal((await owner.route.POST(request('&storagePath=players/foreign/avatar/x'))).status,400);
    assert.equal((await owner.route.POST(request('',Buffer.from('text pretending PDF')))).status,400);
    assert.equal((await owner.route.POST(request('',Buffer.alloc(10*1024*1024+1)))).status,413);
    assert.equal((await foreign.route.POST(request())).status,403);assert.equal(records.size,3);assert.equal(objects.size,0);
  }finally{owner.dispose();foreign.dispose();}
});

test('Free owners and members cannot upload, read or delete Library content, even with a paid-looking label',async()=>{
 const {db,records,objects}=communicationDb({...base,'teams/a':{ownerUserId:'owner',planId:'team',isPro:false},'teams/a/files/retained':{storagePath:'teams/a/library/retained/content',category:'Documents'}});
 const before=structuredClone([...records]);
 for(const uid of ['owner','member']){
  const app=await loadCommunicationRoute('../../src/app/api/teams/library/route.ts',db,{uid});
  try{for(const method of ['POST','GET','DELETE']){
   const req=method==='POST'?request():new Request('http://127.0.0.1/api/teams/library?teamId=a&fileId=retained',{method});
   assert.equal((await app.route[method](req)).status,403);
  }}finally{app.dispose();}
 }
 assert.deepEqual([...records],before);assert.equal(objects.size,0);
});

test('staff can upload with the member Library hidden; downloads follow role visibility',async()=>{
  const {db}=communicationDb({...base,'teams/a':{ownerUserId:'owner',isPro:true,features:{library:false,byRole:{parent:{files:true}}}},
    'teams/a/members/coach':{userId:'coach',position:'Assistant Coach',status:'active'},
    'teams/a/members/parent':{userId:'parent',position:'Guardian',status:'active'}});
  const route=uid=>loadCommunicationRoute('../../src/app/api/teams/library/route.ts',db,{uid});
  const coach=await route('coach'),player=await route('member'),parent=await route('parent');
  try {
    const uploaded=await coach.route.POST(request());
    assert.equal(uploaded.status,201);
    const {fileId}=await uploaded.json();
    const url='http://localhost/api/teams/library?teamId=a&fileId='+fileId;
    assert.equal((await coach.route.GET(new Request(url))).status,200);
    assert.equal((await player.route.GET(new Request(url))).status,403);
    assert.equal((await parent.route.GET(new Request(url))).status,200);
    assert.equal((await parent.route.POST(request())).status,403);
  } finally {coach.dispose();player.dispose();parent.dispose();}
});

test('Library rename changes only the display name and requires staff on the owning team',async()=>{
  const {db,records}=communicationDb(base);
  const owner=await loadCommunicationRoute('../../src/app/api/teams/library/route.ts',db,{uid:'owner'});
  const member=await loadCommunicationRoute('../../src/app/api/teams/library/route.ts',db,{uid:'member'});
  try {
    const created=await owner.route.POST(request());
    assert.equal(created.status,201);
    const {fileId}=await created.json();
    const key='teams/a/files/'+fileId,before=structuredClone(records.get(key));
    const rename=(app,name,teamId='a')=>app.route.PATCH(new Request('http://localhost/?'+new URLSearchParams({fileId,teamId,displayName:name}),{method:'PATCH'}));
    assert.equal((await rename(member,'Other')).status,403);
    assert.equal((await rename(owner,'Other','b')).status,403);
    assert.equal((await rename(owner,'  ')).status,400);
    assert.equal((await rename(owner,'Practice schedule')).status,200);
    assert.deepEqual(records.get(key),{...before,displayName:'Practice schedule'});
    const update=(app,edits)=>app.route.PATCH(new Request('http://localhost/?teamId=a&fileId='+fileId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(edits)}));
    assert.equal((await update(member,{description:'Unauthorized'})).status,403);
    assert.equal((await update(owner,{displayName:'Weekly practice',description:'Bring water.'})).status,200);
    assert.deepEqual(records.get(key),{...before,displayName:'Weekly practice',description:'Bring water.'});
    assert.equal((await update(owner,{description:'x'.repeat(1001)})).status,400);
    assert.equal((await update(owner,{description:''})).status,200);
    assert.deepEqual(records.get(key),{...before,displayName:'Weekly practice',description:''});
    const downloaded=await member.route.GET(new Request('http://localhost/?teamId=a&fileId='+fileId));
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
  } finally { owner.dispose(); member.dispose(); }
});
