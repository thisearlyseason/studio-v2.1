import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationDb,communicationRequest,loadCommunicationRoute} from './helpers/communication-route-harness.mjs';
test('linked roster identity can RSVP, loses access on removal, and recovers on reinstatement',async()=>{
  const state=communicationDb({
    'teams/synthetic-team':{ownerUserId:'synthetic-owner',name:'Synthetic Team',isDemo:true},
    'teams/synthetic-team/members/roster-player':{userId:'synthetic-player',role:'Player',position:'Player',status:'active'},
    'teams/synthetic-team/events/synthetic-event':{title:'Synthetic event',date:'2026-10-10',startTime:'18:00'},
  },{serializeTransactions:true,enforceReadBeforeWrite:true});
  const events=await loadCommunicationRoute('../../src/app/api/teams/events/action/route.ts',state.db,{uid:'synthetic-player',role:'player'});
  const roster=await loadCommunicationRoute('../../src/app/api/teams/members/lifecycle/route.ts',state.db,{uid:'synthetic-owner',role:'coach'});
  const rsvp=()=>events.route.POST(communicationRequest({action:'rsvp',teamId:'synthetic-team',eventId:'synthetic-event',participantId:'roster-player',status:'going'}));
  const memberAction=action=>roster.route.POST(communicationRequest({action,teamId:'synthetic-team',memberId:'roster-player',reason:'Synthetic removal'}));
  try {
    assert.equal((await rsvp()).status,200,'active linked roster identity must have calendar access');
    const edit=await events.route.POST(communicationRequest({action:'update',teamId:'synthetic-team',eventId:'synthetic-event',event:{title:'Unauthorized'}}));
    assert.equal(edit.status,403);
    assert.equal((await memberAction('remove')).status,200);
    assert.equal((await rsvp()).status,403);
    assert.equal((await memberAction('reinstate')).status,200);
    assert.equal((await rsvp()).status,200);
    assert.equal(state.records.get('teams/synthetic-team/events/synthetic-event').userRsvps['roster-player'],'going');
    assert.equal(state.notifications.length,0);
  } finally {events.dispose();roster.dispose();}
});
test('a foreign or deleted linked identity cannot RSVP or acquire staff access',async()=>{
  for(const member of [{userId:'someone-else',position:'Coach',status:'active'},{userId:'synthetic-player',position:'Coach',status:'removed'},{userId:'synthetic-player',position:'Coach',isDeleted:true}]) {
    const state=communicationDb({'teams/synthetic-team':{ownerUserId:'synthetic-owner',isDemo:true},'teams/synthetic-team/members/generated-row':member,'teams/synthetic-team/events/synthetic-event':{title:'Existing'}});
    const app=await loadCommunicationRoute('../../src/app/api/teams/events/action/route.ts',state.db,{uid:'synthetic-player',role:'player'});
    try {
      for(const body of [{action:'rsvp',status:'going'},{action:'update',event:{title:'Forbidden'}}])assert.equal((await app.route.POST(communicationRequest({...body,teamId:'synthetic-team',eventId:'synthetic-event'}))).status,403);
      assert.equal(state.records.get('teams/synthetic-team/events/synthetic-event').title,'Existing');
      assert.equal(state.notifications.length,0);
    } finally {app.dispose();}
  }
});
