import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationDb,communicationRequest,loadCommunicationRoute} from './helpers/communication-route-harness.mjs';
import {sanitizeCertificationArtifact} from '../scripts/qa/run-phase2-emulator-audit.mjs';

test('feed public resource identifiers remain distinct after credential redaction',async()=>{
  const {db}=communicationDb({'teams/team-a':{ownerUserId:'owner-a'}});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/feed/action/route.ts',db,{uid:'owner-a'});
  try {
    const paths=[];
    for(const key of ['one','two']) {
      const response=await loaded.route.POST(communicationRequest({teamId:'team-a',action:'create-post',content:key,idempotencyKey:key}));
      paths.push(`teams/team-a/feedPosts/${(await response.json()).postId}`);
    }
    assert.deepEqual(sanitizeCertificationArtifact(paths),paths);
    assert.equal(new Set(sanitizeCertificationArtifact(paths)).size,2);
  } finally {loaded.dispose();}
});

test('feed replay creates one post with exact request identity',async()=>{
  const {db,records}=communicationDb({'teams/team-a':{ownerUserId:'owner-a'},'users/owner-a':{name:'Owner A'}});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/feed/action/route.ts',db,{uid:'owner-a'});
  try {
    const body={teamId:'team-a',action:'create-post',content:'One post',idempotencyKey:'post-replay'};
    const first=await loaded.route.POST(communicationRequest(body));
    const second=await loaded.route.POST(communicationRequest(body));
    assert.equal(first.status,201);
    assert.equal((await first.json()).postId,(await second.json()).postId);
    assert.equal([...records.keys()].filter(path=>/feedPosts\/[^/]+$/.test(path)).length,1);
  } finally {loaded.dispose();}
});

const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=';

test('feed failed metadata commit removes its newly created image object',async t=>{
  t.mock.method(console,'error',()=>{});
  const {db,objects}=communicationDb({'teams/team-a':{ownerUserId:'owner-a'}});
  db.runTransaction=async()=>{throw Error('injected commit failure');};
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/feed/action/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',action:'create-post',content:'Image',imageUrl:pixel}));
    assert.equal(response.status,500);
    assert.equal(objects.size,0);
  } finally {loaded.dispose();}
});

test('feed private media creates and deletes an exact object plus metadata without public URL',async()=>{
  const {db,records,objects}=communicationDb({'teams/team-a':{ownerUserId:'owner-a'}});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/feed/action/route.ts',db,{uid:'owner-a'});
  try {
    const create=await loaded.route.POST(communicationRequest({teamId:'team-a',action:'create-post',content:'Image',imageUrl:pixel,idempotencyKey:'image-once'}));
    assert.equal(create.status,201);
    const {postId}=await create.json();
    assert.equal(objects.size,1);
    assert.equal(records.get(`teams/team-a/feedPosts/${postId}`).imagePath,`teams/team-a/feed/${postId}/image`);
    assert.equal(records.get(`teams/team-a/feedPosts/${postId}`).imageUrl,null);
    const download=await loaded.route.GET(new Request(`http://127.0.0.1/api/teams/feed/action?teamId=team-a&postId=${postId}&media=1`));
    assert.equal(download.status,200);
    assert.equal(download.headers.get('content-type'),'image/png');
    assert.equal(Buffer.from(await download.arrayBuffer()).toString('base64'),pixel.split(',')[1]);
    assert.equal((await loaded.route.POST(communicationRequest({teamId:'team-a',action:'delete-post',postId}))).status,200);
    assert.equal(objects.size,0);
    assert.equal(records.has(`teams/team-a/feedPosts/${postId}`),false);
  } finally {loaded.dispose();}
});

test('feed legacy everyone is team-scoped and unknown audiences fail closed on posts comments and media',async()=>{
  const {db}=communicationDb({
    'teams/team-a':{ownerUserId:'owner-a'},
    'teams/team-a/members/player':{userId:'player',position:'Player',status:'active'},
    'teams/team-a/feedPosts/legacy':{content:'Legacy'},
    'teams/team-a/feedPosts/coaches':{content:'Private',audience:'coaches'},
    'teams/team-a/feedPosts/bad':{content:'Bad',audience:'unknown'},
  });
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/feed/action/route.ts',db,{uid:'player'});
  try {
    const response=await loaded.route.GET(new Request('http://127.0.0.1/api/teams/feed/action?teamId=team-a'));
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).posts.map(post=>post.id),['legacy']);
    for(const postId of ['coaches','bad']) for(const suffix of ['', '&media=1']) assert.equal((await loaded.route.GET(new Request(`http://127.0.0.1/api/teams/feed/action?teamId=team-a&postId=${postId}${suffix}`))).status,404);
    assert.equal((await loaded.route.POST(communicationRequest({teamId:'team-a',action:'create-comment',postId:'coaches',content:'Blocked'}))).status,404);
  } finally {loaded.dispose();}
});

test('feed disabled module denies owner read and mutation without metadata changes',async()=>{
  const {db,records}=communicationDb({'teams/team-a':{ownerUserId:'owner-a',features:{feed:false}}});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/feed/action/route.ts',db,{uid:'owner-a'});
  try {
    assert.equal((await loaded.route.GET(new Request('http://127.0.0.1/api/teams/feed/action?teamId=team-a'))).status,403);
    assert.equal((await loaded.route.POST(communicationRequest({teamId:'team-a',action:'create-post',content:'Disabled'}))).status,403);
    assert.equal(records.size,1);
  } finally {loaded.dispose();}
});

test('feed image validation rejects over-limit bytes signature mismatch missing and foreign paths with no objects',async()=>{
  const {db,objects,records}=communicationDb({'teams/team-a':{ownerUserId:'owner-a'}});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/feed/action/route.ts',db,{uid:'owner-a'});
  try {
    for(const extra of [{imageUrl:'data:image/png;base64,SGVsbG8='},{imageUrl:`data:image/png;base64,${Buffer.alloc(5*1024*1024+1).toString('base64')}`},{imagePath:'teams/team-a/feed/missing/image'},{imagePath:'teams/team-b/feed/foreign/image'}]) {
      assert.equal((await loaded.route.POST(communicationRequest({teamId:'team-a',action:'create-post',content:'Invalid',...extra}))).status,400);
      assert.equal(objects.size,0);
      assert.equal([...records.keys()].some(path=>path.includes('/feedPosts/')),false);
    }
  } finally {loaded.dispose();}
});

test('feed rejects unsupported image MIME rather than storing a data URL as media',async()=>{
  const {db,records}=communicationDb({'teams/team-a':{ownerUserId:'owner-a'}});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/feed/action/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',action:'create-post',content:'Unsafe',imageUrl:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='}));
    assert.equal(response.status,400);
    assert.equal([...records.keys()].some(path=>path.includes('/feedPosts/')),false);
  } finally {loaded.dispose();}
});
