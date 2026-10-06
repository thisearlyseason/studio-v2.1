import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateTournamentOfficials} from '../src/lib/tournament-official-allocation.ts';
const refs=[{id:'r1',name:'One',email:'one@example.test'},{id:'r2',name:'Two',email:'two@example.test'}];
const game=(id,time)=>({id,date:'2026-10-20',time,gameDurationMinutes:30});
test('automatic officials cover simultaneous games without double bookings and retain assignments',()=>{
 const result=allocateTournamentOfficials([game('a','10:00'),game('b','10:00'),game('c','11:00')],refs,[],{});
 assert.notEqual(result[0].refereeId,result[1].refereeId);assert.ok(result.every(g=>g.refereeId));
 assert.deepEqual(allocateTournamentOfficials(result,refs,[],{}),result);
});
test('shortage stays explicitly unassigned instead of double booking',()=>{
 const result=allocateTournamentOfficials([game('a','10:00'),game('b','10:00')],refs.slice(0,1),[],{});
 assert.equal(result.filter(g=>g.refereeId).length,1);
});
test('other tournaments and rest periods exclude unavailable officials',()=>{
 const result=allocateTournamentOfficials([game('a','10:00'),game('b','10:35')],refs,[{refereeKey:'one@example.test',date:'2026-10-20',startMinute:600,endMinute:660}],{competition:{options:{rest:15}}});
 assert.equal(result[0].refereeId,'r2');assert.equal(result[1].refereeId,undefined);
});
test('rescheduling reassigns a referee whose new time conflicts',()=>{
 const result=allocateTournamentOfficials([{...game('a','10:00'),refereeId:'r1'}],refs,[{refereeKey:'one@example.test',date:'2026-10-20',startMinute:600,endMinute:630}],{});
 assert.equal(result[0].refereeId,'r2');
});
