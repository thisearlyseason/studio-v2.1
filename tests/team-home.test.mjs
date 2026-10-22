import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { nextTeamEvent, homeEventDateLabel, expandTournamentMatches } from '../src/lib/team-home-events.ts';
import { optimizeTeamCover, coverFocalPoint } from '../src/lib/team-cover-processing.ts';
const base = {id:'practice',teamId:'a',title:'Practice',date:'2026-10-21',startTime:'18:00'};
const now = new Date(2026,9,21,12);
test('Next Up excludes other teams, cancellations, postponed and past events; sorts by time', () => {
  const events = [{...base,id:'other',teamId:'b',startTime:'12:00'},{...base,id:'cancel',status:'cancelled'}, {...base,id:'postponed',status:'postponed'}, {...base,id:'old',date:'2026-10-20'}, {...base,id:'late',startTime:'20:00'},base];
  assert.equal(nextTeamEvent(events,'a',now)?.id,'practice');
  assert.equal(nextTeamEvent(events,'missing',now),undefined);
});
test('ongoing, all-day and rescheduled events keep their actual date and time', () => {
  assert.equal(nextTeamEvent([{...base,endTime:'19:00'}],'a',new Date(2026,9,21,18,30))?.id,'practice');
  assert.equal(nextTeamEvent([{...base,endTime:'19:00'}],'a',new Date(2026,9,21,20)),undefined);
  assert.match(homeEventDateLabel({...base,allDay:true}),/All day/);
  assert.equal(nextTeamEvent([{...base,status:'rescheduled',date:'2026-10-22'}],'a',now)?.date,'2026-10-22');
});
test('malformed dates are ignored; Firestore Timestamp values are supported', () => {
  assert.equal(nextTeamEvent([{...base,date:'broken'}],'a',now),undefined);
  assert.equal(nextTeamEvent([{...base,date:{toDate:()=>new Date(2026,9,21)}}],'a',now)?.id,'practice');
});
test('trusted cover processing validates actual bytes and size', async () => {
  await assert.rejects(optimizeTeamCover(Buffer.from('<svg></svg>')));
  await assert.rejects(optimizeTeamCover(Buffer.alloc(5*1024*1024+1)),/5 MB/);
  const tiny = await sharp({create:{width:100,height:100,channels:3,background:'#123456'}}).png().toBuffer();
  await assert.rejects(optimizeTeamCover(tiny),/320/);
});
test('cover variants correct orientation, strip metadata and never upscale', async () => {
  const input = await sharp({create:{width:2200,height:1100,channels:3,background:'#123456'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const variants = await optimizeTeamCover(input);
  assert.deepEqual(variants.map(v=>v.width),[640,960]);
  for (const version of variants) { const metadata = await sharp(version.data).metadata(); assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);assert.equal(metadata.width,version.width);assert.ok(version.data.length<300_000); }
  const small = await sharp({create:{width:400,height:200,channels:3,background:'#123456'}}).png().toBuffer();
  assert.deepEqual((await optimizeTeamCover(small)).map(v=>v.width),[400]);
});
test('crop coordinates reject invalid positions', () => {
  assert.deepEqual(coverFocalPoint('25','75'),{focalX:25,focalY:75});
  for (const value of [null,undefined,'NaN',-1,101]) assert.throws(()=>coverFocalPoint(value,50));
});

test('tournament matches share team membership and TBD filtering with Schedule', () => {
 const events=[{...base,isTournament:true,tournamentGames:[{id:'mine',date:'2026-10-22',team1Id:'a',team2Id:'b',team1:'Falcons',team2:'Wolves',time:'17:00'},{id:'other',date:'2026-10-22',team1Id:'c',team2Id:'d',team1:'Cats',team2:'Dogs'},{id:'tbd',date:'2026-10-22',team1Id:'a',team1:'Falcons',team2:'TBD'}]}];
 const matches=expandTournamentMatches(events,{id:'a',name:'Falcons'});assert.deepEqual(matches.map(m=>m.id),['mine']);assert.equal(matches[0].parentTournamentId,'practice');assert.equal(matches[0].startTime,'17:00');
});
test('events with a known past start and no ongoing status do not mask the next event',()=>{assert.equal(nextTeamEvent([{...base,id:'past-start',startTime:'09:00'},base],'a',now)?.id,'practice');});
