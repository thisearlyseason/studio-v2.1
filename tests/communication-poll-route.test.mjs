import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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

test('ordinary text Chat cannot bypass the tacticalChat module boundary',async()=>{
  const seed={...base,'teams/team-a':{ownerUserId:'owner-a',features:{tacticalChat:false}}};
  const {db,records}=communicationDb(seed);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',type:'text',content:' Tactical update ',requestId:'module-off-request'}));
    assert.equal(response.status,403);
    assert.equal([...records.keys()].filter(path=>path.startsWith('teams/team-a/groupChats/channel/messages/')&&path!=='teams/team-a/groupChats/channel/messages/poll').length,0);
    assert.equal(records.get('teams/team-a/groupChats/channel').unreadBy,undefined);
  } finally {loaded.dispose();}
});

test('ordinary text Chat rejects deleted channels without creating a message or unread state',async()=>{
  const seed={...base,'teams/team-a/groupChats/channel':{...base['teams/team-a/groupChats/channel'],isDeleted:true}};
  const {db,records}=communicationDb(seed);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',type:'text',content:' Tactical update ',requestId:'deleted-channel-request'}));
    assert.equal(response.status,403);
    assert.equal([...records.keys()].filter(path=>path.startsWith('teams/team-a/groupChats/channel/messages/')&&path!=='teams/team-a/groupChats/channel/messages/poll').length,0);
    assert.equal(records.get('teams/team-a/groupChats/channel').unreadBy,undefined);
  } finally {loaded.dispose();}
});

test('ordinary text Chat request identity creates one message and increments recipient unread once',async()=>{
  const {db,records}=communicationDb(base);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'owner-a'});
  const input={teamId:'team-a',chatId:'channel',type:'text',content:'One tactical update',requestId:'one-message-request'};
  try {
    const first=await loaded.route.POST(communicationRequest(input));
    const second=await loaded.route.POST(communicationRequest(input));
    assert.equal(first.status,200);assert.equal(second.status,200);
    const firstBody=await first.json(),secondBody=await second.json();
    assert.equal(secondBody.messageId,firstBody.messageId);
    assert.equal(secondBody.replayed,true);
    const messages=[...records].filter(([path])=>path.startsWith('teams/team-a/groupChats/channel/messages/')&&path!=='teams/team-a/groupChats/channel/messages/poll');
    assert.equal(messages.length,1);
    assert.equal(messages[0][1].content,'One tactical update');
    assert.deepEqual(records.get('teams/team-a/groupChats/channel').unreadBy,{'owner-a':0,voter:1});
  } finally {loaded.dispose();}
});

test('ordinary text Chat rejects reuse of one request identity for different content',async()=>{
  const {db,records}=communicationDb(base);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'owner-a'});
  try {
    const first=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',type:'text',content:'First',requestId:'collision-request'}));
    const second=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',type:'text',content:'Different',requestId:'collision-request'}));
    assert.equal(first.status,200);assert.equal(second.status,409);
    const messages=[...records].filter(([path])=>path.startsWith('teams/team-a/groupChats/channel/messages/')&&path!=='teams/team-a/groupChats/channel/messages/poll');
    assert.equal(messages.length,1);assert.equal(messages[0][1].content,'First');
    assert.deepEqual(records.get('teams/team-a/groupChats/channel').unreadBy,{'owner-a':0,voter:1});
  } finally {loaded.dispose();}
});

test('Chat channel creation is rejected while tactical chat is disabled',async()=>{
  const {db,records}=communicationDb({...base,'teams/team-a':{ownerUserId:'owner-a',features:{tacticalChat:false}}});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',contextId:'team:team-a',name:'Blocked channel',memberIds:['voter']}));
    assert.equal(response.status,403);
    assert.equal([...records.keys()].some(path=>path.includes('Blocked channel')),false);
  } finally {loaded.dispose();}
});

test('Chat read receipt clears only the caller and rejects deleted or disabled channels',async()=>{
  for(const state of ['active','deleted','disabled']) {
    const seed=structuredClone(base);
    seed['teams/team-a/groupChats/channel'].unreadBy={'owner-a':2,voter:3};
    if(state==='deleted')seed['teams/team-a/groupChats/channel'].isDeleted=true;
    if(state==='disabled')seed['teams/team-a'].features={tacticalChat:false};
    const {db,records}=communicationDb(seed);
    const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',db,{uid:'voter'});
    try {
      const response=await loaded.route.PATCH(communicationRequest({action:'mark-read',teamId:'team-a',chatId:'channel'}));
      assert.equal(response.status,state==='active'?200:403,state);
      const unread=records.get('teams/team-a/groupChats/channel').unreadBy;
      assert.deepEqual(unread,state==='active'?{'owner-a':2,voter:0}:{'owner-a':2,voter:3});
    } finally {loaded.dispose();}
  }
});

