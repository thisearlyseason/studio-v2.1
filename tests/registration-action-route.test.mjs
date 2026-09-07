import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationDb,loadCommunicationRoute} from './helpers/communication-route-harness.mjs';
import {effectiveLeagueRegistrationConfig,registrationConfigHash} from '../src/lib/registration-policy.ts';
import {hashLeagueScorekeeperPin,hashTournamentScorekeeperCode} from '../src/lib/server-competition-credential.ts';

process.env.COMPETITION_CREDENTIAL_HMAC_SECRET='current-competition-test-secret-at-least-32-bytes';
process.env.COMPETITION_CREDENTIAL_HMAC_PREVIOUS_SECRETS='previous-competition-test-secret-at-least-32-bytes';

const request=(body,url='http://127.0.0.1/api/public/portals/action')=>new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const teamConfig=overrides=>{const value={title:'Tournament form',description:'',is_active:true,type:'team',form_schema:[{id:'teamName',label:'Team Name',type:'short_text',required:true},{id:'name',label:'Head Coach Name',type:'short_text',required:true},{id:'email',label:'Email Address',type:'email',required:true}],form_version:1,registration_cost:'0',offline_payment_instructions:'',currency:'CAD',waiver_mode:'none',require_default_waiver:false,default_waiver_text:'',custom_waiver_text:'',team_waivers_content:[],...overrides};return{...value,config_hash:registrationConfigHash(value)};};

test('public event final seat is serialized and a missing legacy counter migrates exactly',async()=>{
  const seed={'teams/a':{planId:'team'},'teams/a/events/e':{title:'Open',date:'2099-01-01',registrationOpen:true,registrationCapacity:2,customFormFields:[],registrationFormVersion:1},'teams/a/events/e/registrations/legacy':{email:'legacy@example.test'}};
  const {db,records}=communicationDb(seed,{serializeTransactions:true}),app=await loadCommunicationRoute('../../src/app/api/public/event-registration/route.ts',db,{});
  const get=new Request('http://127.0.0.1/api/public/event-registration?teamId=a&eventId=e');get.nextUrl=new URL(get.url);
  try{
    const projection=await (await app.route.GET(get)).json(),base={teamId:'a',eventId:'e',name:'Registrant',phone:'5551234567',formVersion:projection.data.formVersion,formHash:projection.data.formHash,responses:{}};
    const [one,two]=await Promise.all([
      app.route.POST(request({...base,email:'one@example.test',requestId:'event-final-seat-0001'})),
      app.route.POST(request({...base,email:'two@example.test',requestId:'event-final-seat-0002'})),
    ]);
    assert.deepEqual([one.status,two.status].sort(),[200,409]);
    assert.equal(records.get('teams/a/events/e').registrationCount,2);
    assert.equal([...records.keys()].filter(path=>path.startsWith('teams/a/events/e/registrations/')).length,2);
  }finally{app.dispose();}
});

test('league scoring verifies the private HMAC with rotation and rejects tampering',async()=>{
  const previous='previous-competition-test-secret-at-least-32-bytes',league={creatorId:'owner',tenantId:'host',name:'League',is_active:true,teams:{a:{teamName:'A',status:'accepted'},b:{teamName:'B',status:'accepted'}},schedule:[{id:'g',team1:'A',team1Id:'a',team2:'B',team2Id:'b'}]};
  const {db}=communicationDb({'teams/host':{ownerUserId:'owner',planId:'league'},'users/owner':{role:'coach',plan_type:'league'},'leagues/l':league,'leagues/l/private/lifecycle':{scorekeeperPinHash:hashLeagueScorekeeperPin('l','8274',[previous])},'teams/a':{},'teams/b':{}},{serializeTransactions:true}),app=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{});
  try{
    assert.equal((await app.route.POST(request({kind:'league',action:'score',leagueId:'l',code:'wrong',gameId:'g',requestId:'hmac-score-first',expectedGameVersion:0,score1:2,score2:1}))).status,403);
    assert.equal((await app.route.POST(request({kind:'league',action:'score',leagueId:'l',code:'8274',gameId:'g',requestId:'hmac-score-first',expectedGameVersion:0,score1:2,score2:1}))).status,200);
    assert.equal((await app.route.POST(request({kind:'league',action:'score',leagueId:'l',code:'8274',gameId:'g',requestId:'hmac-score-correct',expectedGameVersion:1,score1:3,score2:1}))).status,200);
  }finally{app.dispose();}
});

