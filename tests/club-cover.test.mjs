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
