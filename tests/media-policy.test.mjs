import assert from 'node:assert/strict';
import test from 'node:test';
import {parseMediaPath,validateMediaSignature,mediaByteLimit,parseMediaRange,consumeMediaBytes} from '../src/lib/media-policy.ts';

test('media path allowlist binds exact user, player category, and branding scope',()=>{
  assert.deepEqual(parseMediaPath('users/u/avatar.jpg'),{kind:'user',subjectId:'u',category:'avatar',path:'users/u/avatar.jpg'});
  assert.equal(parseMediaPath('players/p/videos/clip.webm').category,'videos');
  assert.equal(parseMediaPath('teams/t/branding/logo.png').kind,'team');
  for(const value of ['users/u/other.jpg','players/p/documents/x','players/p/avatar/../x','teams/t/library/x','players/p/avatar/nested/x','/users/u/avatar.jpg','users/%2f/avatar.jpg'])assert.throws(()=>parseMediaPath(value));
});
test('media signature validation rejects text disguised as raster or video',()=>{
  validateMediaSignature(Buffer.from([137,80,78,71,13,10,26,10]),'image/png',false);
  validateMediaSignature(Buffer.from([0x1a,0x45,0xdf,0xa3]),'video/webm',true);
  for(const type of ['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','application/octet-stream'])assert.throws(()=>validateMediaSignature(Buffer.from('<script>text</script>'),type,false));
  assert.throws(()=>validateMediaSignature(Buffer.from('not a video'),'video/mp4',true));
  assert.equal(mediaByteLimit(false),5242880);assert.equal(mediaByteLimit(true),524288000);
});
test('media body meter rejects actual boundary plus one without passing overflow to storage',async()=>{
  const received=[];
  await consumeMediaBytes(new Response(new Uint8Array([1,2,3,4])).body,{limit:4,onChunk:chunk=>received.push(...chunk)});
  assert.deepEqual(received,[1,2,3,4]);
  await assert.rejects(()=>consumeMediaBytes(new Response(new Uint8Array([1,2,3,4,5])).body,{limit:4,onChunk:()=>{throw Error('overflow reached storage');}}),/limit/i);
});
test('media body meter cancels a stalled reader at a finite deadline',async()=>{
  let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;}});
  await assert.rejects(()=>consumeMediaBytes(body,{limit:4,onChunk:()=>{},signal:AbortSignal.timeout(20)}),/abort|deadline|timeout/i);
  assert.equal(cancelled,true);
});
test('protected media byte ranges are bounded and reject malformed or multi-range inputs',()=>{
  assert.deepEqual(parseMediaRange('bytes=2-4',10),{start:2,end:4});
  assert.deepEqual(parseMediaRange('bytes=7-',10),{start:7,end:9});
  assert.deepEqual(parseMediaRange('bytes=-3',10),{start:7,end:9});
  for(const value of ['bytes=10-','bytes=4-2','bytes=0-1,3-4','bad','bytes=-0'])assert.throws(()=>parseMediaRange(value,10));
});
