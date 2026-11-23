import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginChatSend,
  failChatSend,
  finishChatSend,
} from '../src/lib/chat-send-state.ts';
import {
  chatChannelKey,
  isChatVisibleForTeam,
  mergeChatChannels,
} from '../src/lib/chat-channel-identity.ts';

test('a failed chat attempt preserves content and reuses one request identity for retry',()=>{
  const first=beginChatSend({content:'Keep this draft',imageUrl:undefined,type:'text'},'request-1');
  assert.equal(first.status,'sending');
  const failed=failChatSend(first,'Offline');
  assert.deepEqual(failed,{...first,status:'failed',error:'Offline'});
  const retry=beginChatSend(failed,failed.requestId);
  assert.equal(retry.requestId,'request-1');
  assert.equal(retry.content,'Keep this draft');
  assert.equal(finishChatSend(retry).status,'sent');
});

test('chat identity includes its tenant and does not merge equal document IDs across teams',()=>{
  const teamA={id:'same-chat',teamId:'team-a',name:'Team A'};
  const teamB={id:'same-chat',teamId:'team-b',name:'Team B'};
  assert.notEqual(chatChannelKey(teamA,'fallback'),chatChannelKey(teamB,'fallback'));
  assert.deepEqual(mergeChatChannels([teamA,teamB,teamA],'fallback').map(chat=>chat.name),['Team A','Team B']);
});

test('team chat stays in its own team and competition chat follows participating teams', () => {
  for (const kind of ['team', undefined]) {
    assert.equal(isChatVisibleForTeam('a', 'a', kind, 'a'), true);
    assert.equal(isChatVisibleForTeam('a', 'b', kind, 'b'), false);
  }
  for (const kind of ['league', 'tournament']) {
    assert.equal(isChatVisibleForTeam('a', 'b', kind, 'b'), true);
    assert.equal(isChatVisibleForTeam('a', 'c', kind, 'b'), false);
  }
});
