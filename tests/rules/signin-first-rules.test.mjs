import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,getDocs,collection,setDoc,deleteDoc} from 'firebase/firestore';
let env;
const privatePaths=['users/owner','teams/team-a','teams/team-a/members/owner','teams/team-a/events/private-event','teams/team-a/groupChats/private-chat','teams/team-a/groupChats/private-chat/messages/private-message','players/private-player','leagues/private-league','facilities/private-facility','teams/team-a/registrations/private-contact'];
before(async()=>{
 assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(?:127\.0\.0\.1|localhost):(?:18183|8080)$/);assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST||'',/^(?:127\.0\.0\.1|localhost):(?:19193|9199)$/);
 assert.match(process.env.GCLOUD_PROJECT||'demo-the-squad-rules-test',/^demo-/);
 env=await initializeTestEnvironment({projectId:process.env.GCLOUD_PROJECT||'demo-the-squad-rules-test',firestore:{rules:readFileSync('firestore.rules','utf8')},storage:{rules:readFileSync('storage.rules','utf8')}});
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore(),storage=c.storage();
  for(const p of privatePaths)await setDoc(doc(db,p),{ownerUserId:'owner',userId:'owner',clubId:'owner',parentId:'guardian',role:'coach',primaryTeamId:'team-a',recruitingProfileEnabled:false});
  await setDoc(doc(db,'players/public-player'),{userId:'public-player',primaryTeamId:'team-a',recruitingProfileEnabled:true});
  for(const p of ['users/owner/avatar/private.png','players/private-player/avatar/private.png','players/public-player/avatar/public.png','teams/team-a/branding/logo.png'])await storage.ref(p).putString('synthetic local image','raw',{contentType:'image/png'});
 });
});
after(async()=>{await env?.cleanup()});
test('signed-out direct Firestore private document reads, writes and deletes are denied',async()=>{
 const db=env.unauthenticatedContext().firestore();
 for(const p of privatePaths){await assertFails(getDoc(doc(db,p)));await assertFails(setDoc(doc(db,p),{forged:true}));await assertFails(deleteDoc(doc(db,p)))}
});
test('signed-out collection discovery cannot enumerate private tenants or people',async()=>{
 const db=env.unauthenticatedContext().firestore();for(const p of ['users','teams','players','leagues','facilities','teams/team-a/members','teams/team-a/events','teams/team-a/groupChats'])await assertFails(getDocs(collection(db,p)));
});
test('signed-out private media reads and direct uploads are denied',async()=>{
 const storage=env.unauthenticatedContext().storage();for(const p of ['users/owner/avatar/private.png','players/private-player/avatar/private.png']){await assertFails(storage.ref(p).getMetadata());await assertFails(storage.ref(p).putString('forged','raw',{contentType:'image/png'}))}
});
test('explicit public team branding and enabled recruiting media remain readable',async()=>{
 const storage=env.unauthenticatedContext().storage();for(const p of ['teams/team-a/branding/logo.png','players/public-player/avatar/public.png'])await assertSucceeds(storage.ref(p).getMetadata());
});
