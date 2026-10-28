import test from 'node:test';
import assert from 'node:assert/strict';
import { communicationDb, loadCommunicationRoute, communicationRequest } from './helpers/communication-route-harness.mjs';

const seed = {
 'users/owner': { role: 'coach', plan_type: 'free' },
 'teams/a': { ownerUserId: 'owner', planId: 'free', isPro: false },
 'teams/b': { ownerUserId: 'owner', planId: 'free', isPro: false },
};
const getRequest = url => { const req=new Request(url); req.nextUrl=new URL(url); return req; };
const create = (teamId, n) => ({ action: 'create', requestId: `free-league-request-${n}`, teamId, name: `League ${n}`, sport: 'Soccer' });

test('Free league creation serializes per account and cannot bypass the limit through another Free team, division or archive', async () => {
 const {db,records}=communicationDb(seed,{serializeTransactions:true,enforceReadBeforeWrite:true});
 const app=await loadCommunicationRoute('../../src/app/api/leagues/lifecycle/route.ts',db,{uid:'owner'});
 try{
  const results=await Promise.all([app.route.POST(communicationRequest(create('a',1))),app.route.POST(communicationRequest(create('b',2)))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const [path,league]=[...records].find(([path])=>/^leagues\/[^/]+$/.test(path));
  assert.equal((await app.route.POST(communicationRequest({...create('a',3),name:league.name,divisionTitle:'Second'}))).status,409);
  records.set(path,{...league,isArchived:true});
  assert.equal((await app.route.POST(communicationRequest(create('b',4)))).status,409);
  assert.equal([...records.keys()].filter(p=>/^leagues\/[^/]+$/.test(p)).length,1);
 }finally{app.dispose();}
});

test('Pro league creation is independent of paid team-seat capacity; another Free team does not inherit Pro', async () => {
 const {db,records}=communicationDb({...seed,'users/owner':{role:'coach',plan_type:'team',subscription_status:'active',team_limit:1},'teams/a':{...seed['teams/a'],planId:'team',isPro:true}}, {serializeTransactions:true,enforceReadBeforeWrite:true});
 const app=await loadCommunicationRoute('../../src/app/api/leagues/lifecycle/route.ts',db,{uid:'owner'});
 try{
  for(let n=1;n<=4;n++) assert.equal((await app.route.POST(communicationRequest(create('a',n)))).status,201);
  assert.equal((await app.route.POST(communicationRequest(create('b',5)))).status,409);
  assert.equal([...records.keys()].filter(p=>/^leagues\/[^/]+$/.test(p)).length,4);
 }finally{app.dispose();}
});

test('Free organizer can load October 31 single/double brackets privately; public portals and other accounts remain denied', async () => {
 for(const format of ['single_elimination','double_elimination']){
  const competition={version:2,status:'draft',topology:{rules:{format}}};
  const {db}=communicationDb({...seed,'teams/a/events/oct31':{teamId:'a',isTournament:true,date:'2026-10-31',tournamentType:format,competition}});
  const owner=await loadCommunicationRoute('../../src/app/api/tournaments/competition/route.ts',db,{uid:'owner'});
  const other=await loadCommunicationRoute('../../src/app/api/tournaments/competition/route.ts',db,{uid:'other'});
  const url='http://127.0.0.1/api/tournaments/competition?teamId=a&eventId=oct31';
  try{
   const response=await owner.route.GET(getRequest(url));assert.equal(response.status,200);assert.deepEqual((await response.json()).competition.topology.rules,{format});
   assert.equal((await owner.route.GET(getRequest(url+'&public=true'))).status,403);
   assert.equal((await other.route.GET(getRequest(url))).status,403);
  }finally{owner.dispose();other.dispose();}
 }
});

test('original-planner tournaments return actionable guidance rather than an unexplained unavailable message',async()=>{
 const {db}=communicationDb({...seed,'teams/a/events/legacy':{teamId:'a',isTournament:true,date:'2026-10-31',tournamentType:'single_elimination'}});
 const app=await loadCommunicationRoute('../../src/app/api/tournaments/competition/route.ts',db,{uid:'owner'});
 try{const response=await app.route.GET(getRequest('http://127.0.0.1/api/tournaments/competition?teamId=a&eventId=legacy'));assert.equal(response.status,409);assert.match((await response.json()).error,/original planner/);}finally{app.dispose();}
});

test('Free schedule updates retain official history but cannot inject new assignments or mutate retained referee records',async()=>{
 const {planTournamentOfficials}=await import('../src/lib/tournament-official-allocation.ts');
 const {db,records}=communicationDb({...seed,'tournamentReferees/retained':{teamId:'a',eventId:'cup',refereeId:'old',email:'synthetic@example.test'}});
 const before=structuredClone([...records]);
 const plan=await db.runTransaction(transaction=>planTournamentOfficials(db,transaction,'a','cup',{tournamentGames:[{id:'past',isCompleted:true,refereeId:'old',refereeName:'Past Official'}]},[{id:'past',isCompleted:true},{id:'new',refereeId:'injected',refereeName:'Injected'}]));
 assert.equal(plan.games[0].refereeId,'old');assert.equal(plan.games[1].refereeId,undefined);assert.equal(plan.writeCount,0);plan.apply();assert.deepEqual([...records],before);
});

test('the existing named demo guard still limits an otherwise Pro-marked demo owner to one non-seeded league',async()=>{
 const {db}=communicationDb({...seed,'users/owner':{role:'league_creator',plan_type:'league',subscription_status:'active',isDemo:true},'teams/a':{...seed['teams/a'],planId:'league',isPro:true}},{serializeTransactions:true});
 const app=await loadCommunicationRoute('../../src/app/api/leagues/lifecycle/route.ts',db,{uid:'owner'});
 try{assert.equal((await app.route.POST(communicationRequest(create('a',1)))).status,201);assert.equal((await app.route.POST(communicationRequest(create('a',2)))).status,409);}finally{app.dispose();}
});
