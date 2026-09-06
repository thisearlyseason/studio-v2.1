import test from 'node:test';
import assert from 'node:assert/strict';
import {selfMediaPlayerId,uploadSelfPlayerImage,deleteSelfPlayerImage} from '../src/lib/player-self-media.ts';
const subject={actorId:'adult',actorRole:'adult_player',isPlayer:true,member:{userId:'adult',playerId:'p'}};
test('self-media scope excludes teammate, guardian, coach and malformed player IDs',()=>{
  assert.equal(selfMediaPlayerId(subject),'p');
  for(const value of[{...subject,actorId:'teammate'},{...subject,actorRole:'youth_player'},{...subject,actorRole:'coach'},{...subject,isPlayer:false},{...subject,actorId:null},{...subject,member:{userId:'adult',playerId:'../other'}},{...subject,member:{userId:'adult'}}])assert.equal(selfMediaPlayerId(value),null);
});
const state=()=>{const objects=new Map(),profile={bio:'unchanged'},calls=[];return{objects,profile,calls,deps:{async upload(path,file){objects.set(path,file);return{path,url:'/api/media?path='+encodeURIComponent(path)};},async remove(path){objects.delete(path);},async persist(kind,url,remove){calls.push({kind,url,remove});if(kind==='avatar')profile.photoURL=remove?'':url;else profile.photos=remove?(profile.photos||[]).filter(x=>x!==url):[...(profile.photos||[]),url];}}};};
test('self avatar/gallery updates only owned image identities and rollback on metadata failure',async()=>{
  const s=state();const url=await uploadSelfPlayerImage(subject,'gallery',new File(['synthetic'],'x.png'),s.deps);assert.match(url,/^\/api\/media\?path=players%2Fp%2Fthumbnails%2F/);assert.deepEqual(s.profile.photos,[url]);assert.equal(s.profile.bio,'unchanged');
  await deleteSelfPlayerImage(subject,'gallery',url,s.deps);assert.deepEqual(s.profile.photos,[]);assert.equal(s.objects.size,0);
  await assert.rejects(()=>uploadSelfPlayerImage(subject,'avatar',new File(['x'],'x.png'),{...s.deps,persist:async()=>{throw Error('metadata unavailable');}}),/metadata unavailable/);assert.equal(s.objects.size,0);
});
test('forged player/gallery deletion cannot reach storage or profile writes',async()=>{
  const s=state();for(const url of['/api/media?path=players%2Fother%2Fthumbnails%2Fx','/api/media?path=players%2Fp%2Fvideos%2Fx','https://foreign/x'])await assert.rejects(()=>deleteSelfPlayerImage(subject,'gallery',url,s.deps),/own player image/);
  await assert.rejects(()=>uploadSelfPlayerImage({...subject,actorId:'other'},'avatar',new File(['x'],'x'),s.deps),/own player/);assert.equal(s.objects.size,0);assert.deepEqual(s.calls,[]);
});
test('legacy own gallery deletion retains the exact stored URL in the metadata removal',async()=>{
  const before=process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='owned';
  try{const s=state(),url='https://firebasestorage.googleapis.com/v0/b/owned/o/players%2Fp%2Fthumbnails%2Fold?alt=media&token=old';s.profile.photos=[url];s.objects.set('players/p/thumbnails/old','bytes');await deleteSelfPlayerImage(subject,'gallery',url,s.deps);assert.deepEqual(s.profile.photos,[]);assert.equal(s.objects.size,0);}finally{if(before===undefined)delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;else process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=before;}
});