test('Chat lifecycle changes require staff authority and are server validated',async()=>{
  const ownerRun=communicationDb(base);
  const owner=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',ownerRun.db,{uid:'owner-a'});
  try {
    assert.equal((await owner.route.PATCH(communicationRequest({action:'rename',teamId:'team-a',chatId:'channel',name:'Renamed'}))).status,200);
    assert.equal(ownerRun.records.get('teams/team-a/groupChats/channel').name,'Renamed');
    assert.equal((await owner.route.PATCH(communicationRequest({action:'set-members',teamId:'team-a',chatId:'channel',memberIds:['voter']}))).status,200);
    assert.deepEqual(ownerRun.records.get('teams/team-a/groupChats/channel').memberIds,['voter','owner-a']);
    assert.equal((await owner.route.PATCH(communicationRequest({action:'delete',teamId:'team-a',chatId:'channel'}))).status,200);
    assert.equal(ownerRun.records.get('teams/team-a/groupChats/channel').isDeleted,true);
  } finally {owner.dispose();}

  const memberRun=communicationDb(base);
  const member=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',memberRun.db,{uid:'voter'});
  try {
    assert.equal((await member.route.PATCH(communicationRequest({action:'delete',teamId:'team-a',chatId:'channel'}))).status,403);
    assert.notEqual(memberRun.records.get('teams/team-a/groupChats/channel').isDeleted,true);
  } finally {member.dispose();}
});

test('server-derived remote team authority permits only its enrolled channel',async()=>{
  const seed={
    ...base,
    'teams/team-b':{ownerUserId:'owner-b'},
    'teams/team-b/members/remote':{userId:'remote',position:'Assistant Coach',role:'Admin',status:'active'},
    'teams/team-a/groupChats/remote-channel':{
      name:'League channel',memberIds:['owner-a','remote'],isDeleted:false,
      memberAuthorities:{'owner-a':{teamId:'team-a',memberId:'owner-a'},remote:{teamId:'team-b',memberId:'remote'}},
    },
  };
  const {db,records}=communicationDb(seed);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'remote'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'remote-channel',type:'text',content:'Remote staff message',requestId:'remote-authority'}));
    assert.equal(response.status,200);
    const messageId=(await response.json()).messageId;
    assert.equal(records.get(`teams/team-a/groupChats/remote-channel/messages/${messageId}`).content,'Remote staff message');
  } finally {loaded.dispose();}
});

test('Chat push deep link is qualified by both team and channel identity',async()=>{
  const {db,notifications}=communicationDb(base);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/message/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',chatId:'channel',type:'text',content:'Qualified link',requestId:'qualified-link'}));
    assert.equal(response.status,200);
    assert.equal(notifications.length,1);
    assert.equal(notifications[0].url,'/chats/channel?teamId=team-a');
  } finally {loaded.dispose();}
});

test('Chat create revalidates recipient and module state inside its write transaction',async()=>{
  const {db,records}=communicationDb(base,{beforeTransaction:({records})=>{
    records.set('teams/team-a/members/voter',{...records.get('teams/team-a/members/voter'),status:'removed'});
  }});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.POST(communicationRequest({teamId:'team-a',contextId:'team:team-a',name:'Raced channel',memberIds:['voter']}));
    assert.equal(response.status,403);
    assert.equal([...records.values()].some(value=>value?.name==='Raced channel'),false);
  } finally {loaded.dispose();}
});

test('Chat lifecycle revalidates deletion and authority in the same transaction as mutation',async()=>{
  const {db,records}=communicationDb(base,{beforeTransaction:({records})=>{
    records.set('teams/team-a/groupChats/channel',{...records.get('teams/team-a/groupChats/channel'),isDeleted:true});
  }});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',db,{uid:'owner-a'});
  try {
    const response=await loaded.route.PATCH(communicationRequest({action:'rename',teamId:'team-a',chatId:'channel',name:'Raced rename'}));
    assert.equal(response.status,403);
    assert.notEqual(records.get('teams/team-a/groupChats/channel').name,'Raced rename');
  } finally {loaded.dispose();}
});

