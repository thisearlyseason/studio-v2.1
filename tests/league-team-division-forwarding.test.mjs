import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../src/components/providers/team-provider.tsx',import.meta.url),'utf8');
const start=source.indexOf('const updateLeagueTeamDetails = useCallback(');
const bodyStart=source.indexOf('=> {',start)+4;
const bodyEnd=source.indexOf('\n  }, [updateLeague]);',bodyStart);
assert.ok(start>=0&&bodyEnd>bodyStart);
async function submitted(updates){const calls=[];const callback=vm.runInNewContext(ts.transpileModule('(async (leagueId,teamId,updates)=>{'+source.slice(bodyStart,bodyEnd)+'})',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{updateLeague:async(...args)=>calls.push(args),toast(){}});await callback('league-owned','team-owned',updates);return JSON.parse(JSON.stringify(calls[0]));}
test('existing team edit forwards the selected division through the actual lifecycle request callback',async()=>{const [league,body]=await submitted({teamName:'Owned squad',division:'U14',wins:0});assert.equal(league,'league-owned');assert.equal(body.teamUpdate.teamId,'team-owned');assert.equal(body.teamUpdate.publicFields.division,'U14');assert.equal(body.teamUpdate.publicFields.wins,0)});
test('unassigned division is forwarded as an explicit empty value',async()=>{const [,body]=await submitted({division:''});assert.equal(body.teamUpdate.publicFields.division,'')});
test('division remains public assignment data while private contact notes retain their protected channel',async()=>{const [,body]=await submitted({division:'U16',coachEmail:'fixture@phase2.test',organizerNotes:'private'});assert.equal(body.teamUpdate.publicFields.division,'U16');assert.equal(body.teamUpdate.publicFields.coachEmail,undefined);assert.equal(body.teamUpdate.privateFields.coachEmail,'fixture@phase2.test');assert.equal(body.teamUpdate.privateFields.organizerNotes,'private')});