test('legacy league PIN migrates only on a correct score in the same transaction',async()=>{
  const league={creatorId:'owner',tenantId:'host',billingOwnerUserId:'owner',name:'Legacy League',is_active:true,scorekeeperPin:'8274',teams:{a:{teamName:'A',status:'accepted'},b:{teamName:'B',status:'accepted'}},schedule:[{id:'g',team1:'A',team1Id:'a',team2:'B',team2Id:'b'}]};
  const {db,records}=communicationDb({'teams/host':{ownerUserId:'owner',planId:'league'},'users/owner':{role:'coach',plan_type:'league'},'leagues/l':league,'teams/a':{},'teams/b':{}},{serializeTransactions:true}),app=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{});
  try{
    assert.equal((await app.route.POST(request({kind:'league',action:'score',leagueId:'l',code:'wrong',gameId:'g',requestId:'hmac-score-first',expectedGameVersion:0,score1:2,score2:1}))).status,403);
    assert.equal(records.get('leagues/l').scorekeeperPin,'8274');assert.equal(records.has('leagues/l/private/lifecycle'),false);
    assert.equal((await app.route.POST(request({kind:'league',action:'score',leagueId:'l',code:'8274',gameId:'g',requestId:'hmac-score-first',expectedGameVersion:0,score1:2,score2:1}))).status,200);
    assert.equal('scorekeeperPin' in records.get('leagues/l'),false);assert.match(records.get('leagues/l/private/lifecycle').scorekeeperPinHash,/^hmac-sha256:v1:[a-f0-9]{64}$/);
    assert.equal((await app.route.POST(request({kind:'league',action:'score',leagueId:'l',code:'8274',gameId:'g',requestId:'hmac-score-correct',expectedGameVersion:1,score1:3,score2:1}))).status,200);
  }finally{app.dispose();}
});

test('tournament scoring verifies private HMAC and migrates a valid legacy code atomically',async()=>{
  const game={id:'g',team1:'A',team1Id:'a',team2:'B',team2Id:'b',score1:0,score2:0,isCompleted:false,stage:'Pool'};
  const root={isTournament:true,teamId:'t',tournamentType:'round_robin',tournamentGames:[game]};
  const privateSeed={'teams/t':{planId:'elite'},'teams/t/events/e':root,'teams/t/events/e/private/scoring':{scorekeeperCodeHash:hashTournamentScorekeeperCode('t','e','AbC9')}};
  const first=communicationDb(privateSeed,{serializeTransactions:true}),privateApp=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',first.db,{});
  try{
    assert.equal((await privateApp.route.POST(request({kind:'tournament',action:'score',teamId:'t',eventId:'e',code:'wrong',gameId:'g',score1:2,score2:1}))).status,403);
    assert.equal(first.records.get('teams/t/events/e').tournamentGames[0].isCompleted,false);
    assert.equal((await privateApp.route.POST(request({kind:'tournament',action:'score',teamId:'t',eventId:'e',code:'abc9',gameId:'g',score1:2,score2:1}))).status,200);
  }finally{privateApp.dispose();}
  const legacy=communicationDb({'teams/t':{planId:'elite'},'teams/t/events/e':{...root,scoringCode:'1357'}},{serializeTransactions:true}),legacyApp=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',legacy.db,{});
  try{
    assert.equal((await legacyApp.route.POST(request({kind:'tournament',action:'verify',teamId:'t',eventId:'e',code:'1357'}))).status,200);
    assert.equal('scoringCode' in legacy.records.get('teams/t/events/e'),false);
    assert.equal(legacy.records.get('teams/t/events/e').credentialVersion,1);assert.equal(legacy.records.get('teams/t/events/e').scorekeeperConfigured,true);
    assert.match(legacy.records.get('teams/t/events/e/private/scoring').scorekeeperCodeHash,/^hmac-sha256:v1:[a-f0-9]{64}$/);assert.equal(legacy.records.get('teams/t/events/e/private/scoring').credentialVersion,1);
  }finally{legacyApp.dispose();}
});

test('league public entitlement uses the canonical billing owner rather than delegated actor plan',async()=>{
  const config=teamConfig({title:'Delegated league'}),league={creatorId:'staff',billingOwnerUserId:'owner',tenantId:'team-a',registrationEntryCount:0,is_active:true},effective=effectiveLeagueRegistrationConfig(config,league);
  const {db}=communicationDb({'users/owner':{plan_type:'league'},'users/staff':{plan_type:'free'},'leagues/l':league,'leagues/l/registration/team_config':config},{serializeTransactions:true});
  const read=await loadCommunicationRoute('../../src/app/api/public/portals/route.ts',db,{}),write=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{});
  const get=new Request('http://127.0.0.1/api/public/portals?kind=league-registration&leagueId=l&protocolId=team_config');get.nextUrl=new URL(get.url);
  try{
    assert.equal((await read.route.GET(get)).status,200);
    const response=await write.route.POST(request({kind:'league',action:'register',leagueId:'l',protocolId:'team_config',requestId:'delegated-entitle-0001',formVersion:1,formHash:effective.config_hash,answers:{teamName:'Alpha',name:'Coach',email:'coach@example.test',phone:'5551234567'}}));
    assert.equal(response.status,200);
  }finally{read.dispose();write.dispose();}
});

