import test from 'node:test';
import assert from 'node:assert/strict';
import { tournamentRegistrationShareUrl } from '../src/lib/competition/registration-share-url.ts';
test('native registration shares use the working public receiver while retaining exact form identity',()=>{
  const url=new URL(tournamentRegistrationShareUrl('https://native-host.vercel.app','team-a','cup-a','team_config','store'));
  assert.equal(url.origin,'https://www.thesquad.pro');assert.equal(url.pathname,'/register/tournament/team-a/cup-a');assert.equal(url.searchParams.get('protocol'),'team_config');
});
test('web registration shares retain the current web or local origin',()=>{
  for(const origin of ['https://www.thesquad.pro','http://127.0.0.1:9399'])assert.equal(new URL(tournamentRegistrationShareUrl(origin,'t','e','form','web')).origin,origin);
});
test('registration share parameters cannot replace origin or inject additional query fields',()=>{
  const url=new URL(tournamentRegistrationShareUrl('https://native-host.vercel.app','team/other','event?next=x','form&next=https://other.invalid','store'));
  assert.equal(url.origin,'https://www.thesquad.pro');assert.deepEqual([...url.searchParams.keys()],['protocol']);assert.equal(url.searchParams.get('protocol'),'form&next=https://other.invalid');
});
