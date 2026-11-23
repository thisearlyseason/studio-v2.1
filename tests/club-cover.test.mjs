import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {communicationDb,loadCommunicationRoute} from './helpers/communication-route-harness.mjs';

test('club owner can replace and restore the hub cover without altering squad covers',async()=>{
  const team={ownerUserId:'owner',type:'club',homeCover:{id:'squad-photo'}};
  const {db,records}=communicationDb({'teams/club-a':team});
  const load=uid=>loadCommunicationRoute('../../src/app/api/club/cover/route.ts',db,{uid});
  const owner=await load('owner'),other=await load('other');
  const url='https://example.test/api/club/cover?teamId=club-a';
  try {
    assert.equal((await owner.route.GET(new Request(url))).status,204);
    for(const color of ['red','blue']){
      const bytes=await sharp({create:{width:400,height:220,channels:3,background:color}}).png().toBuffer();
      const saved=await owner.route.POST(new Request(url,{method:'POST',body:bytes}));
      assert.equal(saved.status,200);
      const read=await owner.route.GET(new Request(url));
      assert.equal(read.headers.get('Content-Type'),'image/webp');
      assert.deepEqual(Buffer.from(await read.arrayBuffer()),Buffer.from(await saved.arrayBuffer()));
    }
    assert.equal((await other.route.DELETE(new Request(url,{method:'DELETE'}))).status,403);
    assert.equal((await owner.route.DELETE(new Request(url,{method:'DELETE'}))).status,204);
    assert.equal((await owner.route.GET(new Request(url))).status,204);
    assert.deepEqual(records.get('teams/club-a'),team);
  } finally {owner.dispose();other.dispose();}
});

test('cover access matches hub eligibility and always requires ownership', async () => {
  const {db} = communicationDb({
    'teams/squad': { ownerUserId: 'owner', type: 'team' },
    'teams/legacy': { ownerUserId: 'owner', type: 'school_hub' },
    'users/school': { plan_type: 'school' },
    'teams/school-squad': { ownerUserId: 'school', type: 'team' },
  });
  for (const [uid, role, team, status] of [
    ['owner', 'superadmin', 'squad', 204],
    ['owner', '', 'legacy', 204],
    ['school', '', 'school-squad', 204],
    ['owner', '', 'squad', 403],
    ['school', '', 'squad', 403],
    ['other', 'superadmin', 'squad', 403],
  ]) {
    const handle = await loadCommunicationRoute('../../src/app/api/club/cover/route.ts', db, {uid, role});
    try {
      const response = await handle.route.GET(new Request('https://example.test/api/club/cover?teamId=' + team));
      assert.equal(response.status, status);
    } finally { handle.dispose(); }
  }
});

test('switching hubs and linked squads selects their owned branding record',async()=>{
  const {resolveBrandingHub} = await import('../src/lib/hub-eligibility.ts');
  const teams = [
    {id:'a',type:'club'}, {id:'b',type:'club_hub'}, {id:'s',type:'school_hub'},
    {id:'player',clubId:'b'}, {id:'student',schoolId:'s'}, {id:'unlinked'},
  ].map(team=>({...team,ownerUserId:'owner'}));
  for(const [active,expected] of [['b','b'],['a','a'],['player','b'],['student','s'],['s','s'],['unlinked',undefined]]) {
    assert.equal(resolveBrandingHub(teams,active,'owner',false)?.id,expected);
  }
  assert.equal(resolveBrandingHub(teams,'student','other',true),undefined);
});

test('replacing and removing a school cover leaves sibling school and club photos intact',async()=>{
  const data=Object.fromEntries(['club','school','school_hub'].map(type=>['teams/'+type,{type,ownerUserId:'owner'}]));
  const {db}=communicationDb(data);
  const handle=await loadCommunicationRoute('../../src/app/api/club/cover/route.ts',db,{uid:'owner'});
  const address=type=>'https://example.test/api/club/cover?teamId='+type;
  const photos=new Map();
  try {
    for(const [type,color] of [['club','blue'],['school','red'],['school_hub','green']]) {
      const body=await sharp({create:{width:400,height:220,channels:3,background:color}}).png().toBuffer();
      const saved=await handle.route.POST(new Request(address(type),{method:'POST',body}));
      assert.equal(saved.status,200);
      photos.set(type,Buffer.from(await saved.arrayBuffer()));
    }
    assert.equal((await handle.route.DELETE(new Request(address('school'),{method:'DELETE'}))).status,204);
    for(const type of ['school_hub','club']) {
      const response=await handle.route.GET(new Request(address(type)));
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),photos.get(type));
    }
  } finally { handle.dispose(); }
});