test('league fee snapshot is identical from public GET through transactional POST',async()=>{
  const raw=teamConfig({title:'League form'}),league={creatorId:'owner',registrationCost:'40',paymentInstructions:'Pay at desk',registrationEntryCount:0},effective=effectiveLeagueRegistrationConfig(raw,league);
  const {db,records}=communicationDb({'users/owner':{plan_type:'league'},'leagues/l':league,'leagues/l/registration/team_config':raw},{serializeTransactions:true});
  const read=await loadCommunicationRoute('../../src/app/api/public/portals/route.ts',db,{}),write=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{});
  const get=new Request('http://127.0.0.1/api/public/portals?kind=league-registration&leagueId=l&protocolId=team_config');get.nextUrl=new URL(get.url);
  try{
    const projection=await (await read.route.GET(get)).json();assert.equal(projection.data.config.registration_cost,'40');assert.equal(projection.data.config.offline_payment_instructions,'Pay at desk');
    const response=await write.route.POST(request({kind:'league',action:'register',leagueId:'l',protocolId:'team_config',requestId:'league-fee-request-0001',formVersion:effective.form_version,formHash:effective.config_hash,answers:{teamName:'Alpha',name:'Coach',email:'coach@example.test',phone:'5551234567'}}));
    assert.equal(response.status,200);const entry=[...records].find(([path])=>path.startsWith('leagues/l/registrationEntries/'))[1];
    assert.deepEqual(entry.payment,{amount:40,currency:'CAD',mode:'offline',status:'pending',instructions:'Pay at desk'});assert.equal(entry.payment_received,false);
    const root=records.get('leagues/l'),recruitId=Object.keys(root.teams)[0],privateData=records.get('leagues/l/private/lifecycle');
    assert.equal('coachEmail' in root.teams[recruitId],false);assert.equal('coachName' in root.teams[recruitId],false);assert.equal('inviteCode' in root.teams[recruitId],false);
    assert.equal(privateData.teamContacts[recruitId].coachEmail,'coach@example.test');assert.equal(privateData.teamContacts[recruitId].coachPhone,'5551234567');
  }finally{read.dispose();write.dispose();}
});

test('registration replay repairs a missing immutable waiver receipt from original entry time',async()=>{
  const config=teamConfig({title:'League waiver',require_default_waiver:true,default_waiver_text:'League terms'}),league={creatorId:'owner',registrationEntryCount:0};
  const {db,records}=communicationDb({'users/owner':{plan_type:'league'},'leagues/l':league,'leagues/l/registration/team_config':config},{serializeTransactions:true}),app=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{}),body={kind:'league',action:'register',leagueId:'l',protocolId:'team_config',requestId:'league-repair-request-01',formVersion:1,formHash:config.config_hash,signature:'Coach Name',answers:{teamName:'Alpha',name:'Coach',email:'coach@example.test',phone:'5551234567'}};
  try{
    assert.equal((await app.route.POST(request(body))).status,200);const entryPath=[...records.keys()].find(path=>path.startsWith('leagues/l/registrationEntries/')),entry=records.get(entryPath),archivePath=`leagues/l/archived_waivers/arch_waiver_${entryPath.split('/').at(-1)}`;
    assert.equal(records.get(archivePath).signedAt,entry.signature_date);records.delete(archivePath);
    const replay=await app.route.POST(request(body));assert.equal(replay.status,200);assert.equal((await replay.json()).replay,true);assert.equal(records.get(archivePath).signedAt,entry.signature_date);
    records.set(archivePath,{...records.get(archivePath),signedAt:'2000-01-01T00:00:00.000Z'});assert.equal((await app.route.POST(request(body))).status,409);
  }finally{app.dispose();}
});

