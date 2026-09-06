import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
async function load(){const result=await build({entryPoints:[fileURLToPath(new URL('../src/lib/incident-submission.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'}),compiledModule={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),compiledModule,compiledModule.exports);return compiledModule.exports;}
test('both incident surfaces submit the same closed event schema without caller identity or arbitrary attachment URL',async()=>{
  const {prepareIncidentSubmission}=await load();
  const base={title:'Facts',date:'2026-09-06',time:'12:00',location:'Field',description:'Facts',actionsTaken:'Observed',emergencyServicesCalled:false,involvedPeople:'',involvedPersonnel:[{name:'Player'}]};
  const report=prepareIncidentSubmission(base,{requestId:'owned',eventId:'event-a',eventKind:'team'});
  assert.equal(report.involvedPeople,'Player');assert.equal(report.eventKind,'team');assert.equal(report.requestId,'owned');
  const event=prepareIncidentSubmission({...base,participantName:'Player',leagueId:'league-a',reportedByName:'forged',eventName:'forged',supportingDocumentUrl:''},{requestId:'owned',eventId:'league-a',eventKind:'league'});
  assert.equal(event.eventId,'league-a');for(const key of ['leagueId','reportedByName','eventName','supportingDocumentUrl'])assert.equal(Object.hasOwn(event,key),false);
  assert.throws(()=>prepareIncidentSubmission({...base,supportingDocumentUrl:'https://other/private'},{requestId:'owned',eventId:'a',eventKind:'team'}));
});
test('failed incident create leaves form open and reports failure while releasing processing state',async()=>{
  const {settleIncidentSubmission}=await load(),events=[];
  await settleIncidentSubmission(async()=>{throw Error('Save denied');},{busy:value=>events.push(['busy',value]),success:()=>events.push(['closed']),error:message=>events.push(['error',message])});
  assert.deepEqual(events,[['busy',true],['error','Save denied'],['busy',false]]);
});
