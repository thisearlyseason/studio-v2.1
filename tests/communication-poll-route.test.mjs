import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationDb,communicationRequest,loadCommunicationRoute} from './helpers/communication-route-harness.mjs';

const base={
  'teams/team-a':{ownerUserId:'owner-a'},
  'teams/team-a/members/voter':{userId:'voter',position:'Player',status:'active'},
  'teams/team-a/groupChats/channel':{memberIds:['owner-a','voter']},
  'teams/team-a/groupChats/channel/messages/poll':{poll:{options:[{id:'first',text:'A',votes:0},{id:'second',text:'B',votes:0}],voters:{},totalVotes:0,isClosed:false}},
};

test('poll stable-ID vote change and replay leave exactly one canonical vote',async()=>{
  const {db,records}=communicationDb(base);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/vote/route.ts',db,{uid:'voter'});
  try {
    for(const [optionId,want] of [['first',[1,0]],['second',[0,1]],['second',[0,1]]]) {
      const response=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',messageId:'poll',optionId}));
      assert.equal(response.status,200);
      const poll=records.get('teams/team-a/groupChats/channel/messages/poll').poll;
      assert.deepEqual(poll.options.map(option=>option.votes),want);
      assert.deepEqual(poll.voters,{voter:optionId});
      assert.equal(poll.totalVotes,1);
    }
  } finally {loaded.dispose();}
});

test('poll module-off creation and voting cannot bypass the existing tacticalChat boundary',async()=>{
  const {db,records}=communicationDb({...base,'teams/team-a':{ownerUserId:'owner-a',features:{tacticalChat:false}}});
  const vote=await loadCommunicationRoute('../../src/app/api/teams/chat/vote/route.ts',db,{uid:'voter'});
  const create=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'owner-a'});
  try {
    assert.equal((await vote.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',messageId:'poll',optionIdx:0}))).status,403);
    assert.equal((await create.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',type:'poll',poll:{question:'Choose',options:[{text:'A'},{text:'B'}]}}))).status,403);
    assert.equal(records.size,Object.keys(base).length);
  } finally {vote.dispose();create.dispose();}
});

test('poll rejects removed Team A voter with active Team B membership and stale channel inclusion',async()=>{
  const {db,records}=communicationDb({...base,'teams/team-a/members/voter':{userId:'voter',status:'removed'},'teams/team-b/members/voter':{userId:'voter',status:'active'}});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/vote/route.ts',db,{uid:'voter',role:'adult_player'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',messageId:'poll',optionIdx:0}));
    assert.equal(response.status,403);
    assert.equal(records.get('teams/team-a/groupChats/channel/messages/poll').poll.totalVotes,0);
  } finally {loaded.dispose();}
});

test('poll rejects duplicate blank and over-limit options without creating messages or unread writes',async()=>{
  const {db,records}=communicationDb(base);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'owner-a'});
  try {
    for(const options of [[{text:'A'},{text:' a '}],[{text:'A'},{text:'B'},{text:''}],Array.from({length:11},(_,i)=>({text:String(i)})),[{text:'x'.repeat(241)},{text:'B'}]]) {
      const response=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',type:'poll',poll:{question:'Choose',options}}));
      assert.equal(response.status,400);
      assert.equal(records.size,Object.keys(base).length);
      assert.equal(records.get('teams/team-a/groupChats/channel').unreadBy,undefined);
    }
  } finally {loaded.dispose();}
});

test('poll valid creation assigns distinct stable option IDs and preserves existing unread effects',async()=>{
  const {db,records}=communicationDb(base);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',type:'poll',poll:{question:'Choose',options:[{text:'A'},{text:'B'}]}}));
    assert.equal(response.status,200);
    const poll=records.get(`teams/team-a/groupChats/channel/messages/${(await response.json()).messageId}`).poll;
    assert.equal(poll.options.every(option=>typeof option.id==='string'&&option.id.length>0),true);
    assert.equal(new Set(poll.options.map(option=>option.id)).size,2);
    assert.equal(records.get('teams/team-a/groupChats/channel').unreadBy.voter,1);
  } finally {loaded.dispose();}
});

test('legacy index votes remain compatible and repair stale tallies from the canonical voter map',async()=>{
  const poll={options:[{text:'A',votes:900},{text:'B',votes:8}],voters:{other:0,stale:7},totalVotes:908};
  const {db,records}=communicationDb({...base,'teams/team-a/groupChats/channel/messages/poll':{poll}});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/vote/route.ts',db,{uid:'voter'});
  try {
    assert.equal((await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',messageId:'poll',optionIdx:1}))).status,200);
    const result=records.get('teams/team-a/groupChats/channel/messages/poll').poll;
    assert.deepEqual(result.options.map(option=>option.votes),[1,1]);
    assert.deepEqual(result.voters,{other:0,voter:1});assert.equal(result.totalVotes,2);
  } finally {loaded.dispose();}
});

test('unknown, deleted, closed, ambiguous selections and ineligible channel votes do not mutate',async()=>{
  for(const variant of ['unknown','deleted-option','closed','deleted-message','ambiguous','channel']) {
    const seed=structuredClone(base);
    if(variant==='deleted-option')seed['teams/team-a/groupChats/channel/messages/poll'].poll.options[0].isDeleted=true;
    if(variant==='closed')seed['teams/team-a/groupChats/channel/messages/poll'].poll.isClosed=true;
    if(variant==='deleted-message')seed['teams/team-a/groupChats/channel/messages/poll'].isDeleted=true;
    if(variant==='channel')seed['teams/team-a/groupChats/channel'].memberIds=['owner-a'];
    const {db,records}=communicationDb(seed);
    const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/vote/route.ts',db,{uid:'voter'});
    try {
      const result=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',messageId:'poll',optionId:variant==='unknown'?'unknown':'first',...(variant==='ambiguous'?{optionIdx:0}:{})}));
      assert.equal(result.status,variant==='channel'?403:variant==='deleted-message'?404:400,variant);
      assert.deepEqual(records.get('teams/team-a/groupChats/channel/messages/poll'),seed['teams/team-a/groupChats/channel/messages/poll']);
    } finally {loaded.dispose();}
  }
});

test('ordinary text Chat retains authorization, unread, and preexisting module-off behavior',async()=>{
  const seed={...base,'teams/team-a':{ownerUserId:'owner-a',features:{tacticalChat:false}}};
  const {db,records}=communicationDb(seed);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',type:'text',content:' Tactical update '}));
    assert.equal(response.status,200);
    const message=records.get(`teams/team-a/groupChats/channel/messages/${(await response.json()).messageId}`);
    assert.equal(message.content,'Tactical update');assert.equal(message.poll,null);
    assert.deepEqual(records.get('teams/team-a/groupChats/channel').unreadBy,{'owner-a':0,voter:1});
  } finally {loaded.dispose();}
});
