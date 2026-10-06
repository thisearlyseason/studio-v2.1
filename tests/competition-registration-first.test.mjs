import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompetition} from '../src/lib/competition/document.ts';
import {mutateCompetition} from '../src/lib/competition/mutations.ts';
import {COMPETITION_FORMATS} from '../src/lib/competition/types.ts';
import {enrollmentPatch} from '../src/lib/competition/enrollment.ts';
import {playoffSeeds,createPlayoffs,compareStandings} from '../src/lib/competition/playoffs.ts';
import {resolveCompetition,recordCompetitionResult} from '../src/lib/competition/results.ts';
import {validateCompetitionSchedule,zonedInstant} from '../src/lib/competition/schedule.ts';
const teams=n=>Array.from({length:n},(_,i)=>({id:`t${i}`,name:`Team ${i}`}));
const setup=(format='pool_play_knockout',n=8)=>({title:'Registration cup',registrationFirst:true,teams:teams(n),rules:{version:2,format,timezone:'America/Edmonton',poolCount:2,advancePerPool:2},options:{resources:[{id:'court1',name:'Court 1'},{id:'court2',name:'Court 2'}],windows:[{date:'2026-10-01',startTime:'08:00',endTime:'22:00'}],duration:20,rest:10,turnaround:5,maxGamesPerDay:20}});
const deploy=doc=>mutateCompetition(doc,'deploy',{confirmedTeamIds:doc.topology.teams.map(t=>t.id)});
function completed(format='pool_play_knockout',n=8){let doc=deploy(createCompetition(setup(format,n)));for(const match of doc.topology.matches)doc=mutateCompetition(doc,'score',{result:{matchId:match.id,game:1,score1:2,score2:1}});return doc;}
const payload=(doc,brackets=1,qualifiers=2)=>({brackets,qualifiers,confirmedTeamIds:playoffSeeds(doc,qualifiers).map(row=>row.teamId),window:{date:'2026-10-02',startTime:'08:00',endTime:'22:00'}});
for(const [format] of COMPETITION_FORMATS)test(`${format}: zero-team registration draft has no generated matches`,()=>{const doc=createCompetition(setup(format,0));assert.equal(doc.phase,'registration');assert.deepEqual(doc.topology.matches,[]);assert.throws(()=>deploy(doc),/teams/i);assert.throws(()=>mutateCompetition(doc,'generate',{}),/Deploy/);});
test('free or confirmed registrations can be enrolled before any team exists, idempotently',()=>{const doc=createCompetition(setup('single_elimination',0));const event={competition:doc,tournamentTeamsData:[],tournamentGames:[]};const entry={answers:{teamName:'Alpha',name:'Coach'},entrant:{name:'Custom form team',sourceTeamId:'saved-team'}};assert.deepEqual(enrollmentPatch(event,'a',entry,false),{});const patch=enrollmentPatch(event,'a',entry,true);assert.equal(patch.competition.topology.teams.length,1);assert.equal(patch.competition.topology.matches.length,0);assert.equal(patch.tournamentTeamsData[0].sourceTeamId,'saved-team');assert.equal(patch.tournamentTeamsData[0].name,'Custom form team');assert.deepEqual(enrollmentPatch({...event,...patch},'a',entry,true),{});});
test('deployment requires an exact reviewed roster and defers knockout matches',()=>{const draft=createCompetition(setup());assert.throws(()=>mutateCompetition(draft,'deploy',{confirmedTeamIds:['t0']}),/confirm/i);const doc=deploy(draft);assert.equal(doc.status,'published');assert.ok(doc.topology.matches.every(m=>m.pool));assert.deepEqual(validateCompetitionSchedule(doc.topology,doc.schedule,doc.options),[]);assert.throws(()=>enrollmentPatch({competition:doc,tournamentTeamsData:teams(8),tournamentGames:doc.schedule},'new',{answers:{teamName:'Late'}},true),/locked/i);});
test('playoffs require completed preliminary scores and exact seed confirmation',()=>{const doc=deploy(createCompetition(setup()));assert.throws(()=>playoffSeeds(doc,2),/Finish every/);const complete=completed();assert.throws(()=>createPlayoffs(complete,{...payload(complete),confirmedTeamIds:['t0']},[]),/confirm/i);});
for(const count of [1,2,3])test(`${count} playoff brackets retain pools, avoid conflicts and finish with a champion`,()=>{const doc=completed('pool_play_knockout',12);const finals=createPlayoffs(doc,payload(doc,count,3),[]);assert.equal(finals.results.length,doc.results.length);assert.ok(finals.topology.matches.some(m=>m.id.startsWith('finals_')));assert.deepEqual(validateCompetitionSchedule(finals.topology,finals.schedule,finals.options),[]);let results=finals.results;for(let i=0;i<100;i++){const {states}=resolveCompetition(finals.topology,results);const match=finals.topology.matches.find(m=>!states.get(m.id).complete&&!states.get(m.id).inactive&&states.get(m.id).teamIds.every(Boolean));if(!match)break;results=recordCompetitionResult(finals.topology,results,{matchId:match.id,game:1,score1:5,score2:2});}assert.ok(resolveCompetition(finals.topology,results).placements[1]);assert.throws(()=>mutateCompetition(finals,'score',{result:{...finals.results[0],score1:9}}),/locked/i);assert.throws(()=>createPlayoffs(finals,payload(doc,count,3),[]),/once/i);});
test('finals reject overlapping external bookings and hours before pool completion',()=>{const doc=completed();const request=payload(doc);const bookings=doc.options.resources.map(r=>({id:r.id,resourceId:r.id,teamIds:[],start:zonedInstant('2026-10-02',0,'America/Edmonton'),end:zonedInstant('2026-10-02',1439,'America/Edmonton')}));assert.throws(()=>createPlayoffs(doc,request,bookings),/fit|available|schedule/i);assert.throws(()=>createPlayoffs(doc,{...request,window:{date:'2026-09-30',startTime:'08:00',endTime:'22:00'}},[]),/after/i);});
test('equal W/L/D uses point differential before original seed',()=>{const doc=deploy(createCompetition(setup('round_robin',3)));for(const match of doc.topology.matches){const ids=match.sources.map(s=>s.teamId);const pair=new Set(ids);const win=pair.has('t0')&&pair.has('t1')?'t0':pair.has('t1')&&pair.has('t2')?'t1':'t2';const score=win==='t1'?10:1;doc.results=recordCompetitionResult(doc.topology,doc.results,{matchId:match.id,game:1,score1:ids[0]===win?score:0,score2:ids[1]===win?score:0});}assert.equal(playoffSeeds(doc,3)[0].teamId,'t1');});

