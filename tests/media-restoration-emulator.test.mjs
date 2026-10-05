import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildFixtureCatalog} from '../scripts/qa/certification/fixture-catalog.mjs';
import {beforeImageMatches} from '../scripts/qa/certification/local/document-restoration.mjs';
test('exact player recruiting before-image survives flag updates and Firestore restore',{skip:process.env.MEDIA_RESTORATION_EMULATOR_PROBE!=='1'},async()=>{
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');assert.match(process.env.GCLOUD_PROJECT||'',/^demo-/);
  const admin=createRequire(import.meta.url)('firebase-admin'),app=admin.initializeApp({projectId:process.env.GCLOUD_PROJECT},'owned-media-restore-probe');
  const fixture=buildFixtureCatalog('media-restore-probe').firestoreDocuments.find(item=>item.data.fixtureAlias==='qa-player-adult-a'),ref=admin.firestore(app).doc(fixture.path);
  try{
    await ref.set(fixture.data);const before=(await ref.get()).data();
    await ref.update({recruitingProfileEnabled:true});await ref.update({recruitingProfileEnabled:false});await ref.set(before);const after=(await ref.get()).data();
    assert.deepEqual(after,before,'all exact fields and values are restored');
    assert.equal(beforeImageMatches(after,before),true,'current harness restoration comparator');
  }finally{await ref.delete();assert.equal((await ref.get()).exists,false);await app.delete();}
});
