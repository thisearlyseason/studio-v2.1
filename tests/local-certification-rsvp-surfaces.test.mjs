import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateRsvpRoleObservations} from '../scripts/qa/certification/local/rsvp-observation.mjs';

test('own RSVP evidence requires exact Event and Calendar states at both viewports with actual controls',()=>{
  const options={actor:'qa-adult-player-a',calendar:true,staff:false,participants:[{name:'Your RSVP',status:'going'}]};
  const observations=['events','calendar'].flatMap(route=>[{width:1440,height:900},{width:390,height:844}].map(viewport=>({route,viewport,actor:options.actor,participants:options.participants,controls:Object.fromEntries(['dialog','close','participant-0','going','maybe','decline'].map(name=>[name,{x:10,y:10,width:60,height:30}]))})));
  assert.equal(validateRsvpRoleObservations(observations,options),true);
  assert.throws(()=>validateRsvpRoleObservations(observations.slice(1),options));
  assert.throws(()=>validateRsvpRoleObservations(observations,{...options,actor:'qa-youth-active'}));
  const wrong=structuredClone(observations);wrong[2].participants[0].status='declined';
  assert.throws(()=>validateRsvpRoleObservations(wrong,options));
  const clipped=structuredClone(observations);clipped[1].controls.going.x=-5;
  assert.throws(()=>validateRsvpRoleObservations(clipped,options));
});

test('RSVP role workflow is wired before cancellation and captures every role in responsive/console/network evidence',()=>{
  const source=readFileSync(new URL('../scripts/qa/run-phase2-emulator-audit.mjs',import.meta.url),'utf8');
  assert.match(source,/await runRsvpRoleSurfacesAudit\(/);
  for(const actor of ['qa-parent-a','qa-adult-player-a','qa-youth-active','qa-coach-owner-a','qa-team-assistant']) assert.match(source,new RegExp(`RSVP_ROLE_SURFACE_ACTORS[^;]*${actor}`));
  assert.match(source,/validateRsvpRoleObservations/);
});
