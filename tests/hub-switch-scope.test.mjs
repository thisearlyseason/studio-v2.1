import test from 'node:test';
import assert from 'node:assert/strict';
import {hubLabel,resolveBrandingHub,squadBelongsToHub} from '../src/lib/hub-eligibility.ts';
import {communicationDb,communicationRequest,loadCommunicationRoute} from './helpers/communication-route-harness.mjs';

const teams=['club','club_hub','school','school_hub'].flatMap((type,i)=>[
  {id:'hub'+i,ownerUserId:'owner',type,name:'Institution '+i,hubDisplayName:'Renamed '+i},
  {id:'squad'+i,ownerUserId:'owner',type:'team',[['clubId','organizationHubId','schoolId','schoolId'][i]]:'hub'+i},
]);

test('each selected squad resolves only its own hub, squads and display name',()=>{
  for(let i=0;i<4;i++) {
    const hub=resolveBrandingHub(teams,'squad'+i,'owner',false);
    assert.equal(hub.id,'hub'+i);
    assert.deepEqual(teams.filter(team=>squadBelongsToHub(team,hub)).map(team=>team.id),['squad'+i]);
    assert.equal(hubLabel(hub,'Account name',2,'Hub'),'Renamed '+i);
  }
});

test('hub channel creation accepts linked staff and rejects sibling club and school recipients',async()=>{
  const records=Object.fromEntries(teams.map(team=>['teams/'+team.id,team]));
  for(let i=0;i<4;i++) records['teams/squad'+i+'/members/coach'+i]={userId:'coach'+i,position:'Coach'};
  const {db,records:saved}=communicationDb(records);
  const handle=await loadCommunicationRoute('../../src/app/api/teams/chat/route.ts',db,{uid:'owner'});
  try {
    const create=(teamId,ids)=>handle.route.POST(communicationRequest({teamId,contextId:'hub:'+teamId,name:'Staff',memberIds:['owner',...ids]}));
    for(let i=0;i<4;i++) {
      assert.equal((await create('hub'+i,['coach'+((i+1)%4)])).status,403);
      const response=await create('hub'+i,['coach'+i]);
      assert.equal(response.status,200);
      const {chatId}=await response.json();
      const chat=saved.get('teams/hub'+i+'/groupChats/'+chatId);
      assert.deepEqual(chat.memberIds,['owner','coach'+i]);
      assert.equal(chat.memberAuthorities['coach'+i].teamId,'squad'+i);
      assert.equal(chat.isHubChannel,true);
    }
  } finally {handle.dispose();}
});

test('hub waivers reject sibling squads during deployment and later edits', async () => {
  const {db,records} = communicationDb(Object.fromEntries(teams.map(team => ['teams/'+team.id,team])));
  db.getAll = (...refs) => Promise.all(refs.map(ref => ref.get()));
  const handle = await loadCommunicationRoute('../../src/app/api/organizations/waivers/route.ts',db,{uid:'owner'});
  const body = {hubTeamId:'hub0',teamIds:['squad0'],requestId:'hubcheck',title:'Consent',content:'Season terms'};
  try {
    const wrong = await handle.route.POST(communicationRequest({...body,teamIds:['squad0','squad1']}));
    assert.equal(wrong.status,403);
    assert.equal(records.has('teams/squad1/documents/waiver_hubcheck_2'),false);
    const response = await handle.route.POST(communicationRequest(body));
    assert.equal(response.status,201);
    const {documentId,version,textHash} = await response.json();
    const change = {documentId,expectedVersion:version,expectedTextHash:textHash,isActive:false};
    assert.equal((await handle.route.PATCH(communicationRequest({...change,hubTeamId:'hub1'}))).status,403);
    assert.equal((await handle.route.PATCH(communicationRequest({...change,hubTeamId:'hub0'}))).status,200);
  } finally {handle.dispose();}
});
