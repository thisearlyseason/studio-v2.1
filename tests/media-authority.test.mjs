import assert from 'node:assert/strict';
import test from 'node:test';
import {canManageMedia,canReadMedia,revokePlayerMediaTokens} from '../src/lib/media-authority.ts';
const target={kind:'player',subjectId:'p',category:'avatar',path:'players/p/avatar/x.png'};
const state={player:{userId:'adult',parentId:'parent',primaryTeamId:'team-a',recruitingProfileEnabled:false},team:{ownerUserId:'owner'}};
test('media authority grants only the exact linked actors and current primary owner',()=>{
  for(const uid of ['adult','parent','owner'])assert.equal(canManageMedia(target,{uid},state),true);
  for(const uid of ['other-owner','outsider'])assert.equal(canManageMedia(target,{uid},state),false);
  assert.equal(canManageMedia({kind:'user',subjectId:'adult'},{uid:'owner'},{}),false);
  assert.equal(canManageMedia({kind:'team',subjectId:'team-a'},{uid:'parent'},state),false);
});
test('anonymous media read follows only explicit branding and current recruiting opt-in',()=>{
  assert.equal(canReadMedia(target,null,state),false);
  assert.equal(canReadMedia(target,null,{...state,player:{...state.player,recruitingProfileEnabled:true}}),true);
  assert.equal(canReadMedia({kind:'team'},null,state),true);
  assert.equal(canReadMedia({kind:'user'},null,{}),false);
});
test('opt-out sets private state before bounded token revocation and reports partial failures',async()=>{
  let privateState=false;const cleared=[];
  const result=await revokePlayerMediaTokens({setPrivate:async()=>{privateState=true;},list:async()=>({paths:['players/p/avatar/one','players/p/videos/two'],truncated:false}),clear:async path=>{assert.equal(privateState,true);if(path.endsWith('two'))throw Error('temporary');cleared.push(path);}});
  assert.deepEqual(cleared,['players/p/avatar/one']);assert.deepEqual(result,{complete:false,revoked:1,failed:1,remaining:0});
});
test('opt-out never claims complete when bounded listing is truncated',async()=>{
  assert.deepEqual(await revokePlayerMediaTokens({setPrivate:async()=>{},list:async()=>({paths:[],truncated:true}),clear:async()=>{}}),{complete:false,revoked:0,failed:0,remaining:1});
});
