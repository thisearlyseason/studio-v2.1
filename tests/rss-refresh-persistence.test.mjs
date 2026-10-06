import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import ts from 'typescript';
const source=await readFile(new URL('../src/app/api/sports-hub/rss-refresh/route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({items=[],role='superadmin',failCommit=false}={}){
 const articles=new Map(),metadata=new Map(),sizes=[];let fetches=0;const exports={};
 const adminDb={collection(name){return{doc(id){return{async get(){return{exists:true,data:()=>({url:'https://example.test/feed',isEnabled:true,category:'Coaching'})}},async set(data){metadata.set(id,data)},name,id}}}},batch(){const writes=[];return{set(ref,data){writes.push([ref.id,data])},async commit(){sizes.push(writes.length);if(failCommit){failCommit=false;throw Error('Injected commit failure')}for(const [id,data]of writes)articles.set(id,data)}}}};
 const response={json:(body,{status=200}={})=>({status,body})};class NextResponse{};NextResponse.json=response.json;
 const modules={'node:crypto':crypto,'next/server':{NextResponse},'@/lib/rss-parser':{fetchAndParseRSSFeed:async()=>{fetches++;return items},shouldRejectItem:x=>x.rejected===true},'@/lib/api-auth':{verifyFirebaseToken:async()=>({role})},'@/lib/firebase-admin':{adminDb},'@/lib/sports-hub-rss-config':{DEFAULT_RSS_FEEDS:[]}};
 vm.runInNewContext(compiled,{exports,require:id=>{if(!(id in modules))throw Error('Unexpected dependency '+id);return modules[id]},console:{error(){}},Date});
 const post=(body={feedId:'owned_feed',feedUrl:'https://example.test/feed'})=>exports.POST({json:async()=>body});return{post,articles,metadata,sizes,get fetches(){return fetches}};
}
const item=n=>({title:'Coaching '+n,url:'https://example.test/article/'+n,excerpt:'Technique',source:'Local',publishedAt:'2026-10-05T00:00:00Z'});
test('refresh persists filtered articles and a stable link identity avoids repeat duplicates',async()=>{const h=harness({items:[item(1),{...item(2),rejected:true}]});const first=await h.post();assert.equal(first.status,200);assert.equal(first.body.totalImported,1);assert.equal(h.articles.size,1);const key=[...h.articles.keys()][0];assert.equal(h.articles.get(key).feedId,'owned_feed');assert.equal(h.metadata.get('owned_feed').lastSyncStatus,'success');await h.post();assert.equal(h.articles.size,1);assert.equal([...h.articles.keys()][0],key)});
test('failed article commit returns failure without publishing successful feed metadata; retry converges',async()=>{const h=harness({items:[item(1)],failCommit:true});assert.equal((await h.post()).status,500);assert.equal(h.metadata.size,0);assert.equal(h.articles.size,0);assert.equal((await h.post()).status,200);assert.equal(h.articles.size,1);assert.equal(h.metadata.size,1)});
test('large accepted feed respects Firestore batch bounds',async()=>{const h=harness({items:Array.from({length:401},(_,i)=>item(i))});assert.equal((await h.post()).status,200);assert.deepEqual(h.sizes,[400,1]);assert.equal(h.articles.size,401)});
test('nonadmin and mismatched feed URL cannot fetch or import',async()=>{const denied=harness({role:'coach',items:[item(1)]});assert.equal((await denied.post()).status,403);assert.equal(denied.fetches,0);const mismatch=harness({items:[item(1)]});assert.equal((await mismatch.post({feedId:'owned_feed',feedUrl:'https://evil.test/feed'})).status,400);assert.equal(mismatch.fetches,0);assert.equal(mismatch.articles.size,0)});
