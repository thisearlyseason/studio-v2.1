import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,deleteDoc} from 'firebase/firestore';
import {loadCommunicationRoute,communicationRequest} from './helpers/communication-route-harness.mjs';
const enabled=process.env.SQUAD_EVENT_RETRY_EMULATOR_TEST==='1';
test('real Firestore persists one event/booking/receipt and denies client receipt forgery',{skip:!enabled},async()=>{
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:18187');
  const projectId='demo-native-auth-test';
  const app=initializeApp({projectId},'event-retry-fixture');const db=getFirestore(app);db.notifications=[];
  let rules,route;
  try {
    rules=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:18187,rules:await readFile('firestore.rules','utf8')}});
    await db.doc('teams/retry-fixture').set({ownerUserId:'synthetic-owner',name:'Synthetic Team',isDemo:true});
    await db.doc('teams/retry-fixture/members/synthetic-owner').set({userId:'synthetic-owner',position:'Coach',status:'active'});
    route=await loadCommunicationRoute('../../src/app/api/teams/events/action/route.ts',db,{uid:'synthetic-owner',role:'coach'});
    const body={action:'create',teamId:'retry-fixture',requestId:'emulator-event-request-0001',event:{title:'Synthetic only',date:'2026-10-10',startTime:'18:00',endTime:'19:00',location:'Synthetic Field'}};
    const call=()=>route.route.POST(communicationRequest(body));
    const first=await call();assert.equal(first.status,200);const saved=await first.json();
    const repeated=await call();assert.equal(repeated.status,200);assert.equal((await repeated.json()).eventId,saved.eventId);
    assert.equal((await db.collection('teams/retry-fixture/events').get()).size,1);
    const receipts=await db.collection('teamEventMutationReceipts').where('teamId','==','retry-fixture').get();assert.equal(receipts.size,1);
    const bookings=await db.collection('scheduleBookings').where('hostTeamId','==','retry-fixture').get();assert.equal(bookings.size,1);
    const client=rules.authenticatedContext('synthetic-owner',{role:'coach'}).firestore();
    const ref=doc(client,receipts.docs[0].ref.path);
    await assertFails(getDoc(ref));await assertFails(setDoc(ref,{...receipts.docs[0].data(),eventIds:['forged']}));await assertFails(deleteDoc(ref));
    await db.doc('teams/retry-fixture/members/generated-player').set({userId:'synthetic-player',position:'Player',status:'active'});
    const player=await loadCommunicationRoute('../../src/app/api/teams/events/action/route.ts',db,{uid:'synthetic-player',role:'player'});
    try {
      const rsvp=()=>player.route.POST(communicationRequest({action:'rsvp',teamId:'retry-fixture',eventId:saved.eventId,participantId:'generated-player',status:'going'}));
      assert.equal((await rsvp()).status,200);
      await db.doc('teams/retry-fixture/members/generated-player').update({status:'removed'});
      assert.equal((await rsvp()).status,403);
      await db.doc('teams/retry-fixture/members/generated-player').update({status:'active'});
      assert.equal((await rsvp()).status,200);
    } finally {player.dispose();}
    assert.equal(db.notifications.length,0);
    for(const receipt of receipts.docs)await receipt.ref.delete();
    for(const booking of bookings.docs)await booking.ref.delete();
  } finally {
    route?.dispose();await db.recursiveDelete(db.doc('teams/retry-fixture'));await rules?.cleanup();await deleteApp(app);
  }
});
