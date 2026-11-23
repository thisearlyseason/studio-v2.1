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

test('multi-day TBD events create no timed booking until a coach adds a start time', async () => {
  const state = communicationDb(seed);
  await using(state, async call => {
    const event = { title: 'Training camp', date: '2026-12-29', endDate: '2027-01-03', startTime: '' };
    const response = await call({ ...request, event });
    assert.equal(response.status, 200);
    const { eventId } = await response.json();
    const booking = 'scheduleBookings/team_event_team-a_' + eventId;
    const path = 'teams/team-a/events/' + eventId;
    assert.equal(state.records.get(path).endDate, event.endDate);
    assert.equal(state.records.has(booking), false);
    for (const startTime of ['09:30', '']) {
      const updated = await call({ action: 'update', teamId: 'team-a', eventId, event: { ...event, startTime, endTime: null } });
      assert.equal(updated.status, 200);
      assert.equal(state.records.has(booking), Boolean(startTime));
      assert.equal(state.records.get(path).endDate, event.endDate);
    }
  });
});

test('selected dates preserve a multi-day TBD activity span on every occurrence', async () => {
  const state = communicationDb(seed);
  await using(state, async call => {
    const response = await call({
      ...request, action: 'create-series',
      event: { title: 'Training camp', date: '2026-03-01', endDate: '2026-03-03', startTime: '' },
      recurrence: { frequency: 'dates', count: 3, dates: ['2026-05-01', '2026-03-11'] },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(events(state).map(([, value]) => [value.date, value.endDate]).sort(),
      [['2026-03-01','2026-03-03'], ['2026-03-11','2026-03-13'], ['2026-05-01','2026-05-03']]);
  });
});

test('a private draft stays out of the team schedule and is consumed once on publication', async () => {
  const state = communicationDb({ ...seed, 'teams/team-a/members/other': { userId:'other', position:'Coach', status:'active' } });
  let draft;
  await using(state, async call => {
    const result = await call({ action:'save-draft', teamId:'team-a', eventId:'private-draft', event:request.event });
    assert.equal(result.status, 200);
    draft = { id:'private-draft', version:(await result.json()).version };
    assert.equal((await (await call({ action:'list-drafts', teamId:'team-a' })).json()).drafts.length, 1);
    assert.equal(events(state).length, 0);
    assert.equal(state.notifications.length, 0);
  });
  await using(state, async call => {
    assert.deepEqual((await (await call({action:'list-drafts', teamId:'team-a'})).json()).drafts, []);
    assert.equal((await call({ ...request, publishOptions:{draft} })).status, 409);
  }, { uid:'other', role:'coach' });
  await using(state, async call => {
    assert.equal((await call({action:'list-drafts',teamId:'team-a'})).status, 403);
  }, { uid:'player' });
  await using(state, async call => {
    const publish = { ...request, publishOptions:{draft} };
    assert.equal((await call(publish)).status, 200);
    assert.equal((await call(publish)).status, 200);
    assert.equal(events(state).length, 1);
    assert.equal((await (await call({action:'list-drafts',teamId:'team-a'})).json()).drafts.length, 0);
  });
});

test('repeat publication lists all conflicts and atomically skips or replaces only matching team activities', async () => {
  const state = communicationDb(seed);
  await using(state, async call => {
    const existing = [];
    for (const [i,date] of ['2026-10-10','2026-10-17'].entries()) {
      const response = await call({ ...request, requestId:'existing-event-000' + i, event:{ ...request.event, date, title:'Practice ' + i } });
      existing.push((await response.json()).eventId);
    }
    const series = { ...request, action:'create-series', recurrence:{ frequency:'weekly', count:3 } };
    const first = await call(series);
    assert.equal(first.status, 409);
    const { conflicts } = await first.json();
    assert.deepEqual(conflicts.map(c => c.title), ['Practice 0','Practice 1']);
    assert.equal(events(state).length, 2);
    const path = 'teams/team-a/events/' + existing[1];
    state.records.set(path, { ...state.records.get(path), title:'Changed practice' });
    const options = { skipDates:[conflicts[0].date], replace:[{ id:existing[1], revision:conflicts[1].revision }] };
    const stale = await call({ ...series, publishOptions:options });
    assert.equal(stale.status, 409);
    assert.equal(events(state).length, 2);
    options.replace[0].revision = (await stale.json()).conflicts[0].revision;
    const resolved = await call({ ...series, publishOptions:options });
    assert.equal(resolved.status, 200);
    assert.equal((await resolved.json()).eventIds.length, 2);
    assert.equal(state.records.has(path), false);
    assert.equal(state.records.has('teams/team-a/events/' + existing[0]), true);
    assert.equal(events(state).length, 3);
  });
});
