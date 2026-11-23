import assert from 'node:assert/strict';
import test from 'node:test';
import {communicationDb, communicationRequest, loadCommunicationRoute} from './helpers/communication-route-harness.mjs';

test('pinning replaces the previous pin and preserves team and audience boundaries', async () => {
  const {db} = communicationDb({
    'teams/a': {ownerUserId:'coach'}, 'teams/b': {ownerUserId:'other'},
    'teams/a/members/player': {userId:'player',position:'Player',status:'active'},
    'teams/a/feedPosts/one': {content:'One'}, 'teams/a/feedPosts/two': {content:'Private',audience:'coaches'},
  });
  for (const uid of ['coach','player']) {
    const loaded = await loadCommunicationRoute('../../src/app/api/teams/feed/action/route.ts',db,{uid});
    const act = (action,postId,teamId='a') => loaded.route.POST(communicationRequest({action,postId,teamId}));
    const read = async () => (await (await loaded.route.GET(new Request('http://localhost/?teamId=a'))).json()).posts;
    try {
      if (uid === 'coach') {
        assert.equal((await act('pin-post','one','b')).status,403);
        assert.equal((await act('pin-post','one')).status,200);
        assert.equal((await read())[0].isPinned,true);
        assert.equal((await act('pin-post','two')).status,200);
        assert.equal((await act('unpin-post','one')).status,200);
        const posts = await read();
        assert.equal(posts[0].id,'two');
        assert.equal(posts.filter(p => p.isPinned).length,1);
      } else {
        assert.equal((await act('pin-post','one')).status,403);
        assert.deepEqual((await read()).map(p => p.id),['one']);
      }
    } finally { loaded.dispose(); }
  }
});
