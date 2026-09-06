import assert from 'node:assert/strict';
import test from 'node:test';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
async function load(){const result=await build({entryPoints:[fileURLToPath(new URL('../src/lib/incident-export.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,logLevel:'silent'}),compiledModule={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),compiledModule,compiledModule.exports);return compiledModule.exports;}
const incident={id:'stable-id',teamId:'team-a',teamName:'Synthetic Team A',title:'Synthetic Headline',date:'2026-09-06',time:'12:30',location:'Synthetic Field',description:'Long facts '.repeat(1100)+' LAST NARRATIVE',reportedBy:'staff-id',reportedByName:'Synthetic Staff',createdAt:'2026-09-06T12:31:00Z',eventId:'event-id',eventName:'Synthetic Event',involvedPersonnel:[{name:'Person One',phone:'555-0100',email:'person@example.test'}],witnessesList:[{name:'Witness One'}],auditHistory:[{action:'created',userId:'staff-id',at:'2026-09-06T12:31:00Z'}]};
test('incident PDF includes stable original facts and complete structured people/audit with long narrative pagination',async()=>{
  const {createIncidentPdf}=await load(),pdf=createIncidentPdf([incident]);assert.ok(pdf.getNumberOfPages()>2);
  // A phrase may cross a wrapped PDF text run; both final words must survive.
  const output=pdf.output();for(const value of ['stable-id','team-a','Synthetic Team A','staff-id','Synthetic Staff','event-id','Synthetic Event','2026-09-06T12:31:00Z','Person One','555-0100','person@example.test','Witness One','LAST','NARRATIVE'])assert.ok(output.includes(value),value);
  assert.ok(!output.includes('Standard safety protocols applied'));assert.ok(!output.includes('Private Team B'));
  assert.equal(createIncidentPdf([incident]).output(),output,'same input exports deterministic PDF bytes');
});
test('ledger CSV includes all report fields and safely quotes spreadsheet formula/newlines without inventing facts',async()=>{
  const {incidentCsv}=await load(),csv=incidentCsv([{...incident,title:'=HYPERLINK("bad")',description:'Line 1\nLine 2'}]);
  for(const value of ['stable-id','Witness One','Person One','created','event-id','staff-id'])assert.ok(csv.includes(value),value);
  assert.ok(csv.includes("'=HYPERLINK"));assert.ok(!csv.includes('Standard safety protocols applied'));
});