test('unplayed playoffs can be removed to correct preliminary scores, but played playoffs lock removal',()=>{const doc=completed();const finals=createPlayoffs(doc,payload(doc),[]);const restored=mutateCompetition(finals,'remove-unplayed-playoffs',{});assert.equal(restored.finalsCreated,false);assert.equal(restored.schedule.length,doc.schedule.length);assert.doesNotThrow(()=>mutateCompetition(restored,'score',{result:{...restored.results[0],score1:7}}));const match=finals.topology.matches.find(m=>m.id.startsWith('finals_'));const scored=mutateCompetition(finals,'score',{result:{matchId:match.id,game:1,score1:5,score2:1}});assert.throws(()=>mutateCompetition(scored,'remove-unplayed-playoffs',{}),/before any/);});


test('scoring totals break only tied competition points and W/L/D records', () => {
  const row={teamId:'a',played:3,points:6,won:2,lost:1,drawn:0,for:2,against:100};
  assert.ok(compareStandings(row,{...row,teamId:'b',points:3,won:1,lost:2,for:100,against:0})<0);
  assert.ok(compareStandings(row,{...row,teamId:'b',won:1,lost:2,for:100,against:0})<0);
  assert.ok(compareStandings({...row,for:8,against:2},{...row,teamId:'b',for:7,against:2})<0);
  assert.ok(compareStandings({...row,for:8,against:3},{...row,teamId:'b',for:7,against:2})<0);
});

test('shared round robin splits all entrants into independent division championships', () => {
  const doc=completed('round_robin',6);
  const finals=createPlayoffs(doc,payload(doc,3,6),[]);
  const matches=finals.topology.matches.filter(m=>m.id.startsWith('finals_'));
  assert.equal(matches.length,3);
  assert.deepEqual(matches.map(m=>m.stage),['Gold','Silver','Bronze']);
  const entrants=matches.flatMap(m=>m.sources.map(s=>s.teamId));
  assert.equal(new Set(entrants).size,6);
  assert.deepEqual(new Set(entrants),new Set(doc.topology.teams.map(t=>t.id)));
  let results=finals.results;
  for(const match of matches) results=recordCompetitionResult(finals.topology,results,{matchId:match.id,game:1,score1:5,score2:2});
  const {states}=resolveCompetition(finals.topology,results);
  assert.ok(matches.every(m=>states.get(m.id).complete&&states.get(m.id).winner));
  assert.equal(new Set(matches.map(m=>states.get(m.id).winner)).size,3);
  assert.deepEqual(validateCompetitionSchedule(finals.topology,finals.schedule,finals.options),[]);
});

test('all teams advance includes every entrant from uneven pools', () => {
  const doc=completed('pool_play_knockout',7);
  assert.equal(new Set(Object.values(doc.topology.groups).map(ids=>ids.length)).size,2);
  const rows=playoffSeeds(doc,'all');
  assert.equal(rows.length,7);
  assert.equal(new Set(rows.map(row=>row.teamId)).size,7);
  const finals=createPlayoffs(doc,{...payload(doc,2,2),qualifiers:'all',confirmedTeamIds:rows.map(row=>row.teamId)},[]);
  const entrants=finals.topology.matches.filter(m=>m.id.startsWith('finals_')).flatMap(m=>m.sources.filter(s=>s.kind==='team').map(s=>s.teamId));
  assert.deepEqual(new Set(entrants),new Set(doc.topology.teams.map(t=>t.id)));
  assert.deepEqual(validateCompetitionSchedule(finals.topology,finals.schedule,finals.options),[]);
});
