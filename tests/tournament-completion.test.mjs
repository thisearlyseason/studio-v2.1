import test from 'node:test';
import assert from 'node:assert/strict';
import {tournamentCompletion} from '../src/lib/tournament-completion.ts';
test('series sweeps and unused resets are complete without fabricated scores',()=>{
 assert.equal(tournamentCompletion([{isCompleted:true},{isCompleted:true},{isConditional:true}]),100);
 assert.equal(tournamentCompletion([{isCompleted:true},{isCompleted:false}]),50);
 assert.equal(tournamentCompletion([{isCompleted:true},{isCompleted:true},{isCompleted:false}]),67);
 assert.equal(tournamentCompletion([]),0);
});