test('league player registration stores applicant contact data only in the private projection',async()=>{
  const raw=teamConfig({title:'Player form',type:'player',form_schema:[{id:'fullName',label:'Athlete Name',type:'short_text',required:true},{id:'email',label:'Email',type:'email',required:true},{id:'phone',label:'Phone',type:'short_text',required:true},{id:'dateOfBirth',label:'Date of Birth',type:'date',required:true}]}),league={creatorId:'owner',registrationEntryCount:0},effective=effectiveLeagueRegistrationConfig(raw,league);
  const {db,records}=communicationDb({'users/owner':{plan_type:'league'},'leagues/l':league,'leagues/l/registration/player_config':raw},{serializeTransactions:true}),app=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{});
  try{
    const response=await app.route.POST(request({kind:'league',action:'register',leagueId:'l',protocolId:'player_config',requestId:'private-player-request-01',formVersion:effective.form_version,formHash:effective.config_hash,answers:{fullName:'Applicant',email:'applicant@example.test',phone:'5551234567',dateOfBirth:'2000-01-01'}}));
    assert.equal(response.status,200);const recruitId=`recruit_${(await response.json()).entryId}`,root=records.get('leagues/l'),privateData=records.get('leagues/l/private/lifecycle');
    assert.equal(root.individualRecruits,undefined);assert.equal(privateData.individualRecruits[recruitId].email,'applicant@example.test');assert.equal(privateData.individualRecruits[recruitId].phone,'5551234567');
  }finally{app.dispose();}
});

test('transaction-time owner demotion rejects tournament registration without writes',async()=>{
  let demote=true;const config=teamConfig(),seed={'teams/a':{ownerUserId:'owner',planId:'team'},'teams/a/events/e':{isTournament:true,registrationOpen:true,isArchived:false,tournamentGames:[],tournamentTeamsData:[],registrationEntryCount:0},'teams/a/events/e/registration/team_config':config};
  const {db,records}=communicationDb(seed,{beforeTransaction:({records})=>{if(demote){records.set('teams/a',{...records.get('teams/a'),ownerUserId:'replacement'});demote=false;}}});
  const app=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{uid:'owner'});
  try{const response=await app.route.POST(request({kind:'tournament',action:'register',teamId:'a',eventId:'e',protocolId:'team_config',requestId:'demotion-race-0001',formVersion:1,formHash:config.config_hash,answers:{manual_enrollment:true,teamName:'Alpha',name:'Coach',email:'coach@example.test'}}));assert.equal(response.status,403);assert.equal([...records.keys()].some(path=>path.includes('/registrationEntries/')),false);}finally{app.dispose();}
});

test('tournament replay canonicalizes every configured email field but rejects a genuine payload collision',async()=>{
  const config=teamConfig({form_schema:[
    {id:'team_name',label:'Team Name',type:'short_text',required:true},
    {id:'contact_name',label:'Head Coach Name',type:'short_text',required:true},
    {id:'contact_email',label:'Email Address',type:'email',required:true},
  ]});
  const seed={'teams/a':{ownerUserId:'owner',planId:'team'},'teams/a/events/e':{isTournament:true,registrationOpen:true,isArchived:false,tournamentGames:[],tournamentTeams:[],tournamentTeamsData:[],registrationEntryCount:0},'teams/a/events/e/registration/team_config':config};
  const {db,records}=communicationDb(seed,{serializeTransactions:true}),app=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{});
  const base={kind:'tournament',action:'register',teamId:'a',eventId:'e',protocolId:'team_config',formVersion:1,formHash:config.config_hash,answers:{teamName:'Alpha',name:'Coach',email:'coach@example.test',team_name:'Alpha',contact_name:'Coach',contact_email:'coach@example.test'}};
  try{
    assert.equal((await app.route.POST(request({...base,requestId:'email-case-00001'}))).status,200);
    const replay=await app.route.POST(request({...base,requestId:'email-case-00002',answers:{...base.answers,email:'COACH@EXAMPLE.TEST',contact_email:'COACH@EXAMPLE.TEST'}}));
    assert.equal(replay.status,200);assert.equal((await replay.json()).replay,true);
    const collision=await app.route.POST(request({...base,requestId:'email-case-00003',answers:{...base.answers,contact_name:'Different Coach'}}));
    assert.equal(collision.status,409);
    assert.equal([...records.keys()].filter(path=>path.startsWith('teams/a/events/e/registrationEntries/')).length,1);
  }finally{app.dispose();}
});

