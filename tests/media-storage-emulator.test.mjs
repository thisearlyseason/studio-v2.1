import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
test('isolated media SDK transport preserves bytes and actually revokes a legacy token URL',{skip:process.env.MEDIA_STORAGE_EMULATOR_PROBE!=='1'},async()=>{
  assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,'127.0.0.1:9199');assert.match(process.env.GCLOUD_PROJECT||'',/^demo-/);
  process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
  const {mediaBucket}=createRequire(import.meta.url)('../src/lib/server-media-storage.ts');
  const {revokeMediaFileTokens}=createRequire(import.meta.url)('../src/lib/media-token-revocation.ts');
  const bucket=mediaBucket(),name=`players/owned-sdk-probe/avatar/${randomUUID()}.png`,file=bucket.file(name),token=randomUUID(),bytes=Buffer.from('owned synthetic transport bytes');
  const url=`http://127.0.0.1:9199/v0/b/${bucket.name}/o/${encodeURIComponent(name)}?alt=media&token=${token}`;
  try{
    await file.save(bytes,{resumable:false,metadata:{contentType:'image/png',metadata:{firebaseStorageDownloadTokens:token}}});
    const before=await fetch(url,{signal:AbortSignal.timeout(5000)});assert.equal(before.status,200);assert.deepEqual(Buffer.from(await before.arrayBuffer()),bytes);
    await revokeMediaFileTokens(file);
    const after=await fetch(url,{signal:AbortSignal.timeout(5000)});await after.body?.cancel();assert.ok([403,404].includes(after.status));
    assert.deepEqual((await file.download())[0],bytes);
  }finally{await file.delete({ignoreNotFound:true});assert.equal((await file.exists())[0],false);}
});
