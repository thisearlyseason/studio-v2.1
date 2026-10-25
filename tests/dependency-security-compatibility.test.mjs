import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { competitionSetupSchema } from '../src/lib/competition/document.ts';
import { parseBegin, parseReply } from '../src/lib/native-auth/protocol.ts';

test('patched constrained arrays reject before inspecting oversized elements', () => {
  let inspected=0;
  const schema=z.array(z.string().refine(()=>{inspected++;return true})).max(64);
  const result=schema.safeParse(Array(65).fill('fixture'));
  assert.equal(result.success,false);
  assert.equal(inspected,0);
  assert.equal(result.error.issues.length,1);
  assert.equal(result.error.issues[0].code,'too_big');
});

test('tournament series record preserves arbitrary string rounds and allowed lengths', () => {
  const schema=competitionSetupSchema.shape.rules.shape.seriesByRound;
  assert.deepEqual(schema.parse({'Round 1':3,'Final':7,'custom_key':1}),{'Round 1':3,'Final':7,'custom_key':1});
  assert.equal(schema.safeParse({'Final':2}).success,false);
  assert.equal(schema.safeParse({'Final':'3'}).success,false);
});

test('actual tournament teams reject oversize before reading individual teams', () => {
  let inspected=0;
  const team={get id(){inspected++;return 'fixture'},get name(){inspected++;return 'Fixture'}};
  assert.equal(competitionSetupSchema.shape.teams.safeParse(Array(65).fill(team)).success,false);
  assert.equal(inspected,0);
});

test('native auth keeps valid generated request IDs and strict malformed-request rejection', () => {
  const requestId=randomUUID();
  const input={version:1,type:'begin',requestId,provider:'google.com',webChallenge:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'};
  assert.deepEqual(parseBegin(input),input);
  assert.equal(parseReply({version:1,type:'cancelled',requestId}).requestId,requestId);
  assert.throws(()=>parseBegin({...input,requestId:'not-a-uuid'}));
  assert.throws(()=>parseBegin({...input,unexpected:true}));
});

test('patched Undici survives excessive encodings followed by premature response close', async () => {
  const { spawnSync } = await import('node:child_process');
  const child=spawnSync(process.execPath,['--input-type=module','-e',`
    import http from 'node:http';
    import assert from 'node:assert/strict';
    import { fetch } from 'undici';
    const server=http.createServer((_req,res)=>{
      res.writeHead(200,{'Content-Encoding':'gzip, gzip, gzip, gzip, gzip, gzip','Content-Length':'100'});
      res.flushHeaders();setTimeout(()=>res.socket?.destroy(),5);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try { await assert.rejects(fetch('http://127.0.0.1:'+server.address().port));await new Promise(resolve=>setTimeout(resolve,100)); }
    finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
  `],{cwd:process.cwd(),encoding:'utf8',timeout:8000});
  assert.equal(child.error,undefined);
  assert.equal(child.signal,null);
  assert.equal(child.status,0,child.stderr);
});
