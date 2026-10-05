import test from 'node:test';
import assert from 'node:assert/strict';
import {gameResultSummary} from '../src/lib/game-result-summary.ts';
const game={team1:'Red',team2:'Black',team1Id:'r',team2Id:'b',isCompleted:true,score1:3,score2:1};
test('unplayed, completed, drawn, disputed and tiebreak results have unambiguous labels',()=>{
 assert.equal(gameResultSummary({...game,isCompleted:false}),null);
 assert.equal(gameResultSummary(game).label,'Winner: Red');
 assert.equal(gameResultSummary({...game,score1:0,score2:2}).side,2);
 assert.equal(gameResultSummary({...game,score1:1}).label,'Draw');
 assert.equal(gameResultSummary({...game,score1:1,winnerId:'b'}).label,'Winner: Black');
 assert.equal(gameResultSummary({...game,isDisputed:true}).winner,null);
 assert.equal(gameResultSummary({...game,isDisputed:true}).label,'Result under review');
});