test('Chat directory returns only server-authorized multi-team channels without private audience fields',async()=>{
  const seed={
    'teams/team-a':{ownerUserId:'owner-a',name:'Team A',features:{tacticalChat:true}},
    'teams/team-b':{ownerUserId:'owner-b',name:'Team B',features:{tacticalChat:true}},
    'teams/team-c':{ownerUserId:'owner-c',name:'Team C',features:{tacticalChat:true}},
    'teams/team-a/members/multi':{userId:'multi',position:'Assistant Coach',status:'active'},
    'teams/team-b/members/multi':{userId:'multi',position:'Player',status:'active'},
    'teams/team-c/members/multi':{userId:'multi',position:'Player',status:'removed'},
    'teams/team-a/groupChats/shared':{name:'A marker',memberIds:['multi'],memberAuthorities:{multi:{teamId:'team-a',memberId:'multi'}},unreadBy:{multi:2,other:9},createdAt:'2026-09-06T01:00:00.000Z',isDeleted:false},
    'teams/team-b/groupChats/shared':{name:'B marker',memberIds:['multi'],memberAuthorities:{multi:{teamId:'team-b',memberId:'multi'}},unreadBy:{multi:3,other:8},createdAt:'2026-09-06T02:00:00.000Z',isDeleted:false},
    'teams/team-c/groupChats/shared':{name:'C removed marker',memberIds:['multi'],memberAuthorities:{multi:{teamId:'team-c',memberId:'multi'}},unreadBy:{multi:4},isDeleted:false},
    'teams/team-b/groupChats/deleted':{name:'Deleted marker',memberIds:['multi'],memberAuthorities:{multi:{teamId:'team-b',memberId:'multi'}},isDeleted:true},
  };
  const {db}=communicationDb(seed);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',db,{uid:'multi'});
  try {
    const response=await loaded.route.GET({nextUrl:new URL('http://127.0.0.1/api/teams/chat?teamId=team-a')});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    const body=await response.json();
    assert.deepEqual(body.channels.map(channel=>[channel.teamId,channel.id,channel.name,channel.unread]),[
      ['team-b','shared','B marker',3],
      ['team-a','shared','A marker',2],
    ]);
    assert.equal(body.channels.every(channel=>channel.memberIds===undefined&&channel.memberAuthorities===undefined&&channel.unreadBy===undefined),true);
  } finally {loaded.dispose();}
});

test('Chat directory revalidates channel audience inside its read transaction',async()=>{
  const seed={
    'teams/team-a':{ownerUserId:'owner-a',name:'Team A',features:{tacticalChat:true}},
    'teams/team-a/members/member':{userId:'member',position:'Player',status:'active'},
    'teams/team-a/groupChats/channel':{name:'Private',memberIds:['member'],memberAuthorities:{member:{teamId:'team-a',memberId:'member'}},isDeleted:false},
  };
  const {db}=communicationDb(seed,{beforeTransaction:({records})=>records.set('teams/team-a/members/member',{userId:'member',position:'Player',status:'removed'})});
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',db,{uid:'member'});
  try {
    const response=await loaded.route.GET({nextUrl:new URL('http://127.0.0.1/api/teams/chat?teamId=team-a')});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).channels,[]);
  } finally {loaded.dispose();}
});

test('Chat directory honors server-derived remote authority and module revocation',async()=>{
  const seed={
    'teams/host':{ownerUserId:'owner-host',name:'Host',features:{tacticalChat:true}},
    'teams/source':{ownerUserId:'owner-source',name:'Source',features:{tacticalChat:true}},
    'teams/off':{ownerUserId:'owner-off',name:'Off',features:{tacticalChat:false}},
    'teams/source/members/remote':{userId:'remote',position:'Assistant Coach',status:'active'},
    'teams/host/groupChats/league':{name:'League marker',memberIds:['remote'],memberAuthorities:{remote:{teamId:'source',memberId:'remote'}},isDeleted:false},
    'teams/off/groupChats/off-channel':{name:'Off marker',memberIds:['remote'],memberAuthorities:{remote:{teamId:'source',memberId:'remote'}},isDeleted:false},
  };
  const {db}=communicationDb(seed);
  const loaded=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',db,{uid:'remote'});
  try {
    const response=await loaded.route.GET({nextUrl:new URL('http://127.0.0.1/api/teams/chat?teamId=source')});
    assert.equal(response.status,200);
    const body=await response.json();
    assert.deepEqual(body.channels.map(channel=>[channel.teamId,channel.id]),[['host','league']]);
  } finally {loaded.dispose();}
});

test('Chat list consumes the authenticated server directory and exposes directory failures',async()=>{
  const source=await readFile(new URL('../src/app/(dashboard)/chats/page.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/collectionGroup\(db, 'groupChats'\)/);
  assert.match(source,/setAuthorizedChats\(Array\.isArray\(payload\.channels\) \? payload\.channels : \[\]\)/);
  assert.match(source,/setAuthorizedChats\(\[\]\);[\s\S]*?getAuthToken\(auth\)/);
  assert.match(source,/role="alert"/);
  assert.match(source,/Unable to load approved chat channels\./);
});
