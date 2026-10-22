import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { purgeScheduleTodos } from '../functions/src/schedule-todo-purge.ts';
import { TODO_RETENTION } from '../src/lib/schedule-todos/retention.ts';
test('eligible purge removes only exact account tree including nested task/receipt records', async () => {
 const docs = new Map(['scheduleTodoAccounts/A','scheduleTodoAccounts/A/tasks/one','scheduleTodoAccounts/A/requests/receipt','scheduleTodoAccounts/B/tasks/one'].map(k=>[k,{}]));
 await purgeScheduleTodos('A',async path=>{for(const key of docs.keys())if(key===path||key.startsWith(path+'/'))docs.delete(key)});
 assert.deepEqual([...docs.keys()],['scheduleTodoAccounts/B/tasks/one']);
 await purgeScheduleTodos('A',async path=>{for(const key of docs.keys())if(key===path||key.startsWith(path+'/'))docs.delete(key)});
 assert.equal(docs.size,1);
});
test('purge failure propagates for retry; invalid scopes never invoke deletion',async()=>{
 await assert.rejects(purgeScheduleTodos('A',async()=>{throw Error('synthetic failure')}),/synthetic failure/);
 for(const uid of['','A/tasks','x'.repeat(129)])await assert.rejects(purgeScheduleTodos(uid,async()=>assert.fail('forbidden')));
});
test('purge integration is confined to eligible deletion handler before Auth and request removal',()=>{
 const source=fs.readFileSync('functions/src/index.ts','utf8'),start=source.indexOf('export const purgeExpiredDeletionRequests'),end=source.indexOf('export const cleanupAnonymousUsers'),body=source.slice(start,end);
 assert.equal((source.match(/await purgeScheduleTodos\(/g)||[]).length,1);
 assert(body.includes('await purgeScheduleTodos(uid, (path) => db.recursiveDelete(db.doc(path)))'));
 assert(body.indexOf('await purgeScheduleTodos')<body.indexOf('await admin.auth().deleteUser'));
 assert(body.indexOf('await purgeScheduleTodos')<body.indexOf('await request.ref.delete()',body.indexOf('await purgeScheduleTodos')));
});
test('provisional policy counts nondeleted tasks separately from bounded metadata',()=>{assert.equal(TODO_RETENTION.activeLimit,1000);assert.equal(TODO_RETENTION.metadataLimit,10000);assert.equal(TODO_RETENTION.generationDays,30)});
import ts from 'typescript';
import vm from 'node:vm';
function purgeFixture({owner=false,fail=false,scanFail=false}={}){
 const events=[],source=fs.readFileSync('functions/src/index.ts','utf8'),ast=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true);let handler;
 for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations)if(d.name.getText(ast)==='purgeExpiredDeletionRequests')handler=d.initializer.arguments[1].getText(ast);
 const ref=path=>({path,update:async()=>events.push('update:'+path),set:async()=>events.push('set:'+path),delete:async()=>events.push('delete:'+path)});
 const request={id:'A',ref:ref('accountDeletionRequests/A')};
 function query(name){return{where(){return this},limit(){return this},get:async()=>name==='accountDeletionRequests'?{empty:false,docs:[request]}:{empty:!(owner&&name==='teams'),docs:[]},doc(uid){const r=ref(name+'/'+uid);return{...r,get:async()=>({exists:true,ref:r})}}}}
 const db={collection:query,doc:ref,recursiveDelete:async r=>{events.push('tree:'+r.path);if(fail&&r.path==='scheduleTodoAccounts/A')throw Error('synthetic retryable failure')}};
 const admin={firestore:{Timestamp:{now:()=>0},FieldValue:{serverTimestamp:()=>0}},storage:()=>({bucket:()=>({file:()=>({delete:async()=>{}})})}),auth:()=>({deleteUser:async uid=>events.push('auth:'+uid)})};
 const context={db,admin,purgeScheduleTodos,USER_DOCUMENT_TARGETS:[],USER_ARRAY_TARGETS:[],USER_MAP_TARGETS:[],loadUserMapDocumentsByUid:async()=>({failedTargets:scanFail?['synthetic']:[],documentsByTarget:new Map}),console:{log(){},error(){}},Set,Map};
 const js=ts.transpileModule('('+handler+')',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 return{events,run:vm.runInNewContext(js,context)};
}
test('actual scheduled handler purges task tree before Auth/request acknowledgement',async()=>{const f=purgeFixture();await f.run();assert(f.events.includes('tree:scheduleTodoAccounts/A'));assert(f.events.indexOf('tree:scheduleTodoAccounts/A')<f.events.indexOf('auth:A'));assert(f.events.includes('delete:accountDeletionRequests/A'))});
test('actual scheduled handler preserves retry request and Auth on task purge failure',async()=>{const f=purgeFixture({fail:true});await f.run();assert(f.events.includes('tree:scheduleTodoAccounts/A'));assert(!f.events.includes('auth:A'));assert(!f.events.includes('delete:accountDeletionRequests/A'))});
test('organization-owner and incomplete-scan guards prevent new store purge',async()=>{for(const options of[{owner:true},{scanFail:true}]){const f=purgeFixture(options);await f.run();assert(!f.events.some(e=>e.startsWith('tree:')));assert(!f.events.includes('auth:A'))}});
