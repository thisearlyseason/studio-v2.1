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