test('tournament waiver exact replay preserves signedAt and tampering fails closed',async()=>{
  const config=teamConfig({require_default_waiver:true,default_waiver_text:'Exact terms'}),code='VALIDCODE',seed={'teams/a':{ownerUserId:'owner',planId:'team'},'teams/a/events/e':{isTournament:true,isArchived:false,title:'Cup',tournamentTeamsData:[{id:'p_entry',name:'Alpha',sourceTeamId:'a'}],teamAgreements:{}},'teams/a/events/e/registration/team_config':config,[`tournamentRegistrationCodes/${code}`]:{teamId:'a',eventId:'e'}};
  const {db,records}=communicationDb(seed,{serializeTransactions:true}),app=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{uid:'owner'}),body={kind:'tournament',action:'waiver',teamId:'a',eventId:'e',teamName:'Alpha',signer:'Coach Owner',registrationCode:code,signedDate:new Date().toISOString().slice(0,10),expectedVersion:1,expectedHash:config.config_hash};
  try{
    assert.equal((await app.route.POST(request(body))).status,200);const archivePath=[...records.keys()].find(path=>path.includes('/archived_waivers/arch_tournament_')),signedAt=records.get(archivePath).signedAt;
    const replay=await app.route.POST(request(body));assert.equal(replay.status,200);assert.equal((await replay.json()).replay,true);assert.equal(records.get(archivePath).signedAt,signedAt);
    records.set(archivePath,{...records.get(archivePath),signedAt:'2000-01-01T00:00:00.000Z'});assert.equal((await app.route.POST(request(body))).status,409);
  }finally{app.dispose();}
});

test('tournament deletion migrates counters and validates archive pointer before deleting',async()=>{
  const config=teamConfig({require_default_waiver:true,default_waiver_text:'Exact terms'}),code='VALIDCODE',seed={'teams/a':{ownerUserId:'owner',planId:'team'},'teams/a/events/e':{isTournament:true,isArchived:false,title:'Cup',tournamentGames:[],tournamentTeams:['Alpha','Bravo'],tournamentTeamsData:[{id:'p_entry',name:'Alpha',sourceTeamId:'a'},{id:'p_other',name:'Bravo'}],teamAgreements:{}},'teams/a/events/e/registration/team_config':config,'teams/a/events/e/registrationEntries/entry':{answers:{teamName:'Alpha'},event_id:'e'},'teams/a/events/e/registrationEntries/other':{answers:{teamName:'Bravo'},event_id:'e'},[`tournamentRegistrationCodes/${code}`]:{teamId:'a',eventId:'e'}};
  const {db,records}=communicationDb(seed,{serializeTransactions:true}),app=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{uid:'owner'}),waiver={kind:'tournament',action:'waiver',teamId:'a',eventId:'e',teamName:'Alpha',signer:'Coach Owner',registrationCode:code,signedDate:new Date().toISOString().slice(0,10),expectedVersion:1,expectedHash:config.config_hash};
  try{
    assert.equal((await app.route.POST(request(waiver))).status,200);const event=records.get('teams/a/events/e'),agreement=event.teamAgreements.Alpha,archivePath=`teams/a/archived_waivers/${agreement.archiveId}`;
    records.set('teams/a/events/e',{...event,teamAgreements:{Alpha:{...agreement,receiptHash:'0'.repeat(64)}}});
    assert.equal((await app.route.POST(request({kind:'tournament',action:'delete-registration',teamId:'a',eventId:'e',entryId:'entry'}))).status,409);assert.equal(records.has('teams/a/events/e/registrationEntries/entry'),true);
    records.set('teams/a/events/e',{...records.get('teams/a/events/e'),teamAgreements:{Alpha:agreement}});
    assert.equal((await app.route.POST(request({kind:'tournament',action:'delete-registration',teamId:'a',eventId:'e',entryId:'entry'}))).status,200);assert.equal(records.has(archivePath),false);assert.equal(records.get('teams/a/events/e').registrationEntryCount,1);
  }finally{app.dispose();}
});

test('legacy tournament deletion uses the server path without inventing a current counter',async()=>{
  const seed={'teams/a':{ownerUserId:'owner',planId:'team'},'teams/a/events/e':{isTournament:true,isArchived:false,tournamentGames:[],tournamentTeams:['Legacy'],tournamentTeamsData:[{id:'p_legacy',name:'Legacy'}],teamAgreements:{}},'teams/a/registrationEntries/legacy':{event_id:'e',answers:{teamName:'Legacy'}}};
  const {db,records}=communicationDb(seed,{serializeTransactions:true}),app=await loadCommunicationRoute('../../src/app/api/public/portals/action/route.ts',db,{uid:'owner'});
  try{const response=await app.route.POST(request({kind:'tournament',action:'delete-registration',teamId:'a',eventId:'e',entryId:'legacy',legacy:true}));assert.equal(response.status,200);assert.equal(records.has('teams/a/registrationEntries/legacy'),false);assert.equal('registrationEntryCount' in records.get('teams/a/events/e'),false);}finally{app.dispose();}
});
