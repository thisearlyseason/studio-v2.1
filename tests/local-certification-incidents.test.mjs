import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {LOCAL_OPERATIONS_CASE_REQUIREMENTS} from '../scripts/qa/certification/local/batches/operations.mjs';
import {createIncidentBrowserObserver,validateIncidentDownload} from '../scripts/qa/certification/local/incident-browser.mjs';
test('Safety uses every frozen case exactly once and explicit console/network contributions',()=>assert.deepEqual(Object.values(LOCAL_OPERATIONS_CASE_REQUIREMENTS['safety-incident-create-read-export']).flat().sort(),['incident-create','incident-read','incident-export','incident-required','incident-edit-delete','incident-participant','incident-outsider','incident-team-b','incident-attachment','incident-responsive','incident-console','incident-network'].sort()));
test('Incident download must contain all synthetic fields, safe filename and no foreign/private marker',()=>{
  const input={filename:'INCIDENT_REPORT_owned.pdf',byteCount:900,text:'owned Team A staff event created witness original facts'},want={required:['owned','Team A','staff','event','created','witness','original facts'],forbidden:['Team B','PRIVATE']};
  assert.equal(validateIncidentDownload(input,want),true);
  for(const extra of [{filename:'../report.pdf'},{byteCount:0},{byteCount:3*1024*1024},{text:'owned Team A'},{text:input.text+' PRIVATE'}])assert.throws(()=>validateIncidentDownload({...input,...extra},want));
});
test('Incident observer retains the starting case and exact origin without cross-case response reuse',()=>{
  const page=new EventEmitter(),observer=createIncidentBrowserObserver(page,{baseUrl:'http://127.0.0.1:9001'}),request={url:()=> 'http://127.0.0.1:9001/api/teams/incidents?teamId=a',method:()=> 'POST'};
  observer.start(['incident-create']);page.emit('request',request);observer.start(['incident-read']);page.emit('response',{request:()=>request,status:()=>201});
  assert.deepEqual(observer.finish().observedResponses.map(row=>row.tag),['incident-create','incident-console','incident-network']);assert.equal(page.listenerCount('response'),0);
});
