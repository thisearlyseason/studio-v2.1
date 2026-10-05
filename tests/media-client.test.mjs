import assert from 'node:assert/strict';
import test from 'node:test';
import {uploadScopedMedia,mediaReadUrl,mediaPathFromUrl} from '../src/lib/media-client.ts';
test('media client rejects unsupported or over-limit files before any upload',async()=>{
  for(const file of [new File(['text'],'x.svg',{type:'image/svg+xml'}),new File([new Uint8Array(5242881)],'x.png',{type:'image/png'})])await assert.rejects(()=>uploadScopedMedia('users/u/avatar.jpg',file,'synthetic'),/JPEG|5 MB/);
});
test('media URLs normalize only this exact bucket and retain no token',()=>{
  const old='https://firebasestorage.googleapis.com/v0/b/owned-bucket/o/players%2Fp%2Favatar%2Fx.png?alt=media&token=secret';
  assert.equal(mediaReadUrl(old,'owned-bucket'),'/api/media?path=players%2Fp%2Favatar%2Fx.png');
  assert.equal(mediaReadUrl(old,'foreign-bucket'),old);
  assert.equal(mediaPathFromUrl('/api/media?path=players%2Fp%2Favatar%2Fx.png'),'players/p/avatar/x.png');
  assert.equal(mediaPathFromUrl('/api/media?path=players%2Fp%2Favatar%2Fx.png&other=1'),null);
});
test('legacy filenames with spaces keep authorized protected reads after token revocation',()=>{
  const path='players/p/videos/1700000000000_My game.mp4';
  assert.equal(mediaReadUrl('https://firebasestorage.googleapis.com/v0/b/owned/o/'+encodeURIComponent(path)+'?alt=media&token=old','owned'),'/api/media?path='+encodeURIComponent(path));
});
