import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationDb,loadCommunicationRoute} from './helpers/communication-route-harness.mjs';

const base={title:'Team Registration',description:'Register',is_active:true,type:'team',form_schema:[{id:'name',label:'Team name',type:'short_text',required:true}],form_version:1};
const request=body=>new Request('http://127.0.0.1/api/registrations/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('registration config service binds organizer authority and requires exact version/hash on update',async()=>{
  const {db,records}=communicationDb({'leagues/l':{creatorId:'owner'}}),app=await loadCommunicationRoute('../../src/app/api/registrations/config/route.ts',db,{uid:'owner'});
  try{
    const created=await app.route.POST(request({targetKind:'league',targetId:'l',configId:'team_config',expectedVersion:0,config:base}));assert.equal(created.status,200);
    const first=records.get('leagues/l/registration/team_config');assert.equal(first.form_version,1);assert.match(first.config_hash,/^[a-f0-9]{64}$/);
    assert.equal((await app.route.POST(request({targetKind:'league',targetId:'l',configId:'team_config',expectedVersion:0,config:base}))).status,409);
    const updated=await app.route.POST(request({targetKind:'league',targetId:'l',configId:'team_config',expectedVersion:1,expectedHash:first.config_hash,config:{...base,title:'Updated'}}));assert.equal(updated.status,200);
    assert.equal(records.get('leagues/l/registration/team_config').form_version,2);
  }finally{app.dispose();}
});

test('registration config service rejects other organizer and invalid schema without writes',async()=>{
  const {db,records}=communicationDb({'leagues/l':{creatorId:'owner'}}),app=await loadCommunicationRoute('../../src/app/api/registrations/config/route.ts',db,{uid:'other'});
  try{assert.equal((await app.route.POST(request({targetKind:'league',targetId:'l',configId:'team_config',expectedVersion:0,config:base}))).status,403);assert.equal(records.has('leagues/l/registration/team_config'),false);}finally{app.dispose();}
});

test('tournament registration config and private scorekeeper credential commit atomically',async()=>{
  process.env.COMPETITION_CREDENTIAL_HMAC_SECRET='test-secret-that-is-at-least-thirty-two-bytes-long';
  const seed={'teams/t':{ownerUserId:'owner',planId:'elite'},'teams/t/events/e':{isTournament:true,teamId:'t',lifecycleVersion:3,credentialVersion:0}};
  const {db,records}=communicationDb(seed),app=await loadCommunicationRoute('../../src/app/api/registrations/config/route.ts',db,{uid:'owner'});
  try{
    const invalid=await app.route.POST(request({requestId:'registration-credential-0001',targetKind:'tournament',targetId:'t',eventId:'e',configId:'team_config',expectedVersion:0,expectedLifecycleVersion:3,expectedCredentialVersion:0,config:base,scoringCode:'12'}));
    assert.equal(invalid.status,400);assert.equal(records.has('teams/t/events/e/registration/team_config'),false);assert.equal(records.has('teams/t/events/e/private/scoring'),false);
    const body={requestId:'registration-credential-0002',targetKind:'tournament',targetId:'t',eventId:'e',configId:'team_config',expectedVersion:0,expectedLifecycleVersion:3,expectedCredentialVersion:0,config:{...base,scoringCode:'2468'},scoringCode:'2468'};
    const saved=await app.route.POST(request(body));
    assert.equal(saved.status,200);const savedPayload=await saved.json();assert.equal(savedPayload.credentialVersion,1);assert.equal(records.has('teams/t/events/e/registration/team_config'),true);
    assert.match(records.get('teams/t/events/e/private/scoring').scorekeeperCodeHash,/^hmac-sha256:v1:[a-f0-9]{64}$/);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,1);
    assert.equal(records.get('teams/t/events/e').credentialVersion,1);assert.equal(records.get('teams/t/events/e').scorekeeperConfigured,true);assert.equal('scoringCode' in records.get('teams/t/events/e'),false);
    assert.equal('scoringCode' in records.get('teams/t/events/e/registration/team_config'),false);
    const replay=await app.route.POST(request(body));assert.equal(replay.status,200);assert.deepEqual(await replay.json(),savedPayload);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,1);
    const collision=await app.route.POST(request({...body,scoringCode:'9753'}));assert.equal(collision.status,409);
    const before=structuredClone(records.get('teams/t/events/e/registration/team_config'));
    const stale=await app.route.POST(request({...body,requestId:'registration-credential-0003',expectedVersion:1,expectedHash:before.config_hash,config:{...base,title:'Must not commit'},scoringCode:'9753'}));
    assert.equal(stale.status,409);assert.deepEqual(records.get('teams/t/events/e/registration/team_config'),before);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,1);
  }finally{app.dispose();}
});

