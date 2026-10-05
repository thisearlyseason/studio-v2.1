import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationDb, communicationRequest, loadCommunicationRoute} from './helpers/communication-route-harness.mjs';
const seed = {
  'teams/team-a': {ownerUserId:'owner',name:'Alpha',features:{}},
  'teams/team-a/members/owner': {userId:'owner',position:'Coach',status:'active'},
  'teams/team-a/members/player': {userId:'player',position:'Player',status:'active'},
};
const request = {action:'create',teamId:'team-a',requestId:'event-retry-request-0001',event:{title:'Synthetic practice',eventType:'practice',date:'2026-10-10',startTime:'18:00',endTime:'19:00',location:'Synthetic Field'}};
async function using(state,work,auth={uid:'owner',role:'coach'}) {
  const app=await loadCommunicationRoute('../../src/app/api/teams/events/action/route.ts',state.db,auth);
  try {await work(body=>app.route.POST(communicationRequest(body)));} finally {app.dispose();}
}
const events=state=>[...state.records].filter(([path])=>/^teams\/team-a\/events\/[^/]+$/.test(path));
test('lost response retry returns the persisted event and sends no duplicate notification',async()=>{
  const state=communicationDb(seed,{serializeTransactions:true});
  await using(state,async call=>{
    const first=await call(request);assert.equal(first.status,200);const saved=await first.json();
    const retry=await call(structuredClone(request));assert.equal(retry.status,200);
    assert.deepEqual(await retry.json(),{success:true,eventId:saved.eventId,replayed:true});
    assert.equal(events(state).length,1);assert.equal(state.notifications.length,1);
  });
});
test('parallel submissions preserve the schedule lock and recover on retry',async()=>{
  const state=communicationDb(seed,{serializeTransactions:true});
  await using(state,async call=>{
    const responses=await Promise.all([call(request),call(request)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const saved=await responses.find(r=>r.status===200).json();
    const retry=await call(request);assert.equal(retry.status,200);
    assert.equal((await retry.json()).eventId,saved.eventId);
    assert.equal(events(state).length,1);assert.equal(state.notifications.length,1);
  });
});
test('old retry cannot overwrite a later event update or resurrect a deleted event',async()=>{
  const state=communicationDb(seed,{serializeTransactions:true});
  await using(state,async call=>{
    const saved=await(await call(request)).json();
    const path=`teams/team-a/events/${saved.eventId}`;
    state.records.set(path,{...state.records.get(path),title:'Later edit'});
    assert.equal((await call(request)).status,200);
    assert.equal(state.records.get(path).title,'Later edit');
    state.records.delete(path);
    assert.equal((await call(request)).status,200);
    assert.equal(events(state).length,0);assert.equal(state.notifications.length,1);
  });
});
test('request identity cannot be reused for different content',async()=>{
  const state=communicationDb(seed);
  await using(state,async call=>{
    assert.equal((await call(request)).status,200);
    assert.equal((await call({...request,event:{...request.event,title:'Different'}})).status,409);
    assert.equal(events(state).length,1);assert.equal(state.notifications.length,1);
  });
});
test('a revoked member cannot replay a previously successful request',async()=>{
  const state=communicationDb(seed);
  await using(state,async call=>{
    assert.equal((await call(request)).status,200);
    state.records.set('teams/team-a',{ownerUserId:'other',name:'Alpha'});
    state.records.delete('teams/team-a/members/owner');
    assert.equal((await call(request)).status,403);assert.equal(state.notifications.length,1);
  });
});
test('failed batch leaves no receipt and a retry can persist the event',async()=>{
  const state=communicationDb(seed);const batch=state.db.batch.bind(state.db);let fail=true;
  state.db.batch=()=>{const original=batch();return {...original,async commit(){if(fail){fail=false;throw new Error('Synthetic interrupted commit');}return original.commit();}};};
  await using(state,async call=>{
    const previousError=console.error;console.error=()=>{};
    try {assert.equal((await call(request)).status,500);} finally {console.error=previousError;}
    assert.equal(events(state).length,0);assert.equal([...state.records.keys()].some(p=>p.startsWith('teamEventMutationReceipts/')),false);
    assert.equal(state.notifications.length,0);
    assert.equal((await call(request)).status,200);assert.equal(events(state).length,1);assert.equal(state.notifications.length,1);
  });
});
test('recurring event retry returns exactly the original occurrence IDs',async()=>{
  const state=communicationDb(seed);
  const series={...request,action:'create-series',recurrence:{frequency:'weekly',count:3}};
  await using(state,async call=>{
    const first=await call(series);assert.equal(first.status,200);const saved=await first.json();
    const retry=await call(series);assert.equal(retry.status,200);const repeated=await retry.json();
    assert.deepEqual(repeated.eventIds,saved.eventIds);assert.equal(repeated.replayed,true);
    assert.equal(events(state).length,3);assert.equal(state.notifications.length,0);
  });
});
