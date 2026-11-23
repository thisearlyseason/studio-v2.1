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