test('standalone Tournament scorekeeper credential is versioned, replay-safe, and collision-safe',async()=>{
  process.env.COMPETITION_CREDENTIAL_HMAC_SECRET='test-secret-that-is-at-least-thirty-two-bytes-long';
  const {db,records}=communicationDb({'teams/t':{ownerUserId:'owner',planId:'elite'},'teams/t/events/e':{isTournament:true,teamId:'t',lifecycleVersion:4,credentialVersion:0}},{serializeTransactions:true});
  const app=await loadCommunicationRoute('../../src/app/api/tournaments/credential/route.ts',db,{uid:'owner'});
  try{
    const body={requestId:'scorekeeper-credential-0001',teamId:'t',eventId:'e',scoringCode:'8642',expectedLifecycleVersion:4,expectedCredentialVersion:0};
    const response=await app.route.POST(request(body));assert.equal(response.status,200);const first=await response.json();assert.deepEqual(first,{success:true,scorekeeperConfigured:true,lifecycleVersion:4,credentialVersion:1});
    assert.match(records.get('teams/t/events/e/private/scoring').scorekeeperCodeHash,/^hmac-sha256:v1:[a-f0-9]{64}$/);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,1);assert.equal(records.get('teams/t/events/e').credentialVersion,1);
    const replay=await app.route.POST(request(body));assert.equal(replay.status,200);assert.deepEqual(await replay.json(),first);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,1);
    const collision=await app.route.POST(request({...body,scoringCode:'9999'}));assert.equal(collision.status,409);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,1);
    const staleLifecycle=await app.route.POST(request({...body,requestId:'scorekeeper-credential-0002',expectedLifecycleVersion:3,expectedCredentialVersion:1}));assert.equal(staleLifecycle.status,409);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,1);
    const second=await app.route.POST(request({...body,requestId:'scorekeeper-credential-0003',scoringCode:'9753',expectedCredentialVersion:1}));assert.equal(second.status,200);assert.equal((await second.json()).credentialVersion,2);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,2);
  }finally{app.dispose();}
});

test('standalone Tournament credential replay revalidates current staff authority',async()=>{
  process.env.COMPETITION_CREDENTIAL_HMAC_SECRET='test-secret-that-is-at-least-thirty-two-bytes-long';
  const {db,records}=communicationDb({'teams/t':{ownerUserId:'owner',planId:'elite'},'teams/t/events/e':{isTournament:true,teamId:'t',lifecycleVersion:1,credentialVersion:0}},{serializeTransactions:true});
  const app=await loadCommunicationRoute('../../src/app/api/tournaments/credential/route.ts',db,{uid:'owner'});
  const body={requestId:'scorekeeper-authority-0001',teamId:'t',eventId:'e',scoringCode:'8642',expectedLifecycleVersion:1,expectedCredentialVersion:0};
  try{
    assert.equal((await app.route.POST(request(body))).status,200);records.get('teams/t').ownerUserId='replacement';
    assert.equal((await app.route.POST(request(body))).status,403);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,1);
  }finally{app.dispose();}
});

test('concurrent standalone Tournament credential editors reject the stale version',async()=>{
  process.env.COMPETITION_CREDENTIAL_HMAC_SECRET='test-secret-that-is-at-least-thirty-two-bytes-long';
  const {db,records}=communicationDb({'teams/t':{ownerUserId:'owner',planId:'elite'},'teams/t/events/e':{isTournament:true,teamId:'t',lifecycleVersion:2,credentialVersion:0}},{serializeTransactions:true});
  const app=await loadCommunicationRoute('../../src/app/api/tournaments/credential/route.ts',db,{uid:'owner'});
  try{
    const common={teamId:'t',eventId:'e',expectedLifecycleVersion:2,expectedCredentialVersion:0};
    const responses=await Promise.all([
      app.route.POST(request({...common,requestId:'scorekeeper-concurrent-0001',scoringCode:'1111'})),
      app.route.POST(request({...common,requestId:'scorekeeper-concurrent-0002',scoringCode:'2222'})),
    ]);
    assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);assert.equal(records.get('teams/t/events/e/private/scoring').credentialVersion,1);assert.equal(records.get('teams/t/events/e').credentialVersion,1);
  }finally{app.dispose();}
});
