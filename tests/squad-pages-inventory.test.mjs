import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
const root=new URL('../',import.meta.url).pathname,key='__squadInventoryTest';
const stubs={
'next/server':'export class NextRequest extends Request{};',
'@/lib/firebase-admin':'export const adminDb={};',
'@/lib/squad-pages/http':`export const pageActor=async()=>({uid:'demo-owner'});export const fixtureRequest=()=>false;export const pageJSON=x=>Response.json(x);export const pageFailure=e=>Response.json({error:e.message},{status:e.status||500});`,
'@/lib/squad-pages/store':`export const pageStore=async()=>globalThis.${key};`,
};
const b=await build({stdin:{contents:`export {GET} from './src/app/api/squad-pages/entities/route';export {memoryStore} from './src/lib/squad-pages/store';export {previewRecords} from './src/lib/squad-pages/fixtures';`,resolveDir:root},bundle:true,platform:'node',format:'esm',packages:'external',write:false,logLevel:'silent',alias:{'@':root+'src'},plugins:[{name:'local-inventory',setup(x){x.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'fixture'}:null);x.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'js'}));}}]});
const m=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
test('actual inventory route isolates incomplete legacy membership and invalid identifiers without granting access',async()=>{
 const data=m.previewRecords();data['teams/incomplete']={name:'Incomplete legacy',type:'adult'};data['users/demo-owner/teamMemberships/incomplete']={teamId:'incomplete'};data['users/demo-owner/teamMemberships/invalid']={teamId:'not/a/document'};data['users/demo-owner/teamMemberships/number']={teamId:7};
 const store=m.memoryStore(data);globalThis[key]={run:work=>store.run(scope=>work({...scope,get:p=>{assert(p.split('/').length%2===0&&!p.endsWith('/'),'invalid Firestore document path '+p);return scope.get(p)}}))};
 try{const r=await m.GET(new Request('https://fictional.invalid/api/squad-pages/entities'));assert.equal(r.status,200);const result=await r.json();assert(result.entities.some(e=>e.key==='team~demo-hawks'));assert(!result.entities.some(e=>e.ref.id==='incomplete'||String(e.ref.id).includes('/')));assert(result.entities.every(e=>!('ownerId' in e)));}finally{delete globalThis[key]}
});
