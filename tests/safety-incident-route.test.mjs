import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationDb,loadCommunicationRoute} from './helpers/communication-route-harness.mjs';

const initial={
  'teams/a':{ownerUserId:'owner',name:'Synthetic Team A'},
  'teams/a/members/staff':{position:'Assistant Coach',status:'active'},
  'teams/a/members/member':{position:'Player',status:'active'},
  'teams/a/members/removed':{position:'Coach',status:'removed'},
  'teams/b':{ownerUserId:'other',name:'Private Team B'},
  'teams/a/events/event-a':{title:'Synthetic Event A',teamId:'a'},
  'users/owner':{name:'Synthetic Reporter'},
};
const valid={requestId:'initial-request',title:'Synthetic report',date:'2026-09-06',time:'12:30',location:'Synthetic Field',description:'Synthetic facts',eventId:'event-a',eventKind:'team',involvedPeople:'Synthetic Player',actionsTaken:'Rest and observation',emergencyServicesCalled:false};
const make=(body,method='POST',query='')=>new Request('http://127.0.0.1/api/teams/incidents?teamId=a'+query,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const load=(db,uid='owner')=>loadCommunicationRoute('../../src/app/api/teams/incidents/route.ts',db,{uid});
test('linked non-UID staff membership stays supported while forged link and read-time revocation are denied',async()=>{
  const {db}=communicationDb({...initial,'teams/a/members/linked-staff':{userId:'linked',position:'Coach',status:'active'},'teams/a/members/forged':{userId:'someone-else',position:'Coach',status:'active'}});
  for(const [uid,want] of [['linked',201],['forged',403]]) {const app=await load(db,uid);try{assert.equal((await app.route.POST(make(valid))).status,want);}finally{app.dispose();}}
  const revoked=communicationDb(initial,{beforeTransaction:({records})=>records.set('teams/a',{ownerUserId:'replacement'})}),app=await load(revoked.db);
  try{assert.equal((await app.route.GET(new Request('http://127.0.0.1/api/teams/incidents?teamId=a'))).status,403);}finally{app.dispose();}
});
test('bounded incident request identity returns one replay and rejects changed payload without duplicates',async()=>{
  const {db,records}=communicationDb(initial),app=await load(db);
  try{
    const first=await app.route.POST(make({...valid,requestId:'same-request'}));assert.equal(first.status,201);
    const replay=await app.route.POST(make({...valid,requestId:'same-request'}));assert.equal(replay.status,200);assert.equal((await replay.json()).incidentId,(await first.json()).incidentId);
    assert.equal((await app.route.POST(make({...valid,requestId:'same-request',description:'changed'}))).status,409);
    assert.equal([...records.keys()].filter(x=>x.includes('/incidents/')).length,1);
  }finally{app.dispose();}
});
test('incident creation binds trusted report identity, event and original facts; status preserves every audit entry',async()=>{
  const {db,records}=communicationDb(initial),app=await load(db);
  try{
    const response=await app.route.POST(make(valid));assert.equal(response.status,201);
    const {incidentId}=await response.json(),path=`teams/a/incidents/${incidentId}`,original=records.get(path);
    assert.equal(original.reportedBy,'owner');assert.equal(original.reportedByName,'Synthetic Reporter');assert.equal(original.teamName,'Synthetic Team A');assert.equal(original.eventName,'Synthetic Event A');assert.equal(original.status,'open');assert.match(original.createdAt,/^\d{4}-/);
    for(const status of ['monitoring','follow_up_required','resolved']) assert.equal((await app.route.PATCH(make({status},'PATCH',`&incidentId=${incidentId}`))).status,200);
    const after=records.get(path);assert.deepEqual(after.auditHistory.map(x=>x.action),['created','status:monitoring','status:follow_up_required','status:resolved']);assert.deepEqual(after.auditHistory[0],original.auditHistory[0]);assert.equal(after.description,original.description);
    assert.equal((await app.route.PATCH(make({status:'open'},'PATCH',`&incidentId=${incidentId}`))).status,409);
    assert.equal((await app.route.DELETE(new Request(`http://127.0.0.1/api/teams/incidents?teamId=a&incidentId=${incidentId}`,{method:'DELETE'}))).status,403);
    assert.equal(records.has(path),true);
  }finally{app.dispose();}
});
test('each required field omission, bad date, unsafe URL, oversized content and forged audit creates no report',async()=>{
  const {db,records,objects}=communicationDb(initial),app=await load(db);
  try{
    for(const key of ['title','date','time','location','description','eventId','eventKind','involvedPeople','actionsTaken','emergencyServicesCalled']){const input={...valid};delete input[key];assert.equal((await app.route.POST(make(input))).status,400,key);}
    for(const extra of [{date:'2026-02-30'},{time:'99:99'},{description:'a'.repeat(12001)},{supportingDocumentUrl:'https://private.example/other'},{reportedBy:'other'},{auditHistory:[]},{eventId:'foreign'}]) assert.equal((await app.route.POST(make({...valid,...extra}))).status,400);
    assert.equal([...records.keys()].some(x=>x.includes('/incidents/')),false);assert.equal(objects.size,0);
  }finally{app.dispose();}
});
test('participant removed outsider Team B and former owner cannot list read export write or delete incidents',async()=>{
  const {db,records}=communicationDb({...initial,'teams/a/incidents/prior':{...valid,teamId:'a',ownerUserId:'former',reportedBy:'former'}});
  for(const uid of ['member','removed','outsider','other','former']){
    const app=await load(db,uid);
    try{for(const query of ['', '&incidentId=prior','&export=pdf','&incidentId=prior&download=attachment'])assert.equal((await app.route.GET(new Request('http://127.0.0.1/api/teams/incidents?teamId=a'+query))).status,403,uid+query);
      assert.equal((await app.route.POST(make(valid))).status,403);assert.equal((await app.route.PATCH(make({status:'resolved'},'PATCH','&incidentId=prior'))).status,403);
    }finally{app.dispose();}
  }assert.equal(records.size,Object.keys(initial).length+1);
});
test('incident mutation rechecks membership inside transaction and fails without committing after revocation',async()=>{
  const {db,records}=communicationDb(initial,{beforeTransaction:({records})=>records.set('teams/a/members/staff',{position:'Coach',status:'removed'})}),app=await load(db,'staff');
  try{assert.equal((await app.route.POST(make(valid))).status,403);assert.equal([...records.keys()].some(x=>x.includes('/incidents/')),false);}finally{app.dispose();}
});
const pdf=Buffer.from('%PDF-1.4\nSynthetic supporting file\n%%EOF\n');
const upload=(input=valid,bytes=pdf,type='application/pdf')=>{const form=new FormData();form.set('report',JSON.stringify(input));form.set('attachment',new Blob([bytes],{type}),'support.pdf');return new Request('http://127.0.0.1/api/teams/incidents?teamId=a',{method:'POST',body:form});};
test('private attachment is created atomically, downloaded exactly, removed with audited retention and stale access denied',async()=>{
  const {db,records,objects}=communicationDb(initial),app=await load(db);
  try{
    const response=await app.route.POST(upload());assert.equal(response.status,201);const {incidentId}=await response.json();
    const path=`teams/a/incidents/${incidentId}`,record=records.get(path);assert.equal(record.attachment.storagePath,`${path}/attachment`);assert.equal(objects.size,1);
    const url=`http://127.0.0.1/api/teams/incidents?teamId=a&incidentId=${incidentId}&download=attachment`;
    const download=await app.route.GET(new Request(url));assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);assert.equal(download.headers.get('Cache-Control'),'private, no-store');
    assert.equal((await app.route.DELETE(new Request(url,{method:'DELETE'}))).status,200);assert.equal(objects.size,0);assert.equal((await app.route.GET(new Request(url))).status,404);
    assert.equal(records.get(path).auditHistory.at(-1).action,'attachment:deleted');assert.equal(records.get(path).description,'Synthetic facts');
  }finally{app.dispose();}
});
test('attachment MIME spoof and failed report transaction leave no private objects or reports',async()=>{
  let transactions=0;
  const {db,records,objects}=communicationDb(initial,{beforeTransaction:()=>{if(++transactions===2)throw Error('transaction unavailable');}}),app=await load(db);
  try{
    assert.equal((await app.route.POST(upload(valid,Buffer.from('not PDF')))).status,400);
    assert.equal((await app.route.POST(upload())).status,500);assert.equal(objects.size,0);assert.equal([...records.keys()].some(x=>x.includes('/incidents/')),false);
    assert.equal((await app.route.POST(upload())).status,201);assert.equal(objects.size,1);
  }finally{app.dispose();}
});
test('simultaneous attachment creates settle one winner, bounded conflict and safe exact replay',async()=>{
  const {db,records,objects}=communicationDb(initial),real=db.bucket.file;
  let release,entered;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);let held=false;
  db.bucket.file=path=>{const file=real(path);return {...file,async getMetadata(){if(!held){held=true;entered();await gate;}return file.getMetadata();}};};
  const app=await load(db);
  try{
    const first=app.route.POST(upload());await ready;
    const collision=await app.route.POST(upload());release();assert.equal(collision.status,409);
    assert.equal((await first).status,201);assert.equal((await app.route.POST(upload())).status,200);
    assert.equal(objects.size,1);assert.equal([...records.keys()].filter(x=>x.includes('/incidents/')).length,1);
  }finally{release();app.dispose();}
});
test('attachment download rechecks authority after storage settles and exports read only fresh authorized records',async()=>{
  const {db,records}=communicationDb(initial),app=await load(db);
  try{
    const {incidentId}=await (await app.route.POST(upload())).json();
    const exportResult=await app.route.GET(new Request(`http://127.0.0.1/api/teams/incidents?teamId=a&incidentId=${incidentId}&export=csv`));
    assert.equal(exportResult.status,200);const text=await exportResult.text();assert.ok(text.includes('Synthetic Reporter'));assert.ok(text.includes('Synthetic Event A'));assert.ok(!text.includes('Private Team B'));
    const real=db.bucket.file;db.bucket.file=path=>{const file=real(path);return {...file,async download(){const value=await file.download();records.set('teams/a',{ownerUserId:'other'});return value;}};};
    assert.equal((await app.route.GET(new Request(`http://127.0.0.1/api/teams/incidents?teamId=a&incidentId=${incidentId}&download=attachment`))).status,403);
  }finally{app.dispose();}
});
test('lost transaction acknowledgement never rolls back a committed attachment and exact replay remains complete',async()=>{
  const {db,records,objects}=communicationDb(initial),transaction=db.runTransaction.bind(db);let count=0;
  db.runTransaction=async work=>{const result=await transaction(work);if(++count===2)throw Error('commit acknowledgement lost');return result;};
  const app=await load(db);
  try{assert.equal((await app.route.POST(upload())).status,500);assert.equal([...records.keys()].filter(x=>x.includes('/incidents/')).length,1);assert.equal(objects.size,1);assert.equal((await app.route.POST(upload())).status,200);assert.equal(objects.size,1);}finally{app.dispose();}
});
